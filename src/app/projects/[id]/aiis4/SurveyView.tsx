'use client';

import { Check, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import { SurveyTable } from '@/components/SurveyTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/// Панель управления и таблица опроса. Клиентская ради состояния editable:
/// кнопка в панели переключает таблицу между просмотром и правкой.
export function SurveyView({
  columns,
  rows,
  canEdit,
}: {
  columns: SurveyColumn[];
  rows: SurveyCell[][];
  /// Может ли пользователь менять проект (см. canEditProject). Без права
  /// кнопки нет вовсе: незачем показывать то, что не сработает.
  canEdit: boolean;
}) {
  const [editable, setEditable] = useState(false);
  /// Сколько ТИ добавить разом. Строкой, а не числом: иначе поле нельзя
  /// очистить, чтобы набрать новое значение, — пустое число стало бы 0.
  const [addCount, setAddCount] = useState('1');

  return (
    <>
      {/* shrink-0 — высоту делит таблица, панель не сжимается. */}
      <div className='flex h-12 shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
        {canEdit && (
          <Button
            variant={editable ? 'default' : 'outline'}
            aria-pressed={editable}
            onClick={() => setEditable((value) => !value)}
          >
            {editable ? <Check /> : <Pencil />}
            {editable ? 'Готово' : 'Редактировать'}
          </Button>
        )}
        {/* Добавление ТИ — только в режиме правки. Само добавление ещё не
            подключено: пока это поле количества и кнопка. */}
        {editable && (
          <>
            <Input
              type='number'
              min={1}
              step={1}
              value={addCount}
              onChange={(event) => setAddCount(event.target.value)}
              aria-label='Сколько ТИ добавить'
              className='w-16'
            />
            <Button variant='outline'>
              <Plus />
              Добавить ТИ
            </Button>
          </>
        )}
      </div>
      <SurveyTable
        columns={columns}
        rows={rows}
        /// № и наименование ТИ не уезжают при прокрутке вбок: без них
        /// в правых колонках не понять, о какой ТИ строка.
        stickyColumns={2}
        className='min-h-0 flex-1'
      />
    </>
  );
}
