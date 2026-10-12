#!/bin/sh
set -e

echo "[docker] migrasi database..."
npm run db:migrate

# seed aman diulang: akun bawaan hanya dibuat saat tabel users masih kosong (boot pertama),
# jadi akun default yang sudah dihapus operator tidak muncul lagi
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[docker] seed data awal..."
  npm run db:seed
fi

exec node dist/index.js
