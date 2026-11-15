'use client';

import Link from 'next/link';
import {
  Check,
  ChevronDown,
  FileSpreadsheet,
  Merge,
  Pencil,
  Plug,
  Plus,
  Replace,
  Split,
  Trash2,
} from 'lucide-react';
import {
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { CellChoice, type CellChoiceOption } from '@/components/CellChoice';
import { CellEditor } from '@/components/CellEditor';
import { SurveyTable, type SurveyCellProps } from '@/components/SurveyTable';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { copyText, parseClipboard } from '@/lib/clipboard';
import { emptyRow, voltageClassLabels, yesNo } from '@/lib/survey-cells';
import {
  BUILT_IN_MODEM,
  NO_PROPOSED_METER,
  TRANSFORMER_ABSENT,
  invalidValueError,
  TRANSFORMER_FIELDS,
  isTransformerAbsentInput,
  isTtAbsentInput,
  shownPhases,
  TT_ABSENT_PHASES,
  transformerFieldOf,
  modemImeiText,
  parsePhaseValues,
  type PhaseValues,
  parseTiStatus,
  parseVoltageClass,
  parseWiringScheme,
  parseYesNo,
  phaseValuesText,
  suggestedWiring,
  tiStatusLabels,
  wiringLabels,
  type SurveyTi,
} from '@/lib/survey-ti';
import type { ModemKind } from '@/generated/prisma/enums';
import { TiStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import {
  addTis,
  connectMeter,
  deleteTis,
  pingTi,
  type PingResult,
  mergeTiGroups,
  splitTiGroup,
  updateSurveyCells,
  type SurveyEdit,
  type SurveyField,
} from './actions';
import { ReplaceMeterDialog } from './ReplaceMeterDialog';
import { ColumnPicker } from './ColumnPicker';
import { tableColumns as columns, useColumnVisibility } from './columns';
import { columnIndex, tableRows, type TiDetails } from './ti-details';
import { useCellSelection } from './useCellSelection';

/// Индексы колонок здесь — в tableColumns (./ti-details.ts), найдены по id:
/// колонки можно переставлять, не трогая этот файл.
const ROW_HANDLE_COLUMN = columnIndex('rowHandle');
const SOLUTION_COLUMN = columnIndex('technicalSolution');
const IP_COLUMN = columnIndex('ip');
const CONNECTED_COLUMN = columnIndex('connected');
const STATUS_COLUMN = columnIndex('status');
const ATS_DICTIONARY_COLUMN = columnIndex('atsDictionary');
const WIRING_COLUMN = columnIndex('wiring');
const PROPOSED_METER_COLUMN = columnIndex('proposedMeterType');
/// «ТН тип»: у ТИ без ТН в правке она всё равно по фазам (см.
/// phaseLayoutAt), а «-…» в ней — ТН нет.
const TN_TYPE_COLUMN = columnIndex('tnType');
/// Фаза B в «ТТ тип»: ТТ часто ставят только на A и C, и «-» здесь — «на
/// фазе B ТТ нет». В марку и номер фазы B пишется TRANSFORMER_ABSENT: так
/// «нет» отличается от пустой фазы — «не выяснили». Состояния «ТТ нет» у ТИ
/// нет вовсе.
const TT_TYPE_COLUMN = columnIndex('ttType');
/// «-» в фазе A «ТТ тип» — ТТ нет вовсе: TRANSFORMER_ABSENT во всех его
/// полях (isTtAbsentInput).
const PHASE_A = 0;
const PHASE_B = 1;
/// Пофазные колонки: ячейка — по элементу на фазу (A, B, C), выделяют и
/// правят фазу, а не ячейку (renderPhases).
const PHASE_COLUMNS = new Set(
  ['ttType', 'ttNumber', 'tnType', 'tnNumber'].map(columnIndex),
);
/// Чей трансформатор в колонке — по разделу в меню «Колонки» (ТТ или ТН).
const TRANSFORMER_OF_COLUMN = new Map(
  columns.flatMap((column, index) =>
    column.group === 'tt' || column.group === 'tn'
      ? [[index, column.group] as const]
      : [],
  ),
);
const PHASE_LABELS = ['A', 'B', 'C'] as const;
/// Колонки, что не уезжают при прокрутке вбок: пустая, № и наименование ТИ.
/// SurveyTable делает липкими первые показанные колонки — эти должны стоять
/// в tableColumns первыми.
const STICKY_COLUMNS = ['rowHandle', 'number', 'name'].map(columnIndex);

/// Статус ТИ в таблице — точкой: серая — в работе, зелёная — готово,
/// оранжевая — внимание.
const tiStatusDotColors: Record<TiStatus, string> = {
  [TiStatus.InProgress]: 'bg-neutral-400 dark:bg-neutral-500',
  [TiStatus.Done]: 'bg-green-500',
  [TiStatus.Warning]: 'bg-orange-500',
};

/// Итог проверки для точки в ячейке: зелёная — ок, красная — нет. error —
/// почему нет, во всплывающей подсказке.
type CheckStatus = { ok: boolean; error?: string };
/// Колонки, что правятся в режиме правки, и поле под каждой. Тех. решение,
/// IP и порт — общие на группу (ячейка объединена на группу), остальное — своё у
/// каждой ТИ. Статус, Uном, схема, замена и RS-485 —
/// перечисления и да/нет: текст ячейки разбирают parse* из survey-ti.
const EDITABLE_FIELDS: Record<string, SurveyField> = {
  number: 'number',
  name: 'name',
  status: 'status',
  uNom: 'uNom',
  meterType: 'meterType',
  meterNumber: 'meterNumber',
  needsReplacement: 'needsReplacement',
  wiring: 'wiring',
  proposedMeterType: 'proposedMeterType',
  existingPolling: 'existingPolling',
  freeRs485: 'freeRs485',
  technicalSolution: 'technicalSolution',
  modemImei: 'modemImei',
  ip: 'ip',
  /// Порт — у модема группы, как IP; сам модем порт не заводит.
  modemPort: 'port',
  meterAddress: 'connectAddress',
  /// Данные ТТ и ТН — в TiDetails, а не в SurveyTi: правка видна до ответа
  /// сервера через applyDetailEdits. Марки и номера правят по фазе,
  /// коэффициент — целиком, как обычную ячейку.
  ...Object.fromEntries(
    Object.keys(TRANSFORMER_FIELDS).map((field) => [field, field]),
  ),
};
/// То же по индексу колонки в tableColumns.
const EDITABLE_COLUMNS: Partial<Record<number, SurveyField>> =
  Object.fromEntries(
    Object.entries(EDITABLE_FIELDS).map(([id, field]) => [
      columnIndex(id),
      field,
    ]),
  );
/// Колонки, где в режиме правки можно выделять ячейки, — правимые, слева
/// направо. Выделение одно на таблицу — клик в другой колонке переносит его
/// туда. В режиме просмотра клик выделяет строку целиком. «Соотв. по
/// справочнику АТС» не выделяется: её не правят, она считается по типу ПУ.
const SELECTABLE_COLUMNS = Object.keys(EDITABLE_COLUMNS)
  .map(Number)
  .sort((first, second) => first - second);

/// Поля, значение которых в режиме правки выбирают из списка (CellChoice), а
/// не набирают. Вставка и Delete работают в них так же, как в остальных.
const FIELD_CHOICES: Partial<Record<SurveyField, CellChoiceOption[]>> = {
  needsReplacement: [
    { value: 'да', label: 'да' },
    { value: 'нет', label: 'нет' },
    { value: '', label: 'не решили' },
  ],
};

/// Значение правимой ячейки так, как его показывает таблица.
function fieldValue(
  ti: SurveyTi | undefined,
  details: TiDetails | undefined,
  col: number,
): string {
  if (!ti) return '';

  const field = EDITABLE_COLUMNS[col];
  const target = field && transformerFieldOf(field);

  /// ТТ и ТН: марки и номера — по строке на фазу, коэффициент — как есть.
  if (target) {
    const data = details?.[target.transformer];

    return target.part === 'ratio'
      ? (data?.ratio ?? '')
      : phaseValuesText(data?.[target.part]);
  }

  switch (field) {
    case 'port':
      return details?.group?.modem?.port ?? '';
    case 'number':
      return ti.number;
    case 'name':
      return ti.name;
    case 'status':
      return tiStatusLabels[ti.status];
    case 'uNom':
      return ti.uNom ? voltageClassLabels[ti.uNom] : '';
    case 'meterType':
      return ti.currentMeter?.type ?? '';
    case 'meterNumber':
      return ti.currentMeter?.number ?? '';
    case 'needsReplacement':
      return yesNo(ti.currentMeter?.needsReplacement)?.v ?? '';
    case 'wiring':
      return ti.wiring ? wiringLabels[ti.wiring] : '';
    case 'existingPolling':
      return ti.existingPolling ?? '';
    case 'freeRs485':
      return yesNo(ti.freeRs485)?.v ?? '';
    case 'technicalSolution':
      return ti.group?.technicalSolution ?? '';
    case 'proposedMeterType':
      return ti.proposedMeter?.type ?? '';
    case 'ip':
      return ti.group?.modem?.ip ?? '';
    case 'modemImei':
      return modemImeiText(ti.group?.modem);
    default:
      return ti.meterAddress ?? '';
  }
}

/// Правки поверх TiDetails — то же, что applyEdits, для полей, которых нет в
/// SurveyTi: порт модема и данные ТТ и ТН — марки, номера и коэффициент:
/// трансформатора ещё нет — заводим пустой, как экшен.
function applyDetailEdits(
  details: Record<string, TiDetails>,
  edits: SurveyEdit[],
): Record<string, TiDetails> {
  let next = details;

  for (const { tiId, field, value } of edits) {
    const current = next[tiId];

    /// Порт — у модема группы: меняется у всех ТИ группы сразу. Модема нет
    /// — экшен откажет, показывать нечего.
    if (field === 'port') {
      const groupId = current?.group?.id;

      if (!groupId || !current.group?.modem) continue;

      const port = value.trim() === '' ? null : value.trim();

      next = Object.fromEntries(
        Object.entries(next).map(([id, item]) => [
          id,
          item.group?.id === groupId && item.group.modem
            ? {
                ...item,
                group: { ...item.group, modem: { ...item.group.modem, port } },
              }
            : item,
        ]),
      );
      continue;
    }

    const target = transformerFieldOf(field);

    if (!target || !current) continue;

    const { transformer, part } = target;
    const isTn = transformer === 'tn';

    /// «-…» в марке ТН — ТН нет, данных нет тоже (как в экшене).
    if (isTn && part === 'type' && isTransformerAbsentInput(value)) {
      next = { ...next, [tiId]: { ...current, tnState: 'absent', tn: null } };
      continue;
    }

    /// «-…» одной строкой в марке ТТ — ТТ нет: TRANSFORMER_ABSENT во всех
    /// полях, даты пустые (как в экшене).
    if (!isTn && part === 'type' && isTtAbsentInput(value)) {
      next = {
        ...next,
        [tiId]: {
          ...current,
          tt: {
            type: [...TT_ABSENT_PHASES],
            number: [...TT_ABSENT_PHASES],
            ratio: TRANSFORMER_ABSENT,
            dateInstalled: null,
            dateRemoved: null,
          },
        },
      };
      continue;
    }

    const data = current[transformer] ?? {
      type: [null, null, null],
      number: [null, null, null],
      ratio: null,
      dateInstalled: null,
      dateRemoved: null,
    };

    /// Коэффициент — одним значением, марки и номера — по фазам.
    let patch: Partial<NonNullable<TiDetails['tn']>>;
    let hasValue: boolean;

    if (part === 'ratio') {
      const ratio = value.trim() === '' ? null : value.trim();

      patch = { ratio };
      hasValue = ratio !== null;
    } else {
      const values = parsePhaseValues(value);

      if (!values) continue;

      patch = part === 'type' ? { type: values } : { number: values };

      if (!isTn && part === 'type') {
        /// Марка фазы — не «нет», а номер — «---»: «нет» в номере осталось
        /// от фазы без ТТ — стираем. «---» в марке фазы B — ТТ нет на этой
        /// фазе: номер фазы B тоже «---» (как в экшене).
        const number = data.number.map((item, index) =>
          item === TRANSFORMER_ABSENT &&
          !isTransformerAbsentInput(values[index] ?? '')
            ? null
            : item,
        ) as PhaseValues;

        if (values[1] === TRANSFORMER_ABSENT) number[1] = TRANSFORMER_ABSENT;

        patch.number = number;
      }
      hasValue = values.some((item) => item !== null);
    }

    /// Значение в ТН — значит, ТН есть, как и в экшене; стёртое значение
    /// состояние не меняет.
    next = {
      ...next,
      [tiId]: {
        ...current,
        ...(isTn && hasValue && { tnState: 'present' as const }),
        [transformer]: { ...data, ...patch },
      },
    };
  }

  return next;
}

type GroupPatch = {
  technicalSolution?: string | null;
  ip?: string | null;
  /// Ячейка «IMEI модема»: другой IMEI — другой модем, BUILT_IN_MODEM —
  /// встроенный, null — модема нет.
  imei?: string | null;
  kind?: ModemKind;
};

/// Правки поверх ТИ — то, что видно в таблице, пока экшен пишет в базу.
/// Решение, IP и вид модема висят на группе, поэтому меняются у всех ТИ
/// группы сразу; остальное — только у своей ТИ. Нераспознанный текст не
/// показываем: save его и не отправит.
function applyEdits(tis: SurveyTi[], edits: SurveyEdit[]): SurveyTi[] {
  const tiPatches = new Map<string, Partial<SurveyTi>>();
  const groupPatches = new Map<string, GroupPatch>();
  const groupOf = new Map(tis.map((ti) => [ti.id, ti.group?.id]));

  function patchTi(ti: SurveyTi | undefined, patch: Partial<SurveyTi>) {
    if (ti) tiPatches.set(ti.id, { ...tiPatches.get(ti.id), ...patch });
  }

  /// Счётчик с уже сделанными в этой пачке правками: тип и замену могут
  /// вставить одной пачкой, и вторая правка не должна стереть первую.
  function currentMeterOf(ti: SurveyTi | undefined) {
    return ti
      ? (tiPatches.get(ti.id)?.currentMeter ?? ti.currentMeter)
      : undefined;
  }

  function patchGroup(tiId: string, patch: GroupPatch) {
    const groupId = groupOf.get(tiId);

    if (groupId) {
      groupPatches.set(groupId, { ...groupPatches.get(groupId), ...patch });
    }
  }

  for (const { tiId, field, value } of edits) {
    const ti = tis.find((item) => item.id === tiId);
    const trimmed = value.trim() === '' ? null : value.trim();

    switch (field) {
      case 'number':
        patchTi(ti, { number: value.trim() });
        break;
      case 'name':
        /// Наименование обязательное: пустое — '', а не null, как и в экшене.
        patchTi(ti, { name: value.trim() });
        break;
      case 'connectAddress':
        patchTi(ti, { meterAddress: trimmed });
        break;
      case 'meterType':
        patchTi(ti, {
          currentMeter: {
            number: currentMeterOf(ti)?.number ?? null,
            isCompliant: currentMeterOf(ti)?.isCompliant ?? null,
            needsReplacement: currentMeterOf(ti)?.needsReplacement ?? null,
            type: trimmed,
            /// Справочник на клиенте не лежит — до ответа сервера «не
            /// проверено», а не старое значение от прежнего типа.
            inAtsDictionary: null,
            atsDictionaryReason: null,
            atsWiring: null,
          },
        });
        break;
      case 'meterNumber':
        /// Счётчика ещё нет — экшен заведёт его без типа: до ответа сервера
        /// показываем так же.
        patchTi(ti, {
          currentMeter: {
            type: null,
            isCompliant: null,
            needsReplacement: null,
            inAtsDictionary: null,
            atsDictionaryReason: null,
            atsWiring: null,
            ...currentMeterOf(ti),
            number: trimmed,
          },
        });
        break;
      case 'proposedMeterType':
        patchTi(ti, {
          proposedMeter:
            trimmed && trimmed !== NO_PROPOSED_METER
              ? { type: trimmed, number: ti?.proposedMeter?.number ?? null }
              : null,
        });
        break;
      case 'uNom': {
        const uNom = parseVoltageClass(value);

        if (uNom !== undefined) patchTi(ti, { uNom });
        break;
      }
      case 'status': {
        const status = parseTiStatus(value);

        if (status !== undefined) patchTi(ti, { status });
        break;
      }
      case 'wiring': {
        const wiring = parseWiringScheme(value);

        if (wiring !== undefined) patchTi(ti, { wiring });
        break;
      }
      case 'freeRs485': {
        const freeRs485 = parseYesNo(value);

        if (freeRs485 !== undefined) patchTi(ti, { freeRs485 });
        break;
      }
      case 'needsReplacement': {
        const needsReplacement = parseYesNo(value);
        const meter = currentMeterOf(ti);

        /// Счётчика ещё нет — экшен заведёт его без типа: до ответа сервера
        /// показываем так же.
        if (needsReplacement !== undefined) {
          patchTi(ti, {
            currentMeter: {
              type: null,
              number: null,
              isCompliant: null,
              inAtsDictionary: null,
              atsDictionaryReason: null,
              atsWiring: null,
              ...meter,
              needsReplacement,
            },
          });
        }
        break;
      }
      case 'existingPolling': {
        patchTi(ti, { existingPolling: trimmed });
        break;
      }
      case 'technicalSolution':
        patchGroup(tiId, { technicalSolution: trimmed });
        break;
      case 'ip':
        patchGroup(tiId, { ip: trimmed });
        break;
      case 'modemImei':
        patchGroup(tiId, { imei: trimmed });
        break;
    }
  }

  return tis.map((ti) => {
    let next = ti;
    const tiPatch = tiPatches.get(ti.id);

    if (tiPatch) next = { ...next, ...tiPatch };

    const group = next.group;
    const groupPatch = group ? groupPatches.get(group.id) : undefined;

    if (group && groupPatch) {
      const { technicalSolution, ip, kind, imei } = groupPatch;
      let modem = group.modem;

      /// Выбрали другой модем — его вида, типа и IP клиент не знает: пусто,
      /// пока не ответит сервер.
      if (imei !== undefined && (imei ?? '') !== modemImeiText(modem)) {
        modem =
          imei === null
            ? null
            : imei === BUILT_IN_MODEM
              ? {
                  kind: 'builtIn',
                  type: null,
                  imei: null,
                  ip: modem?.ip ?? null,
                }
              : { kind: null, type: null, imei, ip: null };
      }

      /// IP у группы без модема заводит модем (см. updateSurveyCells).
      if (!modem && ip) modem = { kind: null, type: null, imei: null, ip };

      next = {
        ...next,
        group: {
          ...group,
          ...(technicalSolution !== undefined && { technicalSolution }),
          modem: modem && {
            ...modem,
            ...(ip !== undefined && { ip }),
            ...(kind !== undefined && { kind }),
          },
        },
      };
    }

    return next;
  });
}
/// Постоянная ссылка на пустой список: новый [] на каждой перерисовке
/// пересчитывал бы границы ячеек в useCellSelection.
const NO_ROWS: never[] = [];
const NO_ROW_SELECTION = { rows: new Set<number>(), active: null };

/// Панель управления и таблица опроса. Клиентская ради состояния editable:
/// кнопка в панели переключает таблицу между просмотром и правкой.
/// ТИ приходят значениями из базы, ячейки собираются здесь: правке нужны сами
/// значения, а не готовый текст.
export function SurveyView({
  projectId,
  tis,
  freeModemImeis,
  canEdit,
  details,
}: {
  projectId: string;
  tis: SurveyTi[];
  /// Остальные данные ТИ по id — для колонок сверх опроса (tableColumns).
  details: Record<string, TiDetails>;
  /// IMEI свободных модемов проекта — варианты для ячейки «IMEI модема».
  freeModemImeis: string[];
  /// Может ли пользователь менять проект (см. canEditProject). Без права
  /// кнопки нет вовсе: незачем показывать то, что не сработает.
  canEdit: boolean;
}) {
  const [editable, setEditable] = useState(false);
  /// Сколько ТИ добавить разом. Строкой, а не числом: иначе поле нельзя
  /// очистить, чтобы набрать новое значение, — пустое число стало бы 0.
  const [addCount, setAddCount] = useState('1');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /// Сохранение ячеек — своим переходом: иначе на время записи кнопки
  /// панели показывали бы «Добавляем…».
  const [, startSaveTransition] = useTransition();
  const [optimisticTis, addEdits] = useOptimistic(tis, applyEdits);
  const [optimisticDetails, addDetailEdits] = useOptimistic(
    details,
    applyDetailEdits,
  );
  /// Какие колонки показаны — меню «Колонки». Индексы колонок здесь везде
  /// в tableColumns, а не на экране: скрытие их не сдвигает.
  const { hidden, visibleColumns, setVisible, setHiddenIds } =
    useColumnVisibility();
  const visibleSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const selectableColumns = useMemo(
    () => SELECTABLE_COLUMNS.filter((col) => visibleSet.has(col)),
    [visibleSet],
  );
  /// Ячейка, которая сейчас правится (у объединённой — первая строка), и с
  /// какого текста начали.
  const [editing, setEditing] = useState<{
    row: number;
    col: number;
    initial: string;
    /// Пофазная ячейка правится по фазе: какую (0 — A). initial — текст
    /// этой фазы.
    phase?: number;
  } | null>(null);
  /// Фаза (0 — A, 1 — B, 2 — C), выделенная в пофазной ячейке, когда
  /// выделена одна такая ячейка: клик и стрелки выделяют фазу, а не ячейку.
  const [phase, setPhase] = useState(0);
  /// Выделенные строки — ТИ целиком; с Ctrl (⌘) кликом выделяют несколько.
  /// active — последняя выбранная: от неё ходят стрелками. В режиме правки
  /// строки выделяют кликом в первую колонку (для удаления), а в остальных —
  /// ячейки (useCellSelection).
  const [rowSelection, setRowSelection] = useState<{
    rows: ReadonlySet<number>;
    active: number | null;
  }>(NO_ROW_SELECTION);
  const selectedRows = useMemo(
    () => [...rowSelection.rows].sort((first, second) => first - second),
    [rowSelection],
  );
  /// ТИ для диалога «замена сч.»: он открывается на одну выделенную строку.
  const replaceTi =
    selectedRows.length === 1 ? optimisticTis[selectedRows[0]] : undefined;
  const [replaceOpen, setReplaceOpen] = useState(false);
  /// Опрос счётчика кнопкой Connect: идёт ли сейчас. Итог — в колонке
  /// «подключён».
  const [isConnecting, startConnectTransition] = useTransition();
  /// Сколько ТИ уже опрошено, когда опрашиваем все разом; null — одну.
  const [connectProgress, setConnectProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  /// Колонка «подключён»: итог Connect по каждой ТИ за эту сессию — в базу
  /// не пишем, после перезагрузки колонка снова пустая. status — чем кончился
  /// опрос: перед текстом точка, зелёная — счётчик ответил, красная — нет;
  /// пока опрос не кончился, точки нет. error — почему не ответил, во
  /// всплывающей подсказке: в ячейке длинный текст ошибки не уместить.
  const [connected, setConnected] = useState<
    ReadonlyMap<
      string,
      { text: string; status?: 'ok' | 'error'; error?: string }
    >
  >(() => new Map());
  const connectedTexts = useMemo(
    () =>
      new Map(
        Array.from(connected, ([tiId, { text }]) => [tiId, text] as const),
      ),
    [connected],
  );
  /// У проекта без ТИ — шапка и одна пустая строка, как на aiis3.
  const rows = useMemo(
    () =>
      optimisticTis.length > 0
        ? tableRows(optimisticTis, optimisticDetails, connectedTexts)
        : [emptyRow(columns)],
    [optimisticTis, connectedTexts, optimisticDetails],
  );
  console.log('🚀 ~ SurveyView ~ rows:', rows);
  /// Ячейки наименования ТИ, тех. решения и опроса можно выделять, как в Excel. Пустая таблица (одна
  /// строка-заглушка) — выделять нечего.
  const selection = useCellSelection({
    rows: tis.length > 0 ? rows : NO_ROWS,
    columns: selectableColumns,
  });
  console.log('🚀 ~ SurveyView ~ selection:', selection);

  /// Ping IP модемов кнопкой Connect — по IP, а не по ТИ: модем общий на
  /// группу, и ячейка IP объединена на всю группу. Только на эту сессию, как
  /// и «подключён».
  const [pings, setPings] = useState<ReadonlyMap<string, CheckStatus>>(
    () => new Map(),
  );

  function setPing(ip: string, status: CheckStatus | null) {
    setPings((previous) => {
      const next = new Map(previous);

      if (status) next.set(ip, status);
      else next.delete(ip);

      return next;
    });
  }

  function setConnectedText(
    tiId: string,
    text: string,
    status?: 'ok' | 'error',
    error?: string,
  ) {
    setConnected((previous) =>
      new Map(previous).set(tiId, { text, status, error }),
    );
  }

  function save(edits: SurveyEdit[]) {
    if (edits.length === 0) return;

    /// Перечисления и да/нет: нераспознанный текст экшен всё равно
    /// отклонит, а так ошибка видна сразу, без запроса.
    for (const { field, value } of edits) {
      const invalid = invalidValueError(field, value);

      if (invalid) return setError(invalid);
    }

    setError(null);
    /// Не прошёл экшен — оптимистичные значения откатятся сами с концом
    /// перехода.
    startSaveTransition(async () => {
      addEdits(edits);
      addDetailEdits(edits);
      const result = await updateSurveyCells(projectId, edits);

      if (!result.ok) setError(result.error);
    });
  }

  /// Первые строки ячеек колонки: объединённая ячейка группы — одна ячейка
  /// на все её строки, вставка и очистка шагают по ячейкам, а не по строкам.
  function cellStarts(col: number): number[] {
    if (optimisticTis.length === 0) return [];

    return rows.flatMap((cells, row) => (cells[col] !== null ? [row] : []));
  }

  /// Ячейки под выделением — по первой строке каждой.
  function selectedCells(col: number): number[] {
    const range = selection.range;

    if (!range || range.col !== col) return [];

    return cellStarts(col).filter(
      (row) => row >= range.top && row <= range.bottom,
    );
  }

  function valueAt(row: number, col: number): string {
    const ti = optimisticTis[row];

    return fieldValue(ti, ti && optimisticDetails[ti.id], col);
  }

  /// Значения фаз A, B, C пофазной ячейки; пустая фаза — ''.
  function phaseValues(row: number, col: number): string[] {
    const lines = valueAt(row, col).split('\n');

    return PHASE_LABELS.map((_, index) => {
      const line = (lines[index] ?? '').trim();

      return line === '—' ? '' : line;
    });
  }

  /// Текст пофазной ячейки, где одна фаза заменена: той же формы, что
  /// valueAt (по строке на фазу, пустая — прочерком; все пустые — '').
  function withPhase(
    row: number,
    col: number,
    index: number,
    value: string,
  ): string {
    const phases = phaseValues(row, col).map((item, at) =>
      at === index ? value.trim() : item,
    );

    return phases.every((item) => item === '')
      ? ''
      : phases.map((item) => item || '—').join('\n');
  }

  /// Текст ячейки после правки одной фазы. «-…» в фазе марки ТН — ТН нет:
  /// вся ячейка, а не фаза. В марке ТТ: в фазе A — ТТ нет вовсе (PHASE_A),
  /// в фазе B — ТТ нет на этой фазе (PHASE_B). В фазе C ТТ и в номерах дефис
  /// — значение фазы (одиночный — пустая фаза).
  function phaseEditValue(
    row: number,
    col: number,
    index: number,
    value: string,
  ): string {
    if (isTransformerAbsentInput(value)) {
      if (col === TN_TYPE_COLUMN) return TRANSFORMER_ABSENT;

      if (col === TT_TYPE_COLUMN && index === PHASE_A) {
        return TRANSFORMER_ABSENT;
      }

      if (col === TT_TYPE_COLUMN && index === PHASE_B) {
        return withPhase(row, col, index, TRANSFORMER_ABSENT);
      }
    }

    return withPhase(row, col, index, value);
  }

  /// ТН у ТИ этой строки нет (tnState = absent), а колонка — ТН: его
  /// ячейки — TRANSFORMER_ABSENT одной строкой, без фаз. У ТТ состояния нет.
  function absentAt(row: number, col: number): boolean {
    const ti = optimisticTis[row];

    if (!ti || TRANSFORMER_OF_COLUMN.get(col) !== 'tn') return false;

    return optimisticDetails[ti.id]?.tnState === 'absent';
  }

  /// Рисуется ли ячейка по фазам (renderPhases). У ТИ без ТН — нет: в
  /// ячейке TRANSFORMER_ABSENT одной строкой. Кроме «ТН тип» в режиме
  /// правки: там фазы есть и у ТИ без ТН — в фазу вписывают марку, и он
  /// появляется.
  function phaseLayoutAt(row: number, col: number): boolean {
    return (
      PHASE_COLUMNS.has(col) &&
      (!absentAt(row, col) || (editable && col === TN_TYPE_COLUMN))
    );
  }

  /// Выделена ли ровно эта пофазная ячейка, одна: тогда выделение — по фазе.
  /// У ТИ без ТН фаз нет — выделяется ячейка.
  function phaseFocusedAt(row: number, col: number): boolean {
    const range = selection.range;

    return (
      phaseLayoutAt(row, col) &&
      range !== null &&
      range.col === col &&
      range.cells === 1 &&
      range.top === row
    );
  }

  /// Начать правку ячейки: с её текста или с набранного символа (typed).
  /// Пофазную — только выделенную фазу.
  function startEditing(row: number, col: number, typed?: string) {
    if (PHASE_COLUMNS.has(col)) {
      setEditing({
        row,
        col,
        phase,
        initial: typed ?? phaseValues(row, col)[phase],
      });
    } else {
      setEditing({ row, col, initial: typed ?? valueAt(row, col) });
    }
  }

  /// Фазы пофазной ячейки — по элементу на фазу. Выделенная фаза
  /// подсвечена; editor — поле правки на её месте.
  function renderPhases(row: number, col: number, editor?: ReactNode) {
    /// ТН нет — TRANSFORMER_ABSENT в средней фазе, крайние
    /// пустые: ячейка той же высоты, что у ТИ с ним, а «нет» посередине.
    /// ТТ нет вовсе («---» во всех фазах) — так же (shownPhases).
    const values = absentAt(row, col)
      ? ['', TRANSFORMER_ABSENT, '']
      : shownPhases(phaseValues(row, col));
    const focused = editable && phaseFocusedAt(row, col);

    return (
      <div className='-mx-1 flex flex-col'>
        {PHASE_LABELS.map((label, index) => (
          <div
            key={label}
            data-phase={index}
            className={cn(
              'px-1',
              focused &&
                index === phase &&
                'bg-blue-50 shadow-[inset_0_0_0_2px_var(--color-blue-500)] dark:bg-blue-950 dark:shadow-[inset_0_0_0_2px_var(--color-blue-400)]',
            )}
          >
            {editor && index === phase
              ? editor
              : /// Пустая фаза — пустая строка, без прочерка: высоту ей держит
                /// неразрывный пробел, и фазы стоят напротив подписей «фаза».
                values[index] || '\u00a0'}
          </div>
        ))}
      </div>
    );
  }

  /// Варианты для ячейки со списком; undefined — ячейку набирают. IMEI модема
  /// выбирают из свободных модемов проекта или «встроенный»; нынешний —
  /// первым, чтобы было видно, что выбрано, а «без модема» отвязывает модем
  /// от группы.
  function choicesAt(row: number, col: number) {
    const field = EDITABLE_COLUMNS[col];

    if (field !== 'modemImei') return field && FIELD_CHOICES[field];

    const current = valueAt(row, col);
    const imeis = [
      ...(current ? [current] : []),
      BUILT_IN_MODEM,
      ...freeModemImeis,
    ];

    return [
      ...[...new Set(imeis)].map((imei) => ({ value: imei, label: imei })),
      { value: '', label: 'без модема' },
    ];
  }

  /// Правка ячейки — через её первую ТИ: для IP и решения экшен сам найдёт
  /// группу. «Сущ. опрос» — свой у каждой ТИ, а объединённая ячейка
  /// накрывает ТИ группы с одинаковым текстом: правка — каждой из них.
  function edit(row: number, col: number, value: string): SurveyEdit[] {
    const field = EDITABLE_COLUMNS[col]!;
    const span =
      field === 'existingPolling' ? (rows[row][col]?.rowSpan ?? 1) : 1;

    return optimisticTis
      .slice(row, row + span)
      .map((ti) => ({ tiId: ti.id, field, value }));
  }

  function finishEditing(value: string | null, refocus: boolean) {
    if (!editing) return;

    const { row, col } = editing;

    setEditing(null);

    if (value !== null && value.trim() !== valueAt(row, col)) {
      save(edit(row, col, value));
    }

    /// Поле исчезнет только после перерисовки — фокус возвращаем следом.
    if (refocus) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(`[data-select-cell="${row}:${col}"]`)
          ?.focus(),
      );
    }
  }

  /// Клавиши правимой ячейки в режиме правки, как в Excel: Enter и F2 —
  /// править, набор текста — заменить, Delete — очистить выделенное. true —
  /// клавишу обработали, выделению она уже не нужна.
  function handleEditKeyDown(
    event: KeyboardEvent<HTMLTableCellElement>,
    row: number,
    col: number,
  ): boolean {
    /// Ctrl+C на одной пофазной ячейке — только выделенная фаза, а не все
    /// три: выделена фаза, её и копируем. Иначе — как обычно (выделение).
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === 'c' &&
      phaseFocusedAt(row, col)
    ) {
      event.preventDefault();
      void copyText(phaseValues(row, col)[phase] ?? '');
      return true;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(row, col);
      return true;
    }

    /// Стрелки в пофазной ячейке шагают по фазам; с крайней фазы — в
    /// соседнюю ячейку, на её ближнюю фазу. С Shift — выделение ячеек.
    if (
      PHASE_COLUMNS.has(col) &&
      !event.shiftKey &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp')
    ) {
      const down = event.key === 'ArrowDown';

      if (phaseFocusedAt(row, col)) {
        const next = phase + (down ? 1 : -1);

        if (next >= 0 && next < PHASE_LABELS.length) {
          event.preventDefault();
          setPhase(next);
          return true;
        }
      }

      setPhase(down ? 0 : PHASE_LABELS.length - 1);
      return false;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();

      /// Одна пофазная ячейка — очищаем только выделенную фазу.
      if (phaseFocusedAt(row, col)) {
        const value = withPhase(row, col, phase, '');

        if (value !== valueAt(row, col)) save(edit(row, col, value));
        return true;
      }

      save(
        selectedCells(col)
          .filter((cellRow) => valueAt(cellRow, col) !== '')
          .flatMap((cellRow) => edit(cellRow, col, '')),
      );
      return true;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      /// В ячейке со списком набор открывает список: буква — не значение.
      startEditing(row, col, choicesAt(row, col) ? undefined : event.key);
      return true;
    }

    return false;
  }

  /// Вставка из буфера, как в Excel: значения по одному на ячейку сверху
  /// вниз, начиная с верхней выделенной. Объединённая ячейка группы — одна
  /// ячейка, ей одно значение. Из блока в несколько колонок берём первую:
  /// выделение — в одной колонке, и вставка тоже. Лишнее за низом таблицы
  /// отбрасываем. Одно значение на несколько выделенных ячеек заполняет их
  /// все.
  function handlePaste(event: ClipboardEvent<HTMLTableCellElement>) {
    const range = selection.range;

    if (!range || EDITABLE_COLUMNS[range.col] === undefined) return;

    event.preventDefault();

    const col = range.col;
    const values = parseClipboard(
      event.clipboardData.getData('text/plain'),
    ).map((line) => line[0] ?? '');

    /// Одна строка в выделенную фазу — только в эту фазу. Ячейка Excel в
    /// несколько строк ложится на все фазы, как обычно.
    if (
      phaseFocusedAt(range.top, col) &&
      values.length === 1 &&
      !values[0].includes('\n')
    ) {
      const value = withPhase(range.top, col, phase, values[0]);

      if (value !== valueAt(range.top, col)) {
        save(edit(range.top, col, value));
      }
      return;
    }
    const targets =
      values.length === 1
        ? selectedCells(col).map((row) => [row, values[0]] as const)
        : cellStarts(col)
            .filter((row) => row >= range.top)
            .slice(0, values.length)
            .map((row, index) => [row, values[index]] as const);

    save(
      targets
        .filter(([row, value]) => value.trim() !== valueAt(row, col))
        .flatMap(([row, value]) => edit(row, col, value)),
    );
  }

  /// Строка, напротив которой кликнули. У объединённой ячейки это не
  /// обязательно её первая строка: клик в середине группы выделяет ТИ, что
  /// напротив курсора.
  function rowAt(event: MouseEvent<HTMLTableCellElement>, fallback: number) {
    const body = event.currentTarget.closest('tbody');

    if (!body) return fallback;

    const index = Array.from(body.rows).findIndex((tr) => {
      const rect = tr.getBoundingClientRect();

      return event.clientY >= rect.top && event.clientY < rect.bottom;
    });

    return index >= 0 ? index : fallback;
  }

  /// Текст строки для Ctrl+C — колонки через таб, как их отдаёт Excel. У
  /// объединённой ячейки значение лежит в её первой строке — ищем вверх.
  function rowText(row: number): string {
    return visibleColumns
      .map((col) => {
        for (let index = row; index >= 0; index--) {
          const cell = rows[index][col];

          if (cell !== null) return cell.v;
        }

        return '';
      })
      .join('\t');
  }

  /// Перейти к строке: выделить и прокрутить к ней. У первой, пустой колонки
  /// всегда есть ячейка, поэтому она остаётся надёжным ориентиром.
  function goToRow(row: number) {
    selectRow(row);
    document
      .querySelector(`[data-row-cell="${row}:${ROW_HANDLE_COLUMN}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  /// Выделить одну строку — или снять выделение, если null.
  function selectRow(row: number | null) {
    setRowSelection(
      row === null ? NO_ROW_SELECTION : { rows: new Set([row]), active: row },
    );
  }

  /// Клавиши в режиме просмотра: стрелки — соседняя строка, Ctrl+C —
  /// скопировать выделенные строки, Escape — снять выделение.
  function handleRowKeyDown(event: KeyboardEvent<HTMLTableCellElement>) {
    const active = rowSelection.active;

    if (active === null) return;

    if (event.key === 'Escape') {
      selectRow(null);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void copyText(selectedRows.map(rowText).join('\n'));
      return;
    }

    const next =
      event.key === 'ArrowDown'
        ? Math.min(active + 1, rows.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(active - 1, 0)
          : null;

    if (next === null) return;

    /// Стрелки иначе прокрутили бы таблицу.
    event.preventDefault();
    goToRow(next);
  }

  /// Свойства ячеек при выборе строки: в просмотре клик в любую ячейку
  /// выделяет строку, в правке это делает только первая пустая колонка.
  /// Подсвечиваются только ячейки самой строки: объединённая ячейка группы,
  /// подсвеченная во всю высоту, читалась бы как выделение всей группы.
  /// Копируется строка всё же с ними — их значение относится и к этой ТИ.
  function rowCellProps(row: number, col: number): SurveyCellProps | undefined {
    /// Пустая таблица — одна строка-заглушка, выделять в ней нечего.
    if (optimisticTis.length === 0) return undefined;

    const covers =
      rowSelection.rows.has(row) && (rows[row][col]?.rowSpan ?? 1) === 1;

    return {
      'data-row-cell': `${row}:${col}`,
      /// Фокус нужен ради клавиш, но табом по каждой ячейке не ходим.
      tabIndex: -1,
      'aria-selected': covers,
      /// Клик выделяет одну строку, клик по единственной выделенной снимает
      /// выделение. С Ctrl (⌘) клик добавляет строку к выделению или убирает
      /// её оттуда.
      onMouseDown: (event: MouseEvent<HTMLTableCellElement>) => {
        if (col === SOLUTION_COLUMN && optimisticTis[row]?.group) return;

        const clicked = rowAt(event, row);

        if (event.ctrlKey || event.metaKey) {
          /// Иначе браузер выделил бы ячейку таблицы (Firefox) или текст;
          /// фокус ради клавиш ставим сами.
          event.preventDefault();
          event.currentTarget.focus();
          setRowSelection(({ rows: current }) => {
            const next = new Set(current);

            if (next.has(clicked)) next.delete(clicked);
            else next.add(clicked);

            return next.size === 0
              ? NO_ROW_SELECTION
              : {
                  rows: next,
                  active: next.has(clicked) ? clicked : Math.max(...next),
                };
          });
          return;
        }

        setRowSelection(({ rows: current }) =>
          current.size === 1 && current.has(clicked)
            ? NO_ROW_SELECTION
            : { rows: new Set([clicked]), active: clicked },
        );
      },
      onKeyDown: handleRowKeyDown,
      className: cn(
        'cursor-pointer outline-none',
        covers && 'bg-blue-50 dark:bg-blue-950',
      ),
    };
  }

  /// Итог проверки для ячейки: ping — у IP, опрос — у «подключён».
  function checkStatus(row: number, col: number): CheckStatus | undefined {
    const ti = optimisticTis[row];

    if (!ti) return undefined;

    if (col === IP_COLUMN) {
      const ip = ti.group?.modem?.ip?.trim();

      return ip ? pings.get(ip) : undefined;
    }

    if (col === CONNECTED_COLUMN) {
      const state = connected.get(ti.id);

      return state?.status
        ? { ok: state.status === 'ok', error: state.error }
        : undefined;
    }

    return undefined;
  }

  /// Свойства ячеек: точка итога проверки в «IP» и «подключён» поверх того,
  /// что дал режим. Копируется строка без неё — точка лежит только в
  /// разметке. Поле правки точку не получает.
  function cellProps(row: number, col: number): SurveyCellProps | undefined {
    const props = baseCellProps(row, col);

    /// Ячейки ТТ и ТН — с отступами сверху и снизу меньше обычных: в них по
    /// три строки на фазы, и строка таблицы иначе выходит слишком высокой.
    if (!TRANSFORMER_OF_COLUMN.has(col)) return props;

    return { ...props, className: cn(props?.className, 'py-0.5') };
  }

  function baseCellProps(
    row: number,
    col: number,
  ): SurveyCellProps | undefined {
    const props = modeCellProps(row, col);
    const ti = optimisticTis[row];

    if (col === SOLUTION_COLUMN && ti?.group && !editable) {
      return {
        ...props,
        className: cn(props?.className, 'relative'),
        children: (
          <Link
            href={`/projects/${projectId}/ti-groups/${ti.group.id}`}
            className='absolute inset-0 flex cursor-pointer items-center underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500'
          >
            {rows[row][col]?.v ?? ''}
          </Link>
        ),
      };
    }

    /// Пофазная ячейка — по элементу на фазу A, B, C, а не одним текстом с
    /// переводами строк. Текст ячейки (по строке на фазу) остаётся её
    /// значением: его копируют и вставляют. Три элемента есть всегда, и у
    /// ТИ без ТН — пустые: строка таблицы одной высоты, есть ТН или нет, а
    /// в правке пустую фазу выделяют, чтобы заполнить.
    /// ТН нет — в ячейке TRANSFORMER_ABSENT, как в остальных колонках ТН (кроме
    /// «ТН тип» в правке — см. phaseLayoutAt).
    if (ti && !props?.children && phaseLayoutAt(row, col)) {
      return { ...props, children: renderPhases(row, col) };
    }

    /// Статус — точкой вместо текста. Текст остаётся значением ячейки: его
    /// копируют, вставляют и правят, а подпись видна в подсказке.
    if (col === STATUS_COLUMN && ti && !props?.children) {
      const label = tiStatusLabels[ti.status];

      return {
        ...props,
        title: label,
        className: cn(props?.className, 'text-center'),
        children: (
          <span
            role='img'
            aria-label={label}
            className={cn(
              'inline-block size-2.5 rounded-full align-middle',
              tiStatusDotColors[ti.status],
            )}
          />
        ),
      };
    }

    /// Типа ПУ нет в справочнике АТС — красным: такой счётчик, скорее всего,
    /// придётся менять, и строку должно быть видно сразу. Почему «нет» — в
    /// подсказке.
    if (
      col === ATS_DICTIONARY_COLUMN &&
      ti?.currentMeter?.inAtsDictionary === false
    ) {
      return {
        ...props,
        title: ti.currentMeter.atsDictionaryReason ?? undefined,
        className: cn(props?.className, 'text-red-600 dark:text-red-400'),
      };
    }

    /// Счётчик менять надо, а на что — не решили: фон оранжевый, пока
    /// ячейку не выделили (выделение красит свой фон).
    if (
      col === PROPOSED_METER_COLUMN &&
      ti?.currentMeter?.needsReplacement === true &&
      !ti.proposedMeter &&
      !props?.['aria-selected']
    ) {
      return {
        ...props,
        className: cn(props?.className, 'bg-orange-100 dark:bg-orange-950'),
      };
    }

    /// Схема не записана и подсказана (по Uном или справочнику АТС) — серым:
    /// её ещё надо подтвердить. Править ячейку начинают с пустого: подсказка
    /// не значение.
    const suggested = col === WIRING_COLUMN && ti ? suggestedWiring(ti) : null;

    if (suggested) {
      return {
        ...props,
        title: suggested.source,
        className: cn(
          props?.className,
          'text-neutral-400 dark:text-neutral-500',
        ),
      };
    }

    const status = checkStatus(row, col);

    if (!status || props?.children) return props;

    return {
      ...props,
      title: status.error,
      children: (
        <span className='inline-flex items-center gap-1.5'>
          <span
            aria-hidden
            className={cn(
              'size-2 shrink-0 rounded-full',
              status.ok ? 'bg-green-500' : 'bg-red-500',
            )}
          />
          {rows[row][col]?.v}
        </span>
      ),
    };
  }

  /// Свойства ячеек по режиму: в режиме просмотра — выделение строки, в
  /// режиме правки — выделение ячеек и правка правимых колонок.
  function modeCellProps(
    row: number,
    col: number,
  ): SurveyCellProps | undefined {
    if (!editable) return rowCellProps(row, col);

    /// Одна выделенная пофазная ячейка подсвечивает фазу, а не себя.
    const props = selection.cellProps(row, col, !phaseFocusedAt(row, col));

    if (col === ROW_HANDLE_COLUMN) {
      const rowProps = rowCellProps(row, col);

      if (!rowProps) return rowProps;

      return {
        ...rowProps,
        onMouseDown: (event: MouseEvent<HTMLTableCellElement>) => {
          selection.clear();
          rowProps.onMouseDown?.(event);
        },
      };
    }

    if (!props) return props;

    const rowSelected =
      rowSelection.rows.has(row) && (rows[row][col]?.rowSpan ?? 1) === 1;
    const cellProps: SurveyCellProps = {
      ...props,
      'aria-selected': rowSelected || props['aria-selected'],
      onMouseDown: (event: MouseEvent<HTMLTableCellElement>) => {
        selectRow(null);

        /// Клик по фазе выделяет её; мимо фаз (отступ ячейки) — фазу A.
        if (PHASE_COLUMNS.has(col)) {
          const target = (event.target as HTMLElement).closest<HTMLElement>(
            '[data-phase]',
          );

          setPhase(Number(target?.dataset.phase ?? 0));
        }

        props.onMouseDown?.(event);
      },
      className: cn(
        props.className,
        rowSelected && 'bg-blue-50 dark:bg-blue-950',
      ),
    };

    if (EDITABLE_COLUMNS[col] === undefined) return cellProps;

    const isEditing = editing?.row === row && editing.col === col;
    const choices = choicesAt(row, col);

    return {
      ...cellProps,
      onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
        if (!handleEditKeyDown(event, row, col)) props.onKeyDown?.(event);
      },
      onDoubleClick: () => {
        if (!isEditing) startEditing(row, col);
      },
      /// Список открывается с одного клика: выбрать из трёх значений проще,
      /// чем сначала выделить ячейку. Клик с Shift, Ctrl (⌘) — по-прежнему
      /// выделение, а протяжка мышью по ячейкам click на ячейке не даёт.
      onClick: (event: MouseEvent<HTMLTableCellElement>) => {
        if (
          choices &&
          !isEditing &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          setEditing({ row, col, initial: valueAt(row, col) });
        }
      },
      onPaste: handlePaste,
      children: !isEditing ? undefined : choices ? (
        <CellChoice
          initial={editing.initial}
          options={choices}
          onDone={finishEditing}
        />
      ) : editing.phase !== undefined ? (
        renderPhases(
          row,
          col,
          <CellEditor
            initial={editing.initial}
            onDone={(value, refocus) =>
              finishEditing(
                value === null
                  ? null
                  : phaseEditValue(row, col, editing.phase!, value),
                refocus,
              )
            }
          />,
        )
      ) : (
        <CellEditor initial={editing.initial} onDone={finishEditing} />
      ),
    };
  }

  /// Пустое поле — Number('') = 0, его отсечёт проверка в экшене, и человек
  /// увидит, что не так. Проверять здесь второй раз незачем: экшен всё равно
  /// проверяет сам, его можно вызвать и в обход формы.
  /// Объединить выделенные ячейки «тех. решения»: их ТИ уходят в одну группу.
  /// Остаётся решение верхней — если в выделении их несколько разных,
  /// спрашиваем, прежде чем остальные пропадут.
  function handleMerge() {
    const range = selection.range;

    if (!range) return;

    const selected = tis.slice(range.top, range.bottom + 1);
    const solutions = [
      ...new Set(
        selected
          .map((ti) => ti.group?.technicalSolution)
          .filter((text): text is string => Boolean(text)),
      ),
    ];

    if (
      solutions.length > 1 &&
      !window.confirm(
        `Останется решение «${solutions[0]}». Остальные решения выделенных ТИ будут удалены. Объединить?`,
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await mergeTiGroups(
        projectId,
        selected.map((ti) => ti.id),
      );

      if (!result.ok) return setError(result.error);

      selection.clear();
    });
  }

  /// Разъединить объединённую ячейку «тех. решения»: верхняя ТИ остаётся в
  /// группе со всем общим, остальные выходят из неё. Ничего не удаляется,
  /// поэтому и не спрашиваем.
  function handleSplit() {
    const range = selection.range;

    if (!range) return;

    setError(null);
    startTransition(async () => {
      const result = await splitTiGroup(
        projectId,
        tis.slice(range.top, range.bottom + 1).map((ti) => ti.id),
      );

      if (!result.ok) return setError(result.error);

      selection.clear();
    });
  }

  /// Опросить счётчики: выделенных ТИ или, без выделения, всех. По одному:
  /// экшены Next.js из браузера всё равно идут очередью, а ТИ одной группы
  /// сидят на одном модеме и разом их не опросить. Итог каждой ТИ виден в
  /// колонке «подключён», как только он есть.
  function handleConnect() {
    const targets =
      selectedRows.length === 0
        ? optimisticTis
        : selectedRows.flatMap((row) => optimisticTis[row] ?? []);

    if (targets.length === 0) return;

    for (const ti of targets) {
      setConnectedText(ti.id, 'ждёт…');

      const ip = ti.group?.modem?.ip?.trim();

      if (ip) setPing(ip, null);
    }

    setConnectProgress(
      targets.length > 1 ? { done: 0, total: targets.length } : null,
    );
    startConnectTransition(async () => {
      /// Итоги ping за этот проход по IP: у ТИ одной группы модем один, и
      /// пинговать его за каждую ТИ незачем.
      const pinged = new Map<string, PingResult>();

      for (const [index, ti] of targets.entries()) {
        const ip = ti.group?.modem?.ip?.trim();

        if (ip && !pinged.has(ip)) {
          setConnectedText(ti.id, 'ping…');

          const ping = await pingTi(projectId, ti.id);

          pinged.set(ip, ping);
          setPing(
            ip,
            ping.ok ? { ok: true } : { ok: false, error: ping.error },
          );
        }

        /// Модем не отвечает на ping — к счётчику за ним не подключаемся.
        const ping = ip ? pinged.get(ip) : undefined;

        if (ping && !ping.ok) {
          setConnectedText(ti.id, 'не подключён', 'error', ping.error);
        } else {
          setConnectedText(ti.id, 'подключаемся…');

          const result = await connectMeter(projectId, ti.id);

          if (result.ok) {
            setConnectedText(ti.id, `№ ${result.reading.serialNumber}`, 'ok');
          } else {
            setConnectedText(ti.id, 'не подключён', 'error', result.error);
          }
        }

        if (targets.length > 1) {
          setConnectProgress({ done: index + 1, total: targets.length });
        }
      }
    });
  }

  /// Удалить ТИ выделенной строки. Удаление не отменить — спрашиваем.
  function handleDelete() {
    const tis = selectedRows.flatMap((row) => optimisticTis[row] ?? []);

    if (tis.length === 0) return;

    const question =
      tis.length === 1
        ? `Удалить ТИ «${[tis[0].number, tis[0].name].filter(Boolean).join(' ')}»?`
        : `Удалить выделенные ТИ (${tis.length})?`;

    if (!window.confirm(`${question} Это нельзя отменить.`)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteTis(
        projectId,
        tis.map((ti) => ti.id),
      );

      if (!result.ok) return setError(result.error);

      selectRow(null);
    });
  }

  /// Поставить статус всем выделенным ТИ — теми же правками, что и вставка
  /// в колонку «статус»: одна транзакция и сразу видно в таблице.
  function handleSetStatus(status: TiStatus) {
    save(
      selectedRows.flatMap((row) => {
        const ti = optimisticTis[row];

        return ti
          ? [{ tiId: ti.id, field: 'status', value: tiStatusLabels[status] }]
          : [];
      }),
    );
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addTis(projectId, Number(addCount));
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      {/* shrink-0 — высоту делит таблица, панель не сжимается. */}
      <div className='flex h-12 shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
        {canEdit && (
          <Button
            variant={editable ? 'default' : 'outline'}
            aria-pressed={editable}
            onClick={() => {
              /// Режимы выделяют по-разному: при переключении старое выделение
              /// снимаем. Открытое поле правки закрываем без сохранения.
              setEditing(null);
              selectRow(null);
              selection.clear();
              setEditable((value) => !value);
            }}
          >
            {editable ? <Check /> : <Pencil />}
            {editable ? 'Готово' : 'Редактировать'}
          </Button>
        )}
        {/* Подключение — в режиме просмотра: к ТИ выделенной строки, а без
            выделения — ко всем ТИ по очереди. */}
        {!editable && (
          <Button
            variant='outline'
            disabled={optimisticTis.length === 0 || isConnecting}
            onClick={handleConnect}
          >
            <Plug />
            {isConnecting
              ? connectProgress
                ? `Connecting ${connectProgress.done}/${connectProgress.total}…`
                : 'Connecting…'
              : selectedRows.length === 0
                ? 'Connect all'
                : selectedRows.length === 1
                  ? 'Connect'
                  : `Connect ${selectedRows.length}`}
          </Button>
        )}
        {/* Добавление ТИ — только в режиме правки. Новые ТИ встают в конец
            таблицы с номерами по порядку и пустым наименованием. */}
        {editable && (
          <>
            <Input
              type='number'
              min={1}
              step={1}
              value={addCount}
              onChange={(event) => setAddCount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAdd();
              }}
              disabled={isPending}
              aria-label='Сколько ТИ добавить'
              className='w-16'
            />
            <Button variant='outline' onClick={handleAdd} disabled={isPending}>
              <Plus />
              {isPending ? 'Добавляем…' : 'Добавить ТИ'}
            </Button>
          </>
        )}
        {/* Статус выделенных ТИ — разом, без правки каждой ячейки. */}
        {editable &&
          selectedRows.some((row) => optimisticTis[row] !== undefined) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant='outline'>
                    Статус
                    <ChevronDown />
                  </Button>
                }
              />
              <DropdownMenuContent>
                {Object.values(TiStatus).map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => handleSetStatus(status)}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-2.5 rounded-full',
                        tiStatusDotColors[status],
                      )}
                    />
                    {tiStatusLabels[status]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        {/* Замена счётчика — на одну выделенную ТИ. */}
        {editable && replaceTi && (
          <>
            <Button
              variant='outline'
              onClick={() => setReplaceOpen(true)}
              disabled={isPending}
            >
              <Replace />
              Замена сч.
            </Button>
            <ReplaceMeterDialog
              projectId={projectId}
              ti={replaceTi}
              open={replaceOpen}
              onOpenChange={setReplaceOpen}
            />
          </>
        )}
        {/* Удалить ТИ можно, когда выделены строки (кликом в первую колонку,
            с Ctrl — несколько). */}
        {editable &&
          selectedRows.some((row) => optimisticTis[row] !== undefined) && (
            <Button
              variant='outline'
              onClick={handleDelete}
              disabled={isPending}
              className='text-destructive'
            >
              <Trash2 />
              {selectedRows.length > 1
                ? `Удалить ТИ (${selectedRows.length})`
                : 'Удалить ТИ'}
            </Button>
          )}
        {/* Объединить решения можно, когда в «тех. решении» выделено две
            ячейки и больше: одну объединять не с чем. */}
        {editable &&
          selection.range?.col === SOLUTION_COLUMN &&
          selection.range.cells >= 2 && (
            <Button
              variant='outline'
              onClick={handleMerge}
              disabled={isPending}
            >
              <Merge />
              Объединить
            </Button>
          )}
        {/* Разъединить можно одну объединённую ячейку «тех. решения» — ту, что
            накрывает две строки и больше. */}
        {editable &&
          selection.range?.col === SOLUTION_COLUMN &&
          selection.range.cells === 1 &&
          selection.range.bottom > selection.range.top && (
            <Button
              variant='outline'
              onClick={handleSplit}
              disabled={isPending}
            >
              <Split />
              Разъединить
            </Button>
          )}
        {error && <span className='text-xs text-destructive'>{error}</span>}
        <div className='ml-auto flex items-center gap-2'>
          {/* Все ТИ проекта в Excel по форме ПНР (docs/excel_examples/ПНР
              МКЗ.xlsx) — файл собирает сервер, из сохранённых данных. */}
          <Button
            variant='outline'
            nativeButton={false}
            render={<a href={`/api/projects/${projectId}/pnr-xlsx`} download />}
          >
            <FileSpreadsheet />
            Excel ПНР
          </Button>
          <ColumnPicker
            hidden={hidden}
            setVisible={setVisible}
            setHiddenIds={setHiddenIds}
          />
        </div>
      </div>
      <SurveyTable
        columns={columns}
        rows={rows}
        visibleColumns={visibleColumns}
        /// Пустая колонка, № и наименование ТИ не уезжают при прокрутке вбок: без них
        /// в правых колонках не понять, о какой ТИ строка. Скрытые из них не
        /// считаются — липкие идут первыми показанными.
        stickyColumns={
          STICKY_COLUMNS.filter((col) => visibleSet.has(col)).length
        }
        /// Объединённые ячейки — группы ТИ: жирная граница строк во всю
        /// ширину показывает, где группа начинается и кончается.
        mergedBorders
        /// По одному значению в ячейке — по центру строки, а у объединённых
        /// посередине их группы.
        verticalAlign='middle'
        cellProps={cellProps}
        className='min-h-0 flex-1'
      />
    </>
  );
}
