#!/bin/sh
set -e

echo "[docker] migrasi database..."
npx prisma migrate deploy

# seed aman diulang: akun bawaan hanya dibuat saat tabel users masih kosong (boot pertama),
# jadi akun default yang sudah dihapus operator tidak muncul lagi
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[docker] seed data awal..."
  npx prisma db seed
fi

exec node dist/index.js
