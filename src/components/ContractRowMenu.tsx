'use client';

import { EllipsisVertical, Pencil } from 'lucide-react';
import { useState } from 'react';

import { updateContract } from '@/app/contracts/actions';
import { ContractDialog } from '@/components/ContractDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { contractToFormFields } from '@/lib/contract-form';
import type { ContractFormFields } from '@/lib/contract-form';
import type { ContractListItem } from '@/lib/contracts';

/// Удаления в меню нет намеренно: договоры заливает импорт реестра
/// (scripts/extract_contracts.py), и удалённая строка вернулась бы при
/// следующем прогоне.
///
/// Своего состояния ошибки здесь нет: единственное действие открывает диалог,
/// а он на неудачу не закрывается и показывает текст сам.
export function ContractRowMenu({ contract }: { contract: ContractListItem }) {
  const [editOpen, setEditOpen] = useState(false);

  async function handleUpdate(fields: ContractFormFields) {
    const result = await updateContract(contract.id, fields);

    return result.ok ? { ok: true as const, id: contract.id } : result;
  }

  return (
    <div className='flex items-center justify-end'>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={`Действия с договором ${contract.number}`}
            >
              <EllipsisVertical />
            </Button>
          }
        />
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil />
            Редактировать
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContractDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Редактирование: ${contract.number}`}
        submitLabel='Сохранить'
        initialValues={contractToFormFields(contract)}
        onSubmit={handleUpdate}
        files={contract.files}
      />
    </div>
  );
}
