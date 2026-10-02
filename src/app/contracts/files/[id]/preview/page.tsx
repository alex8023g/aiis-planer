import { Download } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { DocxPreview } from '@/components/forContractsPage/DocxPreview';
import { DOCX_TYPE } from '@/lib/contract-files';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/// Просмотр .docx во вкладке. Для остальных типов страница не нужна: PDF и
/// картинки браузер открывает сам, поэтому отправляем их на ?inline=1.
export default async function ContractFilePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  const { id } = await params;

  const file = await prisma.contractFile.findUnique({
    where: { id },
    select: { fileName: true, contentType: true },
  });

  if (!file) notFound();

  const src = `/api/contracts/files/${id}`;

  if (file.contentType !== DOCX_TYPE) redirect(`${src}?inline=1`);

  return (
    <div className='min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <header className='sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900'>
        <h1 className='min-w-0 flex-1 truncate text-sm font-medium'>
          {file.fileName}
        </h1>
        <a
          href={src}
          className='flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800'
        >
          <Download className='size-3.5' />
          Скачать
        </a>
      </header>
      <DocxPreview src={src} />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const file = await prisma.contractFile.findUnique({
    where: { id },
    select: { fileName: true },
  });

  return { title: file?.fileName ?? 'Файл' };
}
