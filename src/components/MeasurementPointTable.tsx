'use client';

import {
  ClipboardPaste,
  EllipsisVertical,
  FolderMinus,
  FolderPlus,
  GripVertical,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react';

import {
  createFacilityWithPoints,
  deleteFacilities,
  deleteMeasurementPoints,
  reorderMeasurementPoints,
  saveMeasurementPoints,
  updateMeasurementPoints,
  type DraftPoint,
  type PointChange,
} from '@/app/projects/[id]/aiis/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { Facility, MeasurementPointRow } from '@/lib/types';

/// Колонка описана один раз: из неё берут и заголовок, и содержимое ячейки, и
/// текст для копирования. Иначе скопированное разошлось бы с показанным.
/// value отдаёт пустую строку там, где данных нет: прочерк — это оформление,
/// и в Excel ему делать нечего.
const columns: {
  header: string;
  className?: string;
  value: (row: MeasurementPointRow, index: number) => string;
  /// Поле черновика, которое заполняет вставка в эту колонку. null — колонка
  /// вычисляемая: номер строки не хранится, вставка в неё только задаёт,
  /// сколько строк набрать.
  field: keyof DraftPoint | null;
}[] = [
  {
    header: '№',
    className: 'w-10 text-neutral-500 dark:text-neutral-400',
    value: (_row, index) => String(index + 1),
    field: null,
  },
  { header: 'Наименование', value: (row) => row.name, field: 'name' },
  {
    header: 'Объект',
    value: (row) => row.facility?.name ?? '',
    field: 'facility',
  },
  {
    header: 'Модель прибора учёта',
    value: (row) => row.meterModel ?? '',
    field: 'meterModel',
  },
  {
    header: 'Заводской номер',
    className: 'whitespace-nowrap',
    value: (row) => row.meterNumber ?? '',
    field: 'meterNumber',
  },
];

const emptyDraft: DraftPoint = {
  name: '',
  facility: '',
  meterModel: '',
  meterNumber: '',
};

type Cell = { row: number; col: number };

/// Столбец из буфера: строка на значение. Если скопировали сразу несколько
/// колонок, берём первую — вставляют всё-таки в одну.
function columnValues(text: string): string[] {
  return parseBlock(text).map((cells) => cells[0]);
}

/// Блок из буфера: строки переводами, ячейки табуляцией — так таблицу отдаёт
/// Excel. Хвостовые пустые строки он добавляет всегда, поэтому их убираем.
function parseBlock(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  return lines.map((line) => line.split('\t').map((cell) => cell.trim()));
}

/// Прямоугольник выделения: от ячейки, с которой начали, до текущей. Границы
/// нормализованы, поэтому тянуть можно в любую сторону.
function areaOf(anchor: Cell, head: Cell) {
  return {
    top: Math.min(anchor.row, head.row),
    bottom: Math.max(anchor.row, head.row),
    left: Math.min(anchor.col, head.col),
    right: Math.max(anchor.col, head.col),
  };
}

/// Таблица точек учёта с выделением ячеек, как в Excel: клик, протягивание,
/// стрелки с Shift, Ctrl+C. Набор идёт колонками: вставка из буфера заполняет
/// колонку черновиков, и всё набранное уходит в базу одним сохранением.
export function MeasurementPointTable({
  projectId,
  rows,
  facilities,
  canEdit,
}: {
  projectId: string;
  rows: MeasurementPointRow[];
  /// Объекты проекта: их имена подсказываем при вводе в колонку «Объект».
  /// Заводить объект вводом нельзя — для этого есть «Добавить объект».
  facilities: Facility[];
  /// Может ли текущий пользователь менять проект (см. canEditProject). Экшен
  /// проверяет это заново: спрятанной кнопки мало.
  canEdit: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  /// Ячейка, с которой начали выделять, и текущая. Обе null — не выделено
  /// ничего; они же задают прямоугольник.
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [head, setHead] = useState<Cell | null>(null);
  /// Тянут ли мышь прямо сейчас. В ref, а не в состоянии: перерисовывать на
  /// каждое движение не нужно.
  const dragging = useRef(false);
  /// Тянут ли за колонку с номерами: тогда выделяются строки целиком, и при
  /// протягивании ширину выделения менять не нужно.
  const draggingRows = useRef(false);
  /// Почему не получилось прочитать буфер или сохранить. null — жалоб нет.
  const [error, setError] = useState<string | null>(null);
  /// Ячейка объекта, которую сейчас правят вводом: строка и набранный текст.
  /// null — не правят ничего. Правка объединённой ячейки идёт по её верхней
  /// строке, а применяется ко всей группе.
  const [editing, setEditing] = useState<{ row: number; value: string } | null>(
    null,
  );
  /// Отменили ли правку: Escape уводит фокус из поля, а уход из поля обычно
  /// означает «сохранить». Без этой отметки отменённое значение записалось бы.
  const cancelEdit = useRef(false);
  /// Строка, которую правят в диалоге целиком: её номер и значения полей.
  /// null — диалог закрыт.
  const [rowForm, setRowForm] = useState<(DraftPoint & { row: number }) | null>(
    null,
  );
  /// Название нового объекта, пока его набирают в диалоге. null — диалог
  /// закрыт.
  const [newFacility, setNewFacility] = useState<string | null>(null);
  /// Строка, которую тянут, и строка, над которой сейчас курсор. null — не
  /// тянут ничего.
  const [dragRow, setDragRow] = useState<number | null>(null);
  /// Куда ляжет строка: номер границы между строками (0 — над первой,
  /// view.length — под последней) и её отступ сверху, чтобы нарисовать черту.
  /// null — не тянут ничего.
  const [dropLine, setDropLine] = useState<{
    index: number;
    top: number;
  } | null>(null);
  /// Набранные, но ещё не сохранённые строки: вставка колонки заполняет в них
  /// своё поле. Живут только в браузере, пока не нажали «Сохранить».
  const [drafts, setDrafts] = useState<DraftPoint[]>([]);
  const [isPending, startTransition] = useTransition();

  /// Кнопку могут отпустить где угодно, в том числе вне таблицы, — слушаем
  /// документ, иначе выделение продолжило бы тянуться за курсором.
  useEffect(() => {
    function stop() {
      dragging.current = false;
    }

    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  }, []);

  /// Показываем, выделяем и копируем один и тот же набор строк: сохранённые из
  /// базы, следом — черновики. Ячейка везде строка, поэтому выделение поверх
  /// границы между ними работает само.
  const view = [
    ...rows.map((row, index) =>
      columns.map((column) => column.value(row, index)),
    ),
    ...drafts.map((draft, index) =>
      columns.map((column) =>
        column.field ? draft[column.field] : String(rows.length + index + 1),
      ),
    ),
  ];

  /// Одинаковый объект подряд идущих строк показываем один раз — объединённой
  /// ячейкой, как в Excel. Пустые не объединяем: «объекта нет» — это не общий
  /// объект, а его отсутствие, и строки с ним ничем не связаны.
  const facilityCol = columns.findIndex(
    (column) => column.field === 'facility',
  );
  /// Сколько строк накрывает ячейка объекта в этой строке; 0 — строку накрыла
  /// ячейка выше, и рисовать здесь нечего. start — где эта ячейка начинается:
  /// по нему находят её в DOM, когда выделение переходит на накрытую строку.
  const facilitySpan = new Array<number>(view.length).fill(1);
  const facilityStart = view.map((_cells, row) => row);

  for (let row = 0; row < view.length;) {
    const value = view[row][facilityCol];

    if (!value) {
      row++;
      continue;
    }

    let end = row + 1;

    while (end < view.length && view[end][facilityCol] === value) end++;

    facilitySpan[row] = end - row;

    for (let covered = row + 1; covered < end; covered++) {
      facilitySpan[covered] = 0;
      facilityStart[covered] = row;
    }

    row = end;
  }

  /// Ячейка, на которой должен стоять фокус: у объединённой колонки это та,
  /// что накрывает текущую строку, — накрытых строк в разметке нет.
  const focusCol = head ? head.col : null;
  const focusRow = head
    ? head.col === facilityCol
      ? facilityStart[head.row]
      : head.row
    : null;

  /// Фокус держим на текущей ячейке: с него работают стрелки и Ctrl+C, и он же
  /// подтягивает ячейку в видимую часть при прокрутке таблицы вбок. В
  /// зависимостях числа, а не head: иначе эффект срабатывал бы на каждую
  /// перерисовку и отбирал фокус.
  useEffect(() => {
    if (focusRow === null || focusCol === null) return;

    container.current
      ?.querySelector<HTMLElement>(`[data-cell="${focusRow}:${focusCol}"]`)
      ?.focus();
  }, [focusRow, focusCol]);

  const area = anchor && head ? areaOf(anchor, head) : null;

  /// Ячейка считается выделенной, если выделение накрывает хоть одну из её
  /// строк: объединённая ячейка живёт сразу за несколько.
  function isSelected(row: number, col: number, span = 1): boolean {
    return (
      area !== null &&
      row + span - 1 >= area.top &&
      row <= area.bottom &&
      col >= area.left &&
      col <= area.right
    );
  }

  function select(cell: Cell, extend: boolean) {
    if (!extend || !anchor) setAnchor(cell);
    setHead(cell);
  }

  /// Клик по номеру выделяет строку целиком — как щелчок по заголовку строки в
  /// Excel. Shift и протягивание набирают несколько строк подряд.
  function selectRow(row: number, extend: boolean) {
    setAnchor(extend && anchor ? { row: anchor.row, col: 0 } : { row, col: 0 });
    setHead({ row, col: columns.length - 1 });
  }

  /// Текст из буфера или null, если прочитать не дали: жалобу показываем здесь
  /// же, вызывающему остаётся только выйти. Чтение требует разрешения браузера,
  /// работает из обработчика события и на защищённой странице (localhost
  /// считается такой, иначе нужен `npm run dev:https`), поэтому отказ — обычное
  /// дело, а не сбой.
  async function readClipboard(): Promise<string | null> {
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((entry) => entry.types.includes('text/plain'));

      if (!item) {
        setError('В буфере нет текста');
        return null;
      }

      return await (await item.getType('text/plain')).text();
    } catch (cause) {
      console.error('Буфер обмена недоступен:', cause);
      setError('Браузер не дал прочитать буфер обмена');
      return null;
    }
  }

  /// Ctrl+V: блок ложится от левого верхнего угла выделения вправо и вниз, как
  /// в Excel. Что не помещается по ширине — отбрасываем, что выходит за
  /// последнюю строку — становится черновиками. Ячейки, попавшие на сохранённые
  /// строки, уходят правкой в базу.
  async function pasteBlock() {
    if (!area) return;

    setError(null);

    const text = await readClipboard();

    if (text === null) return;

    const block = parseBlock(text);

    if (block.length === 0) {
      setError('В буфере нет строк');
      return;
    }

    const changes = new Map<string, PointChange>();
    /// Правки черновиков собираем отдельно: их применяют к состоянию, а не
    /// отправляют на сервер.
    const draftEdits: {
      index: number;
      field: keyof DraftPoint;
      value: string;
    }[] = [];
    let lastDraftIndex = -1;

    block.forEach((cells, blockRow) => {
      const row = area.top + blockRow;

      cells.forEach((value, blockCol) => {
        const col = area.left + blockCol;

        /// Лишние колонки и колонка с номерами отбрасываются: номер строки —
        /// не поле, его не хранят.
        if (col >= columns.length) return;

        const field = columns[col].field;

        if (!field) return;

        if (row < rows.length) {
          const change = changes.get(rows[row].id) ?? { id: rows[row].id };

          change[field] = value;
          changes.set(rows[row].id, change);
          return;
        }

        const index = row - rows.length;

        lastDraftIndex = Math.max(lastDraftIndex, index);
        draftEdits.push({ index, field, value });
      });
    });

    if (draftEdits.length > 0 || lastDraftIndex >= 0) {
      setDrafts((current) => {
        const next = current.map((draft) => ({ ...draft }));

        while (next.length <= lastDraftIndex) next.push({ ...emptyDraft });

        for (const edit of draftEdits)
          next[edit.index][edit.field] = edit.value;

        return next;
      });
    }

    /// Выделяем вставленное — видно, что и куда легло.
    setAnchor({ row: area.top, col: area.left });
    setHead({
      row: area.top + block.length - 1,
      col: Math.min(
        area.left + Math.max(...block.map((cells) => cells.length)) - 1,
        columns.length - 1,
      ),
    });

    if (changes.size === 0) return;

    startTransition(async () => {
      const result = await updateMeasurementPoints(projectId, [
        ...changes.values(),
      ]);

      if (!result.ok) setError(result.error);
    });
  }

  /// Вставка колонки: сколько значений в буфере, столько и строк-черновиков.
  /// Чтение буфера требует разрешения браузера, работает из обработчика клика и
  /// на защищённой странице (localhost считается такой, иначе нужен
  /// `npm run dev:https`), поэтому отказ — обычное дело, а не сбой.
  async function pasteColumn(field: keyof DraftPoint | null) {
    setError(null);

    const text = await readClipboard();

    if (text === null) return;

    const values = columnValues(text);

    if (values.length === 0) {
      setError('В буфере нет строк');
      return;
    }

    setDrafts((current) => {
      /// Строк становится столько, сколько вставили, но уже набранное не
      /// теряем: колонки вставляют по очереди, и вторая может быть короче.
      const next = current.map((draft) => ({ ...draft }));

      while (next.length < values.length) next.push({ ...emptyDraft });

      if (field) {
        values.forEach((value, index) => {
          next[index][field] = value;
        });
      }

      return next;
    });
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveMeasurementPoints(projectId, drafts);

      /// Ошибку экшен возвращает значением, а не исключением: её показывают
      /// рядом с таблицей. Черновики при этом остаются — их правят и сохраняют
      /// заново.
      if (!result.ok) return setError(result.error);

      setDrafts([]);
      setAnchor(null);
      setHead(null);
    });
  }

  /// Удаляем всё, чего касается выделение: строки от верхней до нижней. В них
  /// могут попасть и сохранённые точки, и черновики — первые уходят из базы,
  /// вторые просто исчезают со страницы.
  function handleDelete() {
    if (!area) return;

    const ids: string[] = [];
    let draftCount = 0;

    for (let row = area.top; row <= area.bottom; row++) {
      if (row < rows.length) ids.push(rows[row].id);
      else draftCount++;
    }

    const parts = [
      ids.length > 0 && `сохранённых: ${ids.length}`,
      draftCount > 0 && `черновиков: ${draftCount}`,
    ].filter((part) => part !== false);

    if (!window.confirm(`Удалить строки (${parts.join(', ')})?`)) return;

    /// Черновики убираем сразу: сервер о них не знает. Индексы считаем от
    /// конца списка сохранённых строк — черновики идут следом за ними.
    if (draftCount > 0) {
      const from = Math.max(area.top - rows.length, 0);

      setDrafts((current) =>
        current.filter(
          (_draft, index) => index < from || index >= from + draftCount,
        ),
      );
    }

    setAnchor(null);
    setHead(null);

    if (ids.length === 0) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteMeasurementPoints(projectId, ids);
      if (!result.ok) setError(result.error);
    });
  }

  /// Границы, между которыми строку можно двигать. Объект не ограничивает:
  /// порядок в проекте сквозной, и строка сохраняет свой объект, куда бы её ни
  /// перенесли, — иначе точку из объекта-одиночки нельзя было бы сдвинуть.
  /// Разделены только сохранённые строки и черновики: у черновиков нет ни
  /// объекта, ни номера в базе.
  function dropRange(row: number): { first: number; last: number } {
    return row >= rows.length
      ? { first: rows.length, last: view.length }
      : { first: 0, last: rows.length };
  }

  /// Ближайшая граница к курсору. Считаем по всем строкам, а не по той, над
  /// которой курсор: объединённая ячейка объекта принадлежит первой строке
  /// группы, и по ней черта прыгала бы к началу группы.
  function boundaryAt(clientY: number): number {
    const root = container.current;

    if (!root) return 0;

    const elements = [...root.querySelectorAll<HTMLElement>('[data-row]')];

    for (const [index, element] of elements.entries()) {
      const rect = element.getBoundingClientRect();

      if (clientY < rect.top + rect.height / 2) return index;
    }

    return elements.length;
  }

  /// Отступ границы от верха таблицы: по нему рисуют черту. Границу ниже
  /// последней строки берём по её нижнему краю.
  function boundaryTop(index: number): number {
    if (!container.current) return 0;

    const top = container.current.getBoundingClientRect().top;
    const last = index >= view.length;
    const row = container.current.querySelector(
      `[data-row="${last ? view.length - 1 : index}"]`,
    );

    if (!row) return 0;

    const rect = row.getBoundingClientRect();

    return (last ? rect.bottom : rect.top) - top;
  }

  /// Бросок строки на границу между строками. Сохранённые переставляются в
  /// базе, черновики — в состоянии; смешивать нельзя: у черновиков ещё нет ни
  /// объекта, ни номера в базе.
  function handleDrop(index: number) {
    const from = dragRow;

    setDragRow(null);
    setDropLine(null);

    if (from === null) return;

    const fromDraft = from >= rows.length;
    const range = dropRange(from);

    /// Черта и так прилипает к своему диапазону, но бросок мог прийти мимо
    /// неё — например, с клавиатуры браузера.
    if (index < range.first || index > range.last) return;

    /// Строка уходит со своего места, поэтому граница ниже неё сдвигается на
    /// одну вверх. Бросок на свою же границу ничего не меняет.
    const to = index > from ? index - 1 : index;

    if (to === from) return;

    if (fromDraft) {
      setDrafts((current) => {
        const next = [...current];
        const [moved] = next.splice(from - rows.length, 1);

        next.splice(to - rows.length, 0, moved);

        return next;
      });
      return;
    }

    const order = [...rows];
    const [moved] = order.splice(from, 1);

    order.splice(to, 0, moved);

    /// Порядок сквозной по проекту, поэтому отправляем весь список строк —
    /// объекты при этом не меняются.
    setError(null);
    startTransition(async () => {
      const result = await reorderMeasurementPoints(
        projectId,
        order.map((row) => row.id),
      );

      if (!result.ok) setError(result.error);
    });
  }

  /// Завести объект из выбранных строк. Сохранённые точки переносит экшен, а
  /// черновикам просто проставляем имя объекта: они попадут в него при
  /// сохранении — искать объект по имени умеет и saveMeasurementPoints.
  function handleCreateFacility() {
    if (!area || newFacility === null) return;

    const ids: number[] = [];
    const draftRows: number[] = [];

    for (let row = area.top; row <= area.bottom; row++) {
      if (row < rows.length) ids.push(row);
      else draftRows.push(row - rows.length);
    }

    const name = newFacility;

    setError(null);
    startTransition(async () => {
      if (ids.length > 0) {
        const result = await createFacilityWithPoints(
          projectId,
          name,
          ids.map((row) => rows[row].id),
        );

        if (!result.ok) return setError(result.error);
      }

      if (draftRows.length > 0) {
        setDrafts((current) =>
          current.map((draft, index) =>
            draftRows.includes(index) ? { ...draft, facility: name } : draft,
          ),
        );
      }

      setNewFacility(null);
      setAnchor(null);
      setHead(null);
    });
  }

  /// Объекты, чьи ячейки попали в выделение: кнопка удаления объекта работает
  /// по ним. Имя ищем среди объектов проекта — так в набор попадают и объекты
  /// из строк-черновиков, у которых есть только имя.
  const selectedFacilities =
    area && area.left <= facilityCol && area.right >= facilityCol
      ? [
          ...new Map(
            Array.from(
              { length: area.bottom - area.top + 1 },
              (_value, index) => view[area.top + index][facilityCol],
            )
              .filter((name) => name)
              .map((name) => [
                name.toLowerCase(),
                facilities.find(
                  (facility) =>
                    facility.name.trim().toLowerCase() === name.toLowerCase(),
                ),
              ]),
          ).values(),
        ].filter((facility) => facility !== undefined)
      : [];

  /// Записать объект в строки: сохранённые уходят правкой в базу (имя там же
  /// ищется среди объектов проекта), черновикам проставляем имя на месте.
  function applyFacility(from: number, span: number, value: string) {
    setEditing(null);

    const ids: string[] = [];
    const draftRows: number[] = [];

    for (let row = from; row < from + span; row++) {
      /// Менять нечего, если значение то же — заодно не трогаем базу зря.
      if (view[row][facilityCol] === value.trim()) continue;

      if (row < rows.length) ids.push(rows[row].id);
      else draftRows.push(row - rows.length);
    }

    if (draftRows.length > 0) {
      setDrafts((current) =>
        current.map((draft, index) =>
          draftRows.includes(index) ? { ...draft, facility: value } : draft,
        ),
      );
    }

    if (ids.length === 0) return;

    setError(null);
    startTransition(async () => {
      const result = await updateMeasurementPoints(
        projectId,
        ids.map((id) => ({ id, facility: value })),
      );

      if (!result.ok) setError(result.error);
    });
  }

  /// Удалить объекты, попавшие в выделение. Точки останутся — про это
  /// предупреждаем: со стороны это выглядит как удаление вместе с ними.
  function handleDeleteFacilities() {
    if (selectedFacilities.length === 0) return;

    const ids = selectedFacilities.map((facility) => facility.id);
    const affected = rows.filter(
      (row) => row.facilityId !== null && ids.includes(row.facilityId),
    ).length;
    const names = selectedFacilities
      .map((facility) => `«${facility.name}»`)
      .join(', ');

    const warning =
      affected > 0
        ? `Удалить ${names}? Точки (${affected}) останутся в проекте без объекта.`
        : `Удалить ${names}?`;

    if (!window.confirm(warning)) return;

    /// В черновиках это имя тоже больше ничего не значит — иначе сохранение
    /// завело бы объект заново.
    const deletedNames = selectedFacilities.map((facility) =>
      facility.name.trim().toLowerCase(),
    );

    setDrafts((current) =>
      current.map((draft) =>
        deletedNames.includes(draft.facility.trim().toLowerCase())
          ? { ...draft, facility: '' }
          : draft,
      ),
    );

    setError(null);
    setAnchor(null);
    setHead(null);
    startTransition(async () => {
      const result = await deleteFacilities(projectId, ids);
      if (!result.ok) setError(result.error);
    });
  }

  /// Строка целиком из диалога: сохранённая уходит правкой в базу, черновик
  /// меняется на месте. Поля отдаём все — что не изменилось, экшен и так
  /// перезапишет тем же значением.
  function handleRowFormSave() {
    if (!rowForm) return;

    const { row, ...fields } = rowForm;

    setError(null);

    if (row >= rows.length) {
      setDrafts((current) =>
        current.map((draft, index) =>
          index === row - rows.length ? fields : draft,
        ),
      );
      setRowForm(null);
      return;
    }

    startTransition(async () => {
      const result = await updateMeasurementPoints(projectId, [
        { id: rows[row].id, ...fields },
      ]);

      if (!result.ok) return setError(result.error);

      setRowForm(null);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!head) return;

    if (event.key === 'Escape') {
      setAnchor(null);
      setHead(null);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      /// Ctrl+A — всё внутри таблицы, а не вся страница.
      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setAnchor({ row: 0, col: 0 });
        setHead({ row: view.length - 1, col: columns.length - 1 });
        return;
      }

      /// Копируем сами: браузеру копировать нечего — текст на странице не
      /// выделен, выделение здесь своё.
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void copySelection();
        return;
      }

      /// Вставлять может только тот, кто вправе менять проект; экшены
      /// проверяют это ещё раз.
      if (event.key.toLowerCase() === 'v' && canEdit) {
        event.preventDefault();
        void pasteBlock();
        return;
      }
    }

    /// Правку начинают как в Excel: Enter или F2 открывают ячейку с её
    /// значением, а обычный символ — с ним же вместо старого текста.
    if (canEdit && head.col === facilityCol && !event.altKey) {
      const start = facilityStart[head.row];

      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        setEditing({ row: start, value: view[head.row][facilityCol] });
        return;
      }

      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key !== ' '
      ) {
        event.preventDefault();
        setEditing({ row: start, value: event.key });
        return;
      }
    }

    const step: Record<string, Cell> = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    };
    const move = step[event.key];

    if (!move) return;

    /// Стрелки иначе прокрутили бы страницу под таблицей.
    event.preventDefault();

    select(
      {
        row: Math.min(Math.max(head.row + move.row, 0), view.length - 1),
        col: Math.min(Math.max(head.col + move.col, 0), columns.length - 1),
      },
      event.shiftKey,
    );
  }

  /// Выделенное в том же виде, в каком таблицу отдаёт Excel: строки переводами,
  /// ячейки табуляцией. Так вставка попадает обратно в таблицу, а не в одну
  /// ячейку.
  function selectionText(): string {
    if (!area) return '';

    const lines = [];

    for (let row = area.top; row <= area.bottom; row++) {
      const cells = [];

      for (let col = area.left; col <= area.right; col++) {
        cells.push(view[row][col]);
      }

      lines.push(cells.join('\t'));
    }

    return lines.join('\n');
  }

  async function copySelection() {
    const text = selectionText();

    if (!text) return;

    /// Через буфер напрямую, если он доступен: на http (страница по адресу в
    /// локальной сети, а не localhost) navigator.clipboard не существует
    /// вовсе — тогда остаётся старый приём со скрытым полем. execCommand
    /// объявлен устаревшим, но работает везде и разрешения не спрашивает.
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

  return (
    <div className='flex flex-col gap-2'>
      {error && <p className='text-sm text-destructive'>{error}</p>}

      <div
        ref={container}
        onKeyDown={handleKeyDown}
        className='overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
      >
        <table className='w-full text-left text-sm select-none'>
          <thead className='text-xs text-neutral-500 dark:text-neutral-400'>
            <tr className='border-b border-neutral-200 dark:border-neutral-800'>
              {columns.map((column) => (
                <th key={column.header} className='px-4 py-3 font-medium'>
                  <span className='flex items-center gap-1 whitespace-nowrap'>
                    {column.header}
                    {/* Вставлять может только тот, кто вправе менять проект;
                        экшен сохранения проверяет это ещё раз. */}
                    {canEdit && (
                      <Button
                        size='icon-sm'
                        variant='ghost'
                        aria-label={`Вставить из буфера в колонку «${column.header}»`}
                        title='Вставить из буфера'
                        onClick={() => pasteColumn(column.field)}
                      >
                        <ClipboardPaste />
                      </Button>
                    )}
                  </span>
                </th>
              ))}
              {canEdit && (
                <th className='w-10 px-2 py-3'>
                  <span className='sr-only'>Действия</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody
            /// Строки становятся местом, куда можно бросить, только если
            /// отменить и dragenter, и dragover: одного мало.
            onDragEnter={(event) => {
              if (dragRow !== null) event.preventDefault();
            }}
            onDragOver={(event) => {
              if (dragRow === null) return;

              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';

              /// За пределы своего объекта черта не уходит: она показывает,
              /// куда строка ляжет на самом деле.
              const range = dropRange(dragRow);
              const index = Math.min(
                Math.max(boundaryAt(event.clientY), range.first),
                range.last,
              );

              setDropLine({ index, top: boundaryTop(index) });
            }}
            onDrop={(event) => {
              if (dragRow === null) return;

              event.preventDefault();
              handleDrop(dropLine ? dropLine.index : boundaryAt(event.clientY));
            }}
          >
            {view.map((cells, rowIndex) => {
              /// Черновики идут следом за сохранёнными — по номеру и отличаем.
              const isDraft = rowIndex >= rows.length;

              return (
                <tr
                  key={
                    isDraft
                      ? `draft-${rowIndex - rows.length}`
                      : rows[rowIndex].id
                  }
                  data-row={rowIndex}
                  className={`border-b border-neutral-200 last:border-0 dark:border-neutral-800 ${
                    isDraft ? 'bg-amber-50 dark:bg-amber-500/10' : ''
                  } ${dragRow === rowIndex ? 'opacity-40' : ''}`}
                >
                  {columns.map((column, colIndex) => {
                    const merged = colIndex === facilityCol;
                    const span = merged ? facilitySpan[rowIndex] : 1;

                    /// Строку накрыла ячейка выше — рисовать здесь нечего.
                    if (span === 0) return null;

                    const selected = isSelected(rowIndex, colIndex, span);
                    const active =
                      head !== null &&
                      head.col === colIndex &&
                      (merged
                        ? facilityStart[head.row] === rowIndex
                        : head.row === rowIndex);
                    const text = cells[colIndex];

                    return (
                      <td
                        key={column.header}
                        data-cell={`${rowIndex}:${colIndex}`}
                        rowSpan={span}
                        /// Фокус переходит по стрелкам, поэтому в порядок обхода
                        /// табом попадает только текущая ячейка.
                        tabIndex={active ? 0 : -1}
                        aria-selected={selected}
                        onMouseDown={(event) => {
                          /// Иначе браузер начал бы выделять текст, а фокус ушёл
                          /// бы не туда, куда нам нужно.
                          event.preventDefault();
                          dragging.current = true;
                          draggingRows.current = colIndex === 0;

                          if (draggingRows.current) {
                            selectRow(rowIndex, event.shiftKey);
                            return;
                          }

                          /// Клик по объединённой ячейке берёт все её строки:
                          /// она и показана как одна на группу.
                          if (span > 1) {
                            setAnchor({ row: rowIndex, col: colIndex });
                            setHead({
                              row: rowIndex + span - 1,
                              col: colIndex,
                            });
                            return;
                          }

                          select(
                            { row: rowIndex, col: colIndex },
                            event.shiftKey,
                          );
                        }}
                        onDoubleClick={() => {
                          if (!canEdit || !merged) return;

                          setError(null);
                          setEditing({ row: rowIndex, value: text });
                        }}
                        onMouseEnter={() => {
                          if (!dragging.current) return;

                          setHead({
                            row: rowIndex,
                            col: draggingRows.current
                              ? columns.length - 1
                              : colIndex,
                          });
                        }}
                        className={`px-4 py-2 outline-none ${span > 1 ? 'text-center align-middle' : ''} ${colIndex === 0 ? 'cursor-pointer' : 'cursor-cell'} ${column.className ?? ''} ${
                          selected ? 'bg-primary/10' : ''
                        } ${active ? 'ring-2 ring-primary ring-inset' : ''}`}
                      >
                        {merged && editing?.row === rowIndex ? (
                          <Input
                            autoFocus
                            list='facility-names'
                            value={editing.value}
                            aria-label='Объект'
                            className='h-7'
                            onChange={(event) =>
                              setEditing({
                                row: rowIndex,
                                value: event.target.value,
                              })
                            }
                            /// Клавиши ячейки таблице не нужны: стрелки внутри
                            /// поля двигают курсор, а не выделение.
                            onKeyDown={(event) => {
                              event.stopPropagation();

                              if (event.key === 'Escape')
                                cancelEdit.current = true;

                              /// И Enter, и Escape просто уводят фокус:
                              /// записывает всегда onBlur, поэтому записать
                              /// дважды нельзя.
                              if (
                                event.key === 'Enter' ||
                                event.key === 'Escape'
                              ) {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                            }}
                            /// Уход из поля — то же, что Enter: набранное не
                            /// должно теряться от клика мимо.
                            onBlur={() => {
                              if (cancelEdit.current) {
                                cancelEdit.current = false;
                                setEditing(null);
                                return;
                              }

                              applyFacility(rowIndex, span, editing.value);
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                          />
                        ) : colIndex === 0 && canEdit ? (
                          <span className='flex items-center gap-1'>
                            {/* Тянут за ручку, а не за строку: на самой строке
                                нажатие мыши начинает выделение ячеек. */}
                            <span
                              draggable
                              aria-label={`Перетащить строку ${text}`}
                              title='Перетащить строку'
                              className='-m-1 cursor-grab p-1 text-neutral-400 active:cursor-grabbing dark:text-neutral-500'
                              onMouseDown={(event) => event.stopPropagation()}
                              onDragStart={(event) => {
                                /// Без данных Firefox перетаскивание вообще не
                                /// начинает: номер строки и кладём, он же
                                /// пригодится, если бросят мимо таблицы.
                                event.dataTransfer.setData(
                                  'text/plain',
                                  String(rowIndex + 1),
                                );
                                event.dataTransfer.effectAllowed = 'move';
                                setError(null);
                                setDragRow(rowIndex);
                              }}
                              onDragEnd={() => {
                                setDragRow(null);
                                setDropLine(null);
                              }}
                            >
                              <GripVertical className='size-3.5' />
                            </span>
                            {text}
                          </span>
                        ) : (
                          /* Прочерк — только оформление пустого места: в буфер
                             уходит пустая ячейка (см. value колонки). */
                          text || '—'
                        )}
                      </td>
                    );
                  })}

                  {/* Меню вне колонок таблицы: его нечего выделять и
                      копировать. */}
                  {canEdit && (
                    <td className='px-2 py-2'>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`Действия со строкой ${cells[0]}`}
                              disabled={isPending}
                            >
                              <EllipsisVertical />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem
                            onClick={() => {
                              setError(null);
                              setRowForm({
                                row: rowIndex,
                                name: cells[1],
                                facility: cells[facilityCol],
                                meterModel: cells[3],
                                meterNumber: cells[4],
                              });
                            }}
                          >
                            <Pencil />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              /// Выделяем строку — дальше её удаляют кнопкой
                              /// панели: там же считают, скольких строк это
                              /// коснётся.
                              setAnchor({ row: rowIndex, col: 0 });
                              setHead({
                                row: rowIndex,
                                col: columns.length - 1,
                              });
                            }}
                          >
                            <Trash2 />
                            Выделить строку
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              );
            })}

            {view.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (canEdit ? 1 : 0)}
                  className='px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400'
                >
                  Точек учёта нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Кнопка удаления — при любом выделении: берутся строки, которых оно
          касается, хоть по одной ячейке. */}
      {canEdit && area && (
        <div className='flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950/40'>
          <span className='text-sm'>
            Выбрано строк: {area.bottom - area.top + 1}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={isPending}
            onClick={handleDelete}
          >
            <Trash2 />
            Удалить строки
          </Button>
          {/* Объект удаляют из его же ячейки: выделили — видно, какой. */}
          {selectedFacilities.length > 0 && (
            <Button
              variant='outline'
              size='sm'
              disabled={isPending}
              onClick={handleDeleteFacilities}
            >
              <FolderMinus />
              {selectedFacilities.length === 1
                ? `Удалить объект «${selectedFacilities[0].name}»`
                : `Удалить объекты (${selectedFacilities.length})`}
            </Button>
          )}
          {/* Объект заводят из нескольких строк сразу: ради одной точки проще
              вписать объект в её ячейку. */}
          {area.bottom > area.top && (
            <Button
              variant='outline'
              size='sm'
              disabled={isPending}
              onClick={() => {
                setError(null);
                setNewFacility('');
              }}
            >
              <FolderPlus />
              Добавить объект
            </Button>
          )}
        </div>
      )}

      <Dialog
        open={rowForm !== null}
        onOpenChange={(open) => {
          if (!open) setRowForm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Строка таблицы</DialogTitle>
          </DialogHeader>

          {rowForm && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleRowFormSave();
              }}
              noValidate
              className='flex flex-col gap-3'
            >
              {/* Те же поля, что и колонки таблицы, — правка целиком, когда
                  ходить по ячейкам неудобно. */}
              <label className='flex flex-col gap-1 text-sm'>
                Наименование
                <Input
                  autoFocus
                  value={rowForm.name}
                  onChange={(event) =>
                    setRowForm({ ...rowForm, name: event.target.value })
                  }
                />
              </label>

              <label className='flex flex-col gap-1 text-sm'>
                Объект
                <Input
                  list='facility-names'
                  value={rowForm.facility}
                  placeholder='Без объекта'
                  onChange={(event) =>
                    setRowForm({ ...rowForm, facility: event.target.value })
                  }
                />
              </label>

              <label className='flex flex-col gap-1 text-sm'>
                Модель прибора учёта
                <Input
                  value={rowForm.meterModel}
                  onChange={(event) =>
                    setRowForm({ ...rowForm, meterModel: event.target.value })
                  }
                />
              </label>

              <label className='flex flex-col gap-1 text-sm'>
                Заводской номер
                <Input
                  value={rowForm.meterNumber}
                  onChange={(event) =>
                    setRowForm({ ...rowForm, meterNumber: event.target.value })
                  }
                />
              </label>

              <p className='text-sm text-neutral-500 dark:text-neutral-400'>
                {rowForm.row >= rows.length
                  ? 'Строка ещё не сохранена: изменения останутся в черновике'
                  : 'Объект, которого нет, будет заведён'}
              </p>

              <DialogFooter>
                <DialogClose
                  render={
                    <Button type='button' variant='ghost' disabled={isPending}>
                      Отмена
                    </Button>
                  }
                />
                <Button type='submit' variant='outline' disabled={isPending}>
                  Сохранить
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Подсказка объектов нужна и здесь, и в правке ячейки: список один. */}
      <datalist id='facility-names'>
        {facilities.map((facility) => (
          <option key={facility.id} value={facility.name} />
        ))}
      </datalist>

      <Dialog
        open={newFacility !== null}
        onOpenChange={(open) => {
          if (!open) setNewFacility(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый объект</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateFacility();
            }}
            noValidate
            className='flex flex-col gap-4'
          >
            <Input
              autoFocus
              value={newFacility ?? ''}
              placeholder='Название объекта'
              aria-label='Название объекта'
              onChange={(event) => setNewFacility(event.target.value)}
            />

            <p className='text-sm text-neutral-500 dark:text-neutral-400'>
              {area
                ? `Строк перейдёт в объект: ${area.bottom - area.top + 1}`
                : ''}
            </p>

            <DialogFooter>
              <DialogClose
                render={
                  <Button type='button' variant='ghost' disabled={isPending}>
                    Отмена
                  </Button>
                }
              />
              <Button type='submit' variant='outline' disabled={isPending}>
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Панель появляется вместе с черновиками: пока их нет, сохранять
          нечего. */}
      {drafts.length > 0 && (
        <div className='flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950/40'>
          <span className='text-sm'>Не сохранено строк: {drafts.length}</span>
          <Button
            variant='outline'
            size='sm'
            disabled={isPending}
            onClick={handleSave}
          >
            <Save />
            Сохранить
          </Button>
          <Button
            variant='ghost'
            size='sm'
            disabled={isPending}
            onClick={() => {
              setError(null);
              setDrafts([]);
            }}
          >
            <Trash2 />
            Очистить
          </Button>
        </div>
      )}
    </div>
  );
}
