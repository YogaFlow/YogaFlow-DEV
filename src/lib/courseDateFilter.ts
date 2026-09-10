import {
  isToday,
  isTomorrow,
  isWithinInterval,
  parseISO,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { formatDate } from './format';

export type DateFilterPreset = 'today' | 'tomorrow' | 'thisWeek' | 'custom';

export type CourseDateFilterState = {
  preset: DateFilterPreset | null;
  customDate: string | null;
};

export const EMPTY_DATE_FILTER: CourseDateFilterState = {
  preset: null,
  customDate: null,
};

const WEEK_OPTS = { weekStartsOn: 1 as const, locale: de };

export function formatFilterDateLabel(isoDate: string): string {
  return formatDate(isoDate) || isoDate;
}

export function matchesCourseDateFilter(
  courseDate: string,
  state: CourseDateFilterState
): boolean {
  if (!state.preset) return true;

  let parsed: Date;
  try {
    parsed = parseISO(courseDate);
  } catch {
    return false;
  }

  switch (state.preset) {
    case 'today':
      return isToday(parsed);
    case 'tomorrow':
      return isTomorrow(parsed);
    case 'thisWeek': {
      const now = new Date();
      return isWithinInterval(parsed, {
        start: startOfWeek(now, WEEK_OPTS),
        end: endOfWeek(now, WEEK_OPTS),
      });
    }
    case 'custom':
      return state.customDate !== null && courseDate === state.customDate;
    default:
      return true;
  }
}

/** Date-Objekt -> "YYYY-MM-DD" in Ortszeit. Kein UTC, keine Verschiebung. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function selectPreset(
  current: CourseDateFilterState,
  preset: Exclude<DateFilterPreset, 'custom'>
): CourseDateFilterState {
  if (current.preset === preset) {
    return EMPTY_DATE_FILTER;
  }
  return { preset, customDate: null };
}

export function selectCustomDate(isoDate: string): CourseDateFilterState {
  return { preset: 'custom', customDate: isoDate };
}

export function clearDateFilter(): CourseDateFilterState {
  return EMPTY_DATE_FILTER;
}
