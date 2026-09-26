'use client';

import { renderAsync } from 'docx-preview';
import { useEffect, useRef, useState } from 'react';

/// Документ разбирается целиком в браузере: сервер отдаёт исходный .docx тем
/// же роутом, что и для скачивания, и ничего не конвертирует.
export function DocxPreview({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    /// В dev React монтирует эффект дважды — второй прогон не должен рисовать
    /// документ поверх первого.
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(src);

        if (!response.ok) throw new Error(String(response.status));

        const blob = await response.blob();

        if (cancelled) return;

        container.replaceChildren();
        await renderAsync(blob, container, undefined, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
        });

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <>
      {status === 'loading' && (
        <p className='p-6 text-sm text-neutral-500 dark:text-neutral-400'>
          Загрузка документа…
        </p>
      )}
      {status === 'error' && (
        <p className='p-6 text-sm text-red-600'>
          Не удалось открыть документ.{' '}
          <a href={src} className='underline'>
            Скачать
          </a>
        </p>
      )}
      <div ref={containerRef} />
    </>
  );
}
