import Link from 'next/link';

import { prisma } from '@/lib/prisma';
import { canEdit, requireUser } from '@/lib/session';

import { Header } from '@/components/Header';

import { EquipmentKindsSection } from '../EquipmentKindsSection';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Справочник оборудования' };

export default async function EquipmentsPage() {
  const user = await requireUser();
  const kinds = await prisma.equipmentKind.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      unit: true,
      _count: { select: { items: true } },
      models: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true, _count: { select: { items: true } } },
      },
    },
  });

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='equipmentcatalog'
        title={
          <>
            <Link href='/equipment-catalog' className='hover:underline'>
              Справочник оборудования
            </Link>
            {' / Виды и марки'}
          </>
        }
      />
      <main className='mx-auto flex flex-col items-center gap-4 p-2 sm:gap-6 sm:p-4'>
        <EquipmentKindsSection
          kinds={kinds}
          editable={canEdit(user)}
          editing
          linkHeading={false}
        />
      </main>
    </div>
  );
}