import { join } from "node:path";
import { MessageFlags } from "discord.js";
import { DATA_DIR } from "./config.js";
import { readJSON, writeJSON } from "./store.js";
import { compatibleCard, giveawayMessage, giveawayEndedMessage, giveawayResultMessage } from "./ui.js";

const FILE = join(DATA_DIR, "giveaways.json");
const timers = new Map(); // messageId -> timeout

// --- Persistence -----------------------------------------------------------
function load() {
  const list = readJSON(FILE, []);
  return Array.isArray(list) ? list : [];
}
function save(list) {
  writeJSON(FILE, list);
}
function find(id) {
  return load().find((g) => g.messageId === id) || null;
}
function upsert(giveaway) {
  const list = load().filter((g) => g.messageId !== giveaway.messageId);
  list.push(giveaway);
  save(list);
}

// --- Helpers ---------------------------------------------------------------
// "1h30m", "45m", "2d", "1w" -> milliseconds (or null if invalid).
export function parseDuration(input) {
  const re = /(\d+)\s*(w|d|h|m|s)/gi;
  const units = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000 };
  let ms = 0;
  let matched = false;
  for (const [, n, u] of input.matchAll(re)) {
    ms += Number(n) * units[u.toLowerCase()];
    matched = true;
  }
  return matched && ms > 0 ? ms : null;
}

function pickWinners(entrants, count) {
  const pool = [...entrants];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

// --- Public API ------------------------------------------------------------
export async function startGiveaway(client, { channel, prize, durationMs, winners, hostId }) {
  const endTime = Date.now() + durationMs;
  const draft = { messageId: "pending", channelId: channel.id, prize, endTime, winners, hostId, entrants: [], ended: false };
  const msg = await channel.send(giveawayMessage({ ...draft, entryCount: 0 }));
  draft.messageId = msg.id;
  upsert(draft);
  scheduleEnd(client, draft.messageId, durationMs);
  return msg;
}

export async function toggleEntry(interaction, messageId) {
  const g = find(messageId);
  if (!g || g.ended) {
    return interaction.reply({ content: "This giveaway has ended.", flags: MessageFlags.Ephemeral });
  }
  const uid = interaction.user.id;
  let msg;
  if (g.entrants.includes(uid)) {
    g.entrants = g.entrants.filter((id) => id !== uid);
    msg = "You've left the giveaway.";
  } else {
    g.entrants.push(uid);
    msg = "You're entered — good luck!";
  }
  upsert(g);

  // Live-update the giveaway message with the new entry count.
  await interaction.message
    .edit(compatibleCard(interaction.message, giveawayMessage({ prize: g.prize, endTime: g.endTime, winners: g.winners, hostId: g.hostId, entryCount: g.entrants.length })))
    .catch(() => {});

  return interaction.reply({ content: `${msg} (${g.entrants.length} entered)`, flags: MessageFlags.Ephemeral });
}

// Show everyone (privately) who has entered a giveaway.
export async function listEntrants(interaction, messageId) {
  const g = find(messageId);
  if (!g) {
    return interaction.reply({ content: "This giveaway is no longer tracked.", flags: MessageFlags.Ephemeral });
  }
  if (!g.entrants.length) {
    return interaction.reply({ content: "No one has entered yet — be the first!", flags: MessageFlags.Ephemeral });
  }
  const shown = g.entrants.slice(0, 60).map((id) => `<@${id}>`).join(", ");
  const extra = g.entrants.length > 60 ? ` …and ${g.entrants.length - 60} more` : "";
  return interaction.reply({
    content: `**${g.entrants.length} entered:**\n${shown}${extra}`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

// setTimeout overflows (and fires immediately) past ~24.8 days, so break long
// waits into chunks — durations can be weeks (e.g. "4w").
const MAX_DELAY = 2_147_483_647;
function scheduleEnd(client, messageId, delayMs) {
  clearTimeout(timers.get(messageId));
  const ms = Math.max(0, delayMs);
  if (ms > MAX_DELAY) {
    const t = setTimeout(() => scheduleEnd(client, messageId, ms - MAX_DELAY), MAX_DELAY);
    timers.set(messageId, t);
    return;
  }
  const t = setTimeout(() => endGiveaway(client, messageId).catch((e) => console.error("giveaway end error:", e)), ms);
  timers.set(messageId, t);
}

export async function endGiveaway(client, messageId) {
  const g = find(messageId);
  if (!g || g.ended) return false;
  g.ended = true;
  upsert(g);
  timers.delete(messageId);

  const winners = pickWinners(g.entrants, g.winners);

  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return false;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (message) await message.edit(compatibleCard(message, giveawayEndedMessage({ ...g, winners }))).catch(() => {});

  await channel
    .send(giveawayResultMessage({ prize: g.prize, winners, messageUrl: message?.url }))
    .catch(() => {});
  return true;
}

export async function reroll(client, messageId) {
  const g = find(messageId);
  if (!g) return { ok: false, reason: "No giveaway found for that message ID in my records." };
  if (!g.entrants.length) return { ok: false, reason: "That giveaway had no entrants to reroll." };
  const winners = pickWinners(g.entrants, g.winners);
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (channel) {
    await channel.send(giveawayResultMessage({ prize: g.prize, winners, reroll: true })).catch(() => {});
  }
  return { ok: true, winners };
}

// Reschedule everything on startup; end anything already past.
export function resumeGiveaways(client) {
  for (const g of load()) {
    if (g.ended) continue;
    const remaining = g.endTime - Date.now();
    if (remaining <= 0) endGiveaway(client, g.messageId).catch(() => {});
    else scheduleEnd(client, g.messageId, remaining);
  }
}
