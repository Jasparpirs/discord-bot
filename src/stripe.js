import http from "node:http";
import { join } from "node:path";
import Stripe from "stripe";
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  GUILD_ID,
  LOG_CHANNEL_ID,
  SERVICE_BY_ID,
  DATA_DIR,
} from "./config.js";
import { noticeDM, schedulePromptCard } from "./ui.js";
import { createTicketChannel } from "./tickets.js";
import { ticketServiceId, ticketTopic } from "./perms.js";
import { readJSON, writeJSON } from "./store.js";

// Remember purchases so a refund can reverse the role: paymentIntentId -> {userId, pkgId}
const STORE = join(DATA_DIR, "purchases.json");
function loadPurchases() {
  return readJSON(STORE, {});
}
function savePurchase(pi, record) {
  const all = loadPurchases();
  all[pi] = record;
  writeJSON(STORE, all);
}

// Build the personalized Stripe URL that tells us who bought what.
// client_reference_id = "<discordUserId>-<packageId>"
export function checkoutUrl(pkg, userId) {
  const ref = `${userId}-${pkg.id}`;
  const sep = pkg.stripe.includes("?") ? "&" : "?";
  return `${pkg.stripe}${sep}client_reference_id=${encodeURIComponent(ref)}`;
}

async function resolveGuild(client) {
  if (GUILD_ID) return client.guilds.cache.get(GUILD_ID) || (await client.guilds.fetch(GUILD_ID).catch(() => null));
  return client.guilds.cache.first() || null;
}

async function handleCompletedCheckout(client, session) {
  const ref = session.client_reference_id || "";
  const dash = ref.indexOf("-");
  const userId = dash > 0 ? ref.slice(0, dash) : null;
  const pkgId = dash > 0 ? ref.slice(dash + 1) : null;
  const pkg = pkgId ? SERVICE_BY_ID[pkgId] : null;

  const log = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;

  if (!userId || !pkg) {
    console.warn("Stripe: payment with no usable client_reference_id:", ref);
    if (log) await log.send(`Payment received but I couldn't match it to a Discord user. Assign the role manually. (ref: \`${ref || "none"}\`)`).catch(() => {});
    return;
  }

  const guild = await resolveGuild(client);
  if (!guild) return console.error("Stripe: no guild to assign roles in.");

  const member = await guild.members.fetch(userId).catch(() => null);
  const role = guild.roles.cache.find((r) => pkg.roleMatch.test(r.name));

  if (!member) {
    if (log) await log.send(`<@${userId}> paid for **${pkg.name}** but I couldn't find them in the server.`).catch(() => {});
    return;
  }
  if (!role) {
    if (log) await log.send(`<@${userId}> paid for **${pkg.name}** but no matching role exists. Create a role named like "${pkg.name}".`).catch(() => {});
    return;
  }

  try {
    await member.roles.add(role, `Stripe purchase: ${pkg.name}`);
  } catch (err) {
    console.error("Stripe: failed to add role:", err.message);
    if (log) await log.send(`<@${userId}> paid for **${pkg.name}** but I couldn't assign the role (check my Manage Roles permission and role position).`).catch(() => {});
    return;
  }

  if (session.payment_intent) savePurchase(session.payment_intent, { userId, pkgId });

  // Auto-open a paid ticket so the customer can continue straight to booking,
  // then drop the "book your session" prompt in — mirrors the Mark Paid flow.
  let ticketNote = "";
  try {
    const { channel, reused } = await createTicketChannel(client, guild, member.user, { serviceId: pkgId, paid: true });
    if (reused) {
      // An existing ticket may not be flagged paid yet — flag it, keeping other fields.
      await channel
        .setTopic(ticketTopic({ openerId: member.id, serviceId: ticketServiceId(channel) || pkgId, paid: true }))
        .catch(() => {});
    }
    await channel.send(schedulePromptCard(pkgId, member.id)).catch(() => {});
    ticketNote = ` · ticket ${channel}`;
  } catch (err) {
    console.error("Stripe: ticket auto-open failed:", err.message);
  }

  if (log) await log.send(`<@${userId}> purchased **${pkg.name} — ${pkg.price}** — role **${role.name}** assigned${ticketNote}.`).catch(() => {});
  await member.send(noticeDM("Thanks for your purchase", `Your **${pkg.name}** role is now active and I've opened a ticket for you. Head there and tap **Schedule Session** to book your time.`)).catch(() => {});
}

// A charge was refunded or disputed — pull the role back.
async function handleRefund(client, charge, kind) {
  const record = loadPurchases()[charge.payment_intent];
  const log = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
  if (!record) {
    if (log) await log.send(`A ${kind} came in but I have no record of that purchase — remove the role manually if needed.`).catch(() => {});
    return;
  }
  const pkg = SERVICE_BY_ID[record.pkgId];
  const guild = await resolveGuild(client);
  const member = guild ? await guild.members.fetch(record.userId).catch(() => null) : null;
  const role = guild && pkg ? guild.roles.cache.find((r) => pkg.roleMatch.test(r.name)) : null;

  if (member && role) {
    await member.roles.remove(role, `Stripe ${kind}`).catch(() => {});
  }
  if (log) await log.send(`**${kind}** on <@${record.userId}>'s **${pkg?.name || "purchase"}** — role removed.`).catch(() => {});
}

// Start the webhook HTTP server. No-op if Stripe isn't configured.
export function startStripeServer(client) {
  const port = process.env.PORT || 3000;
  const enabled = Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET);
  const stripe = enabled ? new Stripe(STRIPE_SECRET_KEY) : null;

  // Stripe events are small; cap the body so a hostile POST can't exhaust memory.
  const MAX_BODY = 256 * 1024; // 256 KB

  const server = http.createServer((req, res) => {
    if (req.method === "POST") {
      // Only accept the webhook on its own path — ignore probes elsewhere.
      const path = (req.url || "/").split("?")[0];
      if (path !== "/stripe") {
        res.writeHead(404);
        return res.end("not found");
      }
      if (!enabled) {
        res.writeHead(200);
        return res.end("stripe not configured");
      }

      const chunks = [];
      let size = 0;
      let aborted = false;
      req.on("data", (c) => {
        if (aborted) return;
        size += c.length;
        if (size > MAX_BODY) {
          aborted = true;
          res.writeHead(413);
          res.end("payload too large");
          req.destroy(); // drop the connection instead of buffering more
          return;
        }
        chunks.push(c);
      });
      req.on("end", async () => {
        if (aborted) return;
        let event;
        try {
          event = stripe.webhooks.constructEvent(Buffer.concat(chunks), req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);
        } catch (err) {
          console.error("Stripe signature verification failed:", err.message);
          res.writeHead(400);
          return res.end("invalid signature");
        }
        res.writeHead(200);
        res.end("ok");
        if (event.type === "checkout.session.completed") {
          handleCompletedCheckout(client, event.data.object).catch((e) => console.error("Stripe handler error:", e));
        } else if (event.type === "charge.refunded") {
          handleRefund(client, event.data.object, "refund").catch((e) => console.error("Stripe refund error:", e));
        } else if (event.type === "charge.dispute.created") {
          handleRefund(client, event.data.object, "dispute").catch((e) => console.error("Stripe dispute error:", e));
        }
      });
      req.on("error", () => {
        aborted = true;
      });
      return;
    }
    // Health check / browser visit.
    res.writeHead(200);
    res.end("StenTweaks bot online");
  });

  // Don't let a slow/hung client hold a socket open indefinitely.
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;

  server.listen(port, () =>
    console.log(`HTTP server listening on :${port}${enabled ? " — Stripe webhooks ON" : " — Stripe webhooks OFF (add keys to enable)"}`),
  );
}
