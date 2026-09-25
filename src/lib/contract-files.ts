/// Метаданные скана договора. Сам файл лежит в MinIO и отдаётся через
/// src/app/api/contracts/files/[id]/route.ts.
///
/// Модуль намеренно ничего не импортирует: его тянет и клиентский
/// ContractFilesDialog, и серверный экшен, где 'use server' разрешает
/// экспортировать наружу только асинхронные функции.
export type ContractFileItem = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: string | null;
  createdAt: Date;
};

/// Потолок на один файл. Должен совпадать с serverActions.bodySizeLimit в
/// next.config.ts: при превышении Next обрывает запрос сам, до экшена дело не
/// доходит, и пользователь видит невнятную ошибку вместо текста. Поэтому диалог
/// проверяет размер ещё до отправки.
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;

  const kb = bytes / 1024;

  if (kb < 1024) return `${Math.round(kb)} КБ`;

  return `${(kb / 1024).toFixed(1)} МБ`;
}
