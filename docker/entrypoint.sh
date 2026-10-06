#!/bin/sh
set -e

echo "[docker] migrasi database..."
npx prisma migrate deploy

# seed memakai upsert: aman diulang, akun yang sudah ada tidak diubah
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[docker] seed data awal..."
  npx prisma db seed
fi

exec node dist/index.js
