/**
 * Pure time helpers.
 *
 * `new Date()` and `Date.now()` are banned in this package (§4.2), but converting an
 * instant the caller handed us into a calendar day is not ambient time — it is
 * arithmetic. Care-days (§5.6) and daily resets (§5.3, §5.10) both key off a UTC day, so
 * the conversion lives here rather than being reinvented per system.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/**
 * The simulation's fixed step (§4.3). One sim minute. Fixed steps are what make the result
 * independent of how an interval gets chopped up, which is what makes multi-device play
 * agree.
 */
export const MS_PER_TICK = MS_PER_MINUTE;

/**
 * The longest absence worth simulating (§4.3). A player gone a year finds a very hungry
 * Jelly Bean rather than a request timeout, and an abandoned save costs bounded work when
 * it eventually wakes up.
 */
export const MAX_CATCHUP_MS = 30 * MS_PER_DAY;

/** The number of whole UTC days since the Unix epoch. */
export function utcDayNumber(ms: number): number {
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * `YYYY-MM-DD` for an instant, UTC. Howard Hinnant's civil-from-days, which is exact for
 * every value we will ever see and involves no calendar library.
 */
export function utcDayKey(ms: number): string {
  const z = utcDayNumber(ms) + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);

  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
