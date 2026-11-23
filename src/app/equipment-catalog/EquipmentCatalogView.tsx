import { Header } from '@/components/Header';
import type { SessionUser } from '@/lib/session';
import type { EquipmentKitOption } from '@/lib/specification';

import {
  EquipmentKindsSection,
  type EquipmentKindRow,
} from './EquipmentKindsSection';
import { EquipmentKitsSection } from './EquipmentKitsSection';

export function EquipmentCatalogView({
  user,
  kinds,
  kits,
}: {
  user: SessionUser;
  kinds: EquipmentKindRow[];
  kits: EquipmentKitOption[];
}) {
  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header user={user} current='equipmentcatalog' />
      <main className='mx-auto flex flex-col items-start gap-4 p-2 sm:gap-6 sm:p-4 lg:flex-row'>
        <EquipmentKindsSection kinds={kinds} editable={false} editing={false} />
        <EquipmentKitsSection kits={kits} editable={false} editing={false} />
      </main>
    </div>
  );
}
