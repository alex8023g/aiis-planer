import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const createPrismaClient = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// В dev-режиме Next.js перезагружает модули, поэтому клиент кэшируется
// в globalThis — иначе на каждой перезагрузке создаётся новый пул соединений.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
