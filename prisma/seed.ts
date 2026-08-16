import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import type { StageKind, SubtaskKey } from '../src/generated/prisma/enums';
import { TaskStatus, type Project, type Stage } from '../src/lib/types';

const projects: Project[] = [
  {
    id: 'beta',
    name: 'Дубки',
    responsible: 'Петров П.П.',
    dateStart: '2025-08-10',
    duration: 65,
    stages: {
      ppo: {
        duration: 15,
        subtasks: {
          dogovor: null,
          dopusk: TaskStatus.Completed,
          visit: TaskStatus.Completed,
          summary: TaskStatus.Completed,
          specification: TaskStatus.Completed,
          xml20000: TaskStatus.Completed,
          report: TaskStatus.InProgress,
        },
      },
      supply: {
        duration: 20,
        startAfter: { stage: 'ppo', subtask: 'specification' },
        subtasks: {
          request: TaskStatus.Completed,
          received: TaskStatus.Completed,
          assembled: TaskStatus.InProgress,
          sent: TaskStatus.NotStarted,
          delivered: TaskStatus.NotStarted,
        },
      },
      smrPnr: {
        duration: 30,
        startAfter: { stage: 'supply', subtask: 'delivered' },
        subtasks: {
          dogovor: TaskStatus.NotStarted,
          dopusk: TaskStatus.NotStarted,
          visit: TaskStatus.NotStarted,
          allWorks: TaskStatus.NotStarted,
        },
      },
      poverka: null,
      algorithm: null,
      metrology: null,
      design: null,
    },
  },
  {
    id: 'gamma',
    name: 'Цементум волга',
    responsible: null,
    dateStart: '2025-08-10',
    duration: 143,
    stages: {
      ppo: {
        duration: 18,
        subtasks: {
          dogovor: TaskStatus.Completed,
          dopusk: TaskStatus.Completed,
          visit: TaskStatus.InProgress,
          summary: TaskStatus.NotStarted,
          specification: TaskStatus.NotStarted,
          xml20000: TaskStatus.NotStarted,
          report: TaskStatus.NotStarted,
        },
      },
      design: {
        duration: 35,
        startAfter: { stage: 'ppo', subtask: 'summary' },
        subtasks: {
          tz: TaskStatus.NotStarted,
          rd: TaskStatus.NotStarted,
          td: TaskStatus.NotStarted,
        },
      },
      supply: {
        duration: 25,
        startAfter: { stage: 'ppo', subtask: 'specification' },
        subtasks: {
          request: TaskStatus.NotStarted,
          received: TaskStatus.NotStarted,
          assembled: TaskStatus.NotStarted,
          sent: TaskStatus.NotStarted,
          delivered: TaskStatus.NotStarted,
        },
      },
      smrPnr: {
        duration: 28,
        startAfter: { stage: 'design', subtask: 'td' },
        subtasks: {
          dogovor: TaskStatus.NotStarted,
          dopusk: TaskStatus.NotStarted,
          visit: TaskStatus.NotStarted,
          allWorks: TaskStatus.NotStarted,
        },
      },
      poverka: {
        duration: 12,
        startAfter: { stage: 'ppo', subtask: 'xml20000' },
        subtasks: {
          dogovor: TaskStatus.NotStarted,
          dopusk: TaskStatus.NotStarted,
          visit: TaskStatus.NotStarted,
          arshin: TaskStatus.NotStarted,
        },
      },
      algorithm: {
        duration: 15,
        startAfter: { stage: 'ppo', subtask: 'summary' },
        subtasks: {
          collectData: TaskStatus.NotStarted,
          sendTask: TaskStatus.NotStarted,
          done: TaskStatus.NotStarted,
        },
      },
      metrology: {
        duration: 10,
        startAfter: { stage: 'poverka', subtask: 'arshin' },
        subtasks: {
          documents: TaskStatus.NotStarted,
          vniims: TaskStatus.NotStarted,
          rosstandart: TaskStatus.NotStarted,
          poverkaAiis: TaskStatus.NotStarted,
        },
      },
    },
  },
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type StageEntry = [StageKind, Stage | null | undefined];

async function seedProject(project: Project) {
  const dateStart = new Date(`${project.dateStart}T00:00:00.000Z`);

  await prisma.project.upsert({
    where: { id: project.id },
    update: {
      name: project.name,
      responsible: project.responsible,
      duration: project.duration,
      dateStart,
    },
    create: {
      id: project.id,
      name: project.name,
      responsible: project.responsible,
      duration: project.duration,
      dateStart,
    },
  });

  // Этапы пересоздаются целиком: подзадачи удаляются каскадом.
  await prisma.stage.deleteMany({ where: { projectId: project.id } });

  const entries = (Object.entries(project.stages) as StageEntry[]).filter(
    ([, stage]) => stage != null,
  );

  for (const [kind, stage] of entries) {
    if (!stage) continue;

    await prisma.stage.create({
      data: {
        projectId: project.id,
        kind,
        duration: stage.duration,
        subtasks: {
          create: Object.entries(stage.subtasks).map(
            ([key, status], position) => ({
              key: key as SubtaskKey,
              status,
              position,
            }),
          ),
        },
      },
    });
  }

  // Зависимости проставляются вторым проходом — целевой этап должен уже существовать.
  for (const [kind, stage] of entries) {
    if (!stage?.startAfter) continue;

    const target = await prisma.stage.findUniqueOrThrow({
      where: {
        projectId_kind: {
          projectId: project.id,
          kind: stage.startAfter.stage as StageKind,
        },
      },
      select: { id: true },
    });

    await prisma.stage.update({
      where: { projectId_kind: { projectId: project.id, kind } },
      data: {
        startAfterStageId: target.id,
        startAfterSubtask: stage.startAfter.subtask as SubtaskKey | undefined,
      },
    });
  }
}

async function main() {
  for (const project of projects) {
    await seedProject(project);
    console.log(`seeded project ${project.id} (${project.name})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
