import { splitFileName } from '@/lib/contract-files';

/// Фирменные цвета программ, а не палитра Tailwind: плашку узнают по цвету
/// раньше, чем читают надпись. Acrobat — #B30B00, Word — #185ABD, Excel —
/// #107C41 (основные цвета их иконок). Белый текст на них читается и в
/// тёмной теме, поэтому отдельный dark-вариант не нужен.
const badgeColors: Record<string, string> = {
  PDF: 'bg-[#B30B00]',
  DOC: 'bg-[#185ABD]',
  DOCX: 'bg-[#185ABD]',
  XLS: 'bg-[#107C41]',
  XLSX: 'bg-[#107C41]',
};

/// Цветная плашка с расширением файла — и в таблице договоров, и в диалоге.
export function FileBadge({ fileName }: { fileName: string }) {
  const { ext } = splitFileName(fileName);

  return (
    <span
      className={`w-10 shrink-0 rounded py-0.5 text-center text-[10px] leading-none font-semibold text-white ${
        badgeColors[ext] ?? 'bg-neutral-500'
      }`}
    >
      {ext || 'ФАЙЛ'}
    </span>
  );
}
