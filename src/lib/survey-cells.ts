/// Сборка ячеек таблиц опроса. Без базы и без серверного кода: им пользуются
/// и серверные запросы (src/lib/tis.ts), и клиентская таблица aiis4.
import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import { VoltageClass } from '@/lib/types';

/// Пустая строка во всю ширину таблицы — для проекта, у которого ТИ ещё нет.
/// Одни заголовки над пустотой читаются как сломанная страница, а строка
/// показывает, что таблица в порядке и ждёт данных.
///
/// В ячейках неразрывный пробел, а не пустая строка: у пустой ячейки нет
/// строки текста, и высотой она была бы в одни поля — такую строку под
/// заголовками попросту не разглядеть.
export function emptyRow(columns: SurveyColumn[]): SurveyCell[] {
  return columns.map(() => ({ v: ' ', bordered: true }));
}

/// Соседние ТИ, которые смотрят на одну общую строку — УСПД, модем, текст
/// опроса, примечание, — показываем одной объединённой ячейкой. Для каждой
/// строки возвращает высоту объединения, а для накрытых — null.
/// Объединяются только подряд идущие: разорванную группу таблица показать не
/// может, и такие ТИ получат каждая свою ячейку с тем же текстом.
export function spans(keys: (string | null)[]): (number | null)[] {
  const result: (number | null)[] = keys.map(() => 1);
  let index = 0;

  while (index < keys.length) {
    const key = keys[index];

    if (key == null) {
      index += 1;
      continue;
    }

    let end = index + 1;

    while (end < keys.length && keys[end] === key) end += 1;

    result[index] = end - index;

    for (let covered = index + 1; covered < end; covered += 1) {
      result[covered] = null;
    }

    index = end;
  }

  return result;
}

/// Ячейка под объединение: накрытая — null, владелец — с rowSpan. rowSpan в 1
/// строку не ставим: в разметке он ничего не значит, а в данных выглядит так,
/// будто ячейку зачем-то объединили саму с собой.
/// null и undefined здесь разное: null — «ячейку накрыли сверху, рисовать не
/// надо», undefined — строки за пределами списка, такой вообще не бывает.
/// Свести их вместе (span ?? 1) значит нарисовать накрытую ячейку заново.
export function cell(
  value: string,
  span: number | null | undefined,
): SurveyCell {
  if (span === null) return null;

  return span !== undefined && span > 1
    ? { v: value, rowSpan: span }
    : { v: value };
}

/// Пусто и «неизвестно» в таблице выглядят одинаково: колонка просто пустая.
export function text(value: string | null | undefined): SurveyCell {
  return { v: value ?? '' };
}

export function yesNo(value: boolean | null | undefined): SurveyCell {
  if (value === null || value === undefined) return { v: '' };

  return { v: value ? 'да' : 'нет' };
}

/// Класс напряжения показываем числом, как его называют вслух: «0,4», «110».
/// Запятая — десятичный разделитель по-русски, «0.4» в таблице выглядело бы
/// выгрузкой из чужой системы.
export const voltageClassLabels: Record<VoltageClass, string> = {
  [VoltageClass.Kv0_2]: '0,2',
  [VoltageClass.Kv0_4]: '0,4',
  [VoltageClass.Kv6]: '6',
  [VoltageClass.Kv10]: '10',
  [VoltageClass.Kv35]: '35',
  [VoltageClass.Kv110]: '110',
  [VoltageClass.Kv220]: '220',
  [VoltageClass.Kv330]: '330',
  [VoltageClass.Kv750]: '750',
};
