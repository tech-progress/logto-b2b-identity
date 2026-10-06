import http from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { originsFromEnv } from './config.mjs';

const sessionSeconds = 8 * 60 * 60;
const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

export function equalSecret(actual, expected) {
  return timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest());
}

export function canonicalPath(rawPath) {
  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) throw new Error('Invalid request target');
  const url = new URL(rawPath, 'http://gateway');
  let pathname = url.pathname;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const decoded = decodeURIComponent(pathname).replaceAll('\\', '/');
    if (decoded === pathname) break;
    pathname = decoded;
  }
  if (pathname.includes('%') || /[\x00-\x1f\x7f]/.test(pathname)) throw new Error('Invalid encoded path');
  pathname = new URL(pathname.replace(/\/{2,}/g, '/'), 'http://gateway').pathname;
  return { pathname, upstreamPath: url.pathname + url.search };
}

export function issueSession(secret, now = Date.now()) {
  const payload = `${Math.floor(now / 1000)}.${randomBytes(24).toString('hex')}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

export function validSession(value, secret, now = Date.now()) {
  if (!/^\d+\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(value)) return false;
  const [issuedAt, nonce, signature] = value.split('.');
  const age = Math.floor(now / 1000) - Number(issuedAt);
  return age >= 0 && age < sessionSeconds && equalSecret(signature, createHmac('sha256', secret).update(`${issuedAt}.${nonce}`).digest('hex'));
}

export function gatewayConfig(env) {
  const origins = originsFromEnv(env);
  if (!['issuer', 'admin'].includes(env.GATEWAY_ROLE)) throw new Error('GATEWAY_ROLE must be issuer or admin');
  if (!env.UPSTREAM_HOST || !/^[a-zA-Z0-9.-]+$/.test(env.UPSTREAM_HOST)) throw new Error('Invalid private UPSTREAM_HOST');
  if (env.GATEWAY_ROLE === 'admin' && (!env.ADMIN_GATE_PASSWORD || env.ADMIN_GATE_PASSWORD.length < 32)) {
    throw new Error('Admin gateway requires a generated ADMIN_GATE_PASSWORD of at least 32 characters');
  }
  return {
    ...origins,
    role: env.GATEWAY_ROLE,
    secret: env.ADMIN_GATE_PASSWORD,
    upstreamHost: env.UPSTREAM_HOST,
    upstreamPort: env.GATEWAY_ROLE === 'admin' ? 3002 : 3001,
    origin: env.GATEWAY_ROLE === 'admin' ? origins.adminEndpoint : origins.endpoint,
  };
}

export function upstreamHeaders(request, config, cookieName) {
  const headers = { ...request.headers };
  const nominated = (headers.connection ?? '').split(',').map(header => header.trim().toLowerCase());
  for (const header of [...hopHeaders, ...nominated]) delete headers[header];
  for (const header of Object.keys(headers)) {
    if (header.startsWith('x-forwarded-') || header === 'forwarded') delete headers[header];
  }
  headers.host = config.origin.host;
  headers['x-forwarded-host'] = config.origin.host;
  headers['x-forwarded-proto'] = config.origin.protocol.slice(0, -1);
  headers['x-forwarded-for'] = request.socket.remoteAddress;
  if (config.role === 'admin' && headers.authorization?.startsWith('Basic ')) {
    const credentials = Buffer.from(headers.authorization.slice(6), 'base64').toString();
    if (equalSecret(credentials, `operator:${config.secret}`)) delete headers.authorization;
  }
  if (headers.cookie) headers.cookie = headers.cookie.split(';').filter(cookie => !cookie.trim().startsWith(`${cookieName}=`)).join(';');
  return headers;
}

export function createGateway(config) {
  const secure = config.origin.protocol === 'https:';
  const cookieName = secure ? '__Host-logto_admin_gate' : 'logto_admin_gate_local';
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    let target;
    try {
      target = canonicalPath(request.url);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (target.pathname === '/healthz' && request.method === 'GET') {
      try {
        const readiness = await fetch(`http://${config.upstreamHost}:${config.upstreamPort}/oidc/.well-known/openid-configuration`, {
          headers: { Host: config.origin.host, 'X-Forwarded-Host': config.origin.host, 'X-Forwarded-Proto': config.origin.protocol.slice(0, -1) },
          signal: AbortSignal.timeout(3000),
          redirect: 'error',
        });
        const discovery = await readiness.json();
        if (!readiness.ok || discovery.issuer !== `${config.origin.origin}/oidc`) throw new Error('Upstream not ready');
        response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ready"}');
      } catch {
        response.writeHead(503).end('Not ready');
      }
      return;
    }
    if (config.role === 'issuer' && /^\/(console|welcome|me|__gate)(\/|$)/i.test(target.pathname)) {
      response.writeHead(404).end();
      return;
    }
    if (config.role === 'admin') {
      if (target.pathname === '/__gate/login' && request.method === 'GET') {
        const authorization = request.headers.authorization ?? '';
        const credentials = authorization.startsWith('Basic ') ? Buffer.from(authorization.slice(6), 'base64').toString() : '';
        if (!equalSecret(credentials, `operator:${config.secret}`)) {
          response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Logto operator gate", charset="UTF-8"' }).end('Operator credentials required');
          return;
        }
        response.setHeader('Set-Cookie', `${cookieName}=${issueSession(config.secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionSeconds}${secure ? '; Secure' : ''}`);
        response.writeHead(303, { Location: '/console' }).end();
        return;
      }
      const cookies = (request.headers.cookie ?? '').split(';').map(cookie => cookie.trim());
      const gateCookie = cookies.find(cookie => cookie.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
      if (!validSession(gateCookie, config.secret)) {
        response.writeHead(401).end('Open /__gate/login and authenticate as operator before using Logto');
        return;
      }
      if (target.pathname === '/__gate/logout' && request.method === 'POST') {
        if (request.headers.origin !== config.origin.origin) {
          response.writeHead(403).end();
          return;
        }
        response.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
        response.writeHead(204).end();
        return;
      }
    }
    const headers = upstreamHeaders(request, config, cookieName);
    const upstream = http.request({ hostname: config.upstreamHost, port: config.upstreamPort, method: request.method, path: target.upstreamPath, headers }, upstreamResponse => {
      const responseHeaders = { ...upstreamResponse.headers };
      const nominatedResponse = (responseHeaders.connection ?? '').split(',').map(header => header.trim().toLowerCase());
      for (const header of [...hopHeaders, ...nominatedResponse]) delete responseHeaders[header];
      response.writeHead(upstreamResponse.statusCode, responseHeaders);
      upstreamResponse.pipe(response);
      upstreamResponse.on('error', () => response.destroy());
    });
    upstream.setTimeout(30000, () => upstream.destroy());
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502).end('Upstream unavailable');
      else response.destroy();
    });
    request.on('aborted', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = gatewayConfig(process.env);
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid gateway PORT');
  const server = createGateway(config);
  server.listen(port, '::', () => console.log(`${config.role} gateway listening on ${port}; upstream port ${config.upstreamPort}`));
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
