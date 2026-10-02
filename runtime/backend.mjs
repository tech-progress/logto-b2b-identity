import { spawn } from 'node:child_process';
import pg from 'pg';
import { originsFromEnv } from './config.mjs';

originsFromEnv(process.env);
for (const variable of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  if (!process.env[variable]) throw new Error(`Missing ${variable}`);
}
const databaseUrl = new URL('postgresql://database');
databaseUrl.hostname = process.env.DB_HOST;
databaseUrl.port = process.env.DB_PORT;
databaseUrl.pathname = `/${process.env.DB_NAME}`;
databaseUrl.username = process.env.DB_USER;
databaseUrl.password = process.env.DB_PASSWORD;
process.env.DB_URL = databaseUrl.href;
process.env.PORT = '3001';
process.env.ADMIN_PORT = '3002';
process.env.TRUST_PROXY_HEADER = '1';
process.env.NODE_ENV = 'production';
let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    if (child) process.kill(-child.pid, signal);
    else process.exit(0);
  });
}

function run(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    child = spawn('npm', args, { cwd: '/etc/logto', stdio: 'inherit', detached: true });
    const timeout = timeoutMs && setTimeout(() => process.kill(-child.pid, 'SIGTERM'), timeoutMs);
    const hardTimeout = timeoutMs && setTimeout(() => process.kill(-child.pid, 'SIGKILL'), timeoutMs + 5000);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(hardTimeout);
      child = undefined;
      if (stopping) process.exit(0);
      if (code === 0) resolve();
      else reject(new Error(`Upstream command failed (${code ?? signal})`));
    });
  });
}

let database;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const candidate = new pg.Client({ connectionString: databaseUrl.href, connectionTimeoutMillis: 3000 });
  try {
    await candidate.connect();
    await candidate.query('SELECT 1');
    database = candidate;
    break;
  } catch {
    await candidate.end().catch(() => {});
    if (attempt === 59) throw new Error('Database readiness timed out; check private network and credentials');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
database.on('error', () => {
  console.error('Lost migration lock connection; refusing to continue');
  if (child) process.kill(-child.pid, 'SIGKILL');
  process.exit(1);
});
await database.query("SET statement_timeout = '180s'");
await database.query('SELECT pg_advisory_lock(1280264015, 1)');
try {
  await run(['run', 'cli', 'db', 'seed', '--', '--swe'], 180000);
  await run(['run', 'cli', 'db', 'alteration', 'deploy'], 180000);
} finally {
  await database.query('SELECT pg_advisory_unlock(1280264015, 1)');
  await database.end();
}
await run(['start']);
