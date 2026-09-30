import { noticeDM } from "./ui.js";
import { join } from "node:path";
import { ChannelType } from "discord.js";
import { LOG_CHANNEL_ID, MODMAIL_CHANNEL_ID, DATA_DIR } from "./config.js";
import { readJSON, writeJSON } from "./store.js";

// Use a dedicated modmail channel if set, otherwise the log channel.
const CH = MODMAIL_CHANNEL_ID || LOG_CHANNEL_ID;

const FILE = join(DATA_DIR, "modmail.json");

// { users: { <userId>: threadId }, threads: { <threadId>: userId } }
function load() {
  return readJSON(FILE, { users: {}, threads: {} });
}
function save(data) {
  writeJSON(FILE, data);
}

export const modmailEnabled = () => Boolean(CH);

function attachments(message) {
  return message.attachments.size ? " " + [...message.attachments.values()].map((a) => a.url).join(" ") : "";
}

// Get (or create) the modmail thread for a user. Returns { thread, isNew }.
async function threadForUser(client, user) {
  const data = load();
  const existingId = data.users[user.id];
  if (existingId) {
    const t = await client.channels.fetch(existingId).catch(() => null);
    if (t) {
      if (t.archived) await t.setArchived(false).catch(() => {});
      return { thread: t, isNew: false };
    }
  }

  const channel = await client.channels.fetch(CH).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return { thread: null, isNew: false };

  const thread = await channel.threads.create({
    name: `dm-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90) || "dm",
    autoArchiveDuration: 1440,
  });
  await thread
    .send(noticeDM(`Support · ${user.username}`, `Member ID: ${user.id}\n\nReply in this thread to send a DM. Start a message with a period to keep it as a staff note.`))
    .catch(() => {});

  data.users[user.id] = thread.id;
  data.threads[thread.id] = user.id;
  save(data);
  return { thread, isNew: true };
}

// A user DM'd the bot — forward it into their thread.
export async function handleIncomingDM(client, message) {
  if (!modmailEnabled()) return;
  const { thread, isNew } = await threadForUser(client, message.author);
  if (!thread) return;

  const text = `**${message.author.username}:** ${message.content || ""}${attachments(message)}`.trim();
  await thread.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => {});

  if (isNew) {
    await message.author.send("Thanks for reaching out — the team will reply here shortly.").catch(() => {});
  }
}

// Is this message a staff reply inside a modmail thread?
export function isModmailThread(channel) {
  return channel?.isThread?.() && channel.parentId === CH && Boolean(load().threads[channel.id]);
}

// Relay a staff message from the thread to the user's DM.
export async function relayStaffReply(client, message) {
  const userId = load().threads[message.channel.id];
  if (!userId) return;
  // A message starting with "." is a private staff note — not relayed.
  if (message.content.startsWith(".")) return;
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;

  const body = `${message.content || ""}${attachments(message)}`.trim();
  if (!body) return;
  try {
    await user.send(body.slice(0, 1900));
    await message.react("✅").catch(() => {});
  } catch {
    await message.reply("Couldn't deliver — this user has DMs closed.").catch(() => {});
  }
}
