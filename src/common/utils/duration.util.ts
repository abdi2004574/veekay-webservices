import ms from 'ms';

export type DurationString = Parameters<typeof ms>[0];

export function parseDurationMs(value: string): number {
  return ms(value as DurationString);
}

export function asDurationString(value: string): DurationString {
  return value as DurationString;
}
