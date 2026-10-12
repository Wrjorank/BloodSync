const path = require('path');
const dotenv = require('dotenv');

// Muat konfigurasi dari backend/.env atau .env di root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function stripQuotes(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/^["'](.*)["']$/, '$1');
}

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const rawConn = stripQuotes(process.env.DB_CONNECTION || 'pgsql');
  const connection = rawConn === 'pgsql' ? 'postgresql' : rawConn;
  const rawUser = stripQuotes(process.env.DB_USERNAME || process.env.DB_USER || 'postgres');
  const user = encodeURIComponent(rawUser);
  const rawPass = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.DB_PASS !== undefined ? process.env.DB_PASS : '');
  const pass = stripQuotes(rawPass);
  const auth = pass ? `${user}:${encodeURIComponent(pass)}` : user;
  const host = stripQuotes(process.env.DB_HOST || '127.0.0.1');
  const port = stripQuotes(process.env.DB_PORT || '5432');
  const db = stripQuotes(process.env.DB_DATABASE || process.env.DB_NAME || 'bloodsync');
  const schema = stripQuotes(process.env.DB_SCHEMA || '');

  const params = [];
  if (schema && schema !== 'public') {
    params.push(`schema=${schema}`);
  }
  if (port === '6432' || process.env.DB_PGBOUNCER === 'true') {
    params.push('pgbouncer=true');
  }
  const query = params.length ? `?${params.join('&')}` : '';

  return `${connection}://${auth}@${host}:${port}/${db}${query}`;
}

process.env.DATABASE_URL = buildDatabaseUrl();

const { spawn } = require('child_process');
const args = process.argv.slice(2);
const prismaBin = require.resolve('prisma/build/index.js');
const child = spawn(process.execPath, [prismaBin, ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code || 0);
  }
});
