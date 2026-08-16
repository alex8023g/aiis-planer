import {
  TaskStatus,
  type Dependency,
  type Project,
  type Stages,
} from '@/lib/types';

export const stageLabels: Record<keyof Stages, string> = {
  ppo: 'ППО',
  design: 'Проектирование',
  supply: 'Поставка',
  smrPnr: 'СМР / ПНР',
  poverka: 'Поверка',
  algorithm: 'Алгоритм',
  metrology: 'Метрология',
};

export const stageKeys = Object.keys(stageLabels) as (keyof Stages)[];

/// Подзадачи каждого этапа в порядке отображения (см. Stages в @/lib/types).
export const stageSubtaskKeys: Record<keyof Stages, string[]> = {
  ppo: [
    'dogovor',
    'dopusk',
    'visit',
    'summary',
    'specification',
    'xml20000',
    'report',
  ],
  design: ['tz', 'rd', 'td'],
  supply: ['request', 'received', 'assembled', 'sent', 'delivered'],
  smrPnr: ['dopusk', 'visit', 'allWorks'],
  poverka: ['dogovor', 'dopusk', 'visit', 'arshin'],
  algorithm: ['sendTask', 'done'],
  metrology: ['documents', 'vniims', 'rosstandart', 'poverkaAiis'],
};

/// Подписи подзадач. Ключи глобальные (см. enum SubtaskKey в schema.prisma),
/// поэтому общие для нескольких этапов ключи описаны один раз.
export const subtaskLabels: Record<string, string> = {
  // ppo
  dogovor: 'Договор',
  dopusk: 'Допуск',
  visit: 'Выезд',
  summary: 'Сводка',
  specification: 'Спецификация',
  xml20000: 'XML 20000',
  report: 'Отчёт',
  // design
  tz: 'ТЗ',
  rd: 'РД',
  td: 'ТД',
  // supply
  request: 'Заявка',
  received: 'Получено',
  assembled: 'Собрано',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  // smrPnr
  allWorks: 'Все работы',
  // poverka
  arshin: 'Аршин',
  // algorithm
  sendTask: 'Задание отправлено',
  done: 'Выполнено',
  // metrology
  documents: 'Документы',
  vniims: 'ВНИИМС',
  rosstandart: 'Росстандарт',
  poverkaAiis: 'Поверка АИИС',
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  [TaskStatus.NotStarted]: 'Не начато',
  [TaskStatus.InProgress]: 'В работе',
  [TaskStatus.Completed]: 'Завершено',
};

export const taskStatusKeys = Object.keys(taskStatusLabels) as TaskStatus[];

export type NewProjectFormFields = {
  name: string;
  responsible: string;
  dateStart: string;
  /// Длительность проекта в рабочих днях.
  duration: number;
  /// subtasks — статус каждой подзадачи; null означает, что подзадача
  /// неприменима к проекту (см. модель Subtask в schema.prisma). Статуса на
  /// уровне этапа нет: он выводится из подзадач.
  stages: Record<
    keyof Stages,
    {
      include: boolean;
      duration: number;
      subtasks: Record<string, TaskStatus | null>;
    }
  >;
};

function allSubtasks(key: keyof Stages): Record<string, TaskStatus | null> {
  return Object.fromEntries(
    stageSubtaskKeys[key].map((subtaskKey) => [
      subtaskKey,
      TaskStatus.NotStarted,
    ]),
  );
}

export const newProjectFormFields: NewProjectFormFields = {
  name: '',
  responsible: '',
  dateStart: '',
  duration: 65,
  stages: {
    ppo: {
      include: true,
      duration: 21,
      subtasks: allSubtasks('ppo'),
    },
    design: {
      include: false,
      duration: 30,
      subtasks: allSubtasks('design'),
    },
    supply: {
      include: true,
      duration: 15,
      subtasks: allSubtasks('supply'),
    },
    smrPnr: {
      include: true,
      duration: 25,
      subtasks: allSubtasks('smrPnr'),
    },
    poverka: {
      include: false,
      duration: 10,
      subtasks: allSubtasks('poverka'),
    },
    algorithm: {
      include: false,
      duration: 15,
      subtasks: allSubtasks('algorithm'),
    },
    metrology: {
      include: false,
      duration: 10,
      subtasks: allSubtasks('metrology'),
    },
  },
};

/// Обратное преобразование: проект из базы в значения формы. Отсутствующий
/// этап (null) показываем невыбранным, но с дефолтными длительностью и
/// подзадачами, чтобы галку можно было просто поставить.
export function projectToFormFields(project: Project): NewProjectFormFields {
  const stages = Object.fromEntries(
    stageKeys.map((key) => {
      const stage = project.stages[key];
      const defaults = newProjectFormFields.stages[key];

      if (!stage) {
        return [
          key,
          { ...defaults, include: false, subtasks: { ...defaults.subtasks } },
        ];
      }

      return [
        key,
        {
          include: true,
          duration: stage.duration,
          subtasks: { ...allSubtasks(key), ...stage.subtasks },
        },
      ];
    }),
  ) as NewProjectFormFields['stages'];

  return {
    name: project.name,
    responsible: project.responsible ?? '',
    dateStart: project.dateStart,
    duration: project.duration,
    stages,
  };
}

/// Зависимости этапов по умолчанию: этап начинается после указанной подзадачи
/// другого этапа, а не следом за предыдущим. Применяются, если у этапа не
/// задана своя зависимость (startAfterStageId в базе).
export const defaultStageDependencies: Partial<
  Record<keyof Stages, Dependency>
> = {
  design: { stage: 'ppo', subtask: 'specification' },
  supply: { stage: 'ppo', subtask: 'specification' },
  algorithm: { stage: 'ppo', subtask: 'summary' },
};
