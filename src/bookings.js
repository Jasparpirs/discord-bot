import { join } from "node:path";
import { DATA_DIR, SLOT_HOURS } from "./config.js";
import { readJSON, writeJSON } from "./store.js";

// Persists remote-session bookings so a booked slot stays locked across
// redeploys. Stored as a flat array:
//   [{ id, userId, channelId, serviceId, start, createdAt }]
// `start` is an absolute UTC epoch (ms). Each session reserves a SLOT_MS
// window, and no two bookings may start within SLOT_MS of each other, so
// sessions never overlap.
const FILE = join(DATA_DIR, "bookings.json");
const HOUR = 60 * 60 * 1000;
export const SLOT_MS = Math.max(1, SLOT_HOURS) * HOUR;

function load() {
  const data = readJSON(FILE, []);
  return Array.isArray(data) ? data : [];
}
function save(list) {
  writeJSON(FILE, list);
}

// Drop bookings whose window ended more than a day ago, so the file stays lean.
function prune(list) {
  const cutoff = Date.now() - 24 * HOUR;
  return list.filter((b) => b.start + SLOT_MS > cutoff);
}

// The booking whose window collides with a session starting at `start`
// (within SLOT_MS either side), ignoring `excludeId`. null if the slot is free.
function clashIn(list, start, excludeId) {
  return list.find((b) => b.id !== excludeId && Math.abs(b.start - start) < SLOT_MS) || null;
}

// Next whole-hour start at or after `from` that clears the spacing rule.
function nextFreeIn(list, from, excludeId) {
  let t = Math.ceil(from / HOUR) * HOUR;
  for (let i = 0; i < 24 * 90; i++) {
    if (!clashIn(list, t, excludeId)) return t;
    t += HOUR;
  }
  return null;
}

export function listBookings() {
  return [...prune(load())].sort((a, b) => a.start - b.start);
}

export function upcomingBookings() {
  const now = Date.now();
  return listBookings().filter((b) => b.start + SLOT_MS > now);
}

// Create or move a user's booking after a conflict check. A user holds one
// upcoming booking at a time, so rebooking replaces their previous slot.
// Returns { ok:true, booking, rescheduledFrom } or { ok:false, conflict, suggestion }.
export function book({ userId, channelId, serviceId, start }) {
  const list = prune(load());
  const mine = list.find((b) => b.userId === userId && b.start + SLOT_MS > Date.now());
  const excludeId = mine?.id || null;

  const clash = clashIn(list, start, excludeId);
  if (clash) {
    return { ok: false, conflict: clash, suggestion: nextFreeIn(list, start, excludeId) };
  }

  const kept = list.filter((b) => b.id !== excludeId);
  const booking = {
    id: `${userId}-${start}`,
    userId,
    channelId: channelId || null,
    serviceId: serviceId || "",
    start,
    createdAt: Date.now(),
  };
  kept.push(booking);
  save(kept);
  return { ok: true, booking, rescheduledFrom: mine || null };
}

// Flag a booking as reminded so the reminder sweep only fires once (survives
// redeploys). Returns true if it flipped it (false if already reminded/gone).
export function markReminded(id) {
  const list = load();
  const b = list.find((x) => x.id === id);
  if (!b || b.reminded) return false;
  b.reminded = true;
  save(list);
  return true;
}

export function cancelByUser(userId) {
  const list = load();
  const next = list.filter((b) => b.userId !== userId);
  if (next.length === list.length) return false;
  save(next);
  return true;
}

export function cancelByChannel(channelId) {
  if (!channelId) return false;
  const list = load();
  const next = list.filter((b) => b.channelId !== channelId);
  if (next.length === list.length) return false;
  save(next);
  return true;
}
