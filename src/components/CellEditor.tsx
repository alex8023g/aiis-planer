'use client';

import { useEffect, useRef, useState } from 'react';

/// Поле правки ячейки. Отдельным компонентом ради фокуса при появлении и
/// защиты от двойного сохранения: Enter сохраняет и убирает поле, а
/// исчезающее поле ещё и теряет фокус — blur сохранил бы второй раз.
export function CellEditor({
  initial,
  onDone,
}: {
  initial: string;
  /// value — что сохранить, null — отмена. refocus — вернуть фокус ячейке:
  /// после Enter и Escape работа идёт дальше с клавиатуры, а уход фокуса
  /// мышью в другое место у него не отбираем.
  onDone: (value: string | null, refocus: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const element = input.current;

    if (!element) return;

    element.focus();
    /// Курсор в конец: правку начали набором буквы — её и продолжаем.
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  function finish(result: string | null, refocus: boolean) {
    if (done.current) return;

    done.current = true;
    onDone(result, refocus);
  }

  return (
    <input
      ref={input}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value, false)}
      onKeyDown={(event) => {
        /// Клавиши поля — его собственные: стрелки двигают курсор, а не
        /// выделение, Ctrl+A выделяет текст, а не колонку.
        event.stopPropagation();

        if (event.key === 'Enter') {
          event.preventDefault();
          finish(value, true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(null, true);
        }
      }}
      /// Вставка в поле — обычная вставка текста, а не таблицей поверх ячеек.
      onPaste={(event) => event.stopPropagation()}
      /// Иначе ячейка отменила бы mousedown, и курсор в поле мышью не
      /// поставить.
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className='w-full min-w-0 bg-transparent outline-none select-text'
    />
  );
}
