import Link from 'next/link';

import { Header } from '@/components/Header';
import { canEdit, requireUser } from '@/lib/session';
import { getEquipmentKits } from '@/lib/specification';

import { EquipmentKitsSection } from '../EquipmentKitsSection';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Типовые комплекты' };

export default async function KitsPage() {
  const user = await requireUser();
  const kits = await getEquipmentKits();

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
            {' / Типовые наборы'}
          </>
        }
      />
      <main className='mx-auto flex flex-col items-center gap-4 p-2 sm:gap-6 sm:p-4'>
        <EquipmentKitsSection
          kits={kits}
          editable={canEdit(user)}
          editing
          linkHeading={false}
        />
      </main>
    </div>
  );
}
