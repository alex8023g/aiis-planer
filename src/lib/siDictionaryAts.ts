import 'server-only';

import sax from 'sax';

import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

/// Import of the ATS measuring instrument dictionary
/// (KU_MS_COMPONENTS_DICTIONARY, see prisma/si-dictionary-ats.prisma).
/// The export is ~400 MB, so it is parsed as a stream and written in batches;
/// the whole replacement runs in one transaction, so a broken file leaves the
/// previous dictionary in place.
///
/// Rows are not collected per top-level record: a single current transformer
/// type has up to ~85K ratings. Instead every row goes to a pending batch as
/// soon as it is complete. That needs the parent's id before the parent is in
/// the database, so ids of autoincrement tables are assigned here — safe, as
/// the tables are truncated first — and the sequences are moved past them at
/// the end.

const ROOT_CLASS = 'KU_MS_COMPONENTS_DICTIONARY';

/// Pending rows that trigger a write. 9 columns × 5000 stays well under
/// Postgres's 65535 bind parameters.
const BATCH_SIZE = 5000;

export type SiDictionaryImportResult = {
  generatedAt: Date;
  meterTypes: number;
  meterModifications: number;
  currentTransformerTypes: number;
  currentTransformerNames: number;
  currentTransformerRatings: number;
  voltageTransformerTypes: number;
  voltageTransformerNames: number;
  voltageTransformerRatings: number;
  uspdTypes: number;
  uspdNames: number;
};

type Attrs = Record<string, string>;

/// Rows waiting to be written, in foreign key order: a parent's bucket comes
/// before its children's, and buckets are written in this order.
type Pending = {
  meterTypes: Prisma.AtsMeterTypeCreateManyInput[];
  meterModifications: Prisma.AtsMeterModificationCreateManyInput[];
  currentTransformerTypes: Prisma.AtsCurrentTransformerTypeCreateManyInput[];
  currentTransformerNames: Prisma.AtsCurrentTransformerNameCreateManyInput[];
  currentTransformerRatings: Prisma.AtsCurrentTransformerRatingCreateManyInput[];
  voltageTransformerTypes: Prisma.AtsVoltageTransformerTypeCreateManyInput[];
  voltageTransformerNames: Prisma.AtsVoltageTransformerNameCreateManyInput[];
  voltageTransformerRatings: Prisma.AtsVoltageTransformerRatingCreateManyInput[];
  uspdTypes: Prisma.AtsUspdTypeCreateManyInput[];
  uspdNames: Prisma.AtsUspdNameCreateManyInput[];
};

const emptyPending = (): Pending => ({
  meterTypes: [],
  meterModifications: [],
  currentTransformerTypes: [],
  currentTransformerNames: [],
  currentTransformerRatings: [],
  voltageTransformerTypes: [],
  voltageTransformerNames: [],
  voltageTransformerRatings: [],
  uspdTypes: [],
  uspdNames: [],
});

/// A type of transformer or USPD: its row is complete only once the
/// calibration intervals and manufacturers before <type-names> are read.
type GrsiType = {
  kind: 'current' | 'voltage' | 'uspd';
  atsCode: string;
  grsiCode: string;
  calibrationIntervals: number[];
  manufacturers: string[];
  written: boolean;
};

/// A rating as read: primary and secondary are current or voltage depending
/// on the transformer kind.
type Rating = {
  accuracyClass: string;
  primary: string | null;
  primaryMin: string | null;
  primaryMax: string | null;
  secondary: string | null;
  secondaryLoad: string | null;
  serialNumbers: string[];
};

export class SiDictionaryImportError extends Error {}

/// "" → null, otherwise the value as is.
function text(value: string | undefined): string | null {
  return value ? value : null;
}

/// YYYYMMDD → date; "" → null.
function date(value: string | undefined): Date | null {
  if (!value) return null;

  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);

  if (!match) throw new SiDictionaryImportError(`Неверная дата: ${value}`);

  return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
}

/// YYYYMMDDhhmmss from the root element → date.
function dateTime(value: string | undefined): Date {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(
    value ?? '',
  );

  if (!match) {
    throw new SiDictionaryImportError(`Неверное время выгрузки: ${value}`);
  }

  return new Date(
    +match[1],
    +match[2] - 1,
    +match[3],
    +match[4],
    +match[5],
    +match[6],
  );
}

/// Decimal as a string for Prisma; the export mixes "2.5" and "2,5".
function decimal(value: string | undefined): string | null {
  return value ? value.replace(',', '.') : null;
}

function int(value: string | undefined): number {
  const result = Number(value);

  if (!Number.isInteger(result)) {
    throw new SiDictionaryImportError(`Неверное целое: ${value}`);
  }

  return result;
}

/// Turns sax events into rows. Elements are interpreted by the top-level
/// element they are in: precision-class, for example, means different things
/// for meters and transformers.
class DictionaryReader {
  generatedAt: Date | null = null;
  pending = emptyPending();
  /// Rows in `pending`, to know when a batch is full.
  pendingRows = 0;
  /// Last ids handed out for autoincrement tables.
  lastId = { meterType: 0, currentName: 0, voltageName: 0 };

  private encodingChecked = false;
  private depth = 0;
  private top: string | null = null;
  private meterTypeId = 0;
  private modification: Prisma.AtsMeterModificationCreateManyInput | null =
    null;
  private grsiType: GrsiType | null = null;
  private nameId = 0;
  private rating: Rating | null = null;

  processingInstruction(name: string, body: string) {
    if (name !== 'xml') return;

    /// The stream is decoded as windows-1251 before parsing; a file in another
    /// encoding would come out as garbage, so refuse it up front.
    if (!/encoding="windows-1251"/i.test(body)) {
      throw new SiDictionaryImportError(
        'Ожидалась выгрузка в кодировке windows-1251',
      );
    }

    this.encodingChecked = true;
  }

  open(name: string, attrs: Attrs) {
    this.depth++;

    if (this.depth === 1) {
      if (name !== 'message' || attrs['class'] !== ROOT_CLASS) {
        throw new SiDictionaryImportError(
          `Это не справочник СИ АТС (ожидался ${ROOT_CLASS})`,
        );
      }

      if (!this.encodingChecked) {
        throw new SiDictionaryImportError('Нет XML-заголовка с кодировкой');
      }

      this.generatedAt = dateTime(attrs['generationtime']);
    } else if (this.depth === 2) {
      this.openTop(name, attrs);
    } else if (this.top === 'measuring-device-type') {
      this.openMeterChild(name, attrs);
    } else {
      this.openGrsiChild(name, attrs);
    }
  }

  close(name: string) {
    if (this.depth === 2) {
      /// A type without <type-names> still gets its row.
      this.writeGrsiType();
      this.top = null;
      this.grsiType = null;
    } else if (name === 'measuring-device-modification' && this.modification) {
      this.push('meterModifications', this.modification);
      this.modification = null;
    } else if (name === 'precision-class' && this.rating) {
      this.pushRating(this.rating);
      this.rating = null;
    }

    this.depth--;
  }

  private push<K extends keyof Pending>(bucket: K, row: Pending[K][number]) {
    (this.pending[bucket] as Pending[K][number][]).push(row);
    this.pendingRows++;
  }

  private openTop(name: string, attrs: Attrs) {
    this.top = name;

    switch (name) {
      case 'measuring-device-type':
        this.meterTypeId = ++this.lastId.meterType;
        this.push('meterTypes', {
          id: this.meterTypeId,
          name: attrs['name'],
          grsiCode: attrs['code-in-grsi'],
          isIntegral: attrs['is-integral-device'] === 'true',
          calibrationInterval: int(attrs['calibration-interval']),
        });
        break;
      case 'current-transformer-type':
      case 'voltage-transformer-type':
      case 'uspd-type':
        this.grsiType = {
          kind:
            name === 'current-transformer-type'
              ? 'current'
              : name === 'voltage-transformer-type'
                ? 'voltage'
                : 'uspd',
          atsCode: attrs['ats-code'],
          grsiCode: attrs['code-in-grsi'],
          calibrationIntervals: [],
          manufacturers: [],
          written: false,
        };
        break;
      default:
        throw new SiDictionaryImportError(`Неизвестный элемент <${name}>`);
    }
  }

  private openMeterChild(name: string, attrs: Attrs) {
    if (name === 'measuring-device-modification') {
      this.modification = {
        atsCode: attrs['ats-code'],
        typeId: this.meterTypeId,
        name: attrs['name'],
        manufacturer: attrs['manufacter'],
        activeChannels: int(attrs['n-active-channels']),
        reactiveChannels: int(attrs['n-reactive-channels']),
        ratedCurrents: [],
        ratedVoltages: [],
        accuracyClasses: [],
        comment: text(attrs['external-comment']),
        stopDateAiis: date(attrs['stop-date-use-in-AIIS']),
        stopDateIsu: date(attrs['stop-date-use-in-ISU']),
        stopDateUnion: date(attrs['stop-date-use-in-UNION']),
        inStopList: attrs['in-stop-list'] === 'true',
      };

      return;
    }

    const modification = this.modification;

    if (!modification) return;

    if (name === 'precision-class') {
      (modification.accuracyClasses as string[]).push(
        `${attrs['active']}/${attrs['reactive']}`,
      );
    } else if (name === 'rated-current') {
      (modification.ratedCurrents as string[]).push(attrs['value']);
    } else if (name === 'rated-voltage') {
      (modification.ratedVoltages as string[]).push(attrs['value']);
    }
  }

  /// Children of transformer and USPD types.
  private openGrsiChild(name: string, attrs: Attrs) {
    const type = this.grsiType;

    if (!type) return;

    switch (name) {
      case 'calibration-interval':
        type.calibrationIntervals.push(int(attrs['value']));
        break;
      case 'manufacter':
        type.manufacturers.push(attrs['value']);
        break;
      case 'type-names':
        this.writeGrsiType();
        break;
      case 'type-name':
        this.openTypeName(type, attrs);
        break;
      /// Each precision-class holds exactly one chain (primary → secondary →
      /// load), so it is one rating row; a few have no chain at all. The row
      /// is pushed on close, once the chain is read.
      case 'precision-class':
        this.rating = {
          accuracyClass: attrs['value'],
          primary: null,
          primaryMin: null,
          primaryMax: null,
          secondary: null,
          secondaryLoad: null,
          serialNumbers: [],
        };
        break;
      case 'primary-current':
      case 'primary-voltage':
        if (this.rating) {
          this.rating.primary = decimal(attrs['value']);
          this.rating.primaryMin = decimal(attrs['min-value']);
          this.rating.primaryMax = decimal(attrs['max-value']);
        }
        break;
      case 'secondary-current':
      case 'secondary-voltage':
        if (this.rating) this.rating.secondary = decimal(attrs['value']);
        break;
      case 'secondary-load':
        if (this.rating) {
          this.rating.secondaryLoad = decimal(attrs['nominal-value']);
        }
        break;
      case 'serial-number':
        this.rating?.serialNumbers.push(attrs['value']);
        break;
    }
  }

  private writeGrsiType() {
    const type = this.grsiType;

    if (!type || type.written) return;

    type.written = true;

    const row = {
      atsCode: type.atsCode,
      grsiCode: type.grsiCode,
      calibrationIntervals: type.calibrationIntervals,
      manufacturers: type.manufacturers,
    };

    if (type.kind === 'current') this.push('currentTransformerTypes', row);
    else if (type.kind === 'voltage') this.push('voltageTransformerTypes', row);
    else this.push('uspdTypes', row);
  }

  private openTypeName(type: GrsiType, attrs: Attrs) {
    const common = {
      typeId: type.atsCode,
      name: attrs['value'],
      comment: text(attrs['external-comment']),
      stopDateAiis: date(attrs['stop-date-use-in-AIIS']),
      stopDateIsu: date(attrs['stop-date-use-in-ISU']),
      stopDateUnion: date(attrs['stop-date-use-in-UNION']),
    };

    if (type.kind === 'uspd') {
      this.push('uspdNames', common);

      return;
    }

    const isDigital = attrs['digital-transformer-option'] === 'true';

    if (type.kind === 'current') {
      this.nameId = ++this.lastId.currentName;
      this.push('currentTransformerNames', {
        id: this.nameId,
        ...common,
        isDigital,
      });
    } else {
      this.nameId = ++this.lastId.voltageName;
      this.push('voltageTransformerNames', {
        id: this.nameId,
        ...common,
        isDigital,
      });
    }
  }

  private pushRating({
    primary,
    primaryMin,
    primaryMax,
    secondary,
    ...rest
  }: Rating) {
    if (this.grsiType?.kind === 'current') {
      this.push('currentTransformerRatings', {
        ...rest,
        typeNameId: this.nameId,
        primaryCurrent: primary,
        primaryCurrentMin: primaryMin,
        primaryCurrentMax: primaryMax,
        secondaryCurrent: secondary,
      });
    } else if (this.grsiType?.kind === 'voltage') {
      this.push('voltageTransformerRatings', {
        ...rest,
        typeNameId: this.nameId,
        primaryVoltage: primary,
        primaryVoltageMin: primaryMin,
        primaryVoltageMax: primaryMax,
        secondaryVoltage: secondary,
      });
    }
  }
}

/// createMany for every bucket, in chunks.
async function writePending(
  tx: Prisma.TransactionClient,
  pending: Pending,
  result: SiDictionaryImportResult,
) {
  const writers: {
    [K in keyof Pending]: (data: Pending[K]) => Promise<unknown>;
  } = {
    meterTypes: (data) => tx.atsMeterType.createMany({ data }),
    meterModifications: (data) => tx.atsMeterModification.createMany({ data }),
    currentTransformerTypes: (data) =>
      tx.atsCurrentTransformerType.createMany({ data }),
    currentTransformerNames: (data) =>
      tx.atsCurrentTransformerName.createMany({ data }),
    currentTransformerRatings: (data) =>
      tx.atsCurrentTransformerRating.createMany({ data }),
    voltageTransformerTypes: (data) =>
      tx.atsVoltageTransformerType.createMany({ data }),
    voltageTransformerNames: (data) =>
      tx.atsVoltageTransformerName.createMany({ data }),
    voltageTransformerRatings: (data) =>
      tx.atsVoltageTransformerRating.createMany({ data }),
    uspdTypes: (data) => tx.atsUspdType.createMany({ data }),
    uspdNames: (data) => tx.atsUspdName.createMany({ data }),
  };

  for (const bucket of Object.keys(writers) as (keyof Pending)[]) {
    const rows = pending[bucket];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await (writers[bucket] as (data: unknown[]) => Promise<unknown>)(
        rows.slice(i, i + BATCH_SIZE),
      );
    }

    result[bucket] += rows.length;
  }
}

/// Replaces the dictionary with the export from `body` (raw file bytes).
export async function importSiDictionary(
  body: ReadableStream<Uint8Array>,
  fileName: string,
): Promise<SiDictionaryImportResult> {
  const reader = new DictionaryReader();
  const parser = sax.parser(true);
  /// sax reports errors through callbacks; keep the first one and rethrow it
  /// from the read loop, where the transaction can see it.
  let parseError: Error | null = null;

  const guard = (fn: () => void) => {
    if (parseError) return;

    try {
      fn();
    } catch (error) {
      parseError = error as Error;
    }
  };

  parser.onprocessinginstruction = ({ name, body: pi }) =>
    guard(() => reader.processingInstruction(name, pi));
  parser.onopentag = (node) =>
    guard(() => reader.open(node.name, node.attributes as Attrs));
  parser.onclosetag = (name) => guard(() => reader.close(name));
  parser.onerror = (error) => {
    parseError ??= new SiDictionaryImportError(
      `Ошибка разбора XML: ${error.message}`,
    );
  };

  const result: SiDictionaryImportResult = {
    generatedAt: new Date(0),
    meterTypes: 0,
    meterModifications: 0,
    currentTransformerTypes: 0,
    currentTransformerNames: 0,
    currentTransformerRatings: 0,
    voltageTransformerTypes: 0,
    voltageTransformerNames: 0,
    voltageTransformerRatings: 0,
    uspdTypes: 0,
    uspdNames: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`TRUNCATE "AtsMeterType", "AtsMeterModification",
        "AtsCurrentTransformerType", "AtsCurrentTransformerName",
        "AtsCurrentTransformerRating", "AtsVoltageTransformerType",
        "AtsVoltageTransformerName", "AtsVoltageTransformerRating",
        "AtsUspdType", "AtsUspdName" RESTART IDENTITY`;

      const flush = async (force: boolean) => {
        if (parseError) throw parseError;

        if (!force && reader.pendingRows < BATCH_SIZE) return;

        const pending = reader.pending;

        reader.pending = emptyPending();
        reader.pendingRows = 0;
        await writePending(tx, pending, result);
      };

      /// The next chunk is read only after a full batch is written, so memory
      /// holds at most about one batch of rows.
      const stream = body.getReader();
      const decoder = new TextDecoder('windows-1251');

      for (;;) {
        const { done, value } = await stream.read();

        if (done) break;

        parser.write(decoder.decode(value, { stream: true }));
        await flush(false);
      }

      parser.write(decoder.decode());
      parser.close();
      await flush(true);

      if (!reader.generatedAt) {
        throw new SiDictionaryImportError('Пустой файл');
      }

      /// Ids were assigned here, so move the sequences past them; is_called
      /// false on an empty table makes the next id 1.
      for (const [table, lastId] of [
        ['AtsMeterType', reader.lastId.meterType],
        ['AtsCurrentTransformerName', reader.lastId.currentName],
        ['AtsVoltageTransformerName', reader.lastId.voltageName],
      ] as const) {
        await tx.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), $1, $2)`,
          Math.max(lastId, 1),
          lastId > 0,
        );
      }

      result.generatedAt = reader.generatedAt;
      await tx.atsDictionaryImport.create({
        data: { generatedAt: reader.generatedAt, fileName },
      });
    },
    /// A full import writes ~1.2M rows and takes minutes, far past the 5 s
    /// default.
    { maxWait: 10_000, timeout: 30 * 60_000 },
  );

  return result;
}
