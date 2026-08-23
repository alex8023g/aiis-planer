import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';

import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/types';

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
  user: {
    additionalFields: {
      /// Роль объявлена здесь, чтобы Better Auth отдавал её вместе с сессией и
      /// за ней не приходилось ходить в базу отдельным запросом.
      role: {
        type: Object.values(UserRole),
        /// input: false — роль не приходит ни из формы, ни от Google: её
        /// выдают в базе, иначе любой вошедший назначил бы себя админом.
        input: false,
        /// Войти может любой аккаунт Google, поэтому новый пользователь ждёт,
        /// пока админ выдаст ему роль.
        defaultValue: UserRole.Pending,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    },
  },
  plugins: [nextCookies()],
});
