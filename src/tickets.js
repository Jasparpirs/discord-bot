import { ChannelType, PermissionFlagsBits } from "discord.js";
import { STAFF_ROLE_ID, TICKET_CATEGORY_ID, SERVICE_BY_ID } from "./config.js";
import { ticketOpenerId, ticketTopic } from "./perms.js";
import { ticketWelcomeMessage, intakeCard } from "./ui.js";

// A user's existing open ticket channel in this guild, or null.
export function findUserTicket(guild, userId) {
  return guild.channels.cache.find((ch) => ticketOpenerId(ch) === userId) || null;
}

// Create a ticket for `user` without needing an interaction, so both the panel
// button and the Stripe webhook can open one. Reuses an existing ticket instead
// of making a duplicate. Returns { channel, reused }.
export async function createTicketChannel(client, guild, user, { serviceId = null, intake = null, paid = false } = {}) {
  const existing = findUserTicket(guild, user.id);
  if (existing) return { channel: existing, reused: true };

  const svc = serviceId ? SERVICE_BY_ID[serviceId] : null;
  const prefix = svc ? svc.id : "ticket";

  const allow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
  ];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow },
    { id: client.user.id, allow },
  ];
  if (STAFF_ROLE_ID) overwrites.push({ id: STAFF_ROLE_ID, allow });

  const channel = await guild.channels.create({
    name: `${prefix}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90) || "ticket",
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID || undefined,
    topic: ticketTopic({ openerId: user.id, serviceId: serviceId || "", paid }),
    permissionOverwrites: overwrites,
  });

  await channel.send(ticketWelcomeMessage(user.id, serviceId, { paid })).catch(() => {});
  if (intake && Object.values(intake).some((v) => v && String(v).trim())) {
    await channel.send(intakeCard({ userId: user.id, serviceId, ...intake })).catch(() => {});
  }
  return { channel, reused: false };
}
