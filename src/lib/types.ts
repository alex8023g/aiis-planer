import type { ProjectModel } from '@/generated/prisma/models';

export enum TaskStatus {
  NotStarted = 'not_started',
  InProgress = 'in_progress',
  Completed = 'completed',
}

export type Dependency = {
  stage: keyof Stages;
  subtask?: string;
};

export type Stage = {
  duration: number;
  startAfter?: Dependency;
  subtasks: Record<string, TaskStatus | null>;
};

export type Stages = {
  ppo: {
    duration: number;
    subtasks: {
      dogovor: TaskStatus | null;
      dopusk: TaskStatus;
      visit: TaskStatus;
      summary: TaskStatus;
      specification: TaskStatus | null;
      xml20000: TaskStatus | null;
      report: TaskStatus | null;
    };
  };
  design:
    | {
        duration: number;
        startAfter?: Dependency;
        subtasks: {
          tz: TaskStatus | null;
          rd: TaskStatus | null;
          td: TaskStatus | null;
        };
      }
    | null
    | undefined;
  supply:
    | {
        duration: number;
        startAfter: Dependency;
        subtasks: {
          request: TaskStatus;
          received: TaskStatus;
          assembled: TaskStatus | null;
          sent: TaskStatus;
          delivered: TaskStatus;
        };
      }
    | null
    | undefined;
  smrPnr:
    | {
        duration: number;
        startAfter: Dependency;
        subtasks: {
          dogovor: TaskStatus;
          dopusk: TaskStatus;
          visit: TaskStatus;
          allWorks: TaskStatus;
        };
      }
    | null
    | undefined;
  poverka:
    | {
        duration: number;
        startAfter: Dependency;
        subtasks: {
          dogovor: TaskStatus;
          dopusk: TaskStatus;
          visit: TaskStatus;
          arshin: TaskStatus;
        };
      }
    | null
    | undefined;
  algorithm:
    | {
        duration: number;
        startAfter: Dependency;
        subtasks: {
          collectData: TaskStatus;
          sendTask: TaskStatus;
          done: TaskStatus;
        };
      }
    | null
    | undefined;
  metrology:
    | {
        duration: number;
        startAfter: Dependency;
        subtasks: {
          documents: TaskStatus;
          vniims: TaskStatus;
          rosstandart: TaskStatus;
          poverkaAiis: TaskStatus;
        };
      }
    | null
    | undefined;
};

/// Скалярные поля берём из схемы Prisma, чтобы они не расходились.
/// Переопределяем только то, что в UI устроено иначе: дата как строка и
/// этапы как объект с фиксированными ключами вместо массива Stage[].
export type Project = Omit<
  ProjectModel,
  'dateStart' | 'createdAt' | 'updatedAt'
> & {
  dateStart: `${number}-${number}-${number}`;
  stages: Stages;
  /// Почты, которым проект доступен (нижний регистр, без повторов).
  members: string[];
};
