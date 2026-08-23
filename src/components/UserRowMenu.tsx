'use client';

import { EllipsisVertical, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import { changeUserRole, deleteUser } from '@/app/users/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { roleLabels, UserRole } from '@/lib/types';
import type { UserListItem } from '@/lib/users';

/// Действия админа над чужой строкой в списке пользователей. Своя строка меню
/// не получает: экшены всё равно откажут (см. src/app/users/actions.ts).
export function UserRowMenu({ user }: { user: UserListItem }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(next: string) {
    if (next === user.role) return;

    setError(null);
    startTransition(async () => {
      const result = await changeUserRole(user.id, next as UserRole);
      if (!result.ok) setError(result.error);
    });
  }

  function handleDelete() {
    const name = user.name.trim() || user.email;

    if (
      !window.confirm(
        `Удалить пользователя ${name}? При следующем входе он заведётся заново и будет ждать роли.`,
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className='flex items-center justify-end gap-2'>
      {error && <span className='text-xs text-destructive'>{error}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={`Действия с пользователем ${user.email}`}
              disabled={isPending}
            >
              <EllipsisVertical />
            </Button>
          }
        />
        <DropdownMenuContent align='end'>
          <DropdownMenuRadioGroup
            value={user.role}
            onValueChange={handleRoleChange}
          >
            {/* Заголовок внутри группы, а не рядом: DropdownMenuLabel — это
                Menu.GroupLabel, и вне Menu.Group/Menu.RadioGroup он падает. */}
            <DropdownMenuLabel>Роль</DropdownMenuLabel>
            {Object.values(UserRole).map((role) => (
              <DropdownMenuRadioItem key={role} value={role}>
                {roleLabels[role]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={handleDelete}>
            <Trash2 />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
