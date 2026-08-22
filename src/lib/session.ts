import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { auth } from '@/lib/auth';
import { normalizeEmail } from '@/lib/emails';

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

/// Текущий пользователь или null. Само по себе наличие сессии даёт доступ к
/// приложению: войти может любой аккаунт Google, а вот проекты видны только
/// те, где почта есть в списке доступа (см. src/lib/projects.ts).
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await readSession();

  if (!session) return null;

  return {
    id: session.user.id,
    /// Почта — ключ доступа к проектам, поэтому нормализуем её здесь, чтобы
    /// вызывающим не приходилось помнить об этом.
    email: normalizeEmail(session.user.email),
    name: session.user.name,
    image: session.user.image ?? null,
  };
}

/// В браузере осталась cookie, которой уже не соответствует действующая
/// сессия: срок истёк или сессию удалили.
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
