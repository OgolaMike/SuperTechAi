export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi';
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
    timeZone: getLocalTimeZone(),
  }).format(date);
}

export function formatLocalDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: getLocalTimeZone(),
  }).format(date);
}


export function formatLocalTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: getLocalTimeZone(),
  }).format(date);
}
