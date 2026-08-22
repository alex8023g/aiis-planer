import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';

import { prisma } from '@/lib/prisma';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId || !googleClientSecret) {
  throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is not set');
}

export const auth = betterAuth({
  appName: 'Графики проектов',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  /// Единственный способ входа — Google.
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    },
  },
  plugins: [nextCookies()],
});
