'use client';

import { Check, Pencil, Plus } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { SurveyTable } from '@/components/SurveyTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { emptyRow } from '@/lib/survey-cells';
import { surveyTiCells, surveyTiColumns, type SurveyTi } from '@/lib/survey-ti';

import { addTis } from './actions';

/// Панель управления и таблица опроса. Клиентская ради состояния editable:
/// кнопка в панели переключает таблицу между просмотром и правкой.
/// ТИ приходят значениями из базы, ячейки собираются здесь: правке нужны сами
/// значения, а не готовый текст.
export function SurveyView({
  projectId,
  tis,
  canEdit,
}: {
  projectId: string;
  tis: SurveyTi[];
  /// Может ли пользователь менять проект (см. canEditProject). Без права
  /// кнопки нет вовсе: незачем показывать то, что не сработает.
  canEdit: boolean;
}) {
  const [editable, setEditable] = useState(false);
  /// Сколько ТИ добавить разом. Строкой, а не числом: иначе поле нельзя
  /// очистить, чтобы набрать новое значение, — пустое число стало бы 0.
  const [addCount, setAddCount] = useState('1');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /// У проекта без ТИ — шапка и одна пустая строка, как на aiis3.
  const rows = useMemo(
    () => (tis.length > 0 ? surveyTiCells(tis) : [emptyRow(surveyTiColumns)]),
    [tis],
  );
  console.log('🚀 ~ SurveyView ~ rows:', rows);

  /// Пустое поле — Number('') = 0, его отсечёт проверка в экшене, и человек
  /// увидит, что не так. Проверять здесь второй раз незачем: экшен всё равно
  /// проверяет сам, его можно вызвать и в обход формы.
  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addTis(projectId, Number(addCount));
      if (!result.ok) setError(result.error);
    });
  }

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
        {/* Добавление ТИ — только в режиме правки. Новые ТИ встают в конец
            таблицы с номерами по порядку и пустым наименованием. */}
        {editable && (
          <>
            <Input
              type='number'
              min={1}
              step={1}
              value={addCount}
              onChange={(event) => setAddCount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAdd();
              }}
              disabled={isPending}
              aria-label='Сколько ТИ добавить'
              className='w-16'
            />
            <Button variant='outline' onClick={handleAdd} disabled={isPending}>
              <Plus />
              {isPending ? 'Добавляем…' : 'Добавить ТИ'}
            </Button>
          </>
        )}
        {error && <span className='text-xs text-destructive'>{error}</span>}
      </div>
      <SurveyTable
        columns={surveyTiColumns}
        rows={rows}
        /// № и наименование ТИ не уезжают при прокрутке вбок: без них
        /// в правых колонках не понять, о какой ТИ строка.
        stickyColumns={2}
        className='min-h-0 flex-1'
      />
    </>
  );
}
