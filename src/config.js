import "dotenv/config";
import { fileURLToPath } from "node:url";

// Where the bot stores its JSON data (giveaways, reviews, modmail, purchases).
// Point DATA_DIR at a Railway Volume mount (e.g. /data) so it survives redeploys.
export const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL("../data", import.meta.url));

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

export const DISCORD_TOKEN = required("DISCORD_TOKEN");

// Owner (for the owner-only panel command). Falls back to the guild owner.
export const OWNER_ID = process.env.OWNER_ID || null;
// Staff role that can see + manage every ticket.
export const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || null;
// Optional category to create ticket channels under.
export const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;
// Optional channel where customers post their reviews (the bot links them here).
export const REVIEWS_CHANNEL_ID = process.env.REVIEWS_CHANNEL_ID || null;
// Optional channel where ticket transcripts are logged on close.
export const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || null;
// Optional dedicated channel for modmail (user DMs -> threads). Falls back to LOG.
export const MODMAIL_CHANNEL_ID = process.env.MODMAIL_CHANNEL_ID || null;
// Role granted when a member clicks Verify. Falls back to a role named "Verified".
export const VERIFY_ROLE_ID = process.env.VERIFY_ROLE_ID || null;
// Optional channel where a welcome message is posted when a member verifies.
export const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || null;
// Enable the privileged Server Members Intent (also toggle it in the Developer
// Portal). Lets /stats report exact customer counts by role.
export const MEMBERS_INTENT = process.env.SERVER_MEMBERS_INTENT === "on";

// --- Stripe automation (optional) ------------------------------------------
// Set these to auto-assign package roles when a payment completes.
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || null;
// Guild to assign roles in. Falls back to the bot's only server if unset.
export const GUILD_ID = process.env.GUILD_ID || null;


// --- Scheduling ------------------------------------------------------------
// Customers book a remote session from inside their ticket. Sessions are spaced
// SLOT_HOURS apart so two can never overlap — booking one slot locks out
// anything within that window (book 17:00 → next free is 19:00). Times a
// customer types are read in SCHEDULE_TZ and echoed back as Discord timestamps,
// which auto-localize per viewer.
export const SLOT_HOURS = Number(process.env.SLOT_HOURS) || 2;
// Preferred: a real IANA timezone (e.g. "Europe/Tallinn") — then DST (the +3/+2
// switch) is handled automatically. If it's not a recognized zone, the bot
// falls back to the fixed SCHEDULE_UTC_OFFSET number below.
export const SCHEDULE_TZ = process.env.SCHEDULE_TZ || "UTC";
export const SCHEDULE_UTC_OFFSET = Number(process.env.SCHEDULE_UTC_OFFSET) || 0; // fallback only
// How many minutes before a booked session to DM the customer a reminder.
export const REMIND_BEFORE_MIN = Number(process.env.REMIND_BEFORE_MIN) || 30;

// --- Theme -----------------------------------------------------------------
// StenTweaks runs a semantic accent system: one electric-indigo brand color
// anchors the identity, and each surface gets a purposeful, harmonized accent
// drawn from the same modern cool-plus-warm palette. The sidebar of every panel
// signals *what* it is at a glance — sales, support, money, scheduling, danger,
// legal — while still reading as one coherent brand. Buttons keep their own
// meaning on top (green = go/money, red = danger).
export const BRAND_COLOR = 0x4361ee; // cobalt — the single StenTweaks brand color
export const BOT_NAME = "sten"; // the bot's Discord username

// One brand color runs across every panel so the whole bot reads as one thing.
// The only exceptions carry real meaning: green for done/paid, red for danger,
// a muted slate for legal text. Nothing else is tinted.
export const ACCENTS = {
  brand: BRAND_COLOR,
  sales: BRAND_COLOR,
  support: BRAND_COLOR,
  booking: BRAND_COLOR,
  giveaway: BRAND_COLOR,
  review: BRAND_COLOR,
  stats: BRAND_COLOR,
  verify: 0x2bb673,   // green — "go" / verified
  success: 0x2bb673,  // green — paid / complete
  neutral: 0x606a7b,  // slate — legal / rules / transcripts
  danger: 0xe24c4c,   // red — cancellations
};

export const PACKAGES = [
  {
    id: "windows",
    name: "Windows + BIOS Tuning",
    short: "Win+BIOS",
    price: "€25",
    style: "Secondary",
    stripe: "https://buy.stripe.com/14AeVe9EubDZb9w0az1gs0c",
    roleMatch: /windows/i,
    tagline: "BIOS and Windows tuned together for lower latency, higher FPS and smoother, more responsive gameplay.",
    features: [
      "BIOS + Windows optimization",
      "Low-latency + in-game settings tuning",
      "Background processes + services cleaned",
      "Network optimization",
      "Higher FPS · smoother frametimes · snappier input",
      "2 months of support",
    ],
  },
  {
    id: "advanced",
    name: "Advanced Optimization",
    short: "Advanced",
    price: "€65",
    style: "Primary",
    stripe: "https://buy.stripe.com/9B66oI17YbDZ6Tg7D11gs0i",
    roleMatch: /advanced optimization/i,
    tagline: "A complete system tune covering Windows, BIOS, network, and software.",
    features: [
      "BIOS optimization (SCEWIN)",
      "GPU & CPU Overclocking",
      "Windows optimization",
      "Low-latency optimization",
      "Network optimization",
      "Game + software optimization",
      "Steam, Battle.net, Discord + OBS tuning",
      "Hardware diagnostics",
      "2 months of support",
    ],
  },
  {
    id: "full",
    name: "Full Optimization",
    short: "Full",
    price: "€115",
    style: "Success",
    badge: "MOST POPULAR", // optional pill shown beside the tier name
    // Reuses the previous Ultimate payment link — it already charges €115.
    stripe: "https://buy.stripe.com/9B628s6sibDZ3H47D11gs0j",
    // Matches a "Full Optimization" role, or the older "Ultimate Optimization"
    // role if you haven't renamed it yet — so either works, rename at your leisure.
    roleMatch: /full optimization|ultimate optimization/i,
    tagline: "Your whole system tuned as one — BIOS, Windows, network, overclocking and software, fully tested. Everything we do, one price.",
    features: [
      "BIOS optimization (SCEWIN)",
      "Windows + low-latency optimization",
      "Network + latency tuning",
      "CPU, GPU + RAM overclocking",
      "Undervolting + advanced hardware tuning",
      "Game + software optimization (Steam, Battle.net, Discord, OBS)",
      "Stress + stability testing",
      "Performance benchmarking",
      "Temperature + power optimization",
      "Hardware diagnostics",
      "2 months of support",
    ],
  },
];

// Individual overclocking services (booked via ticket — no Stripe link).
export const OVERCLOCKS = [
  {
    id: "cpu-oc",
    name: "CPU Overclock",
    short: "CPU",
    price: "€30",
    style: "Secondary",
    tagline: "Voltage, LLC and thermal tuning, fully stress-tested.",
    features: [
      "Voltage, LLC & thermal tuning",
      "Full stability + stress testing",
      "Better 1% lows in CPU-heavy games",
    ],
  },
  {
    id: "ram-oc",
    name: "RAM Overclock",
    short: "RAM",
    price: "€55",
    style: "Secondary",
    tagline: "XMP/EXPO plus manual timing tuning with a full stability test.",
    features: [
      "XMP/EXPO + manual timing tuning",
      "Full stability testing",
      "Often the biggest real-world FPS gain",
    ],
  },
  {
    id: "gpu-oc",
    name: "GPU Overclock",
    short: "GPU",
    price: "€20",
    style: "Secondary",
    tagline: "Core/memory curve, power limit and fan-curve tuning.",
    features: [
      "Core + memory curve tuning",
      "Power limit + fan curve",
      "Clocks that hold under load instead of dropping",
    ],
  },
];

// Everything a customer can buy or book, keyed by id (packages + overclocks),
// so ticket booking + purchase prompts work for all.
export const SERVICE_BY_ID = Object.fromEntries(
  [...PACKAGES, ...OVERCLOCKS].map((p) => [p.id, p]),
);

// Terms & Conditions (edit here).
export const TERMS = [
  { title: "No Refunds", text: "Once the optimization service has started, all payments are non-refundable." },
  { title: "Privacy", text: "All files, settings, methods, and information provided during the service are private. You may not share, leak, resell, redistribute, or provide them to others." },
  { title: "Performance", text: "Results vary depending on your hardware, software, games, and overall setup. Specific FPS increases or performance improvements are not guaranteed." },
  { title: "Backups", text: "You are responsible for backing up your important files before the optimization service begins. We are not responsible for lost data." },
  { title: "Chargebacks & Disputes", text: "Unauthorized chargebacks or payment disputes may result in a permanent blacklist from future services." },
  { title: "Agreement", text: "By purchasing the service, you confirm that you have read, understood, and agreed to all of the terms above." },
];

// Server rules (edit here).
export const RULES = [
  { title: "Be Respectful", text: "Treat everyone with respect. No harassment, hate speech, discrimination, or personal attacks." },
  { title: "No Spam", text: "No spam, mass mentions, or flooding. Keep messages relevant to each channel." },
  { title: "No Advertising", text: "No unsolicited advertising or self-promotion, including in DMs, without permission." },
  { title: "Keep It Clean", text: "No NSFW, gore, or otherwise inappropriate content." },
  { title: "Use the Right Channels", text: "Post in the channel that fits your message, and read the pinned messages first." },
  { title: "No Scamming", text: "Scamming, phishing, or any fraudulent behavior results in an immediate ban." },
  { title: "Follow Discord's ToS", text: "You must follow Discord's Terms of Service and Community Guidelines at all times." },
  { title: "Staff Have Final Say", text: "Follow staff instructions. For any dispute, open a ticket instead of arguing in chat." },
];

// Optional "last updated" labels shown on the Rules / Terms panels (free text —
// set to e.g. "29 July 2025", or leave null to hide the line).
export const RULES_UPDATED = process.env.RULES_UPDATED || null;
export const TERMS_UPDATED = process.env.TERMS_UPDATED || null;
// Linked from the Rules panel's "Discord ToS" button.
export const DISCORD_TOS_URL = "https://discord.com/terms";
