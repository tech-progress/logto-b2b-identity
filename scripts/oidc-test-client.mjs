import assert from 'node:assert/strict';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';

const requireThat = (condition, message) => assert.ok(condition, message);
export const randomValue = () => randomBytes(32).toString('base64url');
export const s256 = value => createHash('sha256').update(value).digest('base64url');

export function validateCallback(actual, callback, state, consumedStates = new Set()) {
  const received = new URL(actual);
  const registered = new URL(callback);
  requireThat(!registered.search && !registered.hash && !registered.username && !registered.password, 'Invalid registered callback');
  requireThat(received.origin === registered.origin && received.pathname === registered.pathname, 'Invalid callback destination');
  requireThat(!received.hash && !received.username && !received.password, 'Invalid callback fragment or credentials');
  for (const name of ['state', 'code']) requireThat(received.searchParams.getAll(name).length === 1, 'Missing or duplicate callback parameter');
  requireThat(typeof state === 'string' && state.length > 0 && received.searchParams.get('state') === state, 'Invalid callback state');
  requireThat(!consumedStates.has(state), 'Reused callback state');
  requireThat(received.searchParams.get('code') && !received.searchParams.has('error'), 'Authorization did not produce a code');
  consumedStates.add(state);
  return received.searchParams.get('code');
}

function decodePart(part) {
  requireThat(typeof part === 'string' && /^[A-Za-z0-9_-]+$/.test(part), 'Invalid JWT encoding');
  const bytes = Buffer.from(part, 'base64url');
  requireThat(bytes.toString('base64url') === part, 'Noncanonical JWT encoding');
  const value = JSON.parse(bytes.toString('utf8'));
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Invalid JWT object');
  return value;
}

export function validateJwt(token, jwks, expected) {
  requireThat(typeof token === 'string' && token.length < 65536, 'Invalid signed token');
  const parts = token.split('.');
  requireThat(parts.length === 3 && /^[A-Za-z0-9_-]+$/.test(parts[2]), 'Invalid signed token structure');
  const [head, body, signature] = parts;
  const header = decodePart(head);
  const claims = decodePart(body);
  const algorithms = {
    RS256: { digest: 'sha256', kty: 'RSA' },
    ES256: { digest: 'sha256', kty: 'EC', crv: 'P-256' },
    ES384: { digest: 'sha384', kty: 'EC', crv: 'P-384' },
    ES512: { digest: 'sha512', kty: 'EC', crv: 'P-521' },
  };
  const algorithm = algorithms[header.alg];
  requireThat(algorithm && (expected.algorithms ?? Object.keys(algorithms)).includes(header.alg), 'Unexpected signing algorithm');
  requireThat(!header.crit && !header.jku && !header.jwk && !header.x5u && header.b64 !== false, 'Unsupported JWT header');
  requireThat(typeof header.kid === 'string' && header.kid.length > 0, 'Missing signing key identifier');
  requireThat(Array.isArray(jwks?.keys), 'Invalid signing key set');
  const keys = jwks.keys.filter(key => key.kid === header.kid);
  requireThat(keys.length === 1, 'Unknown or ambiguous signing key');
  const jwk = keys[0];
  requireThat(jwk.kty === algorithm.kty && (!algorithm.crv || jwk.crv === algorithm.crv), 'Incompatible signing key');
  requireThat(!jwk.d && (!jwk.use || jwk.use === 'sig') && (!jwk.alg || jwk.alg === header.alg) && (!jwk.key_ops || jwk.key_ops.includes('verify')), 'Invalid signing key use');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const signed = Buffer.from(head + '.' + body);
  requireThat(verify(algorithm.digest, signed, { key, ...(algorithm.kty === 'EC' ? { dsaEncoding: 'ieee-p1363' } : {}) }, Buffer.from(signature, 'base64url')), 'Invalid token signature');
  requireThat(typeof expected.issuer === 'string' && claims.iss === expected.issuer, 'Invalid token issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  requireThat(typeof expected.audience === 'string' && audiences.length > 0 && audiences.every(value => typeof value === 'string') && new Set(audiences).size === audiences.length && audiences.includes(expected.audience), 'Invalid token audience');
  if (audiences.length > 1 || claims.azp !== undefined) requireThat(claims.azp === (expected.authorizedParty ?? expected.audience), 'Invalid authorized party');
  const now = expected.now ?? Math.floor(Date.now() / 1000);
  requireThat(Number.isFinite(claims.exp) && claims.exp > now, 'Expired token');
  requireThat(Number.isFinite(claims.iat) && claims.iat <= now + 30 && claims.iat < claims.exp, 'Invalid token issue time');
  requireThat(claims.nbf === undefined || (Number.isFinite(claims.nbf) && claims.nbf <= now), 'Token not active');
  requireThat(typeof claims.sub === 'string' && claims.sub.length > 0, 'Missing token subject');
  if (expected.subject !== undefined) requireThat(claims.sub === expected.subject, 'Invalid token subject');
  if (expected.nonce !== undefined) requireThat(typeof expected.nonce === 'string' && expected.nonce.length > 0 && claims.nonce === expected.nonce, 'Invalid token nonce');
  for (const scope of expected.scopes ?? []) requireThat(typeof claims.scope === 'string' && claims.scope.split(' ').includes(scope), 'Missing token scope');
  return claims;
}

export function validateIdToken(token, jwks, expected) {
  requireThat(typeof expected.nonce === 'string' && expected.nonce.length > 0, 'Expected nonce required');
  return validateJwt(token, jwks, expected);
}

export function authorizationRequest(discovery, { clientId, callback, scopes = [], resources = [], prompt = 'login consent' }) {
  const state = randomValue();
  const nonce = randomValue();
  const verifier = randomValue();
  const url = new URL(discovery.authorization_endpoint);
  for (const [name, value] of Object.entries({ client_id: clientId, redirect_uri: callback, response_type: 'code', scope: [...new Set(['openid', 'offline_access', ...scopes])].join(' '), state, nonce, code_challenge: s256(verifier), code_challenge_method: 'S256', prompt })) url.searchParams.set(name, value);
  for (const resource of resources) url.searchParams.append('resource', resource);
  return { url: url.href, state, nonce, verifier, callback, clientId };
}

export async function jsonRequest(request, url, { method = 'GET', token, data, form, statuses = [200], parseBody = true, ...options } = {}) {
  requireThat(typeof parseBody === 'boolean', 'Invalid response-body policy');
  const response = await request.fetch(url, { method, ...(data !== undefined ? { data } : {}), ...(form ? { form } : {}), ...options, timeout: 30000, headers: { ...(options.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!statuses.includes(response.status())) {
    let errorCode = 'unclassified';
    try {
      const failure = JSON.parse(await response.text());
      const code = failure.error ?? failure.code;
      if (typeof code === 'string' && /^[a-z_.]{1,80}$/.test(code)) errorCode = code;
    } catch {}
    throw new Error(`Native API returned unexpected HTTP ${response.status()}; error ${errorCode}`);
  }
  if (!parseBody) return undefined;
  const body = await response.text();
  return body ? JSON.parse(body) : undefined;
}

export async function discover(request, origin) {
  const discovery = await jsonRequest(request, new URL('/oidc/.well-known/openid-configuration', origin).href);
  requireThat(discovery.issuer === `${origin}/oidc`, 'Discovery issuer mismatch');
  for (const name of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'end_session_endpoint']) requireThat(new URL(discovery[name]).origin === origin, 'Discovery endpoint left issuer origin');
  requireThat(discovery.code_challenge_methods_supported?.includes('S256'), 'Issuer does not advertise S256');
  return { discovery, jwks: await jsonRequest(request, discovery.jwks_uri) };
}

export async function exchangeCode(request, discovery, transaction, code, overrides = {}) {
  return jsonRequest(request, discovery.token_endpoint, { method: 'POST', form: { grant_type: 'authorization_code', client_id: transaction.clientId, redirect_uri: transaction.callback, code_verifier: transaction.verifier, code, ...overrides } });
}

export async function nativePasswordAuthorization(page, origin, discovery, options) {
  const transaction = authorizationRequest(discovery, options);
  await page.goto(transaction.url);
  requireThat(new URL(page.url()).origin === origin, 'Authorization left native issuer');
  const api = path => new URL(`/api/experience${path}`, origin).href;
  await jsonRequest(page.request, api(''), { method: 'PUT', data: { interactionEvent: options.register ? 'Register' : 'SignIn' }, statuses: [204] });
  const { verificationId } = await jsonRequest(page.request, api(options.register ? '/verification/new-password-identity' : '/verification/password'), { method: 'POST', data: { identifier: { type: 'username', value: options.username }, password: options.password }, statuses: [200, 201] });
  requireThat(typeof verificationId === 'string' && verificationId.length > 0, 'Native password verification did not return an identifier');
  await jsonRequest(page.request, api('/identification'), { method: 'POST', data: { verificationId }, statuses: [options.register ? 201 : 204], parseBody: false });
  const { redirectTo } = await jsonRequest(page.request, api('/submit'), { method: 'POST', statuses: [200] });
  const redirect = new URL(redirectTo, origin);
  requireThat(redirect.origin === origin, 'Interaction submission left issuer');
  await page.goto(redirect.href);
  const code = validateCallback(page.url(), transaction.callback, transaction.state, options.consumedStates);
  return { transaction, code };
}

export async function organizationToken(request, discovery, clientId, refreshToken, organizationId, scopes) {
  requireThat(typeof refreshToken === 'string' && refreshToken.length > 0, 'Native refresh token required');
  return jsonRequest(request, discovery.token_endpoint, { method: 'POST', form: { grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, organization_id: organizationId, scope: ['openid', 'offline_access', 'urn:logto:scope:organizations', ...scopes].join(' ') } });
}

export async function nativeManagementGrant(request, discovery, jwks, clientId, secret, origin) {
  const audience = 'https://default.logto.app/api';
  const tokens = await jsonRequest(request, discovery.token_endpoint, {
    method: 'POST', form: { grant_type: 'client_credentials', resource: audience, scope: 'all' },
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}` },
  });
  validateJwt(tokens.access_token, jwks, { issuer: discovery.issuer, audience, subject: clientId, scopes: ['all'] });
  await jsonRequest(request, `${origin}/api/applications/${clientId}`, { token: tokens.access_token });
  return tokens.access_token;
}
