import { Header } from '@/components/Header';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Регистрация писем' };

/// Заглушка: раздел ещё не сделан, но ссылка на него в навигации уже есть —
/// пусть ведёт на честное «в разработке», а не в 404.
export default async function LettersPage() {
  const user = await requireUser();

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header user={user} current='letters' />
      <main className='mx-auto p-6 sm:p-10'>
        <p className='text-sm text-neutral-500 dark:text-neutral-400'>
          Раздел в разработке.
        </p>
      </main>
    </div>
  );
}
