'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/// Выбранный договор и открытый диалог правки живут в адресе:
/// ?contract=<id> — выделенная строка, &edit=1 — её диалог открыт. Так их видят
/// любые компоненты страницы без общего провайдера, ссылкой можно поделиться,
/// а перезагрузка ничего не теряет.
///
/// Пишем через history.replaceState, а не router.replace: страница
/// force-dynamic, и роутер на каждый клик заново тянул бы таблицу из базы.
/// useSearchParams синхронизируется с replaceState сам. replace, а не push —
/// чтобы «Назад» уводил со страницы, а не перебирал выделенные строки.
///
/// replaceState — в эффекте, а не в обработчике: Next доносит его до
/// useSearchParams через startTransition, и в обработчике клика этот переход
/// сливался бы с рендером самого клика. Так клик сначала рисует новое значение
/// из локального pending, а адрес меняется уже после коммита.
export function useContractSelection() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.toString();

  /// Строка запроса, которую мы хотим видеть в адресе, но ещё не записали.
  const [pending, setPending] = useState<string | null>(null);
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);

  /// Адрес поменялся — наш replaceState дошёл или его сменили снаружи (другой
  /// экземпляр хука, «Назад»). В обоих случаях отложенное больше не нужно.
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setPending(null);
  }

  useEffect(() => {
    if (pending === null || pending === urlQuery) return;

    window.history.replaceState(
      null,
      '',
      pending ? `?${pending}` : window.location.pathname,
    );
  }, [pending, urlQuery]);

  const params = new URLSearchParams(pending ?? urlQuery);
  const selectedId = params.get('contract');
  const editing = selectedId !== null && params.get('edit') === '1';

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(pending ?? urlQuery);

    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }

    setPending(next.toString());
  }

  return {
    selectedId,
    editing,
    select: (id: string | null) => update({ contract: id, edit: null }),
    toggle: (id: string) =>
      update({ contract: selectedId === id ? null : id, edit: null }),
    openEdit: (id: string) => update({ contract: id, edit: '1' }),
    closeEdit: () => update({ edit: null }),
  };
}
