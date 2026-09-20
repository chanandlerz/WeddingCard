import type { RsvpStatus } from './api';

export const STATUS_OPTIONS: Array<{ value: RsvpStatus; label: string }> = [
  { value: 'hadir', label: 'Yes' },
  { value: 'tidak', label: 'No' },
  { value: 'ragu', label: 'Uncertain' },
];

export const STATUS_LABEL: Record<RsvpStatus, string> = {
  hadir: 'Attending',
  tidak: 'Unable to Attend',
  ragu: 'Uncertain',
};

export const STATUS_BADGE_CLASS: Record<RsvpStatus, string> = {
  hadir: 'bg-emerald-100 text-emerald-800',
  tidak: 'bg-rose-100 text-rose-800',
  ragu: 'bg-amber-100 text-amber-800',
};
