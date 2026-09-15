import {
  ChevronRight,
  FileText,
  Gavel,
  LayoutList,
  Mail,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import { requireUser } from '@/lib/session';
import { UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'АИИС Планер' };

/// Плитка раздела: иконка, название, пояснение — чтобы с первого экрана было
/// понятно, что за ссылкой, а не только куда она ведёт.
function SectionLink({
  href,
  icon: Icon,
  title,
  description,
  soon,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /// Раздел ещё не сделан: за ссылкой заглушка, и честнее сказать об этом
  /// здесь, чем после перехода.
  soon?: boolean;
}) {
  return (
    <Link
      href={href}
      className='group flex items-start gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800'
    >
      <span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'>
        <Icon className='size-5' />
      </span>
      <span className='flex min-w-0 flex-col gap-1'>
        <span className='flex items-center gap-2'>
          <span className='text-base font-medium'>{title}</span>
          {soon && (
            <span className='rounded-full bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-neutral-500 uppercase dark:bg-neutral-800 dark:text-neutral-400'>
              скоро
            </span>
          )}
        </span>
        <span className='text-sm text-neutral-500 dark:text-neutral-400'>
          {description}
        </span>
      </span>
      {/* Прижата к строке с названием, а не к центру плитки: пояснения разной
          длины, и от них высота плитки скачет. */}
      <ChevronRight className='mt-2.5 ml-auto size-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-400 dark:text-neutral-600 dark:group-hover:text-neutral-500' />
    </Link>
  );
}

/// Стартовая страница — только вход в разделы: сами графики живут на
/// /projects. requireUser уводит неавторизованного на логин.
export default async function HomePage() {
  const user = await requireUser();
  /// Тому, кому ещё не выдали роль, ссылка на проекты покажет пустой список —
  /// понятнее сразу сказать, чего он ждёт.
  const waiting = user.role === UserRole.Pending;

  return (
    <div className='flex min-h-screen flex-col justify-center bg-neutral-50 p-6 text-neutral-900 sm:p-10 dark:bg-neutral-950 dark:text-neutral-100'>
      {/* Разделов немного, и на широком экране они раскладываются в сетку:
          карточка в max-w-sm занимала бы четверть ширины, а остальное —
          пустой фон. */}
      <main className='mx-auto w-full max-w-5xl'>
        <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
          Портал ЭнергоПромРесурс
        </h1>
        <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
          {user.name}
        </p>

        {waiting ? (
          <p className='mt-8 max-w-prose rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400'>
            Доступ пока не подтверждён. Попросите администратора выдать вам роль
            — до этого проекты не видны.
          </p>
        ) : (
          <nav className='mt-8 grid gap-4 sm:grid-cols-2'>
            <SectionLink
              href='/projects'
              icon={LayoutList}
              title='Проекты АИИС'
              description='Этапы, сроки и статусы по каждому проекту'
            />
            <SectionLink
              href='/contracts'
              icon={FileText}
              title='Договоры'
              description='Договоры и дополнительные соглашения'
              soon
            />
            <SectionLink
              href='/tenders'
              icon={Gavel}
              title='Конкурсы'
              description='Закупочные процедуры и заявки'
              soon
            />
            <SectionLink
              href='/letters'
              icon={Mail}
              title='Регистрация писем'
              description='Входящая и исходящая корреспонденция'
              soon
            />
            <SectionLink
              href='/warehouse'
              icon={Warehouse}
              title='Склад'
              description='Оборудование и материалы на складе'
              soon
            />
            {/* Страница пользователей admin-only — как и ссылка на неё. */}
            {user.role === UserRole.Admin && (
              <SectionLink
                href='/users'
                icon={Users}
                title='Пользователи'
                description='Роли и доступ к приложению'
              />
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
