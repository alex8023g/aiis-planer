'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/session';
import { roleLabels } from '@/lib/types';

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    try {
      await signOut();
      router.replace('/login');
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant='ghost'
            size='sm'
            className='gap-2'
            aria-label='Меню пользователя'
            disabled={isPending}
          >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt=''
                className='size-5 rounded-full'
                referrerPolicy='no-referrer'
              />
            ) : (
              <span className='flex size-5 items-center justify-center rounded-full bg-neutral-200 text-[0.65rem] font-medium dark:bg-neutral-700'>
                {user.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}
            <span className='max-w-40 truncate'>{user.name || user.email}</span>
          </Button>
        }
      />
      <DropdownMenuContent align='end'>
        <div className='px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-400'>
          <div>{user.email}</div>
          <div>{roleLabels[user.role]}</div>
        </div>
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
