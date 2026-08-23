import { prisma } from '@/lib/prisma';
import type { UserRole } from '@/lib/types';

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  /// Первый вход: строку user заводит Better Auth при входе через Google.
  createdAt: Date;
};

/// Все, кто хоть раз входил в приложение. Порядок — по роли в том виде, в
/// каком она объявлена в схеме (admin выше всех, pending ниже), внутри роли —
/// по почте: список читают сверху вниз, от тех, кому позволено больше.
export async function getUsers(): Promise<UserListItem[]> {
  const rows = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
    },
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  });

  return rows.map((row) => ({ ...row, role: row.role as UserRole }));
}
