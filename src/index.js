import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActivityType,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  AttachmentBuilder,
} from "discord.js";
import {
  DISCORD_TOKEN,
  BOT_NAME,
  REVIEWS_CHANNEL_ID,
  LOG_CHANNEL_ID,
  VERIFY_ROLE_ID,
  WELCOME_CHANNEL_ID,
  MEMBERS_INTENT,
  SERVICE_BY_ID,
  PACKAGES,
  REMIND_BEFORE_MIN,
  DATA_DIR,
  STRIPE_SECRET_KEY,
} from "./config.js";
import { checkWritable } from "./store.js";
import {
  isOwner,
  isStaff,
  isTicketChannel,
  canCloseTicket,
  ticketOpenerId,
  ticketServiceId,
  ticketPaid,
  ticketTopic,
} from "./perms.js";
import {
  compatibleCard,
  salesMessages,
  tosMessage,
  rulesMessage,
  purchasePrompt,
  ticketPanelMessage,
  verifyPanelMessage,
  welcomeMessage,
  closeConfirmMessage,
  intakeModal,
  intakeCard,
  statsMessage,
  transcriptMessage,
  finishCard,
  noticeDM,
  scheduleModal,
  bookingCard,
  slotTakenMessage,
  scheduleInvalidMessage,
  bookingCancelledCard,
  bookingsListMessage,
  needsPaymentMessage,
  schedulePromptCard,
  sessionReminderDM,
  sessionReminderTicket,
  helpMessage,
} from "./ui.js";
import {
  startGiveaway,
  toggleEntry,
  listEntrants,
  endGiveaway,
  reroll,
  parseDuration,
  resumeGiveaways,
} from "./giveaways.js";
import { startStripeServer } from "./stripe.js";
import { handleIncomingDM, isModmailThread, relayStaffReply } from "./modmail.js";
import { addReview, getStats } from "./reviews.js";
import { book, cancelByUser, cancelByChannel, upcomingBookings, markReminded } from "./bookings.js";
import { createTicketChannel, findUserTicket } from "./tickets.js";
import { wallTimeToUtc } from "./time.js";

// Keep the bot alive through transient errors instead of crashing.
process.on("unhandledRejection", (e) => console.error("Unhandled rejection:", e));
process.on("uncaughtException", (e) => console.error("Uncaught exception:", e));

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, // modmail: read DM + staff-reply text
  GatewayIntentBits.DirectMessages,
  // Privileged — required for the join welcome AND exact /stats counts. You MUST
  // enable "Server Members Intent" in the Developer Portal → Bot, or login will
  // fail. MEMBERS_INTENT below only gates the heavier full-member fetch in /stats.
  GatewayIntentBits.GuildMembers,
];

const client = new Client({
  intents,
  partials: [Partials.Channel, Partials.Message],
});

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("What this bot can do and how to use it"),
  new SlashCommandBuilder().setName("tos").setDescription("View the Terms & Conditions"),
  new SlashCommandBuilder().setName("rules").setDescription("View the server rules"),
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Start a giveaway")
    .addStringOption((o) => o.setName("prize").setDescription("What are you giving away?").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("e.g. 30m, 1h, 2d, 1h30m").setRequired(true))
    .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(20).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("gend")
    .setDescription("End a giveaway now and announce the winner")
    .addStringOption((o) => o.setName("message_id").setDescription("The giveaway's message ID").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("Reroll the winner of an ended giveaway")
    .addStringOption((o) => o.setName("message_id").setDescription("The giveaway's message ID").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete a number of recent messages in this channel")
    .addIntegerOption((o) => o.setName("amount").setDescription("How many (1-100)").setMinValue(1).setMaxValue(100).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("grant")
    .setDescription("Give a customer their optimization package role")
    .addUserOption((o) => o.setName("user").setDescription("Customer").setRequired(true))
    .addStringOption((o) => {
      o.setName("package").setDescription("Which package?").setRequired(true);
      for (const p of PACKAGES) o.addChoices({ name: `${p.name} — ${p.price}`, value: p.id });
      return o;
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Remove a customer's optimization package role")
    .addUserOption((o) => o.setName("user").setDescription("Customer").setRequired(true))
    .addStringOption((o) => {
      o.setName("package").setDescription("Which package?").setRequired(true);
      for (const p of PACKAGES) o.addChoices({ name: `${p.name} — ${p.price}`, value: p.id });
      return o;
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID")
    .addStringOption((o) => o.setName("user_id").setDescription("User ID").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption((o) => o.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .addUserOption((o) => o.setName("user").setDescription("User to timeout").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("e.g. 10m, 1h, 1d (max 28d)").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a user's timeout")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("optimizations")
    .setDescription("Post the optimization sales panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Business dashboard: customers, revenue, reviews, tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("finish").setDescription("Mark this ticket's optimization complete and ask for a review"),
  new SlashCommandBuilder().setName("close").setDescription("Close the current ticket"),
  new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Post the open-a-ticket panel")
    .addChannelOption((o) => o.setName("channel").setDescription("Where to post (default: here)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("verifypanel")
    .setDescription("Post the verification panel")
    .addChannelOption((o) => o.setName("channel").setDescription("Where to post (default: here)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("bookings")
    .setDescription("View upcoming booked optimization sessions")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];

// ---------------------------------------------------------------------------
// Ready — register commands per-guild (instant) and clear stale global ones
// ---------------------------------------------------------------------------
const STATUSES = [
  "Optimizing PCs",
  "Open a ticket to start",
  "Book your session",
  "Performance Tuning",
];

// ---------------------------------------------------------------------------
// Session reminders — a 1-minute sweep DMs the customer before their booking.
// The sweep + a persisted `reminded` flag survive redeploys and never double-send.
// ---------------------------------------------------------------------------
const REMIND_MS = REMIND_BEFORE_MIN * 60 * 1000;
async function reminderSweep(c) {
  const now = Date.now();
  for (const b of upcomingBookings()) {
    if (b.reminded) continue;
    if (now < b.start - REMIND_MS || now >= b.start) continue; // outside the reminder window
    if (!markReminded(b.id)) continue; // already sent (or lost a race)
    const user = await c.users.fetch(b.userId).catch(() => null);
    if (user) await user.send(sessionReminderDM(b)).catch(() => {});
    if (b.channelId) {
      const ch = await c.channels.fetch(b.channelId).catch(() => null);
      if (ch) await ch.send(sessionReminderTicket(b)).catch(() => {});
    }
  }
}
function startReminderSweep(c) {
  const tick = () => reminderSweep(c).catch((e) => console.error("reminder sweep:", e.message));
  tick();
  setInterval(tick, 60 * 1000);
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  // Build banner — check this line in the Railway logs to confirm which code is
  // actually live. If it doesn't say v1.3.0, the deploy hasn't picked up the
  // latest push yet.
  console.log("=== StenTweaks build: v1.6.2 ===");

  // Health line — makes persistence + feature config obvious in the logs.
  const writable = checkWritable(DATA_DIR);
  console.log(`Data dir: ${DATA_DIR} — ${writable ? "writable ✓" : "NOT writable ✗ (data will NOT persist across redeploys)"}`);
  console.log(
    "Features: " +
      [
        `stripe ${STRIPE_SECRET_KEY ? "on" : "off"}`,
        `membersIntent ${MEMBERS_INTENT ? "on" : "off"}`,
        `welcome ${WELCOME_CHANNEL_ID || "none"}`,
      ].join(" · "),
  );

  if (c.user.username !== BOT_NAME) {
    await c.user.setUsername(BOT_NAME).catch(err => console.error("Bot rename failed:", err.message));
  }
  let si = 0;
  const rotate = () => {
    // A Custom-type activity renders its `state`, not its `name`, so set both —
    // otherwise the status shows up blank.
    const text = STATUSES[si++ % STATUSES.length];
    c.user.setActivity({ name: text, state: text, type: ActivityType.Custom });
  };
  rotate();
  setInterval(rotate, 60000);

  try {
    const guilds = c.guilds.cache;
    if (guilds.size > 0) {
      for (const g of guilds.values()) await g.commands.set(commands);
      await c.application.commands.set([]); // clear old global commands
      console.log(`Commands registered to ${guilds.size} guild(s): /help /tos /rules /giveaway /gend /reroll /purge /grant /revoke /ban /unban /kick /timeout /untimeout /finish /close /stats /optimizations /ticketpanel /verifypanel /bookings`);
    } else {
      await c.application.commands.set(commands);
      console.log("Commands registered globally.");
    }
  } catch (err) {
    console.error("Command registration failed:", err.message);
  }

  try {
    resumeGiveaways(c); // reschedule any giveaways still running
  } catch (err) {
    console.error("resumeGiveaways failed:", err.message);
  }
  try {
    startStripeServer(client); // start the payment webhook server (if configured)
  } catch (err) {
    console.error("startStripeServer failed:", err.message);
  }
  try {
    startReminderSweep(c); // DM customers before their booked sessions
  } catch (err) {
    console.error("startReminderSweep failed:", err.message);
  }
});

client.on(Events.Error, (e) => console.error("Client error:", e));
client.on(Events.Warn, (w) => console.warn("Client warn:", w));

client.on(Events.GuildCreate, async (guild) => {
  try {
    await guild.commands.set(commands);
  } catch (err) {
    console.error("Guild command registration failed:", err.message);
  }
});

// ---------------------------------------------------------------------------
// Welcome — greet a new member in the welcome channel (falls back to the log
// channel only if no welcome channel is configured).
// ---------------------------------------------------------------------------
async function resolveWelcomeChannel() {
  const id = WELCOME_CHANNEL_ID || LOG_CHANNEL_ID;
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null);
}

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    if (member.user?.bot) return;
    const wc = await resolveWelcomeChannel();
    if (wc) {
      await wc.send(welcomeMessage(member.user, { memberCount: member.guild.memberCount })).catch(() => {});
    }
  } catch (e) {
    console.error("member add (welcome):", e.message);
  }
});

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

// Payment gate for booking. A customer may book once they hold the matching
// package role (paid via Stripe/grant) or staff have marked the ticket paid;
// staff can always book on a customer's behalf.
function hasPaidForService(member, svc) {
  if (!svc || !svc.roleMatch) return false; // overclocks have no role — rely on Mark Paid
  return member?.roles?.cache?.some((r) => svc.roleMatch.test(r.name)) || false;
}
function canBookNow(interaction, serviceId) {
  if (isStaff(interaction)) return true;
  if (ticketPaid(interaction.channel)) return true;
  return hasPaidForService(interaction.member, SERVICE_BY_ID[serviceId]);
}

// Users currently mid-creation — stops a fast double-click from racing past the
// "one ticket per user" check and creating two channels.
const ticketsInFlight = new Set();

async function openTicket(interaction, serviceId = null, intake = null) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: "Tickets can only be opened in the server.", flags: MessageFlags.Ephemeral });
  }

  const existing = findUserTicket(guild, interaction.user.id);
  if (existing) {
    return interaction.reply({ content: `You already have an open ticket: ${existing}`, flags: MessageFlags.Ephemeral });
  }
  if (ticketsInFlight.has(interaction.user.id)) {
    return interaction.reply({ content: "Hang on — I'm already creating your ticket.", flags: MessageFlags.Ephemeral });
  }
  ticketsInFlight.add(interaction.user.id);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // If the customer already holds the package role (paid via Stripe or granted),
    // open the ticket ready-to-book so they get the Schedule button straight away.
    const paid = hasPaidForService(interaction.member, serviceId ? SERVICE_BY_ID[serviceId] : null);
    const { channel } = await createTicketChannel(client, guild, interaction.user, { serviceId, intake, paid });
    return interaction.editReply(`Your ticket has been created: ${channel}`);
  } catch (err) {
    console.error("Ticket create failed:", err.message);
    return interaction.editReply(
      "I couldn't create the ticket channel — I'm likely missing the **Manage Channels** permission.",
    );
  } finally {
    ticketsInFlight.delete(interaction.user.id);
  }
}

// Build a plain-text transcript of a channel (oldest first).
async function buildTranscript(channel) {
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!fetched) return "(could not read messages)";
  const ordered = [...fetched.values()].reverse();
  return ordered
    .map((m) => {
      const time = new Date(m.createdTimestamp).toISOString().replace("T", " ").slice(0, 19);
      let text = m.content || "";
      if (m.embeds.length) text += " [embed]";
      if (m.attachments.size) text += " " + [...m.attachments.values()].map((a) => a.url).join(" ");
      return `[${time}] ${m.author?.tag || "unknown"}: ${text}`.trim();
    })
    .join("\n");
}

// Transcript + log before a ticket is deleted.
async function archiveTicket(channel, closedBy) {
  const openerId = ticketOpenerId(channel);
  cancelByChannel(channel.id); // free any booked session tied to this ticket
  const transcript = await buildTranscript(channel);
  const count = transcript ? transcript.split("\n").length : 0;
  const filename = `transcript-${channel.name}.txt`;
  const meta = { channelName: channel.name, openerId, closedById: closedBy.id, count };

  if (LOG_CHANNEL_ID) {
    try {
      const log = await client.channels.fetch(LOG_CHANNEL_ID);
      await log.send({
        ...transcriptMessage(meta),
        files: [new AttachmentBuilder(Buffer.from(transcript || "(empty)", "utf8"), { name: filename })],
      });
    } catch (err) {
      console.error("Transcript log failed:", err.message);
    }
  }
  // No customer DM on close — the review prompt is sent by /finish when the job
  // is actually done, so closing a ticket for any reason doesn't nag them.
}

// Shared by the /finish command and the Finish button: wrap up a job in one
// step — mark the order complete, free the booked slot, post a completion card,
// and DM the customer a review prompt.
async function finishTicket(interaction) {
  const channel = interaction.channel;
  if (!isTicketChannel(channel)) {
    return interaction.reply({ content: "Use this inside a ticket channel.", flags: MessageFlags.Ephemeral });
  }
  if (!isStaff(interaction)) {
    return interaction.reply({ content: "Only staff can finish an optimization.", flags: MessageFlags.Ephemeral });
  }
  const openerId = ticketOpenerId(channel);
  const serviceId = ticketServiceId(channel) || "";
  cancelByChannel(channel.id); // release the booked session slot

  // Everything stays in the ticket — completion + review buttons, no DM.
  await channel.send(finishCard(openerId, serviceId)).catch(() => {});
  if (LOG_CHANNEL_ID) {
    const log = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (log) await log.send(`${interaction.user} finished **${SERVICE_BY_ID[serviceId]?.name || "an order"}** for <@${openerId}>.`).catch(() => {});
  }
  return interaction.reply({
    content: "Marked complete — review buttons are posted in the ticket for the customer. Hit **Close Ticket** when you're done.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTicketButton(interaction) {
  const id = interaction.customId;

  if (id === "ticket:open") return openTicket(interaction);
  // Booking a specific service → collect specs first, then create the ticket.
  if (id.startsWith("ticket:book:")) return interaction.showModal(intakeModal(id.split(":")[2] || ""));

  if (!isTicketChannel(interaction.channel)) {
    return interaction.reply({ content: "This isn't a ticket channel.", flags: MessageFlags.Ephemeral });
  }

  // Customer (or staff) adding/updating specs inside an existing ticket.
  if (id === "ticket:specs") {
    return interaction.showModal(intakeModal(ticketServiceId(interaction.channel) || ""));
  }

  // Customer (or staff) booking a remote session for this ticket. Payment first.
  if (id === "ticket:schedule") {
    const openerId = ticketOpenerId(interaction.channel);
    const serviceId = ticketServiceId(interaction.channel) || "";
    if (interaction.user.id !== openerId && !isStaff(interaction)) {
      return interaction.reply({ content: "Only the ticket owner or staff can schedule this session.", flags: MessageFlags.Ephemeral });
    }
    if (!canBookNow(interaction, serviceId)) {
      return interaction.reply(needsPaymentMessage());
    }
    return interaction.showModal(scheduleModal(serviceId, openerId || interaction.user.id));
  }

  if (id === "ticket:paid") {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: "Only staff can mark a ticket paid.", flags: MessageFlags.Ephemeral });
    }
    const channel = interaction.channel;
    const openerId = ticketOpenerId(channel);
    const serviceId = ticketServiceId(channel) || "";
    const svc = SERVICE_BY_ID[serviceId];
    // Mark the ticket paid — this unlocks booking.
    await channel
      .setTopic(ticketTopic({ openerId, serviceId, paid: true }))
      .catch(() => {});
    const member = openerId ? await channel.guild.members.fetch(openerId).catch(() => null) : null;
    let note = "";
    if (svc?.roleMatch && member) {
      const role = channel.guild.roles.cache.find((r) => svc.roleMatch.test(r.name));
      if (role) {
        await member.roles.add(role, `Paid — by ${interaction.user.tag}`).catch(() => {});
        note = ` · **${role.name}** assigned`;
        await member.send(noticeDM("Payment confirmed", `Your **${svc.name}** role is now active. Open a ticket whenever you're ready to start.`)).catch(() => {});
      } else {
        note = " · (no matching role found — assign manually)";
      }
    } else if (svc) {
      note = ` · ${svc.name} has no role to assign`;
    }
    await channel.send(`Marked paid by ${interaction.user}${note}.`).catch(() => {});
    // Now that it's paid, invite the customer to book their session.
    await channel.send(schedulePromptCard(serviceId, openerId)).catch(() => {});
    if (LOG_CHANNEL_ID) {
      const log = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (log) await log.send(`${interaction.user} marked **${svc?.name || "a ticket"}** paid for <@${openerId}>${note}.`).catch(() => {});
    }
    return interaction.reply({ content: "Marked paid.", flags: MessageFlags.Ephemeral });
  }

  if (id === "ticket:finish") return finishTicket(interaction);

  if (id === "ticket:close") {
    if (!canCloseTicket(interaction)) {
      return interaction.reply({ content: "You don't have permission to close this ticket.", flags: MessageFlags.Ephemeral });
    }
    return interaction.reply(closeConfirmMessage());
  }

  if (id === "ticket:close_confirm") {
    if (!canCloseTicket(interaction)) {
      return interaction.reply({ content: "You don't have permission to close this ticket.", flags: MessageFlags.Ephemeral });
    }
    const channel = interaction.channel;
    await interaction.update(compatibleCard(interaction.message, noticeDM("Closing ticket", "Saving the transcript and closing this ticket…")));
    await archiveTicket(channel, interaction.user).catch((e) => console.error("archive error:", e));
    setTimeout(() => channel?.delete().catch(() => {}), 3000);
    return;
  }

  if (id === "ticket:close_cancel") {
    return interaction.update(compatibleCard(interaction.message, noticeDM("Ticket kept open", "You can continue the conversation in your ticket.")));
  }
}

// Parse a "YYYY-MM-DD" + "HH:MM" pair typed in the business timezone into a UTC
// epoch (ms), or null if it's not a valid calendar date/time. The timezone (and
// DST) is handled by wallTimeToUtc based on SCHEDULE_TZ.
function parseSchedule(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((dateStr || "").trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec((timeStr || "").trim());
  if (!dm || !tm) return null;
  const y = +dm[1], mo = +dm[2], d = +dm[3], hh = +tm[1], mm = +tm[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  // Validate the calendar date in a neutral UTC frame (rejects e.g. 02-31).
  const base = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (base.getUTCFullYear() !== y || base.getUTCMonth() !== mo - 1 || base.getUTCDate() !== d) return null;
  return wallTimeToUtc(y, mo, d, hh, mm);
}

// ---------------------------------------------------------------------------
// Modal submissions (ticket intake + review + scheduling)
// ---------------------------------------------------------------------------
async function handleModalSubmit(interaction) {
  const id = interaction.customId;

  // Session scheduling from the ticket "Schedule Session" button.
  if (id.startsWith("schedule:set:")) {
    const parts = id.split(":");
    const serviceId = parts[2] || "";
    const targetUserId = parts[3] || interaction.user.id; // the customer the slot is for
    // Payment gate — the authoritative check (buttons can be re-pressed).
    if (!canBookNow(interaction, serviceId)) {
      return interaction.reply(needsPaymentMessage());
    }
    const start = parseSchedule(
      interaction.fields.getTextInputValue("date"),
      interaction.fields.getTextInputValue("time"),
    );
    if (start == null) {
      return interaction.reply(scheduleInvalidMessage("I couldn't read that date/time."));
    }
    const now = Date.now();
    if (start < now + 15 * 60 * 1000) {
      return interaction.reply(scheduleInvalidMessage("That time is in the past or too soon — pick a slot at least 15 minutes out."));
    }
    if (start > now + 180 * 24 * 60 * 60 * 1000) {
      return interaction.reply(scheduleInvalidMessage("That's too far ahead — book within the next 180 days."));
    }
    const inTicket = isTicketChannel(interaction.channel);
    const result = book({
      userId: targetUserId,
      channelId: inTicket ? interaction.channel.id : null,
      serviceId,
      start,
    });
    if (!result.ok) {
      return interaction.reply(slotTakenMessage(result.conflict.start, result.suggestion));
    }
    const card = bookingCard(result.booking, { rescheduled: Boolean(result.rescheduledFrom) });
    if (inTicket) {
      await interaction.channel.send(card).catch(() => {});
      return interaction.reply({
        content: result.rescheduledFrom ? "Session moved — updated details are in the ticket." : "Session booked — details are in the ticket.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({ ...card, flags: card.flags | MessageFlags.Ephemeral });
  }

  // Ticket intake: either creating a booked ticket, or updating specs in one.
  if (id.startsWith("ticket:intake:")) {
    const serviceId = id.split(":")[2] || null;
    const g = (f) => interaction.fields.getTextInputValue(f)?.trim() || "";
    const intake = { cpu: g("cpu"), gpu: g("gpu"), ram: g("ram"), monitor: g("monitor"), notes: g("notes") };

    // Submitted from inside an existing ticket → just post/refresh the card.
    if (isTicketChannel(interaction.channel)) {
      await interaction.channel.send(intakeCard({ userId: interaction.user.id, serviceId, ...intake })).catch(() => {});
      return interaction.reply({ content: "Added your specs to the ticket.", flags: MessageFlags.Ephemeral });
    }
    // Otherwise this is a fresh booking → create the ticket with the intake.
    return openTicket(interaction, serviceId, intake);
  }
}

// ---------------------------------------------------------------------------
// Booking — reschedule / cancel from the confirmation card
// ---------------------------------------------------------------------------
async function handleBookingButton(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];

  if (action === "reschedule") {
    const serviceId = parts[2] || "";
    const targetUserId = parts[3] || interaction.user.id;
    if (interaction.user.id !== targetUserId && !isStaff(interaction)) {
      return interaction.reply({ content: "Only the customer or staff can reschedule this session.", flags: MessageFlags.Ephemeral });
    }
    if (!canBookNow(interaction, serviceId)) {
      return interaction.reply(needsPaymentMessage());
    }
    return interaction.showModal(scheduleModal(serviceId, targetUserId));
  }

  if (action === "cancel") {
    const ownerId = parts[2] || null;
    if (ownerId && interaction.user.id !== ownerId && !isStaff(interaction)) {
      return interaction.reply({ content: "Only the customer or staff can cancel this session.", flags: MessageFlags.Ephemeral });
    }
    const byStaff = ownerId ? interaction.user.id !== ownerId : true;
    cancelByUser(ownerId || interaction.user.id);
    return interaction.update(compatibleCard(interaction.message, bookingCancelledCard(byStaff)));
  }
}

// ---------------------------------------------------------------------------
// Verify gate
// ---------------------------------------------------------------------------
async function handleVerify(interaction) {
  const guild = interaction.guild;
  if (!guild) return;
  const role = VERIFY_ROLE_ID
    ? guild.roles.cache.get(VERIFY_ROLE_ID)
    : guild.roles.cache.find((r) => /^verified$/i.test(r.name));
  if (!role) {
    return interaction.reply({ content: "Verification isn't set up yet — a staff member needs to configure the Verified role.", flags: MessageFlags.Ephemeral });
  }
  if (interaction.member.roles.cache.has(role.id)) {
    return interaction.reply({ content: "You're already verified.", flags: MessageFlags.Ephemeral });
  }
  try {
    await interaction.member.roles.add(role, "Verified via panel");
  } catch (err) {
    console.error("verify failed:", err.message);
    return interaction.reply({ content: "Couldn't verify you — the bot needs **Manage Roles** and its role must be **above** the Verified role.", flags: MessageFlags.Ephemeral });
  }
  // The public welcome is posted on join, not here, so verifying just grants
  // access without a second welcome message.
  return interaction.reply({ content: "You're verified — welcome in.", flags: MessageFlags.Ephemeral });
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------
const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000; // Discord's 28-day cap

async function modLog(text) {
  if (!LOG_CHANNEL_ID) return;
  const ch = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  // Reasons are free-text from a moderator — never let one @everyone/ping roles.
  if (ch) await ch.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
}

async function handleModeration(interaction) {
  const cmd = interaction.commandName;
  const need = {
    ban: PermissionFlagsBits.BanMembers,
    unban: PermissionFlagsBits.BanMembers,
    kick: PermissionFlagsBits.KickMembers,
    timeout: PermissionFlagsBits.ModerateMembers,
    untimeout: PermissionFlagsBits.ModerateMembers,
  }[cmd];
  if (!interaction.memberPermissions?.has(need) && !isOwner(interaction)) {
    return interaction.reply({ content: "You don't have permission for that.", flags: MessageFlags.Ephemeral });
  }

  const reason = interaction.options.getString("reason") || "No reason provided";
  const by = interaction.user.tag;

  try {
    if (cmd === "ban") {
      const user = interaction.options.getUser("user", true);
      await interaction.guild.members.ban(user.id, { reason: `${reason} — by ${by}` });
      await modLog(`**${by}** banned **${user.tag}** — ${reason}`);
      return interaction.reply({ content: `Banned **${user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
    if (cmd === "unban") {
      const id = interaction.options.getString("user_id", true);
      await interaction.guild.members.unban(id);
      await modLog(`**${by}** unbanned <@${id}>`);
      return interaction.reply({ content: `Unbanned <@${id}>.`, flags: MessageFlags.Ephemeral });
    }

    const member = interaction.options.getMember("user");
    if (!member) {
      return interaction.reply({ content: "That user isn't in the server.", flags: MessageFlags.Ephemeral });
    }
    if (cmd === "kick") {
      await member.kick(`${reason} — by ${by}`);
      await modLog(`**${by}** kicked **${member.user.tag}** — ${reason}`);
      return interaction.reply({ content: `Kicked **${member.user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
    if (cmd === "timeout") {
      const ms = parseDuration(interaction.options.getString("duration", true));
      if (!ms) return interaction.reply({ content: "Invalid duration. Try `10m`, `1h`, `1d`.", flags: MessageFlags.Ephemeral });
      await member.timeout(Math.min(ms, MAX_TIMEOUT), `${reason} — by ${by}`);
      await modLog(`**${by}** timed out **${member.user.tag}** — ${reason}`);
      return interaction.reply({ content: `Timed out **${member.user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
    if (cmd === "untimeout") {
      await member.timeout(null);
      await modLog(`**${by}** removed timeout from **${member.user.tag}**`);
      return interaction.reply({ content: `Removed timeout from **${member.user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error("Moderation error:", err.message);
    return interaction.reply({
      content: "Couldn't do that — check my permissions and that my role is **above** the target.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

// A short link to the reviews channel for nudging customers to post there.
function reviewsLink() {
  return REVIEWS_CHANNEL_ID ? `<#${REVIEWS_CHANNEL_ID}>` : "the reviews channel";
}

// ---------------------------------------------------------------------------
// Interactions (slash commands + buttons)
// ---------------------------------------------------------------------------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isModalSubmit()) {
      return await handleModalSubmit(interaction);
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("ticket:")) {
        return await handleTicketButton(interaction);
      }
      if (interaction.customId.startsWith("booking:")) {
        return await handleBookingButton(interaction);
      }
      if (interaction.customId.startsWith("review:rate:")) {
        // In a ticket the buttons are public, so only the customer may rate.
        const opener = ticketOpenerId(interaction.channel);
        if (opener && interaction.user.id !== opener) {
          return interaction.reply({ content: "Only the customer can rate this.", flags: MessageFlags.Ephemeral });
        }
        const parts = interaction.customId.split(":");
        const stars = Math.max(1, Math.min(5, Number(parts[2]) || 5));
        const serviceId = parts[3] || "";
        addReview(stars); // feeds the rating average on the sales panel
        // Re-render the card without the star row so it can only be rated once
        // (stops a customer spamming the buttons to skew the average).
        try {
          await interaction.update(compatibleCard(interaction.message, finishCard(opener, serviceId, { rating: stars })));
          return interaction.followUp({
            content: `Thanks for the ${"★".repeat(stars)}! Mind sharing a couple words in ${reviewsLink()}? Posting it yourself keeps it genuine — it really helps.`,
            flags: MessageFlags.Ephemeral,
          });
        } catch {
          return interaction.reply({
            content: `Thanks for the ${"★".repeat(stars)}! Mind sharing a couple words in ${reviewsLink()}?`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
      }
      if (interaction.customId.startsWith("buy:")) {
        return interaction.reply(purchasePrompt(interaction.customId.split(":")[1], interaction.user.id));
      }
      if (interaction.customId === "verify") {
        return handleVerify(interaction);
      }
      if (interaction.customId === "gw:enter") {
        return await toggleEntry(interaction, interaction.message.id);
      }
      if (interaction.customId === "gw:list") {
        return await listEntrants(interaction, interaction.message.id);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "giveaway") {
      if (!isStaff(interaction)) {
        return interaction.reply({ content: "You don't have permission to start giveaways.", flags: MessageFlags.Ephemeral });
      }
      const prize = interaction.options.getString("prize", true);
      const durationMs = parseDuration(interaction.options.getString("duration", true));
      const winners = interaction.options.getInteger("winners") || 1;
      if (!durationMs) {
        return interaction.reply({ content: "Invalid duration. Try formats like `30m`, `1h`, `2d`, or `1h30m`.", flags: MessageFlags.Ephemeral });
      }
      await startGiveaway(client, { channel: interaction.channel, prize, durationMs, winners, hostId: interaction.user.id });
      return interaction.reply({ content: "Giveaway started.", flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "gend") {
      if (!isStaff(interaction)) {
        return interaction.reply({ content: "You don't have permission to end giveaways.", flags: MessageFlags.Ephemeral });
      }
      const messageId = interaction.options.getString("message_id", true);
      const ended = await endGiveaway(client, messageId);
      return interaction.reply({
        content: ended
          ? "Giveaway ended and the winner announced."
          : "No active giveaway found for that message ID — it may have already ended, or its data was lost on a redeploy. Start a fresh one with `/giveaway`.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.commandName === "reroll") {
      if (!isStaff(interaction)) {
        return interaction.reply({ content: "You don't have permission to reroll giveaways.", flags: MessageFlags.Ephemeral });
      }
      const messageId = interaction.options.getString("message_id", true);
      const result = await reroll(client, messageId);
      return interaction.reply({
        content: result.ok ? "Rerolled." : result.reason,
        flags: MessageFlags.Ephemeral,
      });
    }


    if (interaction.commandName === "purge") {
      const canPurge = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) || isOwner(interaction);
      if (!canPurge) {
        return interaction.reply({ content: "You don't have permission to purge messages.", flags: MessageFlags.Ephemeral });
      }
      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: "I can only purge in a normal text channel.", flags: MessageFlags.Ephemeral });
      }
      const amount = interaction.options.getInteger("amount", true);
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        const note = deleted.size < amount ? " (older messages over 14 days can't be bulk-deleted)" : "";
        return interaction.reply({ content: `Deleted ${deleted.size} message(s).${note}`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        console.error("Purge failed:", err.message);
        return interaction.reply({ content: "I couldn't delete messages — I likely need the **Manage Messages** permission here.", flags: MessageFlags.Ephemeral });
      }
    }

    if (["ban", "unban", "kick", "timeout", "untimeout"].includes(interaction.commandName)) {
      return handleModeration(interaction);
    }

    if (interaction.commandName === "grant" || interaction.commandName === "revoke") {
      const granting = interaction.commandName === "grant";
      if (!isStaff(interaction)) {
        return interaction.reply({ content: "You don't have permission to manage package roles.", flags: MessageFlags.Ephemeral });
      }
      const target = interaction.options.getMember("user");
      const pkg = SERVICE_BY_ID[interaction.options.getString("package", true)];
      if (!pkg || !pkg.roleMatch) {
        return interaction.reply({ content: "Unknown package.", flags: MessageFlags.Ephemeral });
      }
      if (!target) {
        return interaction.reply({ content: "That user isn't in this server.", flags: MessageFlags.Ephemeral });
      }
      const role = interaction.guild.roles.cache.find((r) => pkg.roleMatch.test(r.name));
      if (!role) {
        return interaction.reply({ content: `No role matching **${pkg.name}** exists. Create a role named like that first.`, flags: MessageFlags.Ephemeral });
      }
      try {
        if (granting) await target.roles.add(role, `Granted by ${interaction.user.tag}`);
        else await target.roles.remove(role, `Revoked by ${interaction.user.tag}`);
      } catch (err) {
        console.error("grant/revoke failed:", err.message);
        return interaction.reply({ content: "I couldn't change that role — check my **Manage Roles** permission and that my role is **above** it.", flags: MessageFlags.Ephemeral });
      }

      if (LOG_CHANNEL_ID) {
        const log = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (log) await log.send(`${interaction.user} ${granting ? "granted" : "revoked"} **${role.name}** ${granting ? "to" : "from"} ${target}.`).catch(() => {});
      }
      if (granting) {
        await target.send(noticeDM("Package active", `Your **${pkg.name}** role is now active in **${interaction.guild.name}**. Open a ticket whenever you're ready to start.`)).catch(() => {});
      }
      return interaction.reply({ content: `${granting ? "Granted" : "Revoked"} **${role.name}** ${granting ? "to" : "from"} ${target}.`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "finish") {
      return finishTicket(interaction);
    }

    if (interaction.commandName === "close") {
      if (!isTicketChannel(interaction.channel)) {
        return interaction.reply({ content: "Use this inside a ticket channel.", flags: MessageFlags.Ephemeral });
      }
      if (!canCloseTicket(interaction)) {
        return interaction.reply({ content: "You don't have permission to close this ticket.", flags: MessageFlags.Ephemeral });
      }
      return interaction.reply(closeConfirmMessage());
    }

    if (interaction.commandName === "stats") {
      if (!isStaff(interaction)) {
        return interaction.reply({ content: "This dashboard is for staff.", flags: MessageFlags.Ephemeral });
      }
      const guild = interaction.guild;
      if (!guild) {
        return interaction.reply({ content: "Run this in the server.", flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Fetch members for accurate role counts when the intent is enabled.
      let fetched = false;
      if (MEMBERS_INTENT) {
        try {
          await guild.members.fetch();
          fetched = true;
        } catch {
          /* fall back to cache */
        }
      }

      const priceOf = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
      const seen = new Set(); // count each customer once, at their highest tier
      let revenue = 0;
      const tiers = PACKAGES.map((p) => {
        const role = guild.roles.cache.find((r) => p.roleMatch.test(r.name));
        const count = role ? role.members.size : 0;
        if (role) {
          for (const id of role.members.keys()) seen.add(id);
          revenue += count * priceOf(p.price);
        }
        return { id: p.id, name: p.name, short: p.short, price: p.price, count, hasRole: Boolean(role) };
      });

      const openTickets = guild.channels.cache.filter((ch) => isTicketChannel(ch)).size;
      const { count: reviewCount, avg } = getStats();

      return interaction.editReply(
        statsMessage({
          tiers,
          totalCustomers: seen.size,
          revenue: Math.round(revenue),
          reviewCount,
          reviewAvg: avg,
          openTickets,
          memberCount: guild.memberCount,
          partial: !fetched,
        }),
      );
    }

    if (interaction.commandName === "help") {
      return interaction.reply(helpMessage(isStaff(interaction)));
    }

    if (interaction.commandName === "tos") {
      return interaction.reply(tosMessage());
    }

    if (interaction.commandName === "rules") {
      return interaction.reply(rulesMessage());
    }

    if (interaction.commandName === "bookings") {
      if (!isStaff(interaction)) {
        return interaction.reply({ content: "The bookings calendar is for staff.", flags: MessageFlags.Ephemeral });
      }
      const payload = bookingsListMessage(upcomingBookings());
      return interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "optimizations") {
      if (!isOwner(interaction)) {
        return interaction.reply({ content: "This command is owner only.", flags: MessageFlags.Ephemeral });
      }
      await interaction.reply({ content: "Panel posted.", flags: MessageFlags.Ephemeral });
      for (const payload of salesMessages()) {
        await interaction.channel.send(payload);
      }
      return;
    }

    if (interaction.commandName === "ticketpanel") {
      if (!isStaff(interaction)) {
        return interaction.reply({ content: "You don't have permission to post the ticket panel.", flags: MessageFlags.Ephemeral });
      }
      const target = interaction.options.getChannel("channel") || interaction.channel;
      const sent = await target.send(ticketPanelMessage());
      return interaction.reply({ content: `Ticket panel posted: ${sent.url}`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "verifypanel") {
      if (!isStaff(interaction)) {
        return interaction.reply({ content: "You don't have permission to post the verify panel.", flags: MessageFlags.Ephemeral });
      }
      const target = interaction.options.getChannel("channel") || interaction.channel;
      const sent = await target.send(verifyPanelMessage());
      return interaction.reply({ content: `Verify panel posted: ${sent.url}`, flags: MessageFlags.Ephemeral });
    }

  } catch (err) {
    console.error("Interaction error:", err);
    if (!interaction.isRepliable?.()) return;
    const msg = "Something went wrong. Please try again.";
    try {
      if (interaction.deferred) await interaction.editReply({ content: msg });
      else if (!interaction.replied) await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      else await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    } catch {
      /* nothing more we can do */
    }
  }
});

// ---------------------------------------------------------------------------
// Modmail — user DMs relay into a staff thread and back. (No AI: the bot never
// replies to mentions or normal messages.)
// ---------------------------------------------------------------------------
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // A user DMing the bot -> forward into their thread in the log channel.
  if (!message.guild) {
    return handleIncomingDM(client, message).catch((e) => console.error("modmail in:", e));
  }
  // A staff reply inside a modmail thread -> relay to the user's DM.
  if (isModmailThread(message.channel)) {
    return relayStaffReply(client, message).catch((e) => console.error("modmail out:", e));
  }
});

// Graceful shutdown — Railway sends SIGTERM on every redeploy. Closing the
// gateway cleanly (rather than being hard-killed) avoids interrupting an
// in-flight write and lets Discord see the bot go offline promptly.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal} — shutting down.`);
  try {
    await client.destroy();
  } catch (e) {
    console.error("shutdown error:", e.message);
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

client.login(DISCORD_TOKEN);
