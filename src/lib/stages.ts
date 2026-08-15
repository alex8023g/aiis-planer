import type { Stages } from '@/lib/types';

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

export type NewProjectFormFields = {
  name: string;
  responsible: string;
  dateStart: string;
  /// Длительность проекта в рабочих днях.
  duration: number;
  stages: Record<keyof Stages, { include: boolean; duration: number }>;
};

export const newProjectFormFields: NewProjectFormFields = {
  name: '',
  responsible: '',
  dateStart: '',
  duration: 65,
  stages: {
    ppo: { include: true, duration: 21 },
    design: { include: false, duration: 30 },
    supply: { include: true, duration: 15 },
    smrPnr: { include: true, duration: 25 },
    poverka: { include: false, duration: 10 },
    algorithm: { include: false, duration: 15 },
    metrology: { include: false, duration: 10 },
  },
};
