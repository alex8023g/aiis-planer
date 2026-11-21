import { redirect } from 'next/navigation';

import { Header } from '@/components/Header';
import { prisma } from '@/lib/prisma';
import { canEdit, requireUser } from '@/lib/session';

import { NewKitForm } from './NewKitForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Новый комплект' };

/// Новый типовой комплект. Только для редакторов: остальных возвращаем в
/// справочник — createEquipmentKit их всё равно не пустит.
export default async function NewKitPage() {
  const user = await requireUser();
  if (!canEdit(user)) redirect('/equipment-catalog');

  const kinds = await prisma.equipmentKind.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      models: { orderBy: { name: 'asc' }, select: { id: true, name: true } },
    },
  });

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header user={user} current='equipmentcatalog' title='Новый комплект' />
      <main className='mx-auto max-w-7xl p-2 sm:p-4'>
        <NewKitForm kinds={kinds} />
      </main>
    </div>
  );
}
