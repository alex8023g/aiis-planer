export type tiData = {
  id: string;
  tiNumber: string;
  tiName: string;
  currentMeter: {
    type: string;
    number: string;
    isCompliant: boolean | undefined;
  };
  newMeter: {
    type: string | undefined;
    number: string | undefined;
    isCompliant: true;
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
        number: string | undefined;
        ratio: string | undefined;
      }
    | null
    | undefined;
  currentModem: {
    kind: 'built-in' | 'external';
  } | null;
  newModem: {
    kind: 'built-in' | 'external';
    type: string | undefined | null;
    number: string | undefined;
  };
  connection: {
    meterAddress: string | undefined;
    port: string | undefined;
    channel: 'gprs' | 'csd';
  };
  simCard: {
    number: string | undefined;
    ip: string | undefined;
    provider: string | undefined;
  };
};
