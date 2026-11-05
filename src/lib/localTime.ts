const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi';

export function getLocalTimeZone(): string {
  return LOCAL_TIME_ZONE;
}

export function formatLocalDateTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: LOCAL_TIME_ZONE,
    timeZoneName: 'short',
  }).format(date);
}

export function formatLocalDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: LOCAL_TIME_ZONE,
  }).format(date);
}
