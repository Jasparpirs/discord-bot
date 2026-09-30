import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  PACKAGES,
  OVERCLOCKS,
  SERVICE_BY_ID,
  BRAND_COLOR,
  ACCENTS,
  STAFF_ROLE_ID,
  TERMS,
  RULES,
  RULES_UPDATED,
  TERMS_UPDATED,
  DISCORD_TOS_URL,
  SCHEDULE_TZ,
  SLOT_HOURS,
} from "./config.js";
import { checkoutUrl } from "./stripe.js";

export const V2 = MessageFlags.IsComponentsV2;

// ===========================================================================
// Design system — Components V2, clean
// ---------------------------------------------------------------------------
// Every panel is a Container with a colored accent bar. A plain title, an
// optional one-line subtitle, generous spacing, and — where it helps — a button
// mounted to the right of the block it belongs to (a tier, a CTA). One brand
// color throughout; green means done/paid, red means danger, slate is legal.
// ===========================================================================

const EPHEMERAL = MessageFlags.Ephemeral;
const STYLES = { Secondary: ButtonStyle.Secondary, Primary: ButtonStyle.Primary, Success: ButtonStyle.Success, Danger: ButtonStyle.Danger };
const btnStyle = (name) => STYLES[name] || ButtonStyle.Secondary;

const btn = (style, id, label) => new ButtonBuilder().setStyle(style).setCustomId(id).setLabel(label);
const link = (label, url) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url);
const safe = (v) => String(v).replace(/\r?\n+/g, " ").trim();

// spacing (invisible) vs a hairline divider
const gap = (c) => c.addSeparatorComponents((s) => s.setDivider(false).setSpacing(SeparatorSpacingSize.Small));
const line = (c) => c.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large));

const text = (c, content) => c.addTextDisplayComponents((t) => t.setContent(content));
const head = (c, title, subtitle) => text(c, subtitle ? `## ${title}\n-# ${subtitle}` : `## ${title}`);

// A block of text with a button mounted on its right.
function sectionWithButton(c, content, button) {
  c.addSectionComponents((sec) => sec.addTextDisplayComponents((t) => t.setContent(content)).setButtonAccessory(button));
}

const facts = (rows) =>
  rows.filter(([, v]) => v !== "" && v != null).map(([k, v]) => `**${k}**  ${v}`).join("\n");
const bulleted = (items) => items.map((i) => `- ${i}`).join("\n");
const clauses = (items) => items.map((it, i) => `**${i + 1}. ${it.title}**\n-# ${it.text}`).join("\n\n");

const message = (container) => ({ flags: V2, components: [container] });

// ===========================================================================
// SALES
// ===========================================================================
export function salesMessages() {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.sales);
  head(c, "Optimization Packages", "Pick a package below to open a ticket and get started.");
  line(c);

  PACKAGES.forEach((p, i) => {
    const title = `**${p.name} — ${p.price}**${p.badge ? `  \`${p.badge}\`` : ""}`;
    const block = [title, `*${p.tagline}*`, "", "**What you get**", bulleted(p.features), `-# Remote via AnyDesk · 2 months of support`].join("\n");
    sectionWithButton(c, block, btn(btnStyle(p.style), `buy:${p.id}`, `Book · ${p.price}`));
    if (i < PACKAGES.length - 1) line(c);
  });

  line(c);
  text(c, "### Individual Overclocks\n-# Already optimized and just want more performance? Book them on their own.");
  text(c, OVERCLOCKS.map((o) => `**${o.name} — ${o.price}**  ·  ${o.tagline}`).join("\n"));
  c.addActionRowComponents((row) => row.addComponents(...OVERCLOCKS.map((o) => btn(btnStyle(o.style), `buy:${o.id}`, `${o.short} · ${o.price}`))));

  line(c);
  sectionWithButton(
    c,
    "**Not sure which to pick?**\n-# Open a ticket and we'll help you choose the right one.",
    btn(ButtonStyle.Primary, "ticket:open", "Open a Ticket"),
  );
  gap(c);
  text(c, "-# Two months of support on every package · prices in EUR\n-# Delivered remotely via AnyDesk · pay by Stripe, Crypto or PayPal F&F");

  return [message(c)];
}

export function purchasePrompt(pkgId, userId) {
  const p = SERVICE_BY_ID[pkgId];
  if (!p) return { content: "That option is unavailable.", flags: EPHEMERAL };

  const c = new ContainerBuilder().setAccentColor(ACCENTS.sales);
  head(c, p.name, p.tagline);
  gap(c);
  text(c, facts([["Price", p.oldPrice ? `~~${p.oldPrice}~~ **${p.price}**` : `**${p.price}**`], ["Delivery", "Remote via AnyDesk"], ["Support", "2 months"]]));
  gap(c);
  text(c, `**What you get**\n${bulleted(p.features)}`);
  line(c);
  text(
    c,
    p.stripe
      ? "**How to pay**\n- **Stripe** — instant, your package role is assigned automatically.\n- **Crypto** or **PayPal F&F** — open a ticket and staff sort it out with you."
      : "**How to pay**\n- **Crypto** or **PayPal F&F** — open a ticket and staff sort it out with you.",
  );
  c.addActionRowComponents((row) => {
    if (p.stripe) {
      row.addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(`Pay with Stripe · ${p.price}`).setURL(checkoutUrl(p, userId)),
        btn(ButtonStyle.Secondary, `ticket:book:${p.id}`, "Pay another way"),
      );
    } else {
      row.addComponents(btn(ButtonStyle.Primary, `ticket:book:${p.id}`, `Book ${p.short || p.name}`));
    }
    return row;
  });
  return { flags: V2 | EPHEMERAL, components: [c] };
}

// ===========================================================================
// HELP
// ===========================================================================
export function helpMessage(staff = false) {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.brand);
  head(c, "Command Guide", "Everything this bot does.");
  gap(c);
  text(c, "**For members**\n" + ["`/tos` — terms & conditions", "`/rules` — server rules", "-# Open a ticket from the support panel to book an optimization or ask a question."].join("\n"));
  if (staff) {
    gap(c);
    text(
      c,
      "**Staff**\n" +
        [
          "`/optimizations` — post the sales panel *(owner)*",
          "`/ticketpanel` · `/verifypanel` — post panels",
          "`/stats` — dashboard · `/bookings` — calendar",
          "`/finish` · `/close` — wrap up a ticket",
          "`/grant` · `/revoke` — package roles",
          "`/giveaway` · `/gend` · `/reroll` — giveaways",
        ].join("\n"),
    );
    gap(c);
    text(c, "**Moderation**\n`/purge` · `/ban` · `/unban` · `/kick` · `/timeout` · `/untimeout`");
  }
  return { flags: V2 | EPHEMERAL, components: [c], allowedMentions: { parse: [] } };
}

// ===========================================================================
// WELCOME
// ===========================================================================
export function welcomeMessage(user, { memberCount = null } = {}) {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.brand);
  head(c, `Welcome, ${user.username}`, memberCount ? `Member #${memberCount.toLocaleString("en-US")}` : null);
  gap(c);
  text(c, `${user}, glad to have you here. Verify to unlock the server, then open a ticket whenever you're ready to tune your PC.`);
  return { flags: V2, components: [c], allowedMentions: { users: [user.id] } };
}

// ===========================================================================
// VERIFY
// ===========================================================================
export function verifyPanelMessage() {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.verify);
  sectionWithButton(c, "## Verification\n-# One tap to unlock the server.", btn(ButtonStyle.Success, "verify", "Verify"));
  return message(c);
}

// ===========================================================================
// SUPPORT PANEL
// ===========================================================================
export function ticketPanelMessage() {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.support);
  sectionWithButton(
    c,
    "## Support\n-# A question, an issue, or want to book an optimization? Open a private ticket and staff will be with you shortly.",
    btn(ButtonStyle.Primary, "ticket:open", "Open a Ticket"),
  );
  return message(c);
}

// ===========================================================================
// LEGAL
// ===========================================================================
export function tosMessage() {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.neutral);
  head(c, "Terms & Conditions", TERMS_UPDATED ? `Last updated ${TERMS_UPDATED}` : "Please read carefully before purchasing.");
  line(c);
  text(c, clauses(TERMS));
  return message(c);
}

export function rulesMessage() {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.neutral);
  sectionWithButton(
    c,
    `## Server Rules\n-# ${RULES_UPDATED ? `Last updated ${RULES_UPDATED}` : "Keep it clean and everyone has a good time."}`,
    link("Discord ToS", DISCORD_TOS_URL),
  );
  line(c);
  text(c, clauses(RULES));
  return message(c);
}

// ===========================================================================
// GIVEAWAYS
// ===========================================================================
export function giveawayMessage({ prize, endTime, winners, hostId, entryCount = 0 }) {
  const ends = Math.floor(endTime / 1000);
  const c = new ContainerBuilder().setAccentColor(ACCENTS.giveaway);
  head(c, prize, "Giveaway");
  gap(c);
  text(c, facts([["Winners", String(winners)], ["Entries", String(entryCount)], ["Ends", `<t:${ends}:R>`]]) + `\n-# Hosted by <@${hostId}> · press Enter to join.`);
  gap(c);
  c.addActionRowComponents((row) => row.addComponents(btn(ButtonStyle.Success, "gw:enter", "Enter"), btn(ButtonStyle.Secondary, "gw:list", "Participants")));
  return { flags: V2, components: [c], allowedMentions: { parse: [] } };
}

export function giveawayEndedMessage({ prize, winners }) {
  const won = winners.length ? winners.map((id) => `<@${id}>`).join(", ") : "No valid entries";
  const c = new ContainerBuilder().setAccentColor(ACCENTS.giveaway);
  head(c, prize, "Giveaway ended");
  gap(c);
  text(c, `**Winner${winners.length > 1 ? "s" : ""}**  ${won}`);
  return { flags: V2, components: [c], allowedMentions: { parse: [] } };
}

export function giveawayResultMessage({ prize, winners, reroll = false, messageUrl = null }) {
  const mentions = winners.map((id) => `<@${id}>`).join(", ");
  const jump = messageUrl ? `\n-# [Jump to giveaway](${messageUrl})` : "";
  const content = winners.length
    ? `${reroll ? "**New winner** — " : ""}Congratulations ${mentions}, you won **${prize}**.${jump}`
    : `No valid entries for **${prize}**.`;
  return { content, allowedMentions: { users: winners } };
}

// ===========================================================================
// TICKETS
// ===========================================================================
export function ticketWelcomeMessage(openerId, serviceId, { paid = false } = {}) {
  const svc = serviceId ? SERVICE_BY_ID[serviceId] : null;
  const c = new ContainerBuilder().setAccentColor(ACCENTS.support);
  head(c, svc ? svc.name : "Support Ticket");
  text(c, `<@${openerId}>${STAFF_ROLE_ID ? ` · <@&${STAFF_ROLE_ID}>` : ""}`);

  if (svc) {
    gap(c);
    text(c, facts([["Service", `${svc.name} — ${svc.price}`], ["Delivery", "Remote via AnyDesk"], ["Status", paid ? "Paid — ready to book" : "Awaiting payment"]]));
    text(
      c,
      paid
        ? "-# Tap Schedule Session to pick your time. Add your PC specs first if you haven't."
        : "-# Add your PC specs while you wait — CPU, GPU, RAM, motherboard, resolution and the games you play.",
    );
    gap(c);
    c.addActionRowComponents((row) => {
      row.addComponents(btn(ButtonStyle.Secondary, "ticket:specs", "Add / Update Specs"));
      if (paid) row.addComponents(btn(ButtonStyle.Primary, "ticket:schedule", "Schedule Session"));
      return row;
    });
    c.addActionRowComponents((row) =>
      row.addComponents(btn(ButtonStyle.Success, "ticket:paid", "Mark Paid"), btn(ButtonStyle.Secondary, "ticket:finish", "Finish"), btn(ButtonStyle.Danger, "ticket:close", "Close")),
    );
  } else {
    gap(c);
    text(c, "Thanks for reaching out — a staff member will be with you shortly. Tell us what you need below.");
    c.addActionRowComponents((row) => row.addComponents(btn(ButtonStyle.Danger, "ticket:close", "Close")));
  }

  return { flags: V2, components: [c], allowedMentions: { users: [openerId], roles: STAFF_ROLE_ID ? [STAFF_ROLE_ID] : [] } };
}

export function intakeModal(serviceId = "") {
  const svc = serviceId ? SERVICE_BY_ID[serviceId] : null;
  const title = svc ? `Book · ${svc.short || svc.name}` : "Your PC specs";
  const modal = new ModalBuilder().setCustomId(`ticket:intake:${serviceId}`).setTitle(title.slice(0, 45));
  const field = (id, label, ph, style = TextInputStyle.Short, max = 100) =>
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(ph).setStyle(style).setRequired(false).setMaxLength(max));
  modal.addComponents(
    field("cpu", "CPU", "e.g. Ryzen 5 7600 / i5-13600K"),
    field("gpu", "GPU", "e.g. RTX 4070 / RX 7800 XT"),
    field("ram", "RAM", "e.g. 32GB DDR5 6000MHz"),
    field("monitor", "Monitor", "e.g. 1440p 165Hz"),
    field("notes", "Games + what you want improved", "e.g. Valorant/CS2 — higher FPS, better 1% lows, lower input lag", TextInputStyle.Paragraph, 800),
  );
  return modal;
}

export function intakeCard({ userId, serviceId, cpu, gpu, ram, monitor, notes }) {
  const svc = serviceId ? SERVICE_BY_ID[serviceId] : null;
  const rows = [["CPU", cpu], ["GPU", gpu], ["RAM", ram], ["Monitor", monitor]].filter(([, v]) => v && String(v).trim()).map(([k, v]) => [k, safe(v).slice(0, 80)]);
  const c = new ContainerBuilder().setAccentColor(ACCENTS.support);
  head(c, "PC Specs", svc ? svc.name : null);
  gap(c);
  text(c, rows.length ? facts(rows) : "-# No specs provided yet.");
  if (notes && String(notes).trim()) {
    gap(c);
    text(c, `**Goal**\n-# ${safe(notes).slice(0, 800)}`);
  }
  gap(c);
  text(c, `-# Submitted by <@${userId}> · staff can adjust the plan from here.`);
  return { flags: V2, components: [c], allowedMentions: { parse: [] } };
}

export function finishCard(openerId, serviceId = "", { rating = 0 } = {}) {
  const svc = serviceId ? SERVICE_BY_ID[serviceId] : null;
  const rated = rating > 0;
  const c = new ContainerBuilder().setAccentColor(ACCENTS.success);
  head(c, "Optimization Complete", svc ? svc.name : null);
  gap(c);
  text(
    c,
    rated
      ? `${openerId ? `<@${openerId}>, ` : ""}thanks for the **${rating}/5** — enjoy the gains. Drop a couple of words in the reviews channel when you can.`
      : `${openerId ? `<@${openerId}>, ` : ""}all done — enjoy the gains. Rate the service below, then drop a couple of words in the reviews channel.`,
  );
  gap(c);
  if (!rated) {
    c.addActionRowComponents((row) => row.addComponents(...[1, 2, 3, 4, 5].map((n) => btn(n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary, `review:rate:${n}:${serviceId}`, String(n)))));
  }
  c.addActionRowComponents((row) => row.addComponents(btn(ButtonStyle.Danger, "ticket:close", "Close Ticket")));
  return { flags: V2, components: [c], allowedMentions: openerId ? { users: [openerId] } : { parse: [] } };
}

// ===========================================================================
// SCHEDULING
// ===========================================================================
const SLOT_MS = Math.max(1, SLOT_HOURS) * 60 * 60 * 1000;
const ts = (ms) => Math.floor(ms / 1000);

export function scheduleModal(serviceId = "", targetUserId = "") {
  const modal = new ModalBuilder().setCustomId(`schedule:set:${serviceId}:${targetUserId}`).setTitle("Book your session");
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("date").setLabel("Date (YYYY-MM-DD)").setPlaceholder("2026-09-11").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(8).setMaxLength(10)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("time").setLabel(`Start time · 24h · ${SCHEDULE_TZ}`.slice(0, 45)).setPlaceholder("17:00").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(5)),
  );
  return modal;
}

export function needsPaymentMessage() {
  return { content: "Booking opens once your payment is confirmed. Pay via your package link, or ask staff to mark the ticket paid — then tap Schedule Session to pick a time.", flags: EPHEMERAL };
}

export function schedulePromptCard(serviceId = "", targetUserId = "") {
  const svc = serviceId ? SERVICE_BY_ID[serviceId] : null;
  const c = new ContainerBuilder().setAccentColor(ACCENTS.booking);
  head(c, "Payment Confirmed", svc ? `Book your ${svc.name} session` : "Book your session");
  gap(c);
  text(c, `Pick a date and time that suits you. Sessions run ${SLOT_HOURS}h, done remotely via AnyDesk.`);
  gap(c);
  c.addActionRowComponents((row) => row.addComponents(btn(ButtonStyle.Primary, `booking:reschedule:${serviceId || ""}:${targetUserId || ""}`, "Schedule Session")));
  return { flags: V2, components: [c], allowedMentions: { parse: [] } };
}

export function bookingCard(booking, { rescheduled = false } = {}) {
  const svc = booking.serviceId ? SERVICE_BY_ID[booking.serviceId] : null;
  const start = ts(booking.start);
  const end = ts(booking.start + SLOT_MS);
  const c = new ContainerBuilder().setAccentColor(ACCENTS.booking);
  head(c, rescheduled ? "Session Rescheduled" : "Session Booked", svc ? svc.name : null);
  gap(c);
  text(
    c,
    facts([["When", `<t:${start}:F>`], ["Starts", `<t:${start}:R>`], ["Window", `${SLOT_HOURS}h, until <t:${end}:t>`], ["Delivery", "Remote via AnyDesk"]]) +
      `\n-# Booked for <@${booking.userId}> · shown in your local time. Be at your PC a few minutes early.`,
  );
  gap(c);
  c.addActionRowComponents((row) =>
    row.addComponents(btn(ButtonStyle.Secondary, `booking:reschedule:${booking.serviceId || ""}:${booking.userId}`, "Reschedule"), btn(ButtonStyle.Danger, `booking:cancel:${booking.userId}`, "Cancel")),
  );
  return { flags: V2, components: [c], allowedMentions: { parse: [] } };
}

export function slotTakenMessage(conflictStart, suggestion) {
  const taken = `<t:${ts(conflictStart)}:F>`;
  const sug = suggestion ? `\nNext free slot: **<t:${ts(suggestion)}:F>** (<t:${ts(suggestion)}:R>).` : "\nTry a time further out.";
  return { content: `That time isn't available — sessions are spaced **${SLOT_HOURS} hours** apart and one is already booked around ${taken}.` + sug + `\nTap Schedule Session again to pick another time.`, flags: EPHEMERAL };
}

export function scheduleInvalidMessage(reason) {
  return { content: `${reason}\nFormat: date \`YYYY-MM-DD\` and time \`HH:MM\` (24-hour, ${SCHEDULE_TZ}). Example: \`2026-09-11\` and \`17:00\`.`, flags: EPHEMERAL };
}

export function bookingCancelledCard(byStaff = false) {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.danger);
  head(c, "Session Cancelled");
  gap(c);
  text(c, `The slot is free again${byStaff ? " (cancelled by staff)" : ""}. Tap Schedule Session in the ticket to rebook.`);
  return { flags: V2, components: [c] };
}

export function bookingsListMessage(bookings) {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.booking);
  head(c, "Upcoming Sessions", bookings.length ? `${bookings.length} booked` : null);
  line(c);
  if (!bookings.length) {
    text(c, "-# No sessions booked yet.");
  } else {
    text(
      c,
      bookings
        .map((b) => {
          const svc = b.serviceId ? SERVICE_BY_ID[b.serviceId] : null;
          return `**<t:${ts(b.start)}:F>** — <@${b.userId}>${svc ? ` (${svc.short || svc.name})` : ""}\n-# <t:${ts(b.start)}:R>`;
        })
        .join("\n"),
    );
  }
  const payload = message(c);
  payload.allowedMentions = { parse: [] };
  return payload;
}

export function sessionReminderDM(booking) {
  const svc = booking.serviceId ? SERVICE_BY_ID[booking.serviceId] : null;
  const start = ts(booking.start);
  const c = new ContainerBuilder().setAccentColor(ACCENTS.booking);
  head(c, "Session Coming Up", svc ? svc.name : null);
  gap(c);
  text(c, `Starts <t:${start}:R> · <t:${start}:F>.\n-# Be at your PC a few minutes early with AnyDesk ready.`);
  return message(c);
}

export function sessionReminderTicket(booking) {
  const start = ts(booking.start);
  const c = new ContainerBuilder().setAccentColor(ACCENTS.booking);
  head(c, "Session Starting Soon");
  gap(c);
  text(c, `<@${booking.userId}> — your session starts <t:${start}:R>. Get AnyDesk ready.`);
  return { flags: V2, components: [c], allowedMentions: { users: [booking.userId] } };
}

// ===========================================================================
// TRANSCRIPT · DASHBOARD · DM
// ===========================================================================
export function transcriptEmbed({ channelName, openerId, closedById, count }) {
  return new EmbedBuilder()
    .setColor(ACCENTS.neutral)
    .setTitle("Ticket Closed")
    .addFields(
      { name: "Channel", value: channelName, inline: true },
      { name: "Messages", value: String(count), inline: true },
      { name: "Opened by", value: openerId ? `<@${openerId}>` : "—", inline: true },
      { name: "Closed by", value: `<@${closedById}>`, inline: true },
    )
    .setTimestamp();
}

export function closeConfirmMessage() {
  const r = new ActionRowBuilder().addComponents(btn(ButtonStyle.Danger, "ticket:close_confirm", "Confirm Close"), btn(ButtonStyle.Secondary, "ticket:close_cancel", "Cancel"));
  return { content: "Close this ticket? This will delete the channel.", components: [r], flags: EPHEMERAL };
}

export function statsMessage({ tiers, totalCustomers, revenue, reviewCount, reviewAvg, openTickets, memberCount, partial }) {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.stats);
  head(c, "Dashboard");
  line(c);
  text(
    c,
    facts([
      ["Members", memberCount != null ? memberCount.toLocaleString("en-US") : "—"],
      ["Customers", String(totalCustomers)],
      ["Open tickets", String(openTickets)],
      ["Rating", reviewCount ? `${reviewAvg.toFixed(1)} / 5 (${reviewCount})` : "—"],
      ["Revenue", `€${revenue.toLocaleString("en-US")}`],
    ]),
  );
  if (tiers.length) {
    gap(c);
    text(c, "**By package**\n" + tiers.map((tr) => `${tr.short || tr.name} — **${tr.count}**`).join("\n"));
  }
  if (partial) {
    gap(c);
    text(c, "-# Exact counts need Server Members Intent enabled.");
  }
  return message(c);
}

export function noticeDM(title, body) {
  const c = new ContainerBuilder().setAccentColor(ACCENTS.brand);
  head(c, title);
  gap(c);
  text(c, body);
  return message(c);
}

export const transcriptMessage = (...args) => ({ embeds: [transcriptEmbed(...args)] });

// Bridge a message being edited to whichever component system it was created
// with, so an edit across a redeploy (V2 ⇄ classic) never fails.
function containerText(container) {
  const json = typeof container?.toJSON === "function" ? container.toJSON() : container || {};
  const out = [];
  const walk = (comp) => {
    if (!comp) return;
    if (comp.content) out.push(comp.content);
    if (Array.isArray(comp.components)) comp.components.forEach(walk);
  };
  walk(json);
  return out.join("\n");
}

export function compatibleCard(existing, payload) {
  const existingV2 = Boolean(existing.flags?.has?.(V2));
  const payloadV2 = Boolean(payload.flags & V2);
  if (existingV2 === payloadV2) return payload;
  if (!existingV2 && payloadV2) {
    // Editing a classic message with a V2 payload isn't allowed — flatten to text.
    const body = (payload.components || []).map(containerText).join("\n") || "Updated.";
    return { content: body, embeds: [], components: [] };
  }
  // Editing a V2 message with a classic payload — wrap the embed into a container.
  const c = new ContainerBuilder().setAccentColor(BRAND_COLOR);
  for (const e of payload.embeds || []) {
    const j = e.toJSON ? e.toJSON() : e;
    text(c, [j.title, j.description].filter(Boolean).join("\n") || "Updated.");
  }
  return { flags: V2, components: [c] };
}
