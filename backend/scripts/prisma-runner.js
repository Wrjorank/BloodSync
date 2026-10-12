const path = require('path');
const dotenv = require('dotenv');

// Muat konfigurasi dari backend/.env atau .env di root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const rawConn = process.env.DB_CONNECTION || 'pgsql';
  const connection = rawConn === 'pgsql' ? 'postgresql' : rawConn;
  const user = encodeURIComponent(process.env.DB_USERNAME || process.env.DB_USER || 'postgres');
  const pass = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.DB_PASS !== undefined ? process.env.DB_PASS : '');
  const auth = pass ? `${user}:${encodeURIComponent(pass)}` : user;
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '5432';
  const db = process.env.DB_DATABASE || process.env.DB_NAME || 'bloodsync';
  const schema = process.env.DB_SCHEMA || 'public';

  return `${connection}://${auth}@${host}:${port}/${db}?schema=${schema}`;
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
