import { redirect } from 'next/navigation';

import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { SignOutButton } from '@/components/SignOutButton';
import { getCurrentUser, hasStaleSessionCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Вход — Графики проектов' };

/// Коды, которые Better Auth кладёт в ?error= при неудачном входе.
const errorMessages: Record<string, string> = {
  signup_disabled: 'Регистрация новых пользователей отключена.',
  account_not_linked:
    'Этот аккаунт Google уже привязан к другому пользователю.',
  please_restart_the_process: 'Вход не завершён. Попробуйте ещё раз.',
};

/// Открытый редирект: принимаем только относительные пути внутри приложения.
function safeNextPath(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';

  return next;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const callbackURL = safeNextPath(firstValue(params.next));

  if (user) redirect(callbackURL);

  /// Cookie от истёкшей или отозванной сессии — предлагаем её сбросить.
  const isStale = await hasStaleSessionCookie();
  const errorCode = firstValue(params.error);
  const errorMessage = errorCode
    ? (errorMessages[errorCode] ?? 'Не удалось войти. Попробуйте ещё раз.')
    : null;

  return (
    <div className='flex min-h-screen items-center justify-center bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <main className='w-full max-w-sm'>
        <div className='rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
          <h1 className='text-xl font-semibold tracking-tight'>
            Графики проектов
          </h1>
          <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
            Войдите, чтобы посмотреть и изменить графики.
          </p>

          {errorMessage && (
            <p
              role='alert'
              className='mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive'
            >
              {errorMessage}
            </p>
          )}

          <div className='mt-6 flex flex-col gap-2'>
            <GoogleSignInButton callbackURL={callbackURL} />
            {isStale && <SignOutButton />}
          </div>
        </div>
      </main>
    </div>
  );
}
