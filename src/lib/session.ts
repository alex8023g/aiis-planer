import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { isEmailAllowed } from '@/lib/allowed-emails';
import { auth } from '@/lib/auth';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

/// cache() — чтобы за один рендер сессия читалась один раз, а не в каждом
/// серверном компоненте отдельно.
const readSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/// Текущий пользователь или null. Адрес дополнительно сверяется с белым
/// списком: сессия могла быть выдана до того, как почту убрали из
/// ALLOWED_EMAILS.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await readSession();

  if (!session || !isEmailAllowed(session.user.email)) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };
}

/// В браузере осталась cookie, которой уже не соответствует действующая
/// сессия: срок истёк, сессию удалили или почту убрали из ALLOWED_EMAILS.
/// Страница входа предлагает такую cookie сбросить — сама она не исчезнет.
export async function hasStaleSessionCookie(): Promise<boolean> {
  if (await getCurrentUser()) return false;

  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .some(({ name }) =>
      name.replace('__Secure-', '').startsWith('better-auth'),
    );
}

/// Для страниц и серверных экшенов: без действующей сессии — редирект на вход.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) redirect('/login');

  return user;
}
