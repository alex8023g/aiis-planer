import { UserMenu } from '@/components/UserMenu';
import type { SessionUser } from '@/lib/session';

/// Шапка приложения. Липкая: список проектов длинный, а меню пользователя
/// должно оставаться под рукой на любой прокрутке.
export function Header({ user }: { user: SessionUser }) {
  return (
    <header className='sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80'>
      <div className='mx-auto flex items-center justify-between gap-4 px-6 py-3 sm:px-10'>
        <h1 className='text-xl font-semibold tracking-tight'>
          Графики проектов
        </h1>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
