import { prisma } from '@/lib/prisma';

/// Номер для новой позиции: следом за последней в спецификации этого объекта.
/// Позиции не перенумеровываются при удалении, поэтому берём максимум, а не
/// количество строк.
export async function nextPosition(facilityId: string): Promise<number> {
  const last = await prisma.specificationItem.aggregate({
    where: { facilityId },
    _max: { position: true },
  });

  return (last._max.position ?? -1) + 1;
}
