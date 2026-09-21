import { startOfDay, endOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, format, parseISO } from 'date-fns';

export const DATE_PRESETS = [
  { label: 'Today', getRange: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }) },
  { label: 'This Week', getRange: () => ({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: new Date() }) },
  { label: 'This Month', getRange: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: 'This Quarter', getRange: () => ({ start: startOfQuarter(new Date()), end: new Date() }) },
  { label: 'This Year', getRange: () => ({ start: startOfYear(new Date()), end: new Date() }) },
];

export function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return 'All Time';
  if (start && !end) return `From ${format(parseISO(start), 'MMM d, yyyy')}`;
  if (!start && end) return `Until ${format(parseISO(end), 'MMM d, yyyy')}`;
  return `${format(parseISO(start!), 'MMM d, yyyy')} - ${format(parseISO(end!), 'MMM d, yyyy')}`;
}
