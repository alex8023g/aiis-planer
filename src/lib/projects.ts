import type { Prisma } from '@/generated/prisma/client';
import { normalizeEmail } from '@/lib/emails';
import { prisma } from '@/lib/prisma';
import { canEdit, type SessionUser } from '@/lib/session';
import { defaultStageDependencies, stageKeys } from '@/lib/stages';
import { UserRole } from '@/lib/types';
import type { Project, Stage, Stages, TaskStatus } from '@/lib/types';

/// Колонка dateStart имеет тип DATE, время в ней всегда полночь UTC.
function toDateString(date: Date): Project['dateStart'] {
  return date.toISOString().slice(0, 10) as Project['dateStart'];
}

/// Что нужно загрузить вместе с проектом, чтобы собрать Project целиком.
/// Один объект на оба запроса: список и отдельный проект должны приходить
/// одинаковыми, иначе одна и та же карточка выглядела бы по-разному.
const projectInclude = {
  members: { select: { email: true }, orderBy: { email: 'asc' } },
  stages: {
    include: {
      subtasks: { orderBy: { position: 'asc' } },
      startAfterStage: { select: { kind: true } },
    },
  },
} as const;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

/// Строка базы в Project: этапы из массива превращаются в объект с
/// фиксированными ключами (см. Stages в @/lib/types), отсутствующие — в null.
function toProject(row: ProjectRow): Project {
  const stages = Object.fromEntries(
    stageKeys.map((key) => [key, null]),
  ) as Record<keyof Stages, Stage | null>;

  for (const stage of row.stages) {
    /// Своя зависимость важнее умолчания; если её нет, берём общее правило
    /// для этого этапа. Планировщик сам откатится на последовательный
    /// порядок, когда этап-зависимость в проект не входит.
    const startAfter = stage.startAfterStage
      ? {
          stage: stage.startAfterStage.kind,
          subtask: stage.startAfterSubtask ?? undefined,
        }
      : defaultStageDependencies[stage.kind];

    stages[stage.kind] = {
      duration: stage.duration,
      ...(startAfter && { startAfter }),
      subtasks: Object.fromEntries(
        stage.subtasks.map((subtask) => [
          subtask.key,
          subtask.status as TaskStatus | null,
        ]),
      ),
    };
  }

  return {
    id: row.id,
    name: row.name,
    responsible: row.responsible,
    members: row.members.map((member) => member.email),
    duration: row.duration,
    dateStart: toDateString(row.dateStart),
    stages: stages as Stages,
  };
}

/// Проекты видны всем, кроме pending: список доступа проекта решает не что
/// показать, а кто может это менять (см. canEditProject).
export async function getProjects(user: SessionUser): Promise<Project[]> {
  /// pending роли ещё не выдали — ему не видно ничего, даже если его почта уже
  /// оказалась в списке доступа какого-нибудь проекта.
  if (user.role === UserRole.Pending) return [];

  const rows = await prisma.project.findMany({
    orderBy: { createdAt: 'asc' },
    include: projectInclude,
  });

  return rows.map(toProject);
}

/// Один проект по id или null, если его нет либо смотреть его нельзя.
/// Видимость та же, что у списка: не найден и не показан — один и тот же
/// ответ, чтобы по разнице нельзя было узнать чужие id.
export async function getProject(
  id: string,
  user: SessionUser,
): Promise<Project | null> {
  if (user.role === UserRole.Pending) return null;

  const row = await prisma.project.findUnique({
    where: { id },
    include: projectInclude,
  });

  return row ? toProject(row) : null;
}

/// Может ли пользователь менять этот проект: admin — любой, editor — только
/// тот, где его почта в списке доступа. Список уже загружен вместе с проектом,
/// поэтому запроса в базу тут нет — этим страница и решает, показывать ли меню
/// проекта. В экшенах тот же вопрос задаётся заново (hasProjectAccess): данные
/// на странице могли устареть.
export function canEditProject(project: Project, user: SessionUser): boolean {
  if (!canEdit(user)) return false;
  if (user.role === UserRole.Admin) return true;

  return project.members.includes(normalizeEmail(user.email));
}

/// Проверка доступа для серверных экшенов: страница проекта могла остаться
/// открытой в браузере после того, как почту убрали из списка. admin меняет
/// любой проект, поэтому список доступа для него не проверяется.
/// Речь только о доступе к проекту; право менять — отдельная проверка
/// (см. canEdit в src/lib/session.ts), поэтому viewer'а здесь нет: до этой
/// проверки он не доходит.
export async function hasProjectAccess(
  projectId: string,
  user: SessionUser,
): Promise<boolean> {
  if (user.role === UserRole.Admin) return true;

  const member = await prisma.projectMember.count({
    where: { projectId, email: normalizeEmail(user.email) },
  });

  return member > 0;
}
