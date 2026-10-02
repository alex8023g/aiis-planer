import type { Channel, ModemKind } from '@/lib/types';

export type tiData = {
  id: string;
  tiNumber: string;
  tiName: string;
  currentMeter: {
    type: string;
    number: string;
    isCompliant: boolean;
    hasModem: boolean | undefined;
  };
  newMeter: {
    type: string | undefined;
    number: string | undefined;
    isCompliant: true;
    hasModem: boolean;
  } | null;
  tt:
    | {
        type: [string, string | null, string] | undefined;
        number: [string, string | null, string] | undefined;
        ratio: string | undefined;
      }
    | null
    | undefined;
  tn:
    | {
        type: string | [string, string, string] | undefined;
        number: string | [string, string, string] | undefined;
        ratio: string | undefined;
      }
    | null
    | undefined;
  uspd: {
    type: string | undefined;
    number: string | undefined;
  } | null;
  sidePolling:
    | {
        description: string;
      }
    | null
    | undefined;
  // currentModem: {
  //   kind: ModemKind;
  // } | null;
  newModem: {
    kind: ModemKind;
    type: string | undefined | null;
    number: string | undefined | null;
  };
  connection: {
    meterAddress: string | undefined;
    port: string | undefined;
    channel: Channel;
  };
  simCard: {
    number: string | undefined;
    ip: string | undefined;
    provider: string | undefined;
  };
};
