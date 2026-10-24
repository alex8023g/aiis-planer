/// Записать текст в буфер обмена. Через navigator.clipboard, если он есть: на
/// http (страница по адресу в локальной сети, а не localhost) его не
/// существует вовсе — тогда остаётся старый приём со скрытым полем.
/// execCommand объявлен устаревшим, но работает везде и разрешения не
/// спрашивает.
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (cause) {
    console.error('Не удалось записать в буфер:', cause);
  }

  const field = document.createElement('textarea');

  field.value = text;
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  document.execCommand('copy');
  field.remove();
}

/// Текст из буфера в том виде, в каком его кладёт Excel: строки через
/// перевод строки, колонки через таб. Завершающий перевод строки Excel
/// добавляет сам — пустой строкой он не считается.
export function parseClipboard(raw: string): string[][] {
  const lines = raw.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');

  return lines.map((line) => line.split('\t'));
}
