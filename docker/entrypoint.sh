#!/bin/sh
set -e

# Susun DATABASE_URL dari DB_* bila belum ada
if [ -z "$DATABASE_URL" ]; then
  DB_CONN="${DB_CONNECTION:-postgresql}"
  [ "$DB_CONN" = "pgsql" ] && DB_CONN="postgresql"
  DB_U="${DB_USERNAME:-${DB_USER:-postgres}}"
  DB_P="${DB_PASSWORD:-${DB_PASS:-}}"
  DB_H="${DB_HOST:-host.docker.internal}"
  DB_PORT_VAL="${DB_PORT:-5432}"
  DB_D="${DB_DATABASE:-${DB_NAME:-bloodsync}}"
  DB_S="${DB_SCHEMA:-public}"
  if [ -n "$DB_P" ]; then
    AUTH="${DB_U}:${DB_P}"
  else
    AUTH="${DB_U}"
  fi
  export DATABASE_URL="${DB_CONN}://${AUTH}@${DB_H}:${DB_PORT_VAL}/${DB_D}?schema=${DB_S}"
fi

echo "[docker] migrasi database..."
npm run db:migrate

# seed aman diulang: akun bawaan hanya dibuat saat tabel users masih kosong (boot pertama),
# jadi akun default yang sudah dihapus operator tidak muncul lagi
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[docker] seed data awal..."
  npm run db:seed
fi

exec node dist/index.js
