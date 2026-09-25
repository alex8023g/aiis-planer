'use client';

import { useState } from 'react';

import { createContract } from '@/app/contracts/actions';
import { ContractDialog } from '@/components/ContractDialog';
import { Button } from '@/components/ui/button';
import type { ContractSource } from '@/generated/prisma/enums';
import { newContractFormFields } from '@/lib/contract-form';

export function AddContractDialog({
  /// Реестр активной вкладки: с вкладки «СРО» договор логично заводить сразу в
  /// СРО, а не переставлять переключатель каждый раз.
  defaultSource,
}: {
  defaultSource: ContractSource;
}) {
  const [open, setOpen] = useState(false);

  return (
    <ContractDialog
      open={open}
      onOpenChange={setOpen}
      title='Добавить договор'
      submitLabel='Создать'
      sourceField
      initialValues={newContractFormFields(defaultSource)}
      onSubmit={createContract}
      trigger={
        <Button variant='outline' size='sm'>
          Добавить договор
        </Button>
      }
    />
  );
}
