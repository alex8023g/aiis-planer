'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { UserRole } from '@/lib/types';

export type UserActionResult = { ok: true } | { ok: false; error: string };

/// Общая проверка обоих экшенов. Запрет трогать себя нужен не из вежливости:
/// он гарантирует, что admin в приложении не кончится — тот, кто вызвал экшен,
/// admin'ом и останется. Иначе последний админ мог бы разжаловать или удалить
/// сам себя, и выдать роли стало бы некому.
async function denyIfNotAllowed(
  userId: string,
): Promise<{ ok: false; error: string } | null> {
  /// Экшены вызываются из браузера напрямую — проверяем роль здесь, а не
  /// полагаемся на то, что страница /users открывается только админу.
  const user = await requireUser();

  if (user.role !== UserRole.Admin) {
    return { ok: false, error: 'Менять пользователей может только админ' };
  }

  if (user.id === userId) {
    return { ok: false, error: 'Свою роль изменить нельзя' };
  }

  return null;
}

export async function changeUserRole(
  userId: string,
  role: UserRole,
): Promise<UserActionResult> {
  const denied = await denyIfNotAllowed(userId);

  if (denied) return denied;

  /// Роль приходит из браузера, поэтому проверяем, что она вообще существует:
  /// в базе колонка enum, и произвольная строка уронила бы запрос.
  if (!Object.values(UserRole).includes(role)) {
    return { ok: false, error: 'Неизвестная роль' };
  }

  const updated = await prisma.user.updateMany({
    where: { id: userId },
    data: { role },
  });

  if (updated.count === 0) {
    return { ok: false, error: 'Пользователь не найден' };
  }

  revalidatePath('/users');

  return { ok: true };
}

/// Сессии и аккаунты Google удаляются каскадом (см. onDelete: Cascade в
/// schema.prisma), так что удалённый сразу перестаёт быть залогиненным. Строки
/// ProjectMember остаются: доступ к проектам привязан к почте, а не к user, и
/// его снимают в самом проекте.
export async function deleteUser(userId: string): Promise<UserActionResult> {
  const denied = await denyIfNotAllowed(userId);

  if (denied) return denied;

  const deleted = await prisma.user.deleteMany({ where: { id: userId } });

  if (deleted.count === 0) {
    return { ok: false, error: 'Пользователь не найден' };
  }

  revalidatePath('/users');

  return { ok: true };
}
