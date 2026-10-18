import { Header } from '@/components/Header';
import {
  SiDictionaryImportButton,
  SiDictionaryImportProgress,
  SiDictionaryImportProvider,
} from '@/components/SiDictionaryImport';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Справочник СИ АТС' };

/// For now the page only says which export is loaded and how much is in it;
/// browsing the dictionary comes later.
export default async function SiDictionaryAtsPage() {
  const user = await requireUser();
  const [lastImport, meters, currentTransformers, voltageTransformers, uspd] =
    await Promise.all([
      prisma.atsDictionaryImport.findFirst({ orderBy: { importedAt: 'desc' } }),
      prisma.atsMeterModification.count(),
      prisma.atsCurrentTransformerName.count(),
      prisma.atsVoltageTransformerName.count(),
      prisma.atsUspdName.count(),
    ]);
  const counts = [
    { label: 'Счётчики (модификации)', value: meters },
    { label: 'Трансформаторы тока (марки)', value: currentTransformers },
    { label: 'Трансформаторы напряжения (марки)', value: voltageTransformers },
    { label: 'УСПД (марки)', value: uspd },
  ];

  return (
    /// The import button is in the header and its progress in main, so both
    /// sit under one provider.
    <SiDictionaryImportProvider>
      <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
        <Header
          user={user}
          current='sidictionaryats'
          /// The dictionary is shared by everyone, so only an admin replaces it;
          /// the import route checks the role again.
          action={user.role === UserRole.Admin && <SiDictionaryImportButton />}
        />
        <main className='mx-auto p-6 sm:p-10'>
          <SiDictionaryImportProgress />
          {lastImport ? (
            <>
              <p className='text-sm text-neutral-500 dark:text-neutral-400'>
                Выгрузка от {lastImport.generatedAt.toLocaleString('ru-RU')} ·{' '}
                {lastImport.fileName} · загружена{' '}
                {lastImport.importedAt.toLocaleString('ru-RU')}
              </p>
              <dl className='mt-6 grid max-w-3xl gap-4 sm:grid-cols-2'>
                {counts.map((item) => (
                  <div
                    key={item.label}
                    className='rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
                  >
                    <dt className='text-sm text-neutral-500 dark:text-neutral-400'>
                      {item.label}
                    </dt>
                    <dd className='mt-1 text-2xl font-semibold tabular-nums'>
                      {item.value.toLocaleString('ru-RU')}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className='text-sm text-neutral-500 dark:text-neutral-400'>
              Справочник ещё не загружен.
              {user.role === UserRole.Admin &&
                ' Загрузите XML-выгрузку АТС кнопкой «Импорт СИ».'}
            </p>
          )}
        </main>
      </div>
    </SiDictionaryImportProvider>
  );
}
