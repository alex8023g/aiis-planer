import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';

import { isEmailAllowed } from '@/lib/allowed-emails';
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
  user: {
    /// Вызывается перед созданием пользователя, привязкой аккаунта и при
    /// каждом повторном входе через провайдера — поэтому удаление адреса из
    /// ALLOWED_EMAILS закрывает доступ и уже заведённым пользователям.
    validateUserInfo({ user }) {
      if (isEmailAllowed(user.email)) return;

      return {
        error: 'email_not_allowed',
        errorDescription: 'Этой почте вход не разрешён',
      };
    },
  },
  plugins: [nextCookies()],
});
