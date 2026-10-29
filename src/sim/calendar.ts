// Game time is a day count from 1 January of the scenario's start year. These helpers
// convert it to a Gregorian date with integer arithmetic only, so they behave the same
// on every JavaScript engine.

export interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

// Howard Hinnant's days_from_civil / civil_from_days algorithms.
/** Days since 1970-01-01 for a calendar date. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): CalendarDate {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function dateOfDay(startYear: number, dayIndex: number): CalendarDate {
  return civilFromDays(daysFromCivil(startYear, 1, 1) + dayIndex);
}

export function dayOfDate(startYear: number, date: CalendarDate): number {
  return daysFromCivil(date.year, date.month, date.day) - daysFromCivil(startYear, 1, 1);
}

/** "HH:MM:SS" for a fraction of a day. */
export function formatTimeOfDay(dayFraction: number): string {
  const seconds = Math.min(86399, Math.max(0, Math.floor(dayFraction * 86400)));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

export function daysInMonth(year: number, month: number): number {
  return month === 12 ? 31 : daysFromCivil(year, month + 1, 1) - daysFromCivil(year, month, 1);
}

export function formatDate(date: CalendarDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}
