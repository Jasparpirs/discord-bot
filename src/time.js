import { SCHEDULE_TZ, SCHEDULE_UTC_OFFSET } from "./config.js";

// Convert a wall-clock time typed in the business timezone into a real UTC
// epoch. When SCHEDULE_TZ is a valid IANA zone (e.g. "Europe/Tallinn") this is
// DST-aware — the +3/+2 switch is handled automatically, nothing to change
// twice a year. If SCHEDULE_TZ isn't a recognized zone, it falls back to the
// fixed SCHEDULE_UTC_OFFSET number.

function isValidZone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const ZONE = isValidZone(SCHEDULE_TZ) ? SCHEDULE_TZ : null;

// Offset (zone − UTC) in ms at a given absolute instant.
function zoneOffsetMs(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return asUTC - instant.getTime();
}

// Wall-clock (y, mo[1-12], d, hh, mm) in the business zone → UTC epoch (ms).
export function wallTimeToUtc(y, mo, d, hh, mm) {
  const wallAsUTC = Date.UTC(y, mo - 1, d, hh, mm);
  if (!ZONE) return wallAsUTC - (SCHEDULE_UTC_OFFSET || 0) * 3600000;
  // Estimate with the offset at the wall instant, then refine once so times
  // near a DST boundary resolve to the correct instant.
  let offset = zoneOffsetMs(new Date(wallAsUTC));
  offset = zoneOffsetMs(new Date(wallAsUTC - offset));
  return wallAsUTC - offset;
}
