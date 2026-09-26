'use client';

import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useContractSelection } from '@/lib/use-contract-selection';

/// Кнопка над таблицей. Своего диалога и данных договора у неё нет: она ставит
/// в адрес &edit=1, и диалог открывает строка выбранного договора
/// (ContractRowMenu), у которой все данные уже есть.
export function EditSelectedContractButton() {
  const { selectedId, openEdit } = useContractSelection();

  if (!selectedId) return null;

  return (
    <Button variant='outline' size='sm' onClick={() => openEdit(selectedId)}>
      <Pencil />
      Редактировать
    </Button>
  );
}
