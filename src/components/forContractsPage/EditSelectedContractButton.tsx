'use client';

import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useContractSelection } from '@/components/forContractsPage/useContractSelection';
import { cn } from '@/lib/utils';

/// Кнопка над таблицей. Своего диалога и данных договора у неё нет: она ставит
/// в адрес &edit=1, и диалог открывает строка выбранного договора
/// (ContractDialogWrapper), у которой все данные уже есть.
///
/// Кнопка не размонтируется, когда выбора нет, — иначе ей нечем было бы
/// плавно исчезнуть. Появляется и прячется она только масштабом, от правого
/// края — со стороны «Добавить договор». Место в ряду она держит всегда,
/// поэтому соседняя кнопка не сдвигается.
export function EditSelectedContractButton() {
  const { selectedId, openEdit } = useContractSelection();
  const visible = selectedId !== null;

  return (
    <div
      /// Спрятанная кнопка не ловит ни клик, ни Tab, и скринридер её не читает.
      inert={!visible}
      className={cn(
        'transition-[scale] duration-200 ease-out motion-reduce:transition-none',
        visible ? 'scale-100' : 'scale-0',
      )}
    >
      <Button
        variant='outline'
        size='sm'
        onClick={() => selectedId && openEdit(selectedId)}
      >
        <Pencil />
        Редактировать
      </Button>
    </div>
  );
}
