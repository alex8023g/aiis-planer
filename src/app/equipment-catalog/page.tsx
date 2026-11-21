import { prisma } from '@/lib/prisma';
import { canEdit, requireUser } from '@/lib/session';
import { getEquipmentKits } from '@/lib/specification';

import { EquipmentCatalogView } from './EquipmentCatalogView';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Справочник оборудования' };

/// Справочник оборудования: виды с марками и типовые комплекты.
/// Новые виды и марки заводит редактор спецификации при сохранении.
export default async function EquipmentCatalogPage() {
  const user = await requireUser();
  const [kinds, kits] = await Promise.all([
    prisma.equipmentKind.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        _count: { select: { items: true } },
        models: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, _count: { select: { items: true } } },
        },
      },
    }),
    getEquipmentKits(),
  ]);

  return (
    <EquipmentCatalogView
      user={user}
      kinds={kinds}
      kits={kits}
      editable={canEdit(user)}
    />
  );
}
