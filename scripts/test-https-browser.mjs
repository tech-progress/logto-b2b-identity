import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  authorizationRequest, discover, exchangeCode, jsonRequest,
  nativePasswordAuthorization, nativeManagementGrant, organizationToken, randomValue,
  validateCallback, validateIdToken, validateJwt,
} from './oidc-test-client.mjs';

const check = (condition, message) => assert.ok(condition, message);
const managementAudience = 'https://default.logto.app/api';
const meAudience = 'https://admin.logto.app/me';
const organizationScope = 'urn:logto:scope:organizations';
const organizationResource = 'urn:logto:resource:organizations';
let phase = 'configuration';
const passed = [];
const gate = name => { passed.push(name); process.stdout.write(`PASS ${name}\n`); };

export function readConfiguration(env) {
  const names = ['ISSUER_URL', 'ADMIN_URL', 'ADMIN_GATE_PASSWORD', 'OWNER_USERNAME', 'OWNER_PASSWORD', 'OWNER_RECOVERED_PASSWORD', 'USER_USERNAME', 'USER_PASSWORD', 'LIFECYCLE_HELPER', 'PLAYWRIGHT_MODULE'];
  for (const name of names) check(typeof env[name] === 'string' && env[name].length > 0, `Required environment variable: ${name}`);
  for (const name of ['ALLOW_LOCAL_HTTP', 'ALLOW_LOCAL_TEST_CERTIFICATE', 'ALLOW_CHROMIUM_NO_SANDBOX']) check(env[name] === undefined || env[name] === '0' || env[name] === '1', `Invalid opt-in: ${name}`);
  check(env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'Global TLS certificate bypass is prohibited');
  check(isAbsolute(env.PLAYWRIGHT_MODULE), 'PLAYWRIGHT_MODULE must be an absolute existing module file');
  try {
    accessSync(env.PLAYWRIGHT_MODULE, constants.R_OK);
    check(statSync(env.PLAYWRIGHT_MODULE).isFile(), 'PLAYWRIGHT_MODULE must be a file');
  } catch { throw new Error('PLAYWRIGHT_MODULE must be a readable existing module file'); }
  check(env.NATIVE_TEST_DISPOSABLE === '1', 'NATIVE_TEST_DISPOSABLE=1 required');
  for (const name of ['ISSUER_URL', 'ADMIN_URL']) {
    const url = new URL(env[name]);
    check(env[name] === url.origin && !url.username && !url.password, 'Issuer and admin URLs must be exact origins');
    check(url.protocol === 'https:' || (env.ALLOW_LOCAL_HTTP === '1' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'HTTPS required except explicitly allowed loopback');
  }
  const allowLocalTestCertificate = env.ALLOW_LOCAL_TEST_CERTIFICATE === '1';
  if (allowLocalTestCertificate) {
    for (const name of ['ISSUER_URL', 'ADMIN_URL']) {
      const url = new URL(env[name]);
      check(url.protocol === 'https:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Local certificate opt-in requires both HTTPS loopback origins');
    }
  }
  check(env.ISSUER_URL !== env.ADMIN_URL, 'Issuer and admin origins must differ');
  check(env.OWNER_PASSWORD !== env.OWNER_RECOVERED_PASSWORD, 'Recovery password must differ');
  check(env.OWNER_USERNAME !== env.USER_USERNAME, 'Owner and end user must differ');
  check(env.ADMIN_GATE_PASSWORD.length >= 32, 'Gate credential must contain at least 32 characters');
  check(isAbsolute(env.LIFECYCLE_HELPER), 'Lifecycle helper must be an absolute executable path');
  const timeout = Number(env.LIFECYCLE_TIMEOUT_MS ?? 180000);
  check(Number.isInteger(timeout) && timeout >= 1000 && timeout <= 300000, 'Invalid lifecycle timeout');
  return { ...env, lifecycleTimeout: timeout, allowLocalTestCertificate, loopbackHttpOrigins: new Set() };
}

export function browserLaunchOptions(config) {
  return {
    headless: true,
    ...(config.CHROMIUM_EXECUTABLE ? { executablePath: config.CHROMIUM_EXECUTABLE } : {}),
    ...(config.ALLOW_CHROMIUM_NO_SANDBOX === '1' ? { chromiumSandbox: false } : {}),
  };
}

export function checkLocalRequest(url, config) {
  const target = new URL(url);
  check(!target.username && !target.password && (
    [config.ISSUER_URL, config.ADMIN_URL].includes(target.origin) ||
    (target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
  ), 'Local certificate test traffic must stay on configured HTTPS origins or HTTP loopback');
  return target;
}

export function proxyTunnelTarget(authority, config) {
  const secure = new URL(`https://${authority}`);
  check(!secure.username && !secure.password && !secure.search && !secure.hash && secure.pathname === '/', 'Invalid proxy tunnel target');
  if ([config.ISSUER_URL, config.ADMIN_URL].includes(secure.origin)) return secure;
  const plain = new URL(`http://${authority}`);
  check(['localhost', '127.0.0.1', '[::1]'].includes(plain.hostname) && config.loopbackHttpOrigins?.has(plain.origin), 'Unregistered proxy tunnel target');
  return plain;
}

async function createLoopbackProxy(config) {
  const sockets = new Set();
  const track = socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };
  const hostname = url => url.hostname === 'localhost' ? '127.0.0.1' : url.hostname.replace(/^\[|\]$/g, '');
  const proxy = http.createServer((request, response) => {
    let url;
    try {
      url = checkLocalRequest(request.url, config);
      check(url.protocol === 'http:', 'HTTPS proxy requests require CONNECT');
    } catch { response.writeHead(403).end(); return; }
    const upstream = http.request({
      hostname: hostname(url), port: url.port || 80, path: url.pathname + url.search,
      method: request.method, headers: { ...request.headers, host: url.host }, timeout: 30000,
    }, result => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    });
    upstream.on('socket', track);
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on('error', () => upstream.destroy());
    request.pipe(upstream);
  });
  proxy.on('connection', track);
  proxy.on('connect', (request, socket, head) => {
    let url;
    try {
      url = proxyTunnelTarget(request.url, config);
    } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    const upstream = track(net.connect({ host: hostname(url), port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) }));
    upstream.setTimeout(30000, () => upstream.destroy());
    upstream.on('connect', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.on('close', () => socket.destroy());
  });
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  return {
    settings: { server: `http://127.0.0.1:${proxy.address().port}`, bypass: '<-loopback>' },
    close: () => new Promise(resolve => {
      proxy.close(resolve);
      for (const socket of sockets) socket.destroy();
    }),
  };
}

export function scopedApiRequest(request, config) {
  if (!config.allowLocalTestCertificate) return request;
  return new Proxy(request, {
    get(target, property) {
      if (['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head'].includes(property)) {
        return (url, options = {}) => {
          check(typeof url === 'string' || url instanceof URL, 'Scoped API request requires an explicit URL');
          checkLocalRequest(url, config);
          check(options.ignoreHTTPSErrors === undefined || options.ignoreHTTPSErrors === true, 'Invalid local certificate request option');
          check(options.maxRedirects === undefined || options.maxRedirects === 0, 'Local certificate API requests cannot follow redirects');
          return target[property](String(url), { ...options, ignoreHTTPSErrors: true, maxRedirects: 0 });
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export async function createTestContext(browser, config) {
  const proxy = config.allowLocalTestCertificate ? await createLoopbackProxy(config) : undefined;
  let context;
  try {
    context = await browser.newContext({ ignoreHTTPSErrors: config.allowLocalTestCertificate, ...(proxy ? { proxy: proxy.settings, serviceWorkers: 'block' } : {}) });
  } catch (error) { await proxy?.close(); throw error; }
  if (!config.allowLocalTestCertificate) return context;
  try {
    await context.route('**/*', route => {
      try { checkLocalRequest(route.request().url(), config); }
      catch { return route.abort('blockedbyclient'); }
      return route.continue();
    });
    const request = scopedApiRequest(context.request, config);
    return new Proxy(context, {
      get(target, property) {
        if (property === 'request') return request;
        if (property === 'close') return async () => {
          try { await target.close(); } finally { await proxy.close(); }
        };
        if (property === 'newPage') return async () => {
          const page = await target.newPage();
          return new Proxy(page, {
            get(pageTarget, pageProperty) {
              if (pageProperty === 'request') return request;
              const value = Reflect.get(pageTarget, pageProperty, pageTarget);
              return typeof value === 'function' ? value.bind(pageTarget) : value;
            },
          });
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  } catch (error) {
    try { await context.close(); } finally { await proxy.close(); }
    throw error;
  }
}

export function observeOwnerAuthorization(page, config, discovery) {
  const captured = { bearerTokens: new Set() };
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === config.ADMIN_URL && url.pathname === new URL(discovery.authorization_endpoint).pathname) {
      captured.transaction = {
        nonce: url.searchParams.get('nonce'), state: url.searchParams.get('state'),
        callback: url.searchParams.get('redirect_uri'), clientId: url.searchParams.get('client_id'),
        codeChallenge: url.searchParams.get('code_challenge'), codeChallengeMethod: url.searchParams.get('code_challenge_method'),
      };
    }
    if (url.origin === config.ADMIN_URL && url.pathname === '/console/callback') captured.callback = url.href;
    if ([config.ISSUER_URL, config.ADMIN_URL].includes(url.origin)) {
      void request.allHeaders().then(headers => {
        if (headers.authorization?.startsWith('Bearer ')) captured.bearerTokens.add(headers.authorization.slice(7));
      }).catch(() => {});
    }
  });
  page.on('response', response => {
    if (response.url() === discovery.token_endpoint && response.ok()) {
      void response.json().then(body => {
        if (body.access_token) captured.bearerTokens.add(body.access_token);
        if (body.id_token) captured.tokens = body;
      }).catch(() => {});
    }
  });
  return captured;
}

export function validateLifecycleToken(token, jwks, expected, timeout, now = Math.floor(Date.now() / 1000)) {
  check(Number.isInteger(timeout) && timeout >= 1000 && timeout <= 300000, 'Invalid lifecycle timeout');
  validateJwt(token, jwks, { ...expected, now });
  return validateJwt(token, jwks, { ...expected, now: now + Math.ceil(timeout / 1000) + 180 });
}

export function validateConsoleIdToken(token, jwks, { issuer, nonce }) {
  const expected = { issuer, audience: 'admin-console', authorizedParty: 'admin-console' };
  if (nonce !== null && nonce !== undefined) {
    check(typeof nonce === 'string' && nonce.length > 0, 'Invalid console nonce');
    expected.nonce = nonce;
  }
  return validateJwt(token, jwks, expected);
}

export async function consoleResourceGrant(request, discovery, jwks, refreshToken, audience, ownerId) {
  check([managementAudience, meAudience].includes(audience), 'Invalid console resource');
  check(typeof refreshToken === 'string' && refreshToken.length > 0, 'Native console refresh token required');
  const tokens = await jsonRequest(request, discovery.token_endpoint, {
    method: 'POST', form: { grant_type: 'refresh_token', client_id: 'admin-console', refresh_token: refreshToken, resource: audience, scope: 'all' },
  });
  validateJwt(tokens.access_token, jwks, { issuer: discovery.issuer, audience, authorizedParty: 'admin-console', subject: ownerId, scopes: ['all'] });
  return tokens;
}

export function runLifecycle(config, operation, ownerId) {
  check(['restart', 'fresh-restore', 'recovery'].includes(operation), 'Invalid lifecycle operation');
  return new Promise((resolve, reject) => {
    const child = spawn(config.LIFECYCLE_HELPER, [operation], { env: config, stdio: ['pipe', 'pipe', 'ignore'], detached: true });
    let output = '';
    let failure;
    let forceKill;
    const stop = () => {
      failure = new Error('Lifecycle helper exceeded bounds');
      if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
      forceKill ??= setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 1000);
    };
    const timer = setTimeout(stop, config.lifecycleTimeout);
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ protocol: 1, issuerUrl: config.ISSUER_URL, adminUrl: config.ADMIN_URL, ownerId }));
    child.stdout.on('data', chunk => { output += chunk; if (Buffer.byteLength(output) > 16384) { output = ''; stop(); } });
    child.on('error', () => { clearTimeout(timer); clearTimeout(forceKill); reject(new Error('Lifecycle helper could not start')); });
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(forceKill);
      if (failure || code !== 0) return reject(new Error('Lifecycle helper failed or exceeded bounds'));
      try {
        const receipt = JSON.parse(output);
        check(receipt.operation === operation && receipt.performed === true, 'Invalid lifecycle receipt');
        if (operation === 'fresh-restore') check(receipt.cold === true && receipt.freshDatabase === true && receipt.fullSql === true, 'Full SQL cold restore receipt required');
        if (operation === 'recovery') check(receipt.method === 'admin-management-api' && receipt.ownerId === ownerId, 'Supported admin recovery receipt required');
        resolve();
      } catch { reject(new Error('Invalid lifecycle helper receipt')); }
    });
  });
}

async function openGate(context, config) {
  const response = await context.request.get(`${config.ADMIN_URL}/__gate/login`, {
    headers: { Authorization: `Basic ${Buffer.from(`operator:${config.ADMIN_GATE_PASSWORD}`).toString('base64')}` },
    maxRedirects: 0, timeout: 30000,
  });
  check(response.status() === 303, 'Operator gate login failed');
}

export async function waitFor(page, predicate, message, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(message);
}

export async function ownerUi(browser, config, password, { first = false } = {}) {
  const context = await createTestContext(browser, config);
  try {
    await openGate(context, config);
    const { discovery, jwks } = await discover(context.request, config.ADMIN_URL);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const captured = observeOwnerAuthorization(page, config, discovery);
    await page.goto(`${config.ADMIN_URL}/console`);
    if (first) {
      await page.waitForURL(url => url.origin === config.ADMIN_URL && url.pathname === '/console/welcome');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
    } else {
      await waitFor(page, () => new URL(page.url()).pathname.startsWith('/sign-in') || new URL(page.url()).pathname.startsWith('/register'), 'Native owner sign-in did not start');
    }
    await page.locator('input[name="identifier"]:visible').fill(config.OWNER_USERNAME);
    if (first) {
      await page.locator('button[type="submit"]').click();
      await page.locator('input[name="newPassword"]').fill(password);
      const confirmation = page.locator('input[name="confirmPassword"]');
      if (await confirmation.count()) await confirmation.fill(password);
    } else {
      await page.locator('input[name="password"]').fill(password);
    }
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.origin === config.ADMIN_URL && url.pathname.startsWith('/console') && !url.pathname.endsWith('/callback'));
    await waitFor(page, () => captured.tokens, 'Native console did not issue owner tokens');
    const { transaction: nativeTransaction, callback: nativeCallback, tokens: nativeTokens } = captured;
    check(nativeTransaction?.callback === `${config.ADMIN_URL}/console/callback` && nativeTransaction.state && nativeTransaction.clientId === 'admin-console' && nativeTransaction.codeChallengeMethod === 'S256' && /^[A-Za-z0-9_-]{43}$/.test(nativeTransaction.codeChallenge ?? ''), 'Unexpected native console callback or PKCE');
    validateCallback(nativeCallback, nativeTransaction.callback, nativeTransaction.state);
    const owner = validateConsoleIdToken(nativeTokens.id_token, jwks, { issuer: discovery.issuer, nonce: nativeTransaction.nonce });
    const select = audience => {
      for (const token of captured.bearerTokens) {
        try {
          validateJwt(token, jwks, { issuer: discovery.issuer, audience, authorizedParty: 'admin-console', subject: owner.sub, scopes: ['all'] });
          return token;
        } catch {}
      }
    };
    let refreshToken = nativeTokens.refresh_token;
    for (const audience of [managementAudience, meAudience]) {
      if (!select(audience)) {
        const grant = await consoleResourceGrant(context.request, discovery, jwks, refreshToken, audience, owner.sub);
        captured.bearerTokens.add(grant.access_token);
        if (grant.refresh_token) refreshToken = grant.refresh_token;
      }
    }
    const managementToken = select(managementAudience);
    const meToken = select(meAudience);
    await jsonRequest(context.request, `${config.ISSUER_URL}/api/applications`, { token: managementToken });
    const profile = await jsonRequest(context.request, `${config.ADMIN_URL}/me`, { token: meToken });
    check(profile.id === owner.sub, 'Owner native subject and profile differ');
    return { context, page, ownerId: owner.sub, managementToken, meToken, jwks, discovery };
  } catch (error) { await context.close(); throw error; }
}

export async function rejectedToken(request, endpoint, form, expectedError, expectedStatus = 400) {
  check([400, 403].includes(expectedStatus), 'Invalid expected OAuth rejection status');
  const response = await request.post(endpoint, { form, timeout: 30000 });
  check(response.status() === expectedStatus, `Expected OAuth rejection HTTP ${expectedStatus}; received HTTP ${response.status()}`);
  const body = await response.json();
  check(body.error === expectedError, 'Unexpected OIDC rejection code');
}

async function passwordRejected(browser, config, owner, password) {
  const context = await createTestContext(browser, config);
  try {
    await openGate(context, config);
    const page = await context.newPage();
    const request = authorizationRequest(owner.discovery, { clientId: 'admin-console', callback: `${config.ADMIN_URL}/console/callback`, scopes: ['all'], resources: [managementAudience] });
    await page.goto(request.url);
    await jsonRequest(context.request, `${config.ADMIN_URL}/api/experience`, { method: 'PUT', data: { interactionEvent: 'SignIn' }, statuses: [204] });
    const response = await context.request.post(`${config.ADMIN_URL}/api/experience/verification/password`, { data: { identifier: { type: 'username', value: config.OWNER_USERNAME }, password }, timeout: 30000 });
    check([400, 401, 422].includes(response.status()), 'Previous owner password still accepted');
    const body = await response.json();
    check(body.code === 'session.invalid_credentials' || body.code === 'user.invalid_password', 'Owner password denial was not a credential rejection');
  } finally { await context.close(); }
}

export async function runNativeRegression(env = process.env) {
  const config = readConfiguration(env);
  const { chromium } = await import(pathToFileURL(config.PLAYWRIGHT_MODULE).href);
  check(typeof chromium?.launch === 'function', 'PLAYWRIGHT_MODULE must export Chromium');
  const browser = await chromium.launch(browserLaunchOptions(config));
  let owner;
  let userContext;
  let server;
  try {
    phase = 'native first owner welcome and password registration';
    owner = await ownerUi(browser, config, config.OWNER_PASSWORD, { first: true });
    const unauthorized = await createTestContext(browser, config);
    try {
      for (const headers of [{}, { Authorization: `Bearer ${randomValue()}` }]) {
        const response = await unauthorized.request.get(`${config.ISSUER_URL}/api/applications`, { headers, timeout: 30000 });
        check([401, 403].includes(response.status()), 'Management API accepted absent or invalid native credentials');
      }
      const adminDenied = await unauthorized.request.get(`${config.ADMIN_URL}/console`, { timeout: 30000 });
      check(adminDenied.status() === 401, 'Operator gate accepted an unauthenticated browser');
    } finally { await unauthorized.close(); }
    gate('native-owner-welcome-password-management');
    let managementToken = owner.managementToken;
    const api = (path, options = {}) => jsonRequest(owner.context.request, `${config.ISSUER_URL}/api/${path}`, { token: managementToken, ...options });
    const tag = randomValue().slice(0, 12);

    phase = 'native Management API client registration';
    const m2m = await api('applications', { method: 'POST', data: { name: `native-regression-management-${tag}`, type: 'MachineToMachine' }, statuses: [200] });
    const secret = await api(`applications/${m2m.id}/secrets`, { method: 'POST', data: { name: 'native-regression' }, statuses: [201] });
    const resourceRows = await api('resources');
    const resource = resourceRows.find(row => row.indicator === managementAudience);
    check(resource, 'Native Management API resource missing');
    const resourceScopes = await api(`resources/${resource.id}/scopes`);
    const allScope = resourceScopes.find(row => row.name === 'all');
    check(allScope, 'Native Management API scope missing');
    const managementRole = await api('roles', { method: 'POST', data: { name: `native-management-${tag}`, description: 'Disposable regression management role', type: 'MachineToMachine', scopeIds: [allScope.id] }, statuses: [200] });
    await api(`applications/${m2m.id}/roles`, { method: 'POST', data: { roleIds: [managementRole.id] }, statuses: [201] });
    const { discovery, jwks } = await discover(owner.context.request, config.ISSUER_URL);
    const managementGrant = async () => {
      managementToken = await nativeManagementGrant(owner.context.request, discovery, jwks, m2m.id, secret.value, config.ISSUER_URL);
      return managementToken;
    };
    await managementGrant();
    gate('native-management-client-registration-and-grant');

    const orgScopes = [`read:a:${tag}`, `read:b:${tag}`];
    const expectedResources = new Map();
    server = http.createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/callback' || url.pathname === '/signed-out') return response.writeHead(200).end('Native regression callback');
      const scope = expectedResources.get(url.pathname);
      if (!scope) return response.writeHead(404).end();
      try {
        const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        validateJwt(token, jwks, { issuer: discovery.issuer, audience: `urn:logto:organization:${url.pathname.split('/').at(-1)}`, scopes: [scope] });
        response.writeHead(200).end('Allowed');
      } catch (error) {
        const reason = /^[A-Za-z ]{1,80}$/.test(error.message) ? error.message : 'Token rejected';
        response.setHeader('X-Native-Test-Denial', reason);
        response.writeHead(403).end('Denied');
      }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const relyingParty = `http://127.0.0.1:${server.address().port}`;
    config.loopbackHttpOrigins.add(relyingParty);
    const callback = `${relyingParty}/callback`;
    const signedOut = `${relyingParty}/signed-out`;
    const application = await api('applications', { method: 'POST', data: { name: `native-regression-pkce-${tag}`, type: 'SPA', oidcClientMetadata: { redirectUris: [callback], postLogoutRedirectUris: [signedOut] } }, statuses: [200] });
    const previousExperience = await api('sign-in-exp');
    await api('sign-in-exp', { method: 'PATCH', data: { signInMode: 'SignInAndRegister', signUp: { identifiers: ['username'], password: true, verify: false }, signIn: { methods: [{ identifier: 'username', isPasswordPrimary: true, password: true, verificationCode: false }] } } });

    const organizations = [];
    const organizationRoles = [];
    for (let i = 0; i < 2; i += 1) {
      const organization = await api('organizations', { method: 'POST', data: { name: `Native ${i}-${tag}` }, statuses: [201] });
      const scope = await api('organization-scopes', { method: 'POST', data: { name: orgScopes[i] }, statuses: [201] });
      const role = await api('organization-roles', { method: 'POST', data: { name: `native-org-role-${i}-${tag}`, type: 'User', organizationScopeIds: [scope.id] }, statuses: [201] });
      organizations.push(organization);
      organizationRoles.push(role);
      expectedResources.set(`/protected/${organization.id}`, orgScopes[i]);
    }

    phase = 'native end-user signup and PKCE signature checks';
    userContext = await createTestContext(browser, config);
    const page = await userContext.newPage();
    page.setDefaultTimeout(30000);
    const consumedStates = new Set();
    const credentials = { clientId: application.id, callback, username: config.USER_USERNAME, password: config.USER_PASSWORD, consumedStates, scopes: [organizationScope, ...orgScopes], resources: [organizationResource] };
    const signIn = async (register = false) => {
      const result = await nativePasswordAuthorization(page, config.ISSUER_URL, discovery, { ...credentials, register });
      const tokens = await exchangeCode(userContext.request, discovery, result.transaction, result.code);
      const claims = validateIdToken(tokens.id_token, jwks, { issuer: discovery.issuer, audience: application.id, nonce: result.transaction.nonce });
      check(typeof tokens.refresh_token === 'string' && tokens.refresh_token.length > 0, 'Native refresh token missing');
      return { ...result, tokens, claims };
    };
    let session = await signIn(true);
    const userId = session.claims.sub;
    const nativeUser = await api(`users/${userId}`);
    check(nativeUser.username === config.USER_USERNAME, 'Native end-user signup subject mismatch');
    gate('native-end-user-signup-s256-id-signature-issuer-audience-state-nonce');
    const codeForm = { grant_type: 'authorization_code', client_id: application.id, redirect_uri: callback, code_verifier: session.transaction.verifier, code: session.code };
    await rejectedToken(userContext.request, discovery.token_endpoint, codeForm, 'invalid_grant');
    const wrongVerifier = await nativePasswordAuthorization(page, config.ISSUER_URL, discovery, credentials);
    await rejectedToken(userContext.request, discovery.token_endpoint, { ...codeForm, code: wrongVerifier.code, code_verifier: randomValue() }, 'invalid_grant');
    const wrongCallback = await nativePasswordAuthorization(page, config.ISSUER_URL, discovery, credentials);
    await rejectedToken(userContext.request, discovery.token_endpoint, { ...codeForm, code: wrongCallback.code, code_verifier: wrongCallback.transaction.verifier, redirect_uri: `${callback}/unregistered` }, 'invalid_grant');
    gate('native-code-replay-wrong-verifier-wrong-callback-rejected');
    session = await signIn();
    check(session.claims.sub === userId, 'Native password login changed subject');
    const denial = await userContext.request.get(`${config.ISSUER_URL}/api/users`, { headers: { Authorization: `Bearer ${session.tokens.access_token}` }, timeout: 30000 });
    check([401, 403].includes(denial.status()), 'Non-admin end-user accessed Management API');
    await openGate(userContext, config);
    const adminDenial = await userContext.request.get(`${config.ADMIN_URL}/api/users`, { headers: { Authorization: `Bearer ${session.tokens.access_token}` }, timeout: 30000 });
    check([401, 403].includes(adminDenial.status()), 'End-user accessed admin-tenant Management API');
    const adminError = await adminDenial.json();
    check(['auth.unauthorized', 'auth.forbidden'].includes(adminError.code), 'Admin-tenant denial did not come from native authorization');
    gate('native-password-login-nonadmin-management-denial');

    phase = 'native two-organization membership role and scope boundaries';
    for (let i = 0; i < 2; i += 1) {
      const organization = organizations[i];
      const role = organizationRoles[i];
      await api(`organizations/${organization.id}/users`, { method: 'POST', data: { userIds: [userId] }, statuses: [201], parseBody: false });
      await api(`organizations/${organization.id}/users/${userId}/roles`, { method: 'POST', data: { organizationRoleIds: [role.id] }, statuses: [201], parseBody: false });
    }
    session = await signIn();
    let refreshToken = session.tokens.refresh_token;
    const issuedOrganizationTokens = [];
    const orgGrant = async index => {
      const result = await organizationToken(userContext.request, discovery, application.id, refreshToken, organizations[index].id, orgScopes);
      if (result.refresh_token) refreshToken = result.refresh_token;
      const claims = validateJwt(result.access_token, jwks, { issuer: discovery.issuer, audience: `urn:logto:organization:${organizations[index].id}`, subject: userId, scopes: [orgScopes[index]] });
      check(!claims.scope.split(' ').includes(orgScopes[1 - index]), 'Cross-organization scope leaked');
      return result.access_token;
    };
    for (let i = 0; i < 2; i += 1) {
      const token = await orgGrant(i);
      issuedOrganizationTokens.push(token);
      const allowed = await userContext.request.get(`${relyingParty}/protected/${organizations[i].id}`, { headers: { Authorization: `Bearer ${token}` } });
      const denied = await userContext.request.get(`${relyingParty}/protected/${organizations[1 - i].id}`, { headers: { Authorization: `Bearer ${token}` } });
      check(allowed.status() === 200 && denied.status() === 403, `Organization resource boundary failed: allowed HTTP ${allowed.status()}, denied HTTP ${denied.status()}, reason ${allowed.headers()['x-native-test-denial'] ?? 'none'}`);
    }
    await api(`organizations/${organizations[1].id}/users/${userId}`, { method: 'DELETE', statuses: [204] });
    await rejectedToken(userContext.request, discovery.token_endpoint, { grant_type: 'refresh_token', client_id: application.id, refresh_token: refreshToken, organization_id: organizations[1].id, scope: [organizationScope, ...orgScopes].join(' ') }, 'access_denied', 403);
    const freshMembership = await api(`organizations/${organizations[1].id}/users`);
    check(!freshMembership.some(user => user.id === userId), 'Membership deletion did not persist');
    gate('native-two-org-issued-token-scope-allow-crossorg-deny-absent-membership-deny');

    phase = 'native logout invalidates browser session';
    const logout = new URL(discovery.end_session_endpoint);
    logout.searchParams.set('id_token_hint', session.tokens.id_token);
    logout.searchParams.set('post_logout_redirect_uri', signedOut);
    logout.searchParams.set('state', randomValue());
    await page.goto(logout.href);
    await page.waitForURL(url => url.origin === relyingParty && url.pathname === '/signed-out');
    check(new URL(page.url()).origin === relyingParty && new URL(page.url()).pathname === '/signed-out' && new URL(page.url()).searchParams.get('state') === logout.searchParams.get('state'), 'Native logout callback mismatch');
    const silent = authorizationRequest(discovery, { ...credentials, prompt: 'none' });
    await page.goto(silent.url);
    const silentUrl = new URL(page.url());
    check(silentUrl.origin === relyingParty && silentUrl.pathname === '/callback' && silentUrl.searchParams.get('state') === silent.state && silentUrl.searchParams.get('error') === 'login_required' && !silentUrl.searchParams.has('code'), 'Native logout did not end OIDC session');
    gate('native-logout-state-and-silent-login-denial');

    session = await signIn();
    refreshToken = session.tokens.refresh_token;
    await orgGrant(0);

    const snapshot = await api(`applications/${application.id}`);
    const roleSnapshot = await api(`organizations/${organizations[0].id}/users/${userId}/roles`);
    const signingSnapshot = await jsonRequest(userContext.request, discovery.jwks_uri);
    const beforeLifecycle = async () => {
      issuedOrganizationTokens[0] = await orgGrant(0);
      for (const [index, token] of issuedOrganizationTokens.entries()) {
        validateLifecycleToken(token, jwks, { issuer: discovery.issuer, audience: `urn:logto:organization:${organizations[index].id}`, subject: userId, scopes: [orgScopes[index]] }, config.lifecycleTimeout);
      }
    };
    const continuity = async (label, ownerPassword = config.OWNER_PASSWORD) => {
      await openGate(owner.context, config);
      const fresh = await discover(userContext.request, config.ISSUER_URL);
      check(JSON.stringify(fresh.jwks) === JSON.stringify(signingSnapshot), 'Issuer signing keys changed across lifecycle');
      check(fresh.discovery.issuer === discovery.issuer, 'Issuer changed across lifecycle');
      await managementGrant();
      const app = await api(`applications/${application.id}`);
      check(JSON.stringify(app.oidcClientMetadata) === JSON.stringify(snapshot.oidcClientMetadata), 'Registered callback/client changed across lifecycle');
      const roles = await api(`organizations/${organizations[0].id}/users/${userId}/roles`);
      check(JSON.stringify(roles.map(role => role.id).sort()) === JSON.stringify(roleSnapshot.map(role => role.id).sort()), 'Organization role continuity failed');
      const survivingToken = await orgGrant(0);
      const resourceResponse = await userContext.request.get(`${relyingParty}/protected/${organizations[0].id}`, { headers: { Authorization: `Bearer ${survivingToken}` } });
      check(resourceResponse.status() === 200, 'Surviving lifecycle token failed resource authorization');
      await rejectedToken(userContext.request, discovery.token_endpoint, { grant_type: 'refresh_token', client_id: application.id, refresh_token: refreshToken, organization_id: organizations[1].id, scope: [organizationScope, ...orgScopes].join(' ') }, 'access_denied', 403);
      const login = await signIn();
      check(login.claims.sub === userId, 'Native end-user continuity failed');
      for (const [index, token] of issuedOrganizationTokens.entries()) {
        validateJwt(token, fresh.jwks, { issuer: discovery.issuer, audience: `urn:logto:organization:${organizations[index].id}`, subject: userId, scopes: [orgScopes[index]] });
      }
      const nativeOwner = await ownerUi(browser, config, ownerPassword);
      try {
        check(nativeOwner.ownerId === owner.ownerId, 'Native owner continuity failed');
        check(JSON.stringify(nativeOwner.jwks) === JSON.stringify(owner.jwks), 'Admin issuer signing keys changed across lifecycle');
      } finally { await nativeOwner.context.close(); }
      gate(label);
    };
    phase = 'actual restart continuity';
    await beforeLifecycle();
    await runLifecycle(config, 'restart', owner.ownerId);
    await continuity('native-owner-client-signing-role-token-restart-continuity');
    phase = 'actual full SQL cold restore continuity';
    await beforeLifecycle();
    await runLifecycle(config, 'fresh-restore', owner.ownerId);
    await continuity('native-owner-client-signing-role-token-full-sql-cold-restore-continuity');

    phase = 'supported admin owner recovery';
    await beforeLifecycle();
    await runLifecycle(config, 'recovery', owner.ownerId);
    await passwordRejected(browser, config, owner, config.OWNER_PASSWORD);
    await continuity('native-admin-api-owner-recovery-old-denied-new-login-same-subject-and-continuity', config.OWNER_RECOVERED_PASSWORD);
    await api('sign-in-exp', { method: 'PATCH', data: { signInMode: previousExperience.signInMode, signUp: previousExperience.signUp, signIn: previousExperience.signIn } });
    process.stdout.write('PASS all native gates; lifecycle mechanics require parent helper evidence\n');
  } finally {
    await userContext?.close();
    await owner?.context.close();
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNativeRegression().catch(() => {
    process.stderr.write(`FAIL ${phase}; completed ${passed.length} gates; remaining gates pending\n`);
    process.exitCode = 1;
  });
}
