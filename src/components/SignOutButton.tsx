'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';

/// Сбрасывает cookie сессии, которая осталась в браузере от закрытого доступа.
export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await signOut();
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant='ghost'
      size='sm'
      className='w-full'
      disabled={isPending}
      onClick={handleClick}
    >
      Выйти из текущего аккаунта
    </Button>
  );
}
