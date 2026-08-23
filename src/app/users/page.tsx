import { redirect } from 'next/navigation';

import { Header } from '@/components/Header';
import { requireUser } from '@/lib/session';
import { UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await requireUser();

  /// Ссылку в шапке видит только admin, но по прямому адресу зайти может любой,
  /// поэтому роль проверяется и здесь: не admin — обратно на список проектов.
  if (user.role !== UserRole.Admin) redirect('/');

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header user={user} current='users' />
      <main className='mx-auto p-6 sm:p-10'>
        <h1>Users Page</h1>
        <p>This is the users page content.</p>
      </main>
    </div>
  );
}
