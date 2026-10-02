export function canonicalOrigin(value, allowInsecureLocalhost = false) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) {
    throw new Error('Origins must be absolute origins without credentials, paths, queries, fragments, or wildcards');
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowInsecureLocalhost && isLoopback && url.protocol === 'http:')) {
    throw new Error('HTTPS origins are required; HTTP is allowed only for explicit loopback testing');
  }
  return url;
}

export function originsFromEnv(env) {
  const endpoint = canonicalOrigin(env.ENDPOINT, env.ALLOW_INSECURE_LOCALHOST === '1');
  const adminEndpoint = canonicalOrigin(env.ADMIN_ENDPOINT, env.ALLOW_INSECURE_LOCALHOST === '1');
  if (endpoint.origin === adminEndpoint.origin) {
    throw new Error('ENDPOINT and ADMIN_ENDPOINT must be independent origins');
  }
  return { endpoint, adminEndpoint };
}
