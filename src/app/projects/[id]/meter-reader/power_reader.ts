import { createConnection, type Socket } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const ENERGY_LABELS = [
  'A+ active import',
  'A- active export',
  'R+ reactive import',
  'R- reactive export',
] as const;
const DEFAULT_PASSWORD = '000000';
const METER_TYPE_NAMES: Readonly<Record<number, string>> = {
  0x00: 'СЭТ-4ТМ.02 / СЭТ-1М.01',
  0x01: 'СЭТ-4ТМ.03',
  0x02: 'СЭБ-1ТМ',
  0x03: 'ПСЧ-4ТМ.05',
  0x04: 'СЭО-1.16',
  0x05: 'ПСЧ-3ТМ.05',
  0x06: 'ПСЧ-4ТМ.05М',
  0x07: 'ПСЧ-3ТМ.05М',
  0x08: 'СЭТ-4ТМ.02М / СЭТ-4ТМ.03М',
  0x09: 'СЭБ-1ТМ.02Д',
  0x0a: 'ПСЧ-3ТМ.05Д / ПСЧ-4ТМ.05Д',
  0x0b: 'ПСЧ-4ТМ.05МК',
  0x0c: 'СЭБ-1ТМ.02М',
  0x0d: 'ПСЧ-4ТМ.05МД',
  0x0f: 'Extended meter type code',
};
const POWER_LABELS = [
  'P+ active forward',
  'P- active reverse',
  'Q+ reactive forward',
  'Q- reactive reverse',
] as const;
const PROFILE_MEMORY_IDS = { 0: 0x03, 1: 0x08 } as const;
const PROFILE_MEMORY_SIZE = 0x10000;
const PROFILE_RECORD_SIZE = 8;
const PROFILE_READ_CHUNK_SIZE = 88;
const PROFILE_SHORT_READ_CHUNK_SIZE = 16;
const PROFILE_MAX_AGE_HOURS = 4096;
const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  0x01: 'invalid command or parameter',
  0x02: 'internal meter error',
  0x03: 'insufficient access level',
  0x04: 'meter clock was already corrected today',
  0x05: 'communication channel is not open',
  0x06: 'meter is busy; retry later',
  0x07: 'measurement is not ready',
  0x08: 'meter is busy with a similar process',
  0x09: 'payment register overflow',
  0x0a: 'meter cannot execute the control request',
};

type ChecksumMode = 'ks' | 'crc';
type ChecksumOption = ChecksumMode | 'auto';
type DateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};
export type ConnectionConfig = {
  host: string;
  port: number;
  address: number;
  password: string;
};
type PowerMaximum = DateTime & { value: number; rawTimestamp: Buffer };
type PowerMaxima = {
  morning: PowerMaximum;
  evening: PowerMaximum;
  integrationMinutes: number;
  currentRatio: number;
  voltageRatio: number;
};
type MeterIdentity = { serialNumber: string; manufactureDate: DateTime };
type MeterType = {
  model: string;
  typeCode: number;
  rawData: Buffer;
  details: string[];
};
type ProfilePointer = { timestamp: DateTime; memoryAddress: number };
type ProfileSlice = {
  timestamp: DateTime;
  intervalMinutes: number;
  season: number;
  memoryAddress: number;
  values: [number, number, number, number];
  incomplete: [boolean, boolean, boolean, boolean];
};
type PowerProfile = { pointer: ProfilePointer; slices: ProfileSlice[] };

type Options = {
  config: string;
  array: number;
  month: number;
  tariff: number;
  maxima: boolean;
  meterNumber: boolean;
  meterType: boolean;
  profile?: number;
  maximaProfile: number;
  powerType: number;
  checksum: ChecksumOption;
  openChannel: boolean;
  timeout: number;
  meterConstant?: number;
  voltageRatio: number;
  currentRatio: number;
};

class MeterReaderError extends Error {}
class MeterStatusError extends MeterReaderError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
class CliError extends Error {}

function formatHex(value: number, width = 2): string {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexBytes(data: Buffer): string {
  return [...data]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ');
}

function parseNumber(value: string, field: string): number {
  const trimmed = value.trim();
  const valid =
    /^0[xX][0-9a-fA-F]+$/.test(trimmed) || /^[+-]?\d+$/.test(trimmed);
  const number = valid ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(number)) {
    throw new MeterReaderError(`Invalid ${field}: ${JSON.stringify(value)}`);
  }
  return number;
}

async function loadConnection(path: string): Promise<ConnectionConfig> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    throw new MeterReaderError(`Cannot read ${path}: ${errorMessage(error)}`);
  }

  const values = new Map<string, string>();
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    const separator = entry.indexOf('=');
    if (separator < 0)
      throw new MeterReaderError(`Invalid setting on ${path}:${index + 1}`);
    const key = entry.slice(0, separator).trim().toLowerCase();
    const value = entry.slice(separator + 1).trim();
    if (!key || !value)
      throw new MeterReaderError(`Invalid setting on ${path}:${index + 1}`);
    values.set(key, value);
  }

  const missing = ['ip', 'port', 'address'].filter((key) => !values.has(key));
  if (missing.length) {
    throw new MeterReaderError(
      `Missing setting(s) in ${path}: ${missing.sort().join(', ')}`,
    );
  }

  return parseConnection({
    ip: values.get('ip')!,
    port: values.get('port')!,
    address: values.get('address')!,
    password: values.get('password'),
  });
}

/// Validate raw connection settings (from the config file or the app's database).
export function parseConnection(raw: {
  ip: string;
  port: string;
  address: string;
  password?: string;
}): ConnectionConfig {
  const host = raw.ip.trim();
  if (!isIP(host))
    throw new MeterReaderError(`Invalid IP address: ${JSON.stringify(raw.ip)}`);
  const port = parseNumber(raw.port, 'port');
  const address = parseNumber(raw.address, 'meter address');
  const password = raw.password ?? DEFAULT_PASSWORD;
  if (port < 1 || port > 65535)
    throw new MeterReaderError('Port must be between 1 and 65535');
  if (address < 0 || address > 0xef) {
    throw new MeterReaderError('Short meter address must be between 0 and 239');
  }
  if (!/^\d{6}$/.test(password)) {
    throw new MeterReaderError('Password must contain exactly six digits');
  }
  return { host, port, address, password };
}

function ksChecksum(data: Buffer): number {
  let checksum = 0xff;
  for (const value of data) checksum ^= value;
  return checksum;
}

function modbusCrc(data: Buffer): number {
  let crc = 0xffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

function addChecksum(data: Buffer, mode: ChecksumMode): Buffer {
  if (mode === 'ks')
    return Buffer.concat([data, Buffer.from([ksChecksum(data)])]);
  const crc = modbusCrc(data);
  return Buffer.concat([data, Buffer.from([crc & 0xff, crc >>> 8])]);
}

function buildEnergyRequest(
  address: number,
  array: number,
  month: number,
  tariff: number,
  mode: ChecksumMode,
): Buffer {
  if (array < 0 || array > 5)
    throw new MeterReaderError('Array must be between 0 and 5');
  if (month < 0 || month > 12)
    throw new MeterReaderError('Month must be between 0 and 12');
  if (tariff < 0 || tariff > 8)
    throw new MeterReaderError('Tariff must be between 0 and 8');
  return addChecksum(
    Buffer.from([address, 0x05, (array << 4) | month, tariff]),
    mode,
  );
}

function buildPowerMaximaRequest(
  address: number,
  profile: number,
  powerType: number,
  mode: ChecksumMode,
): Buffer {
  if (profile !== 0 && profile !== 1)
    throw new MeterReaderError('Profile must be 0 or 1');
  if (powerType < 0 || powerType > 3)
    throw new MeterReaderError('Power type must be between 0 and 3');
  return addChecksum(
    Buffer.from([address, 0x08, 0x1c, 0x01, profile, powerType]),
    mode,
  );
}

function buildProfilePointerRequest(
  address: number,
  profile: number,
  mode: ChecksumMode,
): Buffer {
  if (profile !== 0 && profile !== 1)
    throw new MeterReaderError('Profile array must be 0 or 1');
  return addChecksum(Buffer.from([address, 0x08, 0x04, profile]), mode);
}

function buildSingleProfilePointerRequest(
  address: number,
  mode: ChecksumMode,
): Buffer {
  return addChecksum(Buffer.from([address, 0x08, 0x04]), mode);
}

function buildProfileMemoryRequest(
  address: number,
  requestId: number,
  memoryId: number,
  memoryAddress: number,
  count: number,
  mode: ChecksumMode,
): Buffer {
  if (requestId < 0 || requestId > 0xff) {
    throw new MeterReaderError(
      'Profile request identifier must be between 0 and 255',
    );
  }
  if (memoryId !== 0x03 && memoryId !== 0x08)
    throw new MeterReaderError('Unsupported profile memory id');
  if (memoryAddress < 0 || memoryAddress > 0xffff) {
    throw new MeterReaderError(
      'Profile memory address must be between 0 and 65535',
    );
  }
  if (count < 2 || count > 92)
    throw new MeterReaderError(
      'Profile read size must be between 2 and 92 bytes',
    );
  return addChecksum(
    Buffer.from([
      address,
      0x0c,
      requestId,
      memoryId,
      memoryAddress >>> 8,
      memoryAddress & 0xff,
      count,
    ]),
    mode,
  );
}

function buildShortProfileMemoryRequest(
  address: number,
  memoryId: number,
  memoryAddress: number,
  count: number,
  mode: ChecksumMode,
): Buffer {
  if (memoryId !== 0x03 && memoryId !== 0x08)
    throw new MeterReaderError('Unsupported profile memory id');
  if (memoryAddress < 0 || memoryAddress > 0xffff) {
    throw new MeterReaderError(
      'Profile memory address must be between 0 and 65535',
    );
  }
  if (count < 2 || count > PROFILE_SHORT_READ_CHUNK_SIZE) {
    throw new MeterReaderError(
      `Profile read size must be between 2 and ${PROFILE_SHORT_READ_CHUNK_SIZE} bytes`,
    );
  }
  return addChecksum(
    Buffer.from([
      address,
      0x06,
      memoryId,
      memoryAddress >>> 8,
      memoryAddress & 0xff,
      count,
    ]),
    mode,
  );
}

function buildMeterIdentityRequest(
  address: number,
  mode: ChecksumMode,
): Buffer {
  return addChecksum(Buffer.from([address, 0x08, 0x00]), mode);
}

function buildMeterTypeRequest(address: number, mode: ChecksumMode): Buffer {
  return addChecksum(Buffer.from([address, 0x08, 0x12]), mode);
}

function buildChannelRequest(
  address: number,
  command: number,
  mode: ChecksumMode,
  password?: string,
): Buffer {
  let request = Buffer.from([address, command]);
  if (command === 0x01) {
    if (!password || !/^\d{6}$/.test(password)) {
      throw new MeterReaderError(
        'The channel password must contain exactly six digits',
      );
    }
    request = Buffer.concat([request, Buffer.from(password, 'ascii')]);
  }
  return addChecksum(request, mode);
}

class MeterConnection {
  private readonly socket: Socket;
  private buffer = Buffer.alloc(0);
  private lastDataAt = Date.now();
  private ended = false;
  private socketError: Error | undefined;
  private waiter: (() => void) | undefined;

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.lastDataAt = Date.now();
      this.notify();
    });
    socket.on('end', () => {
      this.ended = true;
      this.notify();
    });
    socket.on('close', () => {
      this.ended = true;
      this.notify();
    });
    socket.on('error', (error: Error) => {
      this.socketError = error;
      this.notify();
    });
  }

  static async open(
    host: string,
    port: number,
    timeout: number,
  ): Promise<MeterConnection> {
    const socket = createConnection({ host, port });
    return new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      const timer = setTimeout(
        () =>
          finish(new MeterReaderError('Timed out connecting to meter gateway')),
        timeout * 1000,
      );
      const onConnect = () => finish();
      const onError = (error: Error) => finish(error);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.removeListener('connect', onConnect);
        socket.removeListener('error', onError);
        if (error) {
          socket.destroy();
          rejectPromise(error);
        } else {
          resolvePromise(new MeterConnection(socket));
        }
      };
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
  }

  send(data: Buffer): Promise<void> {
    return new Promise((resolvePromise, rejectPromise) => {
      this.socket.write(data, (error?: Error | null) =>
        error ? rejectPromise(error) : resolvePromise(),
      );
    });
  }

  async receive(timeout: number, expectedSize: number): Promise<Buffer> {
    const deadline = Date.now() + timeout * 1000;
    while (true) {
      if (this.buffer.length >= expectedSize) return this.takeBuffer();
      if (this.socketError || this.ended) {
        if (this.buffer.length) return this.takeBuffer();
        if (this.socketError) throw this.socketError;
        throw new MeterReaderError(
          'The server closed the connection without a response',
        );
      }

      const now = Date.now();
      const remaining = deadline - now;
      if (remaining <= 0) {
        if (this.buffer.length) return this.takeBuffer();
        throw new MeterReaderError('Timed out waiting for a meter response');
      }

      const idleRemaining = this.buffer.length
        ? 250 - (now - this.lastDataAt)
        : remaining;
      if (this.buffer.length && idleRemaining <= 0) return this.takeBuffer();
      await this.wait(Math.max(1, Math.min(remaining, idleRemaining)));
    }
  }

  close(): void {
    this.socket.destroy();
  }

  private takeBuffer(): Buffer {
    const result = this.buffer;
    this.buffer = Buffer.alloc(0);
    return result;
  }

  private notify(): void {
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.();
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolvePromise) => {
      let settled = false;
      const timer = setTimeout(() => finish(), milliseconds);
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.waiter === finish) this.waiter = undefined;
        resolvePromise();
      };
      this.waiter = finish;
    });
  }
}

function checksumSize(mode: ChecksumMode): number {
  return mode === 'ks' ? 1 : 2;
}

function verifyChecksum(
  response: Buffer,
  mode: ChecksumMode,
  subject: string,
): Buffer {
  const size = checksumSize(mode);
  if (response.length < size)
    throw new MeterReaderError(
      `${subject} is too short: ${hexBytes(response)}`,
    );
  const body = response.subarray(0, -size);
  const expected = addChecksum(body, mode).subarray(-size);
  if (!response.subarray(-size).equals(expected)) {
    throw new MeterReaderError(
      `Invalid ${mode.toUpperCase()} checksum in ${subject}: ${hexBytes(response)}`,
    );
  }
  return body;
}

function verifyAddress(response: Buffer, address: number): void {
  if (response[0] !== address) {
    throw new MeterReaderError(
      `Response address ${formatHex(response[0] ?? 0)} does not match meter address ${formatHex(address)}`,
    );
  }
}

function throwStatus(status: number, extra = ''): never {
  const message = STATUS_MESSAGES[status] ?? 'unknown meter status';
  throw new MeterStatusError(
    `Meter returned status ${formatHex(status)}${extra}: ${message}`,
    status,
  );
}

function decodeEnergyResponse(
  response: Buffer,
  address: number,
  mode: ChecksumMode,
): number[] {
  const size = checksumSize(mode);
  if (response.length < 2 + size)
    throw new MeterReaderError(`Response is too short: ${hexBytes(response)}`);
  const body = verifyChecksum(response, mode, 'response');
  verifyAddress(response, address);
  if (response[1] !== 0) throwStatus(response[1]!);
  const data = body.subarray(2);
  if (data.length !== 16) {
    throw new MeterReaderError(
      `Expected 16 energy-data bytes, received ${data.length}: ${hexBytes(response)}`,
    );
  }
  return [0, 4, 8, 12].map((offset) => data.readUInt32BE(offset));
}

function makeDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): DateTime {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    throw new MeterReaderError('Invalid date or time');
  }
  return { year, month, day, hour, minute };
}

function decodeBcd(value: number, field: string): number {
  const high = value >>> 4;
  const low = value & 0x0f;
  if (high > 9 || low > 9)
    throw new MeterReaderError(`Invalid BCD ${field}: ${formatHex(value)}`);
  return high * 10 + low;
}

function decodeMeterIdentityResponse(
  response: Buffer,
  address: number,
  mode: ChecksumMode,
): MeterIdentity {
  const size = checksumSize(mode);
  if (response.length < 2 + size)
    throw new MeterReaderError(
      `Meter-identity response is too short: ${hexBytes(response)}`,
    );
  const body = verifyChecksum(response, mode, 'meter-identity response');
  verifyAddress(response, address);
  const data = body.subarray(1);
  if (data.length === 1) throwStatus(data[0]!);
  if (data.length !== 7) {
    throw new MeterReaderError(
      `Expected 7 meter-identity data bytes, received ${data.length}: ${hexBytes(response)}`,
    );
  }
  const serialNumber = data.readUInt32BE(0).toString().padStart(8, '0');
  const day = decodeBcd(data[4]!, 'manufacture day');
  const month = decodeBcd(data[5]!, 'manufacture month');
  const year = 2000 + decodeBcd(data[6]!, 'manufacture year');
  try {
    return { serialNumber, manufactureDate: makeDateTime(year, month, day) };
  } catch {
    throw new MeterReaderError(
      `Invalid meter manufacture date: ${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`,
    );
  }
}

function decodeMeterTypeResponse(
  response: Buffer,
  address: number,
  mode: ChecksumMode,
): MeterType {
  const size = checksumSize(mode);
  if (response.length < 2 + size)
    throw new MeterReaderError(
      `Meter-type response is too short: ${hexBytes(response)}`,
    );
  const body = verifyChecksum(response, mode, 'meter-type response');
  verifyAddress(response, address);
  const data = body.subarray(1);
  if (data.length === 1) throwStatus(data[0]!);
  if (data.length !== 3) {
    throw new MeterReaderError(
      `Expected 3 meter-variant data bytes, received ${data.length}: ${hexBytes(response)}`,
    );
  }
  const rawCode = data[2]!;
  const swappedCode = ((rawCode & 0x0f) << 4) | (rawCode >>> 4);
  const highNibble = rawCode >>> 4;
  const typeCode =
    rawCode in METER_TYPE_NAMES
      ? rawCode
      : highNibble in METER_TYPE_NAMES
        ? highNibble
        : swappedCode;
  const details = decodeMeterVariantDetails(data, typeCode);
  return {
    model:
      METER_TYPE_NAMES[typeCode] ??
      `Unknown meter type code ${formatHex(typeCode)}`,
    typeCode,
    rawData: data,
    details,
  };
}

function decodeMeterVariantDetails(data: Buffer, typeCode: number): string[] {
  const activeAccuracy = (data[0]! >>> 6) & 0x03;
  const reactiveAccuracy = (data[0]! >>> 4) & 0x03;
  const voltageCode = (data[0]! >>> 2) & 0x03;
  const currentCode = data[0]! & 0x03;
  const directionsCode = (data[1]! >>> 7) & 0x01;
  const temperatureCode = (data[1]! >>> 6) & 0x01;
  const phasesCode = (data[1]! >>> 5) & 0x01;
  const constantCode = data[1]! & 0x07;
  const accuracyClasses = ['0,2 %', '0,5 %', '1,0 %', '2,0 %'];
  const voltages = ['57,7 В', '120–230 В'];
  const currents = ['5 А', '1 А', '10 А'];
  const constants = [5000, 25000, 1250, 6250, 500, 250, 6400];
  const describe = <T>(values: readonly T[], code: number): string =>
    code < values.length ? String(values[code]) : `неизвестный код ${code}`;

  const details = [
    `Класс точности активной энергии: ${accuracyClasses[activeAccuracy]}`,
    `Класс точности реактивной энергии: ${accuracyClasses[reactiveAccuracy]}`,
    `Номинальное напряжение: ${describe(voltages, voltageCode)}`,
    `Номинальный ток: ${describe(currents, currentCode)}`,
    `Число направлений учета: ${directionsCode === 0 ? 2 : 1}`,
    `Температурный диапазон: ${temperatureCode === 0 ? '−20…+55 °C' : '−40…+55 °C'}`,
    `Число фаз: ${phasesCode === 0 ? 3 : 1}`,
    `Постоянная счетчика: ${describe(constants, constantCode)} имп/кВт·ч (имп/квар·ч)`,
  ];

  if (typeCode === 0x0d) {
    const executionCode = (data[2]! >>> 3) & 0x01;
    const backupPowerCode = (data[2]! >>> 2) & 0x01;
    const currentConnectionCode = (data[2]! >>> 1) & 0x01;
    const digitalInputCode = data[2]! & 0x01;
    const accountingMode =
      directionsCode === 0
        ? 'двунаправленный учет активной и реактивной энергии (4 канала)'
        : executionCode === 0
          ? 'однонаправленный учет активной энергии по модулю (1 канал)'
          : 'комбинированный учет: активная энергия по модулю, реактивная двунаправленно (3 канала)';
    details.push(
      `Исполнение: ${accountingMode}`,
      `Резервный источник питания: ${backupPowerCode === 0 ? 'есть' : 'нет'}`,
      `Подключение по току: ${currentConnectionCode === 0 ? 'трансформаторное' : 'непосредственное'}`,
      `Цифровой вход: ${digitalInputCode === 0 ? 'нет' : 'есть'}`,
    );
  }

  return details;
}

function decodePowerMaximum(
  data: Buffer,
  offset: number,
  label: string,
): PowerMaximum {
  return {
    minute: decodeBcd(data[offset]!, `${label} minute`),
    hour: decodeBcd(data[offset + 1]!, `${label} hour`),
    day: decodeBcd(data[offset + 2]!, `${label} day`),
    month: decodeBcd(data[offset + 3]!, `${label} month`),
    year: 2000 + decodeBcd(data[offset + 4]!, `${label} year`),
    value: data.readUInt16BE(offset + 5),
    rawTimestamp: data.subarray(offset, offset + 5),
  };
}

function decodePowerMaximaResponse(
  response: Buffer,
  address: number,
  mode: ChecksumMode,
): PowerMaxima {
  const size = checksumSize(mode);
  if (response.length !== 2 + 19 + size) {
    throw new MeterReaderError(
      `Expected 19 power-maximum data bytes, received ${Math.max(0, response.length - 2 - size)}: ${hexBytes(response)}`,
    );
  }
  const body = verifyChecksum(response, mode, 'power-maximum response');
  verifyAddress(response, address);
  if (response[1] !== 0) throwStatus(response[1]!);
  const data = body.subarray(2);
  return {
    morning: decodePowerMaximum(data, 0, 'morning'),
    evening: decodePowerMaximum(data, 7, 'evening'),
    integrationMinutes: data[14]!,
    currentRatio: data.readUInt16BE(15),
    voltageRatio: data.readUInt16BE(17),
  };
}

function decodeProfilePointerResponse(
  response: Buffer,
  address: number,
  mode: ChecksumMode,
): ProfilePointer {
  const size = checksumSize(mode);
  if (response.length < 2 + size)
    throw new MeterReaderError(
      `Profile-pointer response is too short: ${hexBytes(response)}`,
    );
  const body = verifyChecksum(response, mode, 'profile-pointer response');
  verifyAddress(response, address);
  const data = body.subarray(1);
  if (data.length === 1) throwStatus(data[0]!);
  if (data.length !== 7) {
    throw new MeterReaderError(
      `Expected 7 profile-pointer bytes, received ${data.length}: ${hexBytes(response)}`,
    );
  }
  const minute = decodeBcd(data[0]! & 0x7f, 'profile pointer minute');
  const hour = decodeBcd(data[1]!, 'profile pointer hour');
  const day = decodeBcd(data[2]!, 'profile pointer day');
  const month = decodeBcd(data[3]!, 'profile pointer month');
  const shortYear = decodeBcd(data[4]!, 'profile pointer year');
  const year = shortYear < 70 ? 2000 + shortYear : 1900 + shortYear;
  let timestamp: DateTime;
  try {
    timestamp = makeDateTime(year, month, day, hour, minute);
  } catch {
    throw new MeterReaderError(
      `Invalid profile-pointer timestamp: ${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
    );
  }
  const memoryAddress = data.readUInt16BE(5);
  if (memoryAddress % PROFILE_RECORD_SIZE) {
    throw new MeterReaderError(
      `Profile pointer ${formatHex(memoryAddress, 4)} is not record-aligned`,
    );
  }
  return { timestamp, memoryAddress };
}

function decodeProfileMemoryResponse(
  response: Buffer,
  address: number,
  requestId: number,
  count: number,
  mode: ChecksumMode,
): Buffer {
  const size = checksumSize(mode);
  if (response.length < 3 + size)
    throw new MeterReaderError(
      `Profile-memory response is too short: ${hexBytes(response)}`,
    );
  const body = verifyChecksum(response, mode, 'profile-memory response');
  verifyAddress(response, address);
  if (response[1] !== requestId) {
    throw new MeterReaderError(
      `Profile response id ${formatHex(response[1]!)} does not match request id ${formatHex(requestId)}`,
    );
  }
  const data = body.subarray(2);
  if (data.length === 1) throwStatus(data[0]!);
  if (data.length !== count) {
    throw new MeterReaderError(
      `Expected ${count} profile-memory bytes, received ${data.length}: ${hexBytes(response)}`,
    );
  }
  return data;
}

function decodeShortProfileMemoryResponse(
  response: Buffer,
  address: number,
  count: number,
  mode: ChecksumMode,
): Buffer {
  const size = checksumSize(mode);
  if (response.length < 2 + size)
    throw new MeterReaderError(
      `Profile-memory response is too short: ${hexBytes(response)}`,
    );
  const body = verifyChecksum(response, mode, 'profile-memory response');
  verifyAddress(response, address);
  const data = body.subarray(1);
  if (data.length === 1) throwStatus(data[0]!);
  if (data.length !== count) {
    throw new MeterReaderError(
      `Expected ${count} profile-memory bytes, received ${data.length}: ${hexBytes(response)}`,
    );
  }
  return data;
}

function decodeProfileHeader(
  header: Buffer,
): { timestamp: DateTime; interval: number; season: number } | undefined {
  if (
    header.length !== PROFILE_RECORD_SIZE ||
    header.every((value) => value === 0)
  )
    return undefined;
  if (
    (header.subarray(0, 6).reduce((sum, value) => sum + value, 0) & 0xff) !==
    header[6]
  )
    return undefined;
  try {
    const hour = decodeBcd(header[0]!, 'profile hour');
    const day = decodeBcd(header[1]!, 'profile day');
    const month = decodeBcd(header[2]!, 'profile month');
    const shortYear = decodeBcd(header[3]!, 'profile year');
    const year = shortYear < 70 ? 2000 + shortYear : 1900 + shortYear;
    if (
      hour > 23 ||
      (header[4] !== 0 && header[4] !== 1) ||
      header[5]! < 1 ||
      header[5]! > 60
    ) {
      return undefined;
    }
    return {
      timestamp: makeDateTime(year, month, day, hour),
      interval: header[5]!,
      season: header[4]!,
    };
  } catch {
    return undefined;
  }
}

function dateTimeToMinutes(value: DateTime): number {
  return Math.floor(
    Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute) /
      60_000,
  );
}

function addMinutes(value: DateTime, minutes: number): DateTime {
  const date = new Date(DateTimeToMilliseconds(value) + minutes * 60_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function DateTimeToMilliseconds(value: DateTime): number {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
  );
}

function decodeProfileArray(
  memory: Buffer,
  pointer: ProfilePointer,
): ProfileSlice[] {
  const cutoff =
    dateTimeToMinutes(pointer.timestamp) - PROFILE_MAX_AGE_HOURS * 60;
  const pointerTime = dateTimeToMinutes(pointer.timestamp);
  const slices: ProfileSlice[] = [];

  for (
    let headerAddress = 0;
    headerAddress <= memory.length - PROFILE_RECORD_SIZE;
    headerAddress += PROFILE_RECORD_SIZE
  ) {
    const decodedHeader = decodeProfileHeader(
      memory.subarray(headerAddress, headerAddress + PROFILE_RECORD_SIZE),
    );
    if (!decodedHeader) continue;
    const { timestamp: blockTime, interval, season } = decodedHeader;
    const samplesPerHour = Math.ceil(60 / interval);
    const blockEnd = headerAddress + (samplesPerHour + 1) * PROFILE_RECORD_SIZE;
    if (blockEnd > memory.length) continue;

    for (let sampleIndex = 0; sampleIndex < samplesPerHour; sampleIndex++) {
      const sampleAddress =
        headerAddress + (sampleIndex + 1) * PROFILE_RECORD_SIZE;
      const timestamp = addMinutes(blockTime, sampleIndex * interval);
      const sampleTime = dateTimeToMinutes(timestamp);
      if (sampleTime < cutoff || sampleTime >= pointerTime) continue;
      const rawValues = [0, 1, 2, 3].map((index) =>
        memory.readUInt16BE(sampleAddress + index * 2),
      );
      slices.push({
        timestamp,
        intervalMinutes: interval,
        season,
        memoryAddress: sampleAddress,
        values: rawValues.map((value) => value & 0x7fff) as [
          number,
          number,
          number,
          number,
        ],
        incomplete: rawValues.map((value) => Boolean(value & 0x8000)) as [
          boolean,
          boolean,
          boolean,
          boolean,
        ],
      });
    }
  }

  return slices.sort(
    (left, right) =>
      dateTimeToMinutes(left.timestamp) - dateTimeToMinutes(right.timestamp) ||
      left.memoryAddress - right.memoryAddress,
  );
}

function decodeChannelResponse(
  response: Buffer,
  address: number,
  mode: ChecksumMode,
  operation: string,
): void {
  const size = checksumSize(mode);
  if (response.length !== 2 + size)
    throw new MeterReaderError(
      `Unexpected ${operation} response: ${hexBytes(response)}`,
    );
  verifyChecksum(response, mode, `${operation} response`);
  if (response[0] !== address) {
    throw new MeterReaderError(
      `${operation[0]!.toUpperCase()}${operation.slice(1)} response address ${formatHex(response[0]!)} does not match meter address ${formatHex(address)}`,
    );
  }
  if (response[1] !== 0)
    throwStatus(response[1]!, ` while attempting to ${operation}`);
}

async function withMeterConnection<T>(
  config: ConnectionConfig,
  mode: ChecksumMode,
  timeout: number,
  password: string | undefined,
  operation: (connection: MeterConnection) => Promise<T>,
): Promise<T> {
  const connection = await MeterConnection.open(
    config.host,
    config.port,
    timeout,
  );
  const ackSize = 2 + checksumSize(mode);
  let opened = false;
  let result: T | undefined;
  let operationError: unknown;

  try {
    try {
      if (password !== undefined) {
        await connection.send(
          buildChannelRequest(config.address, 0x01, mode, password),
        );
        const response = await connection.receive(timeout, ackSize);
        decodeChannelResponse(response, config.address, mode, 'open channel');
        opened = true;
      }
      result = await operation(connection);
    } catch (error) {
      operationError = error;
    }

    if (opened) {
      try {
        await connection.send(buildChannelRequest(config.address, 0x02, mode));
        const response = await connection.receive(timeout, ackSize);
        decodeChannelResponse(response, config.address, mode, 'close channel');
      } catch (error) {
        process.stderr.write(
          `Warning: could not confirm channel close: ${errorMessage(error)}\n`,
        );
      }
    }
  } finally {
    connection.close();
  }

  if (operationError !== undefined) throw operationError;
  if (result === undefined) throw new MeterReaderError('No data was returned');
  return result;
}

function checksumModes(option: ChecksumOption): ChecksumMode[] {
  return option === 'auto' ? ['ks', 'crc'] : [option];
}

async function tryChecksumModes<T>(
  option: ChecksumOption,
  operationLabel: string,
  read: (mode: ChecksumMode) => Promise<T>,
): Promise<{ value: T; mode: ChecksumMode }> {
  const errors: string[] = [];
  for (const mode of checksumModes(option)) {
    try {
      return { value: await read(mode), mode };
    } catch (error) {
      if (error instanceof MeterStatusError) throw error;
      errors.push(`${mode.toUpperCase()}: ${errorMessage(error)}`);
    }
  }
  throw new MeterReaderError(
    `Could not read ${operationLabel} (${errors.join('; ')})`,
  );
}

async function readEnergy(
  config: ConnectionConfig,
  options: Options,
  password?: string,
): Promise<{ value: number[]; mode: ChecksumMode }> {
  return tryChecksumModes(options.checksum, 'energy data', (mode) =>
    withMeterConnection(
      config,
      mode,
      options.timeout,
      password,
      async (connection) => {
        await connection.send(
          buildEnergyRequest(
            config.address,
            options.array,
            options.month,
            options.tariff,
            mode,
          ),
        );
        const response = await connection.receive(
          options.timeout,
          2 + 16 + checksumSize(mode),
        );
        return decodeEnergyResponse(response, config.address, mode);
      },
    ),
  );
}

async function readMeterIdentity(
  config: ConnectionConfig,
  options: Options,
  password?: string,
): Promise<{ value: MeterIdentity; mode: ChecksumMode }> {
  return tryChecksumModes(options.checksum, 'meter number', (mode) =>
    withMeterConnection(
      config,
      mode,
      options.timeout,
      password,
      async (connection) => {
        await connection.send(buildMeterIdentityRequest(config.address, mode));
        const response = await connection.receive(
          options.timeout,
          1 + 7 + checksumSize(mode),
        );
        return decodeMeterIdentityResponse(response, config.address, mode);
      },
    ),
  );
}

async function readMeterType(
  config: ConnectionConfig,
  options: Options,
  password?: string,
): Promise<{ value: MeterType; mode: ChecksumMode }> {
  return tryChecksumModes(options.checksum, 'meter type', (mode) =>
    withMeterConnection(
      config,
      mode,
      options.timeout,
      password,
      async (connection) => {
        await connection.send(buildMeterTypeRequest(config.address, mode));
        const response = await connection.receive(
          options.timeout,
          1 + 3 + checksumSize(mode),
        );
        return decodeMeterTypeResponse(response, config.address, mode);
      },
    ),
  );
}

async function readPowerMaxima(
  config: ConnectionConfig,
  options: Options,
  password?: string,
): Promise<{ value: PowerMaxima; mode: ChecksumMode }> {
  return tryChecksumModes(options.checksum, 'power maxima', (mode) =>
    withMeterConnection(
      config,
      mode,
      options.timeout,
      password,
      async (connection) => {
        await connection.send(
          buildPowerMaximaRequest(
            config.address,
            options.maximaProfile,
            options.powerType,
            mode,
          ),
        );
        const response = await connection.receive(
          options.timeout,
          2 + 19 + checksumSize(mode),
        );
        return decodePowerMaximaResponse(response, config.address, mode);
      },
    ),
  );
}

async function readProfileArray(
  config: ConnectionConfig,
  options: Options,
  password?: string,
  shortRequests = false,
  targetDate?: DateTime | 'latest',
): Promise<{ value: PowerProfile; mode: ChecksumMode }> {
  if (options.profile !== 0 && options.profile !== 1)
    throw new MeterReaderError('Profile array must be 0 or 1');
  if (shortRequests && options.profile !== 0) {
    throw new MeterReaderError('This meter supports only profile array 0');
  }
  if (options.checksum === 'ks') {
    throw new MeterReaderError(
      'Historical profile reads use the extended request with CRC checksum',
    );
  }

  try {
    const value = await withMeterConnection(
      config,
      'crc',
      options.timeout,
      password,
      async (connection) => {
        const profile = options.profile!;
        await connection.send(
          shortRequests
            ? buildSingleProfilePointerRequest(config.address, 'crc')
            : buildProfilePointerRequest(config.address, profile, 'crc'),
        );
        const pointerResponse = await connection.receive(
          options.timeout,
          1 + 7 + 2,
        );
        const pointer = decodeProfilePointerResponse(
          pointerResponse,
          config.address,
          'crc',
        );
        const memoryId =
          profile === 0 ? PROFILE_MEMORY_IDS[0] : PROFILE_MEMORY_IDS[1];
        let requestId = 1;
        const readMemory = async (
          memoryAddress: number,
          count: number,
        ): Promise<Buffer> => {
          if (shortRequests) {
            await connection.send(
              buildShortProfileMemoryRequest(
                config.address,
                memoryId,
                memoryAddress,
                count,
                'crc',
              ),
            );
            const response = await connection.receive(
              options.timeout,
              1 + count + 2,
            );
            return decodeShortProfileMemoryResponse(
              response,
              config.address,
              count,
              'crc',
            );
          }
          await connection.send(
            buildProfileMemoryRequest(
              config.address,
              requestId,
              memoryId,
              memoryAddress,
              count,
              'crc',
            ),
          );
          const response = await connection.receive(
            options.timeout,
            2 + count + 2,
          );
          const chunk = decodeProfileMemoryResponse(
            response,
            config.address,
            requestId,
            count,
            'crc',
          );
          requestId = (requestId + 1) & 0xff;
          return chunk;
        };
        const firstHeader = await readMemory(0, PROFILE_RECORD_SIZE);
        const decodedHeader = decodeProfileHeader(firstHeader);
        if (!decodedHeader) {
          throw new MeterReaderError(
            'Profile header at address 0x0000 is invalid; cannot bound the profile array',
          );
        }

        const samplesPerHour = Math.ceil(60 / decodedHeader.interval);
        const blockSize = (samplesPerHour + 1) * PROFILE_RECORD_SIZE;
        const readableSize =
          Math.floor(PROFILE_MEMORY_SIZE / blockSize) * blockSize;
        const chunkSize = shortRequests
          ? PROFILE_SHORT_READ_CHUNK_SIZE
          : PROFILE_READ_CHUNK_SIZE;
        if (targetDate) {
          const date = targetDate === 'latest' ? pointer.timestamp : targetDate;
          const pointerHeaderOffset =
            (Math.floor(pointer.timestamp.minute / decodedHeader.interval) +
              1) *
            PROFILE_RECORD_SIZE;
          const pointerHeaderAddress =
            (((pointer.memoryAddress - pointerHeaderOffset) % readableSize) +
              readableSize) %
            readableSize;
          const pointerHourStart = {
            ...pointer.timestamp,
            minute: 0,
          };
          const targetHourStart = {
            ...date,
            hour: 0,
            minute: 0,
          };
          const hoursFromPointer =
            (dateTimeToMinutes(targetHourStart) -
              dateTimeToMinutes(pointerHourStart)) /
            60;
          if (!Number.isInteger(hoursFromPointer)) {
            throw new MeterReaderError(
              'Target profile date is not aligned to an hour',
            );
          }
          const firstHeaderAddress =
            (((pointerHeaderAddress + hoursFromPointer * blockSize) %
              readableSize) +
              readableSize) %
            readableSize;
          const slices: ProfileSlice[] = [];
          for (let hour = 0; hour < 24; hour++) {
            const headerAddress =
              (firstHeaderAddress + hour * blockSize) % readableSize;
            const block = Buffer.alloc(blockSize);
            for (let offset = 0; offset < blockSize; offset += chunkSize) {
              const count = Math.min(chunkSize, blockSize - offset);
              const part = await readMemory(headerAddress + offset, count);
              part.copy(block, offset);
            }
            const header = decodeProfileHeader(
              block.subarray(0, PROFILE_RECORD_SIZE),
            );
            const expectedHour = {
              ...date,
              hour,
              minute: 0,
            };
            if (
              !header ||
              header.timestamp.year !== expectedHour.year ||
              header.timestamp.month !== expectedHour.month ||
              header.timestamp.day !== expectedHour.day ||
              header.timestamp.hour !== expectedHour.hour ||
              header.interval !== decodedHeader.interval
            ) {
              continue;
            }
            for (
              let sampleIndex = 0;
              sampleIndex < samplesPerHour;
              sampleIndex++
            ) {
              const timestamp = addMinutes(
                header.timestamp,
                sampleIndex * header.interval,
              );
              const sampleTime = dateTimeToMinutes(timestamp);
              const cutoff =
                dateTimeToMinutes(pointer.timestamp) -
                PROFILE_MAX_AGE_HOURS * 60;
              if (
                sampleTime < cutoff ||
                sampleTime >= dateTimeToMinutes(pointer.timestamp)
              )
                continue;
              const sampleAddress =
                PROFILE_RECORD_SIZE + sampleIndex * PROFILE_RECORD_SIZE;
              const rawValues = [0, 1, 2, 3].map((index) =>
                block.readUInt16BE(sampleAddress + index * 2),
              );
              slices.push({
                timestamp,
                intervalMinutes: header.interval,
                season: header.season,
                memoryAddress: headerAddress + sampleAddress,
                values: rawValues.map((value) => value & 0x7fff) as [
                  number,
                  number,
                  number,
                  number,
                ],
                incomplete: rawValues.map((value) =>
                  Boolean(value & 0x8000),
                ) as [boolean, boolean, boolean, boolean],
              });
            }
          }
          return { pointer, slices };
        }
        const memory = Buffer.alloc(readableSize);
        firstHeader.copy(memory, 0);

        for (
          let memoryAddress = PROFILE_RECORD_SIZE;
          memoryAddress < readableSize;
          memoryAddress += chunkSize
        ) {
          const count = Math.min(chunkSize, readableSize - memoryAddress);
          const chunk = await readMemory(memoryAddress, count);
          chunk.copy(memory, memoryAddress);
          if ((memoryAddress - PROFILE_RECORD_SIZE) % (chunkSize * 128) === 0) {
            const progress = Math.floor(
              (memoryAddress * 100) / PROFILE_MEMORY_SIZE,
            );
            process.stderr.write(
              `Reading profile array: ${progress}% (address ${formatHex(memoryAddress, 4)})\n`,
            );
          }
        }
        process.stderr.write('Reading profile array: 100% (complete)\n');
        return { pointer, slices: decodeProfileArray(memory, pointer) };
      },
    );
    return { value, mode: 'crc' };
  } catch (error) {
    if (error instanceof MeterStatusError) throw error;
    throw new MeterReaderError(
      `Could not read profile array ${options.profile} (CRC: ${errorMessage(error)})`,
    );
  }
}

export type MeterNumberReading = {
  mode: ChecksumMode;
  serialNumber: string;
  /// DD.MM.YYYY, as the CLI prints it.
  manufactureDate: string;
};

export type MeterProfileReading = {
  meterType: string;
  meterTypeCode: number;
  pointer: string;
  profile: number;
  slices: {
    timestamp: string;
    intervalMinutes: number;
    season: number;
    values: [number, number, number, number];
    incomplete: [boolean, boolean, boolean, boolean];
  }[];
};

/// Read profile array 0 for the latest day recorded by the meter.
export async function readMeterProfile(
  config: ConnectionConfig,
  timeout = 10,
): Promise<MeterProfileReading> {
  const options: Options = {
    config: '',
    array: 0,
    month: 0,
    tariff: 0,
    maxima: false,
    meterNumber: false,
    meterType: false,
    profile: 0,
    maximaProfile: 0,
    powerType: 0,
    checksum: 'crc',
    openChannel: true,
    timeout,
    voltageRatio: 1,
    currentRatio: 1,
  };
  const { value: meterType } = await readMeterType(
    config,
    options,
    config.password,
  );
  const shortRequests = meterType.typeCode === 0x09;
  const { value } = await readProfileArray(
    config,
    options,
    config.password,
    shortRequests,
    'latest',
  );

  return {
    meterType: meterType.model,
    meterTypeCode: meterType.typeCode,
    pointer: formatDateTime(value.pointer.timestamp),
    profile: 0,
    slices: value.slices.map((slice) => ({
      timestamp: formatDateTime(slice.timestamp),
      intervalMinutes: slice.intervalMinutes,
      season: slice.season,
      values: slice.values,
      incomplete: slice.incomplete,
    })),
  };
}

/// Status a meter returns when it only answers after the channel is opened.
const STATUS_CHANNEL_NOT_OPEN = 0x05;

/// What `--meter-number` does: serial number and manufacture date, auto
/// checksum. Used by the app's Connect button. Reads without opening the
/// channel first; if the meter answers that the channel is not open, retries
/// as with --open-channel, using the configured password.
export async function readMeterNumber(
  config: ConnectionConfig,
  timeout = 3,
): Promise<MeterNumberReading> {
  const options: Options = {
    config: '',
    array: 0,
    month: 0,
    tariff: 0,
    maxima: false,
    meterNumber: true,
    meterType: false,
    maximaProfile: 0,
    powerType: 0,
    checksum: 'auto',
    openChannel: true,
    timeout,
    voltageRatio: 1,
    currentRatio: 1,
  };
  let result: { value: MeterIdentity; mode: ChecksumMode };
  try {
    result = await readMeterIdentity(config, options);
  } catch (error) {
    if (
      !(error instanceof MeterStatusError) ||
      error.status !== STATUS_CHANNEL_NOT_OPEN
    )
      throw error;
    result = await readMeterIdentity(config, options, config.password);
  }
  const { value, mode } = result;
  const date = value.manufactureDate;
  return {
    mode,
    serialNumber: value.serialNumber,
    manufactureDate: `${date.day.toString().padStart(2, '0')}.${date.month.toString().padStart(2, '0')}.${date.year}`,
  };
}

function formatDateTime(value: DateTime): string {
  return `${value.year.toString().padStart(4, '0')}-${value.month.toString().padStart(2, '0')}-${value.day.toString().padStart(2, '0')} ${value.hour.toString().padStart(2, '0')}:${value.minute.toString().padStart(2, '0')}`;
}

function formatPowerTimestamp(maximum: PowerMaximum): string {
  if (
    maximum.minute > 59 ||
    maximum.hour > 23 ||
    maximum.day < 1 ||
    maximum.day > 31 ||
    maximum.month < 1 ||
    maximum.month > 12
  ) {
    return `invalid (raw timestamp bytes: ${hexBytes(maximum.rawTimestamp)})`;
  }
  return `${maximum.hour.toString().padStart(2, '0')}:${maximum.minute.toString().padStart(2, '0')} ${maximum.day.toString().padStart(2, '0')}.${maximum.month.toString().padStart(2, '0')}.${maximum.year.toString().padStart(4, '0')}`;
}

function parseIntegerOption(value: string, option: string): number {
  if (!/^[+-]?\d+$/.test(value))
    throw new CliError(
      `${option}: expected an integer, received ${JSON.stringify(value)}`,
    );
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new CliError(`${option}: integer is out of range`);
  return number;
}

function parsePositiveFloat(value: string, option: string): number {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number))
    throw new CliError(`${option}: must be a number`);
  if (number <= 0) throw new CliError(`${option}: must be greater than zero`);
  return number;
}

const USAGE = `Usage: node meter_reader.ts [options]

Read energy registers, meter type/number, historical interval profiles, or
morning/evening power maxima from a SET-4TM-series meter over TCP.
Without options, reads historical profile data for 12.10.2026.

Options:
  --config PATH           Connection file (default: connection.md beside script)
  --array N               Energy array number, 0–5 (default: 0)
  --month N               Month number, 0–12 (default: 0)
  --tariff N              Tariff number, 0–8 (default: 0 = all tariffs)
  --maxima                Read morning/evening power maxima
  --meter-number          Read meter serial number and manufacture date
  --meter-type            Read meter model/execution variant
  --profile N             Read historical profile array: 0 = first, 1 = second
  --maxima-profile N      Profile for --maxima: 0 or 1 (default: 0)
  --power-type N          --maxima type: 0=P+, 1=P-, 2=Q+, 3=Q- (default: 0)
  --checksum MODE         auto, ks, or crc (default: auto; profile requires CRC)
  --open-channel          Open channel with configured password, read, then close
  --timeout SECONDS       Response timeout (default: 3)
  --meter-constant VALUE Meter constant for physical-unit conversion
  --voltage-ratio VALUE   Voltage transformer ratio (default: 1)
  --current-ratio VALUE   Current transformer ratio (default: 1)
  -h, --help              Show this help
`;

function parseOptions(argv: string[]): Options | undefined {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const options: Options = {
    config: resolve(scriptDirectory, 'connection.md'),
    array: 0,
    month: 0,
    tariff: 0,
    maxima: false,
    meterNumber: false,
    meterType: false,
    maximaProfile: 0,
    powerType: 0,
    checksum: 'auto',
    openChannel: false,
    timeout: 3,
    voltageRatio: 1,
    currentRatio: 1,
  };
  let operationCount = 0;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === '--help' || argument === '-h') return undefined;
    if (argument === '--open-channel') {
      options.openChannel = true;
      continue;
    }
    if (
      argument === '--maxima' ||
      argument === '--meter-number' ||
      argument === '--meter-type'
    ) {
      operationCount++;
      if (argument === '--maxima') options.maxima = true;
      else if (argument === '--meter-number') options.meterNumber = true;
      else options.meterType = true;
      continue;
    }

    const equalsAt = argument.indexOf('=');
    const name = equalsAt > 0 ? argument.slice(0, equalsAt) : argument;
    const inlineValue = equalsAt > 0 ? argument.slice(equalsAt + 1) : undefined;
    const supported = [
      '--config',
      '--array',
      '--month',
      '--tariff',
      '--profile',
      '--maxima-profile',
      '--power-type',
      '--checksum',
      '--timeout',
      '--meter-constant',
      '--voltage-ratio',
      '--current-ratio',
    ];
    if (!supported.includes(name))
      throw new CliError(`unrecognized argument: ${argument}`);
    const value = inlineValue ?? argv[++index];
    if (value === undefined || value.startsWith('--'))
      throw new CliError(`${name}: expected a value`);

    switch (name) {
      case '--config':
        options.config = resolve(value);
        break;
      case '--array':
        options.array = parseIntegerOption(value, name);
        break;
      case '--month':
        options.month = parseIntegerOption(value, name);
        break;
      case '--tariff':
        options.tariff = parseIntegerOption(value, name);
        break;
      case '--profile': {
        const parsed = parseIntegerOption(value, name);
        if (parsed !== 0 && parsed !== 1)
          throw new CliError(`${name}: choose from 0, 1`);
        options.profile = parsed;
        operationCount++;
        break;
      }
      case '--maxima-profile': {
        const parsed = parseIntegerOption(value, name);
        if (parsed !== 0 && parsed !== 1)
          throw new CliError(`${name}: choose from 0, 1`);
        options.maximaProfile = parsed;
        break;
      }
      case '--power-type': {
        const parsed = parseIntegerOption(value, name);
        if (parsed < 0 || parsed > 3)
          throw new CliError(`${name}: choose from 0, 1, 2, 3`);
        options.powerType = parsed;
        break;
      }
      case '--checksum':
        if (value !== 'auto' && value !== 'ks' && value !== 'crc') {
          throw new CliError(`${name}: choose from auto, ks, crc`);
        }
        options.checksum = value;
        break;
      case '--timeout':
        options.timeout = parsePositiveFloat(value, name);
        break;
      case '--meter-constant':
        options.meterConstant = parsePositiveFloat(value, name);
        break;
      case '--voltage-ratio':
        options.voltageRatio = parsePositiveFloat(value, name);
        break;
      case '--current-ratio':
        options.currentRatio = parsePositiveFloat(value, name);
        break;
    }
  }

  if (operationCount > 1)
    throw new CliError(
      '--maxima, --meter-number, --meter-type, and --profile are mutually exclusive',
    );
  return options;
}

function formatDecimal(value: number): string {
  return value.toFixed(4);
}

async function main(): Promise<number> {
  let options: Options | undefined;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Error: ${errorMessage(error)}\n`);
    process.stderr.write(USAGE);
    return 2;
  }
  if (!options) {
    process.stdout.write(USAGE);
    return 0;
  }

  try {
    if (options.array < 0 || options.array > 5)
      throw new MeterReaderError('Array must be between 0 and 5');
    if (options.month < 0 || options.month > 12)
      throw new MeterReaderError('Month must be between 0 and 12');
    if (options.tariff < 0 || options.tariff > 8)
      throw new MeterReaderError('Tariff must be between 0 and 8');
    const config = await loadConnection(options.config);
    const password = options.openChannel ? config.password : undefined;

    if (options.meterNumber) {
      const { value, mode } = await readMeterIdentity(
        config,
        options,
        password,
      );
      console.log(
        `Read from meter address ${config.address} using ${mode.toUpperCase()} checksum.`,
      );
      console.log(`Meter number: ${value.serialNumber}`);
      console.log(
        `Manufacture date: ${value.manufactureDate.day.toString().padStart(2, '0')}.${value.manufactureDate.month.toString().padStart(2, '0')}.${value.manufactureDate.year}`,
      );
      return 0;
    }

    if (options.meterType) {
      const { value, mode } = await readMeterType(config, options, password);
      console.log(
        `Read from meter address ${config.address} using ${mode.toUpperCase()} checksum.`,
      );
      console.log(`Meter type: ${value.model}`);
      console.log(
        `Данные варианта исполнения: ${hexBytes(value.rawData).toUpperCase()}`,
      );
      for (const detail of value.details) console.log(`  ${detail}`);
      return 0;
    }

    if (options.profile !== undefined) {
      const { value, mode } = await readProfileArray(config, options, password);
      process.stderr.write(
        `Read from meter address ${config.address} using ${mode.toUpperCase()} checksum.\n`,
      );
      process.stderr.write(
        `Profile array: ${options.profile}; pointer: ${formatDateTime(value.pointer.timestamp)} at ${formatHex(value.pointer.memoryAddress, 4)}; slices: ${value.slices.length}\n`,
      );
      console.log(
        'timestamp,interval_minutes,season,memory_address,p_plus_count,p_plus_incomplete,p_minus_count,p_minus_incomplete,q_plus_count,q_plus_incomplete,q_minus_count,q_minus_incomplete',
      );
      for (const profileSlice of value.slices) {
        const row = [
          formatDateTime(profileSlice.timestamp),
          profileSlice.intervalMinutes,
          profileSlice.season,
          formatHex(profileSlice.memoryAddress, 4),
          profileSlice.values[0],
          Number(profileSlice.incomplete[0]),
          profileSlice.values[1],
          Number(profileSlice.incomplete[1]),
          profileSlice.values[2],
          Number(profileSlice.incomplete[2]),
          profileSlice.values[3],
          Number(profileSlice.incomplete[3]),
        ];
        console.log(row.join(','));
      }
      return 0;
    }

    if (options.maxima) {
      const { value, mode } = await readPowerMaxima(config, options, password);
      console.log(
        `Read from meter address ${config.address} using ${mode.toUpperCase()} checksum.`,
      );
      console.log(
        `Power profile: ${options.maximaProfile}; type: ${[...POWER_LABELS][options.powerType]!}`,
      );
      for (const [label, maximum] of [
        ['Morning', value.morning],
        ['Evening', value.evening],
      ] as const) {
        const timestamp = formatPowerTimestamp(maximum);
        if (options.meterConstant === undefined) {
          console.log(
            `${label} maximum: ${maximum.value} internal counts at ${timestamp}`,
          );
        } else if (value.integrationMinutes === 0) {
          console.log(
            `${label} maximum: ${maximum.value} internal counts at ${timestamp}; cannot convert (zero integration time)`,
          );
        } else {
          const power =
            (maximum.value *
              value.integrationMinutes *
              value.currentRatio *
              value.voltageRatio) /
            (2 * options.meterConstant * 60);
          console.log(
            `${label} maximum: ${formatDecimal(power)} kW at ${timestamp} (${maximum.value} internal counts)`,
          );
        }
      }
      console.log(
        `Integration: ${value.integrationMinutes} min; Kt: ${value.currentRatio}; Kn: ${value.voltageRatio}`,
      );
      return 0;
    }

    const { value, mode } = await readEnergy(config, options, password);
    console.log(
      `Read from meter address ${config.address} using ${mode.toUpperCase()} checksum.`,
    );
    console.log(
      `Energy array: ${options.array}; month: ${options.month}; tariff: ${options.tariff}`,
    );
    for (const [index, count] of value.entries()) {
      const label = ENERGY_LABELS[index]!;
      if (options.meterConstant === undefined) {
        console.log(`${label}: ${count} internal counts`);
      } else {
        const energy =
          (count * options.voltageRatio * options.currentRatio) /
          (2 * options.meterConstant);
        const unit = label.startsWith('A') ? 'kWh' : 'kvarh';
        console.log(
          `${label}: ${formatDecimal(energy)} ${unit} (${count} internal counts)`,
        );
      }
    }
    return 0;
  } catch (error) {
    process.stderr.write(`Error: ${errorMessage(error)}\n`);
    return 1;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  if (process.argv.length > 2) {
    process.exitCode = await main();
  } else {
    try {
      const config = parseConnection({
        ip: '37.9.240.12',
        port: '6001',
        address: '80',
      });
      const targetDate: DateTime = {
        year: 2026,
        month: 10,
        day: 12,
        hour: 0,
        minute: 0,
      };
      const targetDateLabel = '12.10.2026';
      const options: Options = {
        config: '',
        array: 0,
        month: 0,
        tariff: 0,
        maxima: false,
        meterNumber: false,
        meterType: false,
        profile: 0,
        maximaProfile: 0,
        powerType: 0,
        checksum: 'crc',
        openChannel: false,
        timeout: 10,
        voltageRatio: 1,
        currentRatio: 1,
      };
      const { value: meterType } = await readMeterType(
        config,
        options,
        config.password,
      );
      const shortRequests = meterType.typeCode === 0x09;
      const profiles = shortRequests ? [0] : [0, 1];
      for (const profile of profiles) {
        options.profile = profile;
        const { value, mode } = await readProfileArray(
          config,
          options,
          config.password,
          shortRequests,
          targetDate,
        );
        console.log(
          `Profile array: ${profile}; read using ${mode.toUpperCase()} checksum.`,
        );
        console.log(
          `Pointer: ${formatDateTime(value.pointer.timestamp)} at ${formatHex(value.pointer.memoryAddress, 4)}`,
        );
        console.log(
          shortRequests
            ? 'timestamp,interval_minutes,season,memory_address,p_plus_raw,p_plus_incomplete,voltage_raw,voltage_incomplete,current_raw,current_incomplete,temperature_raw,temperature_incomplete'
            : 'timestamp,interval_minutes,season,memory_address,p_plus_count,p_plus_incomplete,p_minus_count,p_minus_incomplete,q_plus_count,q_plus_incomplete,q_minus_count,q_minus_incomplete',
        );
        const matchingSlices = value.slices;
        if (matchingSlices.length === 0) {
          console.log(`No records found for ${targetDateLabel}.`);
          continue;
        }
        for (const profileSlice of matchingSlices) {
          const row = [
            formatDateTime(profileSlice.timestamp),
            profileSlice.intervalMinutes,
            profileSlice.season,
            formatHex(profileSlice.memoryAddress, 4),
            profileSlice.values[0],
            Number(profileSlice.incomplete[0]),
            profileSlice.values[1],
            Number(profileSlice.incomplete[1]),
            profileSlice.values[2],
            Number(profileSlice.incomplete[2]),
            profileSlice.values[3],
            Number(profileSlice.incomplete[3]),
          ];
          console.log(row.join(','));
        }
      }
    } catch (error) {
      console.error(`Error: ${errorMessage(error)}`);
      process.exitCode = 1;
    }
  }
}
