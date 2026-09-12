import { LayoutList, Users } from 'lucide-react';
import Link from 'next/link';

import { AddProjectDialog } from '@/components/AddProjectDialog';
import { UserMenu } from '@/components/UserMenu';
import { buttonVariants } from '@/components/ui/button';
import { canEdit, type SessionUser } from '@/lib/session';
import { UserRole } from '@/lib/types';

const navLink = buttonVariants({ variant: 'ghost', size: 'sm' });

/// Заголовок в шапке — название текущей страницы.
const pageTitles = {
  projects: 'Графики проектов',
  project: 'Проект',
  aiis: 'АИИС',
  users: 'Пользователи',
  contracts: 'Договоры',
  tenders: 'Конкурсы',
  letters: 'Регистрация писем',
} as const;

/// Шапка приложения. Липкая: список проектов длинный, а меню пользователя
/// должно оставаться под рукой на любой прокрутке.
/// current — страница, на которой мы сейчас: её название шапка показывает
/// заголовком, а ссылку на неё саму — нет. Определить её на сервере иначе
/// нельзя: pathname доступен только клиентским компонентам, а делать ради
/// этого шапку клиентской незачем.
export function Header({
  user,
  current,
  title,
  meta,
}: {
  user: SessionUser;
  current: keyof typeof pageTitles;
  /// Заголовок вместо названия страницы: у страницы проекта он свой —
  /// название самого проекта, общего слова «Проект» тут мало.
  title?: string;
  /// Приписка к заголовку — например, сколько всего проектов. Считает её
  /// страница: шапка сама за данными не ходит.
  meta?: string;
}) {
  return (
    <header className='sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80'>
      <div className='mx-auto flex items-center justify-between gap-4 px-6 py-3 sm:px-10'>
        <div className='flex items-baseline gap-3'>
          <h1 className='text-xl font-semibold tracking-tight'>
            {title ?? pageTitles[current]}
          </h1>
          {meta && (
            <span className='text-md whitespace-nowrap text-neutral-500 dark:text-neutral-400'>
              {meta}
            </span>
          )}
        </div>
        <div className='flex items-center gap-2'>
          {/* Кнопка живёт в шапке, чтобы не уезжать вверх вместе со списком.
              Создавать проекты может admin и editor; viewer'у и pending —
              нечего. */}
          {current === 'projects' && canEdit(user) && <AddProjectDialog />}
          {current !== 'projects' && (
            <Link href='/projects' className={navLink}>
              <LayoutList />
              Проекты
            </Link>
          )}
          {/* Страница пользователей admin-only, поэтому и ссылка на неё тоже.
              Сама страница проверяет роль ещё раз: по прямому адресу ссылка
              не нужна. */}
          {current !== 'users' && user.role === UserRole.Admin && (
            <Link href='/users' className={navLink}>
              <Users />
              Пользователи
            </Link>
          )}
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
