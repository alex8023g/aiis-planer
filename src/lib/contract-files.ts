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

/// .docx браузер показать не умеет — его рисует docx-preview на странице
/// src/app/contracts/files/[id]/preview. Старый .doc — другой, двоичный
/// формат, библиотека его не читает, поэтому он по-прежнему скачивается.
export const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/// Что браузер умеет показать сам. Word, Excel, HEIC и TIFF он бы всё равно
/// скачал, только через пустую вкладку, — их открываем прямым скачиванием.
const previewableTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

/// Куда ведёт клик по имени: PDF и картинки браузер показывает сам, .docx
/// рисует страница просмотра, остальное — null, то есть просто скачать.
export function openHref(file: { id: string; contentType: string }) {
  if (previewableTypes.has(file.contentType)) {
    return `/api/contracts/files/${file.id}?inline=1`;
  }

  if (file.contentType === DOCX_TYPE) {
    return `/contracts/files/${file.id}/preview`;
  }

  return null;
}

/// Имя и расширение порознь: расширение уходит в цветную плашку, и дублировать
/// его в обрезанном имени незачем. Для людей «DOCX» понятнее MIME-строки.
export function splitFileName(fileName: string) {
  const dot = fileName.lastIndexOf('.');

  return dot > 0
    ? {
        base: fileName.slice(0, dot),
        ext: fileName.slice(dot + 1).toUpperCase(),
      }
    : { base: fileName, ext: '' };
}
