'use client';

import { updateContract } from '@/app/contracts/actions';
import { ContractDialog } from '@/components/forContractsPage/ContractDialog';
import { contractToFormFields } from '@/lib/contract-form';
import type { ContractFormFields } from '@/lib/contract-form';
import type { ContractListItem } from '@/lib/contracts';
import { useContractSelection } from '@/components/forContractsPage/useContractSelection';

/// Диалог правки договора — по одному на строку, со всеми данными строки.
/// Своей кнопки у него нет: открывает его «Редактировать» над таблицей
/// (EditSelectedContractButton) через адрес. Удаления нет намеренно: договоры
/// заливает импорт реестра (scripts/extract_contracts.py), и удалённая строка
/// вернулась бы при следующем прогоне.
///
/// Своего состояния ошибки здесь нет: диалог на неудачу не закрывается и
/// показывает текст сам.
export function ContractDialogWrapper({
  contract,
}: {
  contract: ContractListItem;
}) {
  /// Открыт ли диалог, решает адрес (?contract=<id>&edit=1).
  const { selectedId, editing, openEdit, closeEdit } = useContractSelection();
  const editOpen = editing && selectedId === contract.id;

  async function handleUpdate(fields: ContractFormFields) {
    const result = await updateContract(contract.id, fields);

    return result.ok ? { ok: true as const, id: contract.id } : result;
  }

  return (
    <ContractDialog
      open={editOpen}
      onOpenChange={(open) => (open ? openEdit(contract.id) : closeEdit())}
      title={`Редактирование: ${contract.number}`}
      submitLabel='Сохранить'
      initialValues={contractToFormFields(contract)}
      onSubmit={handleUpdate}
      files={contract.files}
    />
  );
}
