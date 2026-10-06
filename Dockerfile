# backend + frontend statis dalam satu image (backend menyajikan folder frontend/)
FROM node:20-bookworm-slim

# prisma butuh openssl untuk query engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# devDependencies ikut terpasang: seed dijalankan dengan ts-node saat container start
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc

# index.ts menyajikan ../../frontend relatif terhadap dist/, yaitu /app/frontend
COPY frontend/*.html /app/frontend/
COPY frontend/css /app/frontend/css
COPY frontend/js /app/frontend/js
COPY frontend/vendor /app/frontend/vendor
COPY frontend/assets /app/frontend/assets

COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh \
    && mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads

USER node
EXPOSE 5000
ENTRYPOINT ["/entrypoint.sh"]
