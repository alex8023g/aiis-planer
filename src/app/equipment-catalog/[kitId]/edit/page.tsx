import { notFound, redirect } from 'next/navigation';

import { Header } from '@/components/Header';
import { prisma } from '@/lib/prisma';
import { canEdit, requireUser } from '@/lib/session';

import { NewKitForm } from '../../new-kit/NewKitForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Редактирование комплекта' };

export default async function EditKitPage({
  params,
}: {
  params: Promise<{ kitId: string }>;
}) {
  const { kitId } = await params;
  const user = await requireUser();
  if (!canEdit(user)) redirect('/equipment-catalog');

  const [kinds, kit] = await Promise.all([
    prisma.equipmentKind.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        models: { orderBy: { name: 'asc' }, select: { id: true, name: true } },
      },
    }),
    prisma.equipmentKit.findUnique({
      where: { id: kitId },
      select: {
        id: true,
        name: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            quantity: true,
            kind: { select: { id: true, name: true } },
            model: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  if (!kit) notFound();

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='equipmentcatalog'
        title='Редактирование комплекта'
      />
      <main className='mx-auto max-w-7xl p-2 sm:p-4'>
        <NewKitForm
          kinds={kinds}
          initial={{
            id: kit.id,
            name: kit.name,
            items: kit.items.map((item) => ({
              key: item.model
                ? `${item.kind.id}:${item.model.id}`
                : item.kind.id,
              kindId: item.kind.id,
              kind: item.kind.name,
              modelId: item.model?.id ?? '',
              model: item.model?.name ?? null,
              quantity: item.quantity?.toString() ?? '',
            })),
          }}
        />
      </main>
    </div>
  );
}
