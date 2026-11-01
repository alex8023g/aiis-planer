'use client';

import { useState } from 'react';

import type { ProjectModem } from '@/lib/tis';

import { AddModemDialog } from './AddModemDialog';
import { DeleteModemDialog } from './DeleteModemDialog';
import { ModemTable } from './ModemTable';

/// Панель управления и таблица модемов: выбор строки общий у них, чтобы
/// кнопки панели могли работать с выбранным модемом.
export function ModemsView({
  projectId,
  modems,
  canEdit,
}: {
  projectId: string;
  modems: ProjectModem[];
  canEdit: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /// Выбранный модем мог исчезнуть после обновления страницы — тогда
  /// выбранного нет.
  const selected = modems.find((modem) => modem.id === selectedId) ?? null;

  return (
    <>
      {/* Панель управления. Заводить и удалять модемы может тот, кто может
          менять проект. */}
      {canEdit && (
        <div className='flex h-12 shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
          <AddModemDialog projectId={projectId} />
          {selected && (
            <DeleteModemDialog
              /// key — чтобы у другого модема диалог начинался заново.
              key={selected.id}
              projectId={projectId}
              modem={selected}
              onDeleted={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
      {modems.length === 0 ? (
        <p className='text-sm text-neutral-500 dark:text-neutral-400'>
          В проекте пока нет модемов.
        </p>
      ) : (
        <ModemTable
          modems={modems}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
    </>
  );
}
