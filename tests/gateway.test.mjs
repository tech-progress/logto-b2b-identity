import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalPath, gatewayConfig, issueSession, validSession, upstreamHeaders } from '../runtime/gateway.mjs';
import { canonicalOrigin, originsFromEnv } from '../runtime/config.mjs';

const env = { ENDPOINT: 'https://identity.example.org', ADMIN_ENDPOINT: 'https://admin.example.org', UPSTREAM_HOST: 'logto.railway.internal' };
test('origins fail closed', () => {
  for (const origin of ['http://identity.example.org', 'https://identity.example.org/path', 'https://user:pass@identity.example.org', 'https://*.example.org', 'https://identity.example.org/?query']) {
    assert.throws(() => canonicalOrigin(origin, true));
  }
  assert.throws(() => originsFromEnv({ ...env, ADMIN_ENDPOINT: env.ENDPOINT }));
  assert.throws(() => originsFromEnv({ ...env, ENDPOINT: undefined }));
  assert.equal(canonicalOrigin('http://127.0.0.1:18420', true).origin, 'http://127.0.0.1:18420');
});
test('roles select independent upstream listeners and require a strong gate', () => {
  assert.equal(gatewayConfig({ ...env, GATEWAY_ROLE: 'issuer' }).upstreamPort, 3001);
  const admin = gatewayConfig({ ...env, GATEWAY_ROLE: 'admin', ADMIN_GATE_PASSWORD: 'a'.repeat(48) });
  assert.equal(admin.upstreamPort, 3002);
  assert.equal(admin.origin.origin, env.ADMIN_ENDPOINT);
  assert.throws(() => gatewayConfig({ ...env, GATEWAY_ROLE: 'admin' }));
  assert.throws(() => gatewayConfig({ ...env, GATEWAY_ROLE: 'admin', ADMIN_GATE_PASSWORD: 'weak' }));
  assert.throws(() => gatewayConfig({ ...env, GATEWAY_ROLE: 'unknown' }));
});
test('sessions reject tampering, expiry, future timestamps and rotated secrets', () => {
  const secret = 'a'.repeat(48);
  const now = 1800000000000;
  const session = issueSession(secret, now);
  assert.equal(validSession(session, secret, now), true);
  assert.equal(validSession(session, secret, now + 8 * 60 * 60 * 1000), false);
  assert.equal(validSession(session, secret, now - 1000), false);
  assert.equal(validSession(session, 'b'.repeat(48), now), false);
  assert.equal(validSession(session.slice(0, -1), secret, now), false);
  assert.equal(validSession('', secret, now), false);
});
test('admin-path canonicalization catches nested encoding, backslashes and dot segments', () => {
  for (const path of ['/console', '/%63onsole', '/%2563onsole', '/other/../console', '/%5cconsole', '/me%2fusers']) {
    assert.match(canonicalPath(path).pathname, /^\/(console|me)(\/|$)/);
  }
  for (const path of ['//example.org/console', 'https://example.org/console', '/%00', '/%bad']) assert.throws(() => canonicalPath(path));
});

test('forwarding pins origins, preserves OIDC Basic/Bearer, and never leaks operator credentials', () => {
  const secret = 'a'.repeat(48);
  const admin = gatewayConfig({ ...env, GATEWAY_ROLE: 'admin', ADMIN_GATE_PASSWORD: secret });
  const issuer = gatewayConfig({ ...env, GATEWAY_ROLE: 'issuer' });
  const request = {
    headers: { host: 'spoofed.example', forwarded: 'host=spoofed.example', 'x-forwarded-host': 'spoofed.example', 'x-forwarded-proto': 'http', cookie: 'gate=secret; oidc=session', authorization: 'Bearer api-token' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const headers = upstreamHeaders(request, admin, 'gate');
  assert.equal(headers.host, 'admin.example.org');
  assert.equal(headers['x-forwarded-proto'], 'https');
  assert.equal(headers.forwarded, undefined);
  assert.equal(headers.authorization, 'Bearer api-token');
  assert.equal(headers.cookie.trim(), 'oidc=session');
  request.headers.authorization = `Basic ${Buffer.from('client:secret').toString('base64')}`;
  assert.equal(upstreamHeaders(request, issuer, 'gate').authorization, request.headers.authorization);
  assert.equal(upstreamHeaders(request, admin, 'gate').authorization, request.headers.authorization);
  request.headers.authorization = `Basic ${Buffer.from(`operator:${secret}`).toString('base64')}`;
  assert.equal(upstreamHeaders(request, admin, 'gate').authorization, undefined);
});
