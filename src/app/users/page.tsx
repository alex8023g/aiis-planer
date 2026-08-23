import dayjs from 'dayjs';
import { redirect } from 'next/navigation';

import { Header } from '@/components/Header';
import { UserRowMenu } from '@/components/UserRowMenu';
import { requireUser } from '@/lib/session';
import { roleLabels, UserRole } from '@/lib/types';
import { getUsers } from '@/lib/users';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await requireUser();

  /// Ссылку в шапке видит только admin, но по прямому адресу зайти может любой,
  /// поэтому роль проверяется и здесь: не admin — обратно на список проектов.
  if (user.role !== UserRole.Admin) redirect('/');

  const users = await getUsers();

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header user={user} current='users' />
      <main className='mx-auto p-6 sm:p-10'>
        <p className='mb-4 text-sm text-neutral-500 dark:text-neutral-400'>
          Пользователей: {users.length}
        </p>

        <div className='overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
          <table className='w-full text-left text-sm'>
            <thead className='text-xs text-neutral-500 dark:text-neutral-400'>
              <tr className='border-b border-neutral-200 dark:border-neutral-800'>
                <th className='px-4 py-3 font-medium'>Пользователь</th>
                <th className='px-4 py-3 font-medium'>Роль</th>
                <th className='px-4 py-3 font-medium'>Первый вход</th>
                <th className='px-4 py-3'>
                  <span className='sr-only'>Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr
                  key={row.id}
                  className='border-b border-neutral-200 last:border-0 dark:border-neutral-800'
                >
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      {row.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.image}
                          alt=''
                          className='size-7 shrink-0 rounded-full'
                          referrerPolicy='no-referrer'
                        />
                      ) : (
                        <span className='flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium dark:bg-neutral-700'>
                          {row.name.trim().charAt(0).toUpperCase() || '?'}
                        </span>
                      )}
                      <div>
                        <div className='font-medium'>
                          {row.name.trim() || '—'}
                          {row.id === user.id && (
                            <span className='ml-1 font-normal text-neutral-500 dark:text-neutral-400'>
                              (вы)
                            </span>
                          )}
                        </div>
                        <div className='text-xs text-neutral-500 dark:text-neutral-400'>
                          {row.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 whitespace-nowrap ${
                      /// pending — единственная роль, с которой админу нужно
                      /// что-то сделать, поэтому она выделена цветом.
                      row.role === UserRole.Pending
                        ? 'text-orange-600 dark:text-orange-400'
                        : ''
                    }`}
                  >
                    {roleLabels[row.role]}
                  </td>
                  <td className='px-4 py-3 whitespace-nowrap text-neutral-500 dark:text-neutral-400'>
                    {dayjs(row.createdAt).format('DD.MM.YYYY')}
                  </td>
                  <td className='px-4 py-3'>
                    {row.id !== user.id && <UserRowMenu user={row} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
