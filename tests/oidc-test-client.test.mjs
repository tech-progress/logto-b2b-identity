import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  authorizationRequest, jsonRequest, nativeManagementGrant, organizationToken, s256, validateCallback, validateIdToken, validateJwt,
} from '../scripts/oidc-test-client.mjs';
import {
  browserLaunchOptions, checkLocalRequest, consoleResourceGrant, createTestContext, observeOwnerAuthorization,
  proxyTunnelTarget, readConfiguration, rejectedToken, scopedApiRequest, validateConsoleIdToken, validateLifecycleToken, waitFor,
} from '../scripts/test-https-browser.mjs';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
const now = 1900000000;
const expected = { issuer: 'https://issuer.example/oidc', audience: 'client-a', nonce: 'fresh-nonce', now };
const claims = { iss: expected.issuer, aud: expected.audience, sub: 'native-user', nonce: expected.nonce, iat: now - 10, exp: now + 100, scope: 'read:org' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwks = { keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'rsa-key', alg: 'RS256', use: 'sig' }] };

function token(payload = {}, header = {}, pair = rsa) {
  const algorithm = pair === ec ? 'ES384' : 'RS256';
  const input = `${encode({ alg: algorithm, kid: pair === ec ? 'ec-key' : 'rsa-key', ...header })}.${encode({ ...claims, ...payload })}`;
  return `${input}.${sign(pair === ec ? 'sha384' : 'sha256', Buffer.from(input), { key: pair.privateKey, ...(pair === ec ? { dsaEncoding: 'ieee-p1363' } : {}) }).toString('base64url')}`;
}

test('verifies RSA and the pinned default P-384 issuer signatures', () => {
  assert.equal(validateIdToken(token(), jwks, expected).sub, claims.sub);
  const ecJwks = { keys: [{ ...ec.publicKey.export({ format: 'jwk' }), kid: 'ec-key', alg: 'ES384', use: 'sig' }] };
  assert.equal(validateIdToken(token({}, {}, ec), ecJwks, expected).sub, claims.sub);
});

test('native console validates signed identity when its SDK omits optional nonce', () => {
  const current = Math.floor(Date.now() / 1000);
  const identity = token({ aud: 'admin-console', nonce: undefined, iat: current - 1, exp: current + 120 });
  assert.equal(validateConsoleIdToken(identity, jwks, { issuer: expected.issuer, nonce: null }).sub, claims.sub);
  assert.throws(() => validateConsoleIdToken(token({ aud: 'attacker', iat: current - 1, exp: current + 120 }), jwks, { issuer: expected.issuer }), /audience/);
  assert.throws(() => validateConsoleIdToken(identity, jwks, { issuer: 'https://attacker.example/oidc' }), /issuer/);
  const parts = identity.split('.');
  assert.throws(() => validateConsoleIdToken([parts[0], encode({ ...claims, aud: 'admin-console' }), parts[2]].join('.'), jwks, { issuer: expected.issuer }), /signature/);
  assert.throws(() => validateIdToken(identity, jwks, { issuer: expected.issuer, audience: 'admin-console' }), /nonce/);
});

test('native console enforces a nonce whenever its authorization requested one', () => {
  const current = Math.floor(Date.now() / 1000);
  const identity = token({ aud: 'admin-console', iat: current - 1, exp: current + 120 });
  assert.equal(validateConsoleIdToken(identity, jwks, { issuer: expected.issuer, nonce: expected.nonce }).sub, claims.sub);
  for (const nonce of ['', 'wrong-nonce', 42]) assert.throws(() => validateConsoleIdToken(identity, jwks, { issuer: expected.issuer, nonce }), /nonce/);
});

test('console resource grant obtains and verifies genuine resource-scoped owner tokens', async () => {
  const current = Math.floor(Date.now() / 1000);
  const audience = 'https://admin.logto.app/me';
  const identity = token({ aud: audience, azp: 'admin-console', iat: current - 1, exp: current + 120, scope: 'all' });
  const requests = [];
  const request = { fetch: async (url, options) => {
    requests.push({ url, options });
    return { status: () => 200, text: async () => JSON.stringify({ access_token: identity, refresh_token: 'rotated-native-grant' }) };
  } };
  const discovery = { issuer: expected.issuer, token_endpoint: 'https://issuer.example/oidc/token' };
  assert.equal((await consoleResourceGrant(request, discovery, jwks, 'native-grant', audience, claims.sub)).access_token, identity);
  assert.deepEqual(requests[0].options.form, { grant_type: 'refresh_token', client_id: 'admin-console', refresh_token: 'native-grant', resource: audience, scope: 'all' });
  await assert.rejects(consoleResourceGrant(request, discovery, jwks, '', audience, claims.sub), /refresh token/);
  await assert.rejects(consoleResourceGrant(request, discovery, jwks, 'native-grant', 'https://attacker.example/api', claims.sub), /resource/);
  await assert.rejects(consoleResourceGrant(request, discovery, jwks, 'native-grant', audience, 'attacker'), /subject/);
});

test('OAuth rejection requires the exact status and error for each native failure', async () => {
  const request = (status, error) => ({ post: async () => ({ status: () => status, json: async () => ({ error }) }) });
  await rejectedToken(request(400, 'invalid_grant'), 'https://issuer.example/oidc/token', {}, 'invalid_grant');
  await rejectedToken(request(403, 'access_denied'), 'https://issuer.example/oidc/token', {}, 'access_denied', 403);
  await assert.rejects(rejectedToken(request(400, 'access_denied'), 'https://issuer.example/oidc/token', {}, 'access_denied', 403), /received HTTP 400/);
  await assert.rejects(rejectedToken(request(403, 'invalid_grant'), 'https://issuer.example/oidc/token', {}, 'access_denied', 403), /rejection code/);
  for (const status of [200, 401, 500]) await assert.rejects(rejectedToken(request(status, 'access_denied'), 'https://issuer.example/oidc/token', {}, 'access_denied', 403), /received HTTP/);
});

test('bodyless native writes verify exact status without parsing Koa Created text', async () => {
  const request = status => ({ fetch: async () => ({ status: () => status, text: async () => 'Created' }) });
  assert.equal(await jsonRequest(request(201), 'https://issuer.example/api/experience/identification', { statuses: [201], parseBody: false }), undefined);
  await assert.rejects(jsonRequest(request(400), 'https://issuer.example/api/experience/identification', { statuses: [201], parseBody: false }), /HTTP 400/);
  await assert.rejects(jsonRequest(request(201), 'https://issuer.example/api/experience/identification', { statuses: [201] }), SyntaxError);
  await assert.rejects(jsonRequest(request(201), 'https://issuer.example/api/experience/identification', { parseBody: 'false' }), /policy/);
});

test('rejects tampered payload and signature using actual cryptographic verification', () => {
  const original = token().split('.');
  assert.throws(() => validateIdToken([original[0], encode({ ...claims, sub: 'attacker' }), original[2]].join('.'), jwks, expected), /signature/);
  const signature = Buffer.from(original[2], 'base64url');
  signature[0] ^= 1;
  assert.throws(() => validateIdToken([original[0], original[1], signature.toString('base64url')].join('.'), jwks, expected), /signature/);
});

test('rejects unsigned, symmetric, token-supplied keys and unadvertised algorithms', () => {
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { alg: 'RS512' }, { jku: 'https://attacker.example/keys' }, { jwk: jwks.keys[0] }, { x5u: 'https://attacker.example/cert' }, { crit: ['b64'] }, { b64: false }]) {
    assert.throws(() => validateIdToken(token({}, header), jwks, expected));
  }
  assert.throws(() => validateIdToken(token(), jwks, { ...expected, algorithms: ['ES384'] }), /algorithm/);
});

test('rejects missing, unknown, ambiguous or incompatible issuer keys', () => {
  for (const keys of [[], [jwks.keys[0], jwks.keys[0]], [{ ...jwks.keys[0], kid: 'other' }], [{ ...jwks.keys[0], use: 'enc' }], [{ ...jwks.keys[0], key_ops: ['sign'] }], [{ ...jwks.keys[0], alg: 'ES384' }], [{ ...jwks.keys[0], d: 'private' }]]) {
    assert.throws(() => validateIdToken(token(), { keys }, expected));
  }
  assert.throws(() => validateIdToken(token({}, { kid: '' }), jwks, expected), /identifier/);
  assert.throws(() => validateIdToken(token(), {}, expected), /key set/);
  const mismatched = { keys: [{ ...ec.publicKey.export({ format: 'jwk' }), kid: 'ec-key', crv: 'P-256' }] };
  assert.throws(() => validateIdToken(token({}, {}, ec), mismatched, expected), /Incompatible/);
});

test('rejects wrong issuer, audience, subject, nonce and missing authorization scope', () => {
  for (const payload of [{ iss: 'https://other.example/oidc' }, { aud: 'client-b' }, { sub: '' }, { nonce: 'replayed-nonce' }, { nonce: undefined }, { scope: 'read:other' }]) {
    assert.throws(() => validateIdToken(token(payload), jwks, { ...expected, scopes: ['read:org'] }));
  }
  assert.throws(() => validateJwt(token(), jwks, { ...expected, subject: 'other-user' }), /subject/);
  assert.throws(() => validateIdToken(token(), jwks, { ...expected, nonce: undefined }), /nonce/);
  assert.throws(() => validateIdToken(token(), jwks, { ...expected, nonce: '' }), /nonce/);
});

test('enforces authorized party for multiple audiences', () => {
  assert.throws(() => validateIdToken(token({ aud: ['client-a', 'other'] }), jwks, expected), /party/);
  assert.throws(() => validateIdToken(token({ aud: ['client-a', 'other'], azp: 'other' }), jwks, expected), /party/);
  assert.throws(() => validateIdToken(token({ aud: ['client-a', 'client-a'], azp: 'client-a' }), jwks, expected), /audience/);
  assert.throws(() => validateIdToken(token({ aud: [123, 'client-a'], azp: 'client-a' }), jwks, expected), /audience/);
  assert.equal(validateIdToken(token({ aud: ['client-a', 'other'], azp: 'client-a' }), jwks, expected).azp, 'client-a');
});

test('enforces numeric expiration, issue time, not-before and nonempty subject', () => {
  for (const payload of [{ exp: now }, { exp: now - 1 }, { exp: String(now + 1) }, { exp: undefined }, { iat: undefined }, { iat: now + 31 }, { iat: now + 100 }, { nbf: now + 1 }, { nbf: '1' }, { sub: null }, { sub: {} }]) {
    assert.throws(() => validateIdToken(token(payload), jwks, expected));
  }
});

test('rejects malformed JWT structures and noncanonical encodings', () => {
  for (const malformed of ['', 'a.b', 'a.b.c.d', 'a=.b.c', 'a.b.c=', 'e30.e30.']) assert.throws(() => validateIdToken(malformed, jwks, expected));
  const [head, body, signature] = token().split('.');
  assert.throws(() => validateIdToken(`${head}.${body}=.${signature}`, jwks, expected), /encoding/);
  assert.throws(() => validateIdToken(`${encode([])}.${body}.${signature}`, jwks, expected), /object/);
});

const callback = 'http://127.0.0.1:4100/callback';
const actual = `${callback}?code=native-code&state=fresh-state`;
test('accepts exact callback once and rejects replayed state', () => {
  const consumed = new Set();
  assert.equal(validateCallback(actual, callback, 'fresh-state', consumed), 'native-code');
  assert.throws(() => validateCallback(actual, callback, 'fresh-state', consumed), /Reused/);
});

test('rejects callback destination, state, fragment, error and parameter pollution', () => {
  for (const received of [
    actual.replace('127.0.0.1', 'localhost'), actual.replace(':4100', ':4101'),
    actual.replace('/callback', '/callback/'), actual.replace('fresh-state', 'wrong-state'),
    actual.replace('fresh-state', ''), `${callback}?code=native-code`,
    `${actual}&state=attacker`, `${actual}&code=other`, `${actual}&error=access_denied`,
    `${actual}#ignored`, `${callback}?code=&state=fresh-state`,
    actual.replace('http://', 'http://attacker@'),
  ]) assert.throws(() => validateCallback(received, callback, 'fresh-state', new Set()));
  assert.throws(() => validateCallback(actual, `${callback}?preexisting=1`, 'fresh-state'));
  assert.throws(() => validateCallback(actual, callback, ''));
  assert.throws(() => validateCallback(`${callback}?error=login_required&state=fresh-state`, callback, 'fresh-state'));
});

test('S256 matches the RFC 7636 example and every authorization has fresh entropy', () => {
  assert.equal(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const discovery = { authorization_endpoint: 'https://issuer.example/oidc/auth' };
  const options = { clientId: 'client', callback, scopes: ['openid', 'read:org'], resources: ['https://api.example'] };
  const first = authorizationRequest(discovery, options);
  const second = authorizationRequest(discovery, options);
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.verifier, second.verifier);
  assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);
  const url = new URL(first.url);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), s256(first.verifier));
  assert.equal(url.searchParams.get('redirect_uri'), callback);
  assert.equal(url.searchParams.get('scope'), 'openid offline_access read:org');
  assert.equal(url.searchParams.get('prompt'), 'login consent');
});

const environment = {
  ISSUER_URL: 'https://issuer.example', ADMIN_URL: 'https://admin.example',
  ADMIN_GATE_PASSWORD: 'gate-secret-unit-fixture-only-123456',
  OWNER_USERNAME: 'unit-owner', OWNER_PASSWORD: 'old-unit-password',
  OWNER_RECOVERED_PASSWORD: 'new-unit-password', USER_USERNAME: 'unit-user',
  USER_PASSWORD: 'unit-user-password', NATIVE_TEST_DISPOSABLE: '1',
  LIFECYCLE_HELPER: '/private/parent-lifecycle-helper',
  PLAYWRIGHT_MODULE: fileURLToPath(import.meta.url),
};
test('live harness requires explicit disposable target, credentials and bounded helper', () => {
  assert.equal(readConfiguration(environment).lifecycleTimeout, 180000);
  for (const changes of [
    { NATIVE_TEST_DISPOSABLE: undefined }, { ADMIN_GATE_PASSWORD: 'short' },
    { OWNER_PASSWORD: undefined }, { OWNER_RECOVERED_PASSWORD: environment.OWNER_PASSWORD },
    { ISSUER_URL: environment.ADMIN_URL }, { ISSUER_URL: 'https://issuer.example/oidc' },
    { ISSUER_URL: 'https://secret@issuer.example' }, { ISSUER_URL: 'http://remote.example', ALLOW_LOCAL_HTTP: '1' },
    { LIFECYCLE_HELPER: 'shell command' }, { LIFECYCLE_TIMEOUT_MS: 'Infinity' },
    { LIFECYCLE_TIMEOUT_MS: '300001' }, { LIFECYCLE_TIMEOUT_MS: '0' },
  ]) assert.throws(() => readConfiguration({ ...environment, ...changes }));
  assert.equal(readConfiguration({ ...environment, ISSUER_URL: 'http://127.0.0.1:3100', ADMIN_URL: 'http://127.0.0.1:3101', ALLOW_LOCAL_HTTP: '1' }).lifecycleTimeout, 180000);
});


test('Playwright must be an explicitly supplied absolute existing module file', () => {
  for (const PLAYWRIGHT_MODULE of [undefined, '', 'playwright', './node_modules/playwright/index.mjs', '/nonexistent-native-regression-module.mjs', fileURLToPath(new URL('.', import.meta.url))]) {
    assert.throws(() => readConfiguration({ ...environment, PLAYWRIGHT_MODULE }), /PLAYWRIGHT_MODULE/);
  }
});

test('local certificate opt-in requires both exact HTTPS loopback origins', () => {
  assert.equal(readConfiguration(environment).allowLocalTestCertificate, false);
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    const config = readConfiguration({ ...environment, ISSUER_URL: `https://${hostname}:3100`, ADMIN_URL: `https://${hostname}:3101`, ALLOW_LOCAL_TEST_CERTIFICATE: '1' });
    assert.equal(config.allowLocalTestCertificate, true);
  }
  for (const [ISSUER_URL, ADMIN_URL] of [
    ['https://issuer.example', 'https://admin.example'],
    ['https://localhost:3100', 'https://admin.example'],
    ['https://issuer.example', 'https://127.0.0.1:3101'],
    ['https://localhost.evil.example:3100', 'https://localhost:3101'],
    ['https://127.0.0.2:3100', 'https://localhost:3101'],
    ['https://[::ffff:127.0.0.1]:3100', 'https://localhost:3101'],
    ['http://localhost:3100', 'https://localhost:3101'],
    ['https://localhost:3100', 'http://127.0.0.1:3101'],
    ['https://localhost:3100/path', 'https://localhost:3101'],
  ]) assert.throws(() => readConfiguration({ ...environment, ISSUER_URL, ADMIN_URL, ALLOW_LOCAL_HTTP: '1', ALLOW_LOCAL_TEST_CERTIFICATE: '1' }));
});

test('rejects invalid opt-ins and a globally disabled TLS verifier', () => {
  for (const name of ['ALLOW_LOCAL_HTTP', 'ALLOW_LOCAL_TEST_CERTIFICATE', 'ALLOW_CHROMIUM_NO_SANDBOX']) {
    for (const value of ['', 'true', 'yes', '2', 1, null]) assert.throws(() => readConfiguration({ ...environment, [name]: value }));
    assert.doesNotThrow(() => readConfiguration({ ...environment, [name]: '0' }));
  }
  assert.throws(() => readConfiguration({ ...environment, NODE_TLS_REJECT_UNAUTHORIZED: '0' }));
});

const localEnvironment = { ...environment, ISSUER_URL: 'https://localhost:3100', ADMIN_URL: 'https://127.0.0.1:3101', ALLOW_LOCAL_TEST_CERTIFICATE: '1' };

test('proxy tunnels permit only exact native origins or the registered owned HTTP relying party', () => {
  const config = readConfiguration(localEnvironment);
  assert.equal(proxyTunnelTarget('localhost:3100', config).href, 'https://localhost:3100/');
  assert.throws(() => proxyTunnelTarget('127.0.0.1:4100', config));
  config.loopbackHttpOrigins.add('http://127.0.0.1:4100');
  assert.equal(proxyTunnelTarget('127.0.0.1:4100', config).href, 'http://127.0.0.1:4100/');
  for (const authority of ['127.0.0.1:4101', 'localhost:4100', 'public.example:4100', 'localhost:3100/path', 'user@localhost:3100', 'localhost:3100?target=public.example']) assert.throws(() => proxyTunnelTarget(authority, config));
  assert.throws(() => checkLocalRequest('https://127.0.0.1:4100', config));
});

test('Chromium keeps existing launch defaults unless no-sandbox is explicitly opted in', () => {
  assert.deepEqual(browserLaunchOptions(readConfiguration(environment)), { headless: true });
  assert.deepEqual(browserLaunchOptions(readConfiguration({ ...environment, CHROMIUM_EXECUTABLE: '/existing/chromium', ALLOW_CHROMIUM_NO_SANDBOX: '1' })), { headless: true, executablePath: '/existing/chromium', chromiumSandbox: false });
});

test('certificate-test API requests reject public destinations and redirect overrides before fetching', async () => {
  const calls = [];
  const request = { fetch: async (...args) => { calls.push(args); return 'unit-response'; } };
  assert.equal(scopedApiRequest(request, readConfiguration(environment)), request);
  const local = scopedApiRequest(request, readConfiguration(localEnvironment));
  for (const url of ['https://public.example', 'http://public.example', 'https://localhost:3999', 'https://localhost.evil.example:3100', 'https://credentials@localhost:3100']) {
    assert.throws(() => local.fetch(url));
  }
  for (const options of [{ maxRedirects: 1 }, { maxRedirects: -1 }, { ignoreHTTPSErrors: 'true' }]) {
    assert.throws(() => local.fetch(localEnvironment.ISSUER_URL, options));
  }
  assert.equal(calls.length, 0);
  assert.equal(await local.fetch(localEnvironment.ISSUER_URL), 'unit-response');
  assert.deepEqual(calls[0][1], { ignoreHTTPSErrors: true, maxRedirects: 0 });
  await local.fetch('http://127.0.0.1:4100/callback');
  assert.equal(calls.length, 2);
});

test('default browser and API contexts retain strict certificate validation', async () => {
  const request = {};
  const context = { request };
  let options;
  const actual = await createTestContext({ newContext: async value => { options = value; return context; } }, readConfiguration(environment));
  assert.equal(actual, context);
  assert.equal(actual.request, request);
  assert.deepEqual(options, { ignoreHTTPSErrors: false });
});

test('opt-in contexts enforce loopback on routes, proxy tunnels and API requests without starting services', async t => {
  const proxy = new EventEmitter();
  let proxyRequest;
  let proxyClosed = false;
  proxy.listen = (_port, host, ready) => { assert.equal(host, '127.0.0.1'); ready(); };
  proxy.address = () => ({ port: 4105 });
  proxy.close = done => { proxyClosed = true; done(); };
  t.mock.method(http, 'createServer', handler => { proxyRequest = handler; return proxy; });
  const connect = t.mock.method(net, 'connect', () => { throw new Error('Unit test must not connect'); });
  let launchOptions;
  let routeHandler;
  let contextClosed = false;
  const fetches = [];
  const request = { get: async (...args) => { fetches.push(args); } };
  const page = { request, url: () => localEnvironment.ISSUER_URL };
  const context = {
    request, newPage: async () => page, close: async () => { contextClosed = true; },
    route: async (pattern, handler) => { assert.equal(pattern, '**/*'); routeHandler = handler; },
  };
  const actual = await createTestContext({ newContext: async options => { launchOptions = options; return context; } }, readConfiguration(localEnvironment));
  assert.equal(launchOptions.ignoreHTTPSErrors, true);
  assert.deepEqual(launchOptions.proxy, { server: 'http://127.0.0.1:4105', bypass: '<-loopback>' });
  assert.equal(launchOptions.serviceWorkers, 'block');
  const outcomes = [];
  for (const url of [localEnvironment.ISSUER_URL, 'https://public.example', 'https://localhost:3999']) {
    await routeHandler({ request: () => ({ url: () => url }), continue: () => outcomes.push('allowed'), abort: () => outcomes.push('denied') });
  }
  assert.deepEqual(outcomes, ['allowed', 'denied', 'denied']);
  const browserPage = await actual.newPage();
  assert.equal(browserPage.url(), localEnvironment.ISSUER_URL);
  assert.throws(() => browserPage.request.get('https://public.example'));
  await browserPage.request.get(localEnvironment.ISSUER_URL);
  assert.equal(fetches[0][1].ignoreHTTPSErrors, true);
  for (const target of ['public.example:443', 'localhost:3999', 'localhost.evil.example:3100']) {
    const denied = [];
    proxy.emit('connect', { url: target }, { end: response => denied.push(response) }, Buffer.alloc(0));
    assert.match(denied[0], /403 Forbidden/);
  }
  assert.equal(connect.mock.callCount(), 0);
  let status;
  const response = { writeHead: value => { status = value; return response; }, end() {} };
  proxyRequest({ url: 'http://public.example' }, response);
  assert.equal(status, 403);
  await actual.close();
  assert.equal(contextClosed && proxyClosed, true);
});

test('loopback policy rejects the public destination of a redirect chain', () => {
  const config = readConfiguration(localEnvironment);
  let current = checkLocalRequest(config.ISSUER_URL, config);
  current = checkLocalRequest(new URL('/redirect', current), config);
  assert.throws(() => checkLocalRequest(new URL('https://public.example/callback', current), config));
});

test('owner capture includes late request headers and late token response bodies', async () => {
  const page = new EventEmitter();
  const discovery = { authorization_endpoint: `${environment.ADMIN_URL}/oidc/auth`, token_endpoint: `${environment.ADMIN_URL}/oidc/token` };
  const captured = observeOwnerAuthorization(page, environment, discovery);
  const transaction = authorizationRequest(discovery, { clientId: 'admin-console', callback: `${environment.ADMIN_URL}/console/callback` });
  const emitRequest = (url, allHeaders = async () => ({})) => page.emit('request', { url: () => url, allHeaders });
  emitRequest(transaction.url);
  emitRequest(`${transaction.callback}?state=${transaction.state}&code=unit-native-code`);
  const code = validateCallback(captured.callback, captured.transaction.callback, captured.transaction.state);
  assert.equal(code, 'unit-native-code');
  assert.equal(captured.transaction.codeChallenge, s256(transaction.verifier));
  assert.equal(captured.transaction.codeChallengeMethod, 'S256');
  let releaseHeaders;
  emitRequest(`${environment.ISSUER_URL}/api/applications`, () => new Promise(resolve => { releaseHeaders = resolve; }));
  let releaseBody;
  page.emit('response', { url: () => discovery.token_endpoint, ok: () => true, json: () => new Promise(resolve => { releaseBody = resolve; }) });
  assert.equal(captured.bearerTokens.size, 0);
  assert.equal(captured.tokens, undefined);
  releaseBody({ id_token: 'unit-id-token', access_token: 'unit-me-token' });
  await Promise.resolve();
  assert.equal(captured.tokens.id_token, 'unit-id-token');
  assert.equal(captured.bearerTokens.has('unit-management-token'), false);
  let waits = 0;
  await waitFor({ waitForTimeout: async () => {
    waits += 1;
    releaseHeaders({ authorization: 'Bearer unit-management-token' });
    await Promise.resolve();
  } }, () => captured.tokens && captured.bearerTokens.has('unit-management-token') && captured.bearerTokens.has('unit-me-token'), 'Unit owner capture timed out', 1000);
  assert.equal(waits, 1);
  assert.equal(captured.bearerTokens.has('unit-management-token'), true);
  assert.equal(captured.bearerTokens.has('unit-me-token'), true);
  emitRequest('https://public.example', async () => ({ authorization: 'Bearer unit-untrusted-token' }));
  await Promise.resolve();
  assert.equal(captured.bearerTokens.has('unit-untrusted-token'), false);
});

test('lifecycle tokens must be valid now and past the bounded helper plus verification budget', () => {
  assert.throws(() => validateLifecycleToken(token(), jwks, expected, 1000, now), /Expired/);
  assert.equal(validateLifecycleToken(token({ exp: now + 482 }), jwks, expected, 300000, now).sub, claims.sub);
  assert.throws(() => validateLifecycleToken(token({ exp: now + 480 }), jwks, expected, 300000, now), /Expired/);
  assert.throws(() => validateLifecycleToken(token({ iat: now + 100, exp: now + 1000 }), jwks, expected, 1000, now), /issue time/);
  assert.throws(() => validateLifecycleToken(token({ exp: now + 1000 }), jwks, expected, Infinity, now), /timeout/);
});

test('native Management grants use newly issued signed credentials for live API authorization', async () => {
  const current = Math.floor(Date.now() / 1000);
  const accessToken = token({ aud: 'https://default.logto.app/api', sub: 'unit-m2m', scope: 'all', iat: current - 1, exp: current + 3600 });
  const discovery = { issuer: expected.issuer, token_endpoint: 'https://issuer.example/oidc/token' };
  const calls = [];
  const request = { fetch: async (url, options) => {
    calls.push({ url, options });
    return { status: () => 200, text: async () => JSON.stringify(url === discovery.token_endpoint ? { access_token: accessToken } : { id: 'unit-m2m' }) };
  } };
  assert.equal(await nativeManagementGrant(request, discovery, jwks, 'unit-m2m', 'unit-client-secret', 'https://issuer.example'), accessToken);
  assert.deepEqual(calls[0].options.form, { grant_type: 'client_credentials', resource: 'https://default.logto.app/api', scope: 'all' });
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('unit-m2m:unit-client-secret').toString('base64')}`);
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${accessToken}`);
  calls.length = 0;
  await assert.rejects(nativeManagementGrant(request, discovery, jwks, 'other-client', 'unit-secret', 'https://issuer.example'), /subject/);
  assert.equal(calls.length, 1);
});

test('organization refresh rejects a missing live grant before issuing any request', async () => {
  const request = { fetch: () => assert.fail('No request allowed without a refresh token') };
  for (const refresh of [undefined, null, '']) await assert.rejects(organizationToken(request, {}, 'unit-client', refresh, 'unit-org', ['read:org']), /refresh token/);
});
