import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { env } from './config/env';
import prisma from './config/prisma';
import { connectRedis, disconnectRedis, redisStatus } from './config/redis';
import routes from './routes';
import pages from './routes/pages';
import { authenticate } from './middlewares/auth';
import { requestContext } from './middlewares/requestContext';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { setupSocket } from './socket';
import { startEngine, stopEngine } from './jobs/engine';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './docs/openapi';

const app = express();
const httpServer = createServer(app);
const corsOrigin = env.corsOrigins.includes('*') ? '*' : env.corsOrigins;
const io = new Server(httpServer, { cors: { origin: corsOrigin } });

app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);
app.use(cors({ origin: corsOrigin, exposedHeaders: ['Content-Disposition', 'X-Export-Rows', 'X-Export-Truncated', 'X-Import-Rows'] }));
app.use(requestContext);
// gzip/brotli for html, js, css and json; already-compressed bodies (xlsx, images) are skipped by content type
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '100kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // scripts only from this origin (vendor libs are self-hosted), so an injected <script> or cdn compromise cannot run.
  // inline styles stay allowed: the qr scanner and progress bars set style attributes. google fonts is the only third party
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // firebase messaging fetches its push token from these two google endpoints
    "connect-src 'self' https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  if (env.isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get('/health', async (_req, res) => {
  const db = await prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down');
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'OK' : 'DEGRADED', db, redis: redisStatus() });
});

if (env.enableApiDocs) {
  app.get('/docs/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'BloodSync API',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
  }));
}

app.use('/api', authenticate, routes);
app.use('/api', notFoundHandler);

app.use(pages);

app.use(errorHandler);

setupSocket(io);

async function start() {
  await connectRedis();
  await prisma.$connect();
  httpServer.listen(env.port, () => console.log(`[server] BloodSync API berjalan di http://localhost:${env.port}`));
  startEngine();
}

start().catch(err => {
  console.error('[server] gagal start', err);
  process.exit(1);
});

async function shutdown() {
  console.log('\n[server] mematikan server...');
  stopEngine();
  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
