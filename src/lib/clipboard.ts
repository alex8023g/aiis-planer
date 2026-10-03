/// Записать текст в буфер обмена. Через navigator.clipboard, если он есть: на
/// http (страница по адресу в локальной сети, а не localhost) его не
/// существует вовсе — тогда остаётся старый приём со скрытым полем.
/// execCommand объявлен устаревшим, но работает везде и разрешения не
/// спрашивает. Тот же приём — в MeasurementPointTable.
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
