import { PrismaClient } from '@prisma/client';
import { env } from './env';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.databaseUrl,
    },
  },
  log: env.isProduction ? ['error'] : ['warn', 'error'],
});

export default prisma;
