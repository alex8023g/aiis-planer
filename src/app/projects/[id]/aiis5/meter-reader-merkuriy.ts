import { createConnection, type Socket } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

export type ConnectionConfig = { host: string; port: number; address: number };

export type MeterNumberReading = {
  mode: 'crc';
  serialNumber: string;
  manufactureDate: string;
};

class MeterReaderError extends Error {}

function errorMessageMerkuriy(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseNumberMerkuriy(value: string, field: string): number {
  const trimmed = value.trim();
  const valid =
    /^0[xX][0-9a-fA-F]+$/.test(trimmed) || /^[+-]?\d+$/.test(trimmed);
  const number = valid ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(number)) {
    throw new MeterReaderError(`Invalid ${field}: ${JSON.stringify(value)}`);
  }
  return number;
}

export function parseConnectionMerkuriy(raw: {
  ip: string;
  port: string;
  address: string;
}): ConnectionConfig {
  const host = raw.ip.trim();
  if (!isIP(host))
    throw new MeterReaderError(`Invalid IP address: ${JSON.stringify(raw.ip)}`);

  const port = parseNumberMerkuriy(raw.port, 'port');
  const address = parseNumberMerkuriy(raw.address, 'meter address');
  if (port < 1 || port > 65535)
    throw new MeterReaderError('Port must be between 1 and 65535');
  if (address < 0 || address > 0xf0) {
    throw new MeterReaderError(
      'Mercury meter address must be between 0 and 240',
    );
  }
  return { host, port, address };
}

async function loadConnectionMerkuriy(path: string): Promise<ConnectionConfig> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    throw new MeterReaderError(
      `Cannot read ${path}: ${errorMessageMerkuriy(error)}`,
    );
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
      `Missing setting(s) in ${path}: ${missing.join(', ')}`,
    );
  }
  return parseConnectionMerkuriy({
    ip: values.get('ip')!,
    port: values.get('port')!,
    address: values.get('address')!,
  });
}

function hexBytesMerkuriy(data: Buffer): string {
  return [...data]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ');
}

function modbusCrcMerkuriy(data: Buffer): number {
  let crc = 0xffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

function addCrc(data: Buffer): Buffer {
  const crc = modbusCrcMerkuriy(data);
  return Buffer.concat([data, Buffer.from([crc & 0xff, crc >>> 8])]);
}

function buildMeterIdentityRequestMerkuriy(address: number): Buffer {
  return addCrc(Buffer.from([address, 0x08, 0x00]));
}

function decodeMeterIdentityResponseMerkuriy(
  response: Buffer,
  address: number,
): MeterNumberReading {
  if (response.length < 4) {
    throw new MeterReaderError(
      `Meter-identity response is too short: ${hexBytesMerkuriy(response)}`,
    );
  }
  if (response[0] !== address) {
    throw new MeterReaderError(
      `Response address 0x${response[0]!.toString(16).toUpperCase().padStart(2, '0')} does not match meter address 0x${address.toString(16).toUpperCase().padStart(2, '0')}`,
    );
  }

  const body = response.subarray(0, -2);
  const expectedCrc = addCrc(body).subarray(-2);
  if (!response.subarray(-2).equals(expectedCrc)) {
    throw new MeterReaderError(
      `Invalid CRC checksum in meter-identity response: ${hexBytesMerkuriy(response)}`,
    );
  }

  const data = body.subarray(1);
  if (data.length === 1) {
    const status = data[0]! & 0x0f;
    const messages: Readonly<Record<number, string>> = {
      0x01: 'invalid command or parameter',
      0x02: 'internal meter error',
      0x03: 'insufficient access level',
      0x05: 'communication channel is not open',
    };
    throw new MeterReaderError(
      `Meter returned status 0x${status.toString(16).toUpperCase()}: ${messages[status] ?? 'unknown meter status'}`,
    );
  }
  if (data.length !== 7) {
    throw new MeterReaderError(
      `Expected 7 meter-identity data bytes, received ${data.length}: ${hexBytesMerkuriy(response)}`,
    );
  }

  const serialBytes = data.subarray(0, 4);
  const serialNumber = [...serialBytes]
    .map((value) => value.toString().padStart(2, '0'))
    .join('');
  const day = data[4]!;
  const month = data[5]!;
  const year = 2000 + data[6]!;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new MeterReaderError(
      `Invalid meter manufacture date: ${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`,
    );
  }

  return {
    mode: 'crc',
    serialNumber,
    manufactureDate: `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`,
  };
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
      this.notifyMerkuriy();
    });
    socket.on('end', () => {
      this.ended = true;
      this.notifyMerkuriy();
    });
    socket.on('close', () => {
      this.ended = true;
      this.notifyMerkuriy();
    });
    socket.on('error', (error: Error) => {
      this.socketError = error;
      this.notifyMerkuriy();
    });
  }

  static async openMerkuriy(
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

  sendMerkuriy(data: Buffer): Promise<void> {
    return new Promise((resolvePromise, rejectPromise) => {
      this.socket.write(data, (error?: Error | null) =>
        error ? rejectPromise(error) : resolvePromise(),
      );
    });
  }

  async receiveMerkuriy(
    timeout: number,
    expectedSize: number,
  ): Promise<Buffer> {
    const deadline = Date.now() + timeout * 1000;
    while (true) {
      if (this.buffer.length >= expectedSize)
        return this.takeBufferMerkuriy(expectedSize);
      if (this.socketError || this.ended) {
        if (this.buffer.length)
          return this.takeBufferMerkuriy(this.buffer.length);
        if (this.socketError) throw this.socketError;
        throw new MeterReaderError(
          'The server closed the connection without a response',
        );
      }

      const now = Date.now();
      const remaining = deadline - now;
      if (remaining <= 0) {
        if (this.buffer.length)
          return this.takeBufferMerkuriy(this.buffer.length);
        throw new MeterReaderError('Timed out waiting for a meter response');
      }

      const idleRemaining = this.buffer.length
        ? 250 - (now - this.lastDataAt)
        : remaining;
      if (this.buffer.length && idleRemaining <= 0)
        return this.takeBufferMerkuriy(this.buffer.length);
      await this.waitMerkuriy(Math.max(1, Math.min(remaining, idleRemaining)));
    }
  }

  closeMerkuriy(): void {
    this.socket.destroy();
  }

  private takeBufferMerkuriy(size: number): Buffer {
    const result = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return result;
  }

  private notifyMerkuriy(): void {
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.();
  }

  private waitMerkuriy(milliseconds: number): Promise<void> {
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

export async function readMeterNumberMerkuriy(
  config: ConnectionConfig,
  timeout = 3,
): Promise<MeterNumberReading> {
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new MeterReaderError('Timeout must be greater than zero');
  }

  const validatedConfig = parseConnectionMerkuriy({
    ip: config.host,
    port: String(config.port),
    address: String(config.address),
  });
  const connection = await MeterConnection.openMerkuriy(
    validatedConfig.host,
    validatedConfig.port,
    timeout,
  );
  try {
    await connection.sendMerkuriy(
      buildMeterIdentityRequestMerkuriy(validatedConfig.address),
    );
    const response = await connection.receiveMerkuriy(timeout, 10);
    return decodeMeterIdentityResponseMerkuriy(
      response,
      validatedConfig.address,
    );
  } finally {
    connection.closeMerkuriy();
  }
}

const USAGE = `Usage: node meter-reader-merkuriy.ts [options]

Read the serial number and manufacture date from a Mercury meter over TCP.
The meter's documented 08h/00h identity request does not require opening the
communication channel.

Options:
  --config PATH       Connection file (default: connection.md beside script)
  --timeout SECONDS   Connection and response timeout (default: 3)
  -h, --help          Show this help
`;

async function mainMerkuriy(argv: string[]): Promise<number> {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  let configPath = resolve(scriptDirectory, 'connection.md');
  let timeout = 3;

  try {
    for (let index = 0; index < argv.length; index++) {
      const argument = argv[index]!;
      if (argument === '--help' || argument === '-h') {
        process.stdout.write(USAGE);
        return 0;
      }

      const equalsAt = argument.indexOf('=');
      const name = equalsAt > 0 ? argument.slice(0, equalsAt) : argument;
      const inlineValue =
        equalsAt > 0 ? argument.slice(equalsAt + 1) : undefined;
      if (name !== '--config' && name !== '--timeout') {
        throw new MeterReaderError(`Unrecognized argument: ${argument}`);
      }
      const value = inlineValue ?? argv[++index];
      if (value === undefined || value.startsWith('--')) {
        throw new MeterReaderError(`${name}: expected a value`);
      }
      if (name === '--config') {
        configPath = resolve(value);
      } else {
        timeout = Number(value);
        if (!Number.isFinite(timeout) || timeout <= 0) {
          throw new MeterReaderError(`${name}: must be greater than zero`);
        }
      }
    }

    const config = await loadConnectionMerkuriy(configPath);
    const reading = await readMeterNumberMerkuriy(config, timeout);
    console.log(
      `Read from meter address ${config.address} using ${reading.mode.toUpperCase()} checksum.`,
    );
    console.log(`Meter number: ${reading.serialNumber}`);
    console.log(`Manufacture date: ${reading.manufactureDate}`);
    return 0;
  } catch (error) {
    process.stderr.write(`Error: ${errorMessageMerkuriy(error)}\n`);
    process.stderr.write(USAGE);
    return 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  process.exitCode = await mainMerkuriy(process.argv.slice(2));
}
