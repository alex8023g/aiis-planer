'use client';

import { useState, useTransition } from 'react';

import { updateMeterReaderCells } from '../../meter-reader/actions';

export function ProposedMeterInput({
  projectId,
  tiId,
  value,
}: {
  projectId: string;
  tiId: string;
  value: string;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (text === value) return;

    startTransition(async () => {
      const result = await updateMeterReaderCells(projectId, [
        { tiId, field: 'proposedMeterType', value: text },
      ]);

      if (result.ok) {
        setError(null);
      } else {
        setError(result.error);
        setText(value);
      }
    });
  }

  return (
    <div>
      <input
        value={text}
        disabled={isPending}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setText(value);
            event.currentTarget.blur();
          }
        }}
        className='w-full rounded border border-transparent bg-transparent px-1 hover:border-neutral-300 focus:border-neutral-400 focus:outline-none dark:hover:border-neutral-700 dark:focus:border-neutral-500'
      />
      {error && <p className='text-xs text-red-600'>{error}</p>}
    </div>
  );
}
