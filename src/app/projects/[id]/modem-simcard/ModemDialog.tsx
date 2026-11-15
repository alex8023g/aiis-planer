'use client';

import { Pencil, Plus } from 'lucide-react';
import { useId, useState, useTransition, type SubmitEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Field,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  defaultSimChannel,
  MAIN_SIM_SLOT,
  RESERVE_SIM_SLOT,
} from '@/lib/sim-card';
import type { ProjectModem } from '@/lib/tis';
import { Channel } from '@/lib/types';

import { createModem, updateModem, type ModemFields } from './actions';

const channelOptions = [
  { value: Channel.Gprs, label: 'GPRS' },
  { value: Channel.Csd, label: 'CSD' },
];

/// Порт, на котором модемы обычно слушают опрос.
const defaultPort = '6001';

const emptyFields: ModemFields = {
  type: '',
  imei: '',
  port: defaultPort,
  channel: defaultSimChannel(MAIN_SIM_SLOT),
  simNumber: '',
  ip: '',
  provider: '',
  reserveChannel: defaultSimChannel(RESERVE_SIM_SLOT),
  reserveSimNumber: '',
  reserveIp: '',
  reserveProvider: '',
};

function fieldsOf(modem: ProjectModem): ModemFields {
  return {
    type: modem.type ?? '',
    imei: modem.imei ?? '',
    port: modem.port ?? defaultPort,
    channel: modem.channelValue,
    simNumber: modem.simNumber ?? '',
    ip: modem.ip ?? '',
    provider: modem.provider ?? '',
    reserveChannel: modem.reserveChannelValue,
    reserveSimNumber: modem.reserveSimNumber ?? '',
    reserveIp: modem.reserveIp ?? '',
    reserveProvider: modem.reserveProvider ?? '',
  };
}

/// Добавление модема с сим-картой, а с modem — правка выбранного. Все поля
/// необязательны: модем заводят, ещё не зная о нём всего, и дописывают потом.
export function ModemDialog({
  projectId,
  modem,
}: {
  projectId: string;
  modem?: ProjectModem;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(emptyFields);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const title = modem ? 'Изменить модем' : 'Добавить модем с сим-картой';

  /// Форма живёт, пока смонтирован диалог, поэтому при каждом открытии
  /// заполняем её заново: пустой или полями модема.
  function handleOpenChange(next: boolean) {
    if (next) {
      setFields(modem ? fieldsOf(modem) : emptyFields);
      setSubmitError(null);
    }
    setOpen(next);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    startTransition(async () => {
      const result = modem
        ? await updateModem(projectId, modem.id, fields)
        : await createModem(projectId, fields);

      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  function input(
    key: Exclude<keyof ModemFields, 'channel' | 'reserveChannel'>,
    label: string,
    mono = false,
    placeholder?: string,
  ) {
    const id = `modem-${key}-${fieldId}`;

    return (
      <Field>
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          name={key}
          autoComplete='off'
          placeholder={placeholder}
          className={mono ? 'font-mono' : undefined}
          value={fields[key]}
          onChange={(event) =>
            setFields((prev) => ({ ...prev, [key]: event.target.value }))
          }
        />
      </Field>
    );
  }

  function channelInput(key: 'channel' | 'reserveChannel') {
    const id = `modem-${key}-${fieldId}`;

    return (
      <Field>
        <Label id={id}>Канал</Label>
        <RadioGroup
          aria-labelledby={id}
          value={fields[key]}
          onValueChange={(value) =>
            setFields((prev) => ({ ...prev, [key]: value as Channel }))
          }
          className='flex-row gap-6'
        >
          {channelOptions.map(({ value, label }) => (
            <Label
              key={value}
              className='gap-2 font-normal'
              htmlFor={`${id}-${value}`}
            >
              <RadioGroupItem id={`${id}-${value}`} value={value} />
              {label}
            </Label>
          ))}
        </RadioGroup>
      </Field>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant='outline'>
            {modem ? <Pencil /> : <Plus />}
            {title}
          </Button>
        }
      />
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className='grid gap-4'>
          <FieldGroup className='gap-3'>
            {input('type', 'Тип модема')}
            {input('imei', 'IMEI', true)}
            {input('port', 'Порт', true, defaultPort)}
          </FieldGroup>
          <div className='grid gap-4 sm:grid-cols-2'>
            <FieldSet>
              <FieldLegend variant='label'>SIM 1 — основная</FieldLegend>
              <FieldGroup className='gap-3'>
                {channelInput('channel')}
                {input('simNumber', '№ SIM-карты')}
                {fields.channel !== Channel.Csd && input('ip', 'IP', true)}
                {input('provider', 'Оператор')}
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant='label'>SIM 2 — запасная</FieldLegend>
              <FieldGroup className='gap-3'>
                {channelInput('reserveChannel')}
                {input('reserveSimNumber', '№ SIM-карты')}
                {fields.reserveChannel !== Channel.Csd &&
                  input('reserveIp', 'IP', true)}
                {input('reserveProvider', 'Оператор')}
              </FieldGroup>
            </FieldSet>
          </div>
          <DialogFooter>
            {submitError && (
              <p className='mr-auto self-center text-sm text-destructive'>
                {submitError}
              </p>
            )}
            <DialogClose render={<Button variant='outline'>Отмена</Button>} />
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Сохранение…' : modem ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
