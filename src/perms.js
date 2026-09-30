import { PermissionFlagsBits } from "discord.js";
import { OWNER_ID, STAFF_ROLE_ID } from "./config.js";

// Is this interaction's user the owner? (configured OWNER_ID, or the guild owner)
export function isOwner(interaction) {
  if (OWNER_ID && interaction.user.id === OWNER_ID) return true;
  return interaction.guild?.ownerId === interaction.user.id;
}

// Staff = configured staff role, a server manager/admin, or the owner.
export function isStaff(interaction) {
  const member = interaction.member;
  if (!member) return false;
  if (STAFF_ROLE_ID && member.roles?.cache?.has(STAFF_ROLE_ID)) return true;
  if (
    member.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    member.permissions?.has?.(PermissionFlagsBits.ManageChannels) ||
    member.permissions?.has?.(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }
  return isOwner(interaction);
}


// Ticket helpers — topic format:
//   `ticket:<openerId>:<serviceId>:<legacy>:<paid>`  (paid = "1" once paid)
// The 4th field is an unused legacy slot, kept so older tickets still parse.
export function isTicketChannel(channel) {
  return typeof channel?.topic === "string" && channel.topic.startsWith("ticket:");
}
export function ticketOpenerId(channel) {
  return isTicketChannel(channel) ? channel.topic.split(":")[1] || null : null;
}
export function ticketServiceId(channel) {
  return isTicketChannel(channel) ? channel.topic.split(":")[2] || null : null;
}
export function ticketPaid(channel) {
  return isTicketChannel(channel) ? channel.topic.split(":")[4] === "1" : false;
}
// Rebuild a ticket topic. The 4th field is a legacy (unused) slot kept so tickets
// created before it was retired still parse the paid flag from the 5th field.
export function ticketTopic({ openerId = "", serviceId = "", paid = false }) {
  return `ticket:${openerId || ""}:${serviceId || ""}::${paid ? "1" : ""}`;
}
export function canCloseTicket(interaction) {
  const opener = ticketOpenerId(interaction.channel);
  if (opener && interaction.user.id === opener) return true;
  return isStaff(interaction);
}
