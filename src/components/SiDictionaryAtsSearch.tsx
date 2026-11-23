'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';

/// Строка поиска живёт в адресе (?q=), а фильтрует сервер — см.
/// ContractSearch, откуда скопирован этот приём.
export function SiDictionaryAtsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  const [value, setValue] = useState(urlQuery);
  const [isPending, startTransition] = useTransition();

  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    if (value.trim() === prevUrlQuery.trim()) setValue(urlQuery);
  }

  useEffect(() => {
    if (value.trim() === urlQuery.trim()) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `?${query}` : window.location.pathname, {
          scroll: false,
        });
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [value, urlQuery, router]);

  return (
    <div className='relative w-full max-w-3xl'>
      <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-400' />
      <Input
        type='search'
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder='Поиск по справочнику'
        title='Счётчики, трансформаторы, УСПД — по названию'
        aria-label='Поиск по справочнику СИ АТС'
        className={`h-8.5 bg-white pl-8 transition-opacity dark:bg-neutral-900 ${
          isPending ? 'opacity-60' : ''
        }`}
      />
    </div>
  );
}
