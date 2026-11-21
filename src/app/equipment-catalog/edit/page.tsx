import { redirect } from 'next/navigation';

import { Header } from '@/components/Header';
import { prisma } from '@/lib/prisma';
import { canEdit, requireUser } from '@/lib/session';

import { EditCatalogTable } from './EditCatalogTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Редактирование справочника' };

/// Справочник таблицей: строку можно удалить, новый вид или марку — добавить.
export default async function EditCatalogPage() {
  const user = await requireUser();
  if (!canEdit(user)) redirect('/equipment-catalog');

  const kinds = await prisma.equipmentKind.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      unit: true,
      _count: { select: { items: true, kitItems: true } },
      models: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          _count: { select: { items: true, kitItems: true } },
        },
      },
    },
  });

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='equipmentcatalog'
        title='Редактирование справочника'
      />
      <main className='mx-auto max-w-4xl p-2 sm:p-4'>
        <EditCatalogTable
          kinds={kinds.map((kind) => ({
            id: kind.id,
            name: kind.name,
            unit: kind.unit,
            used: kind._count.items + kind._count.kitItems > 0,
            models: kind.models.map((model) => ({
              id: model.id,
              name: model.name,
              used: model._count.items + model._count.kitItems > 0,
            })),
          }))}
        />
      </main>
    </div>
  );
}
