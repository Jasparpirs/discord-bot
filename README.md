# StenTweaks — Discord Bot

A clean, minimal Discord bot for the StenTweaks PC optimization service.

## Features

- **Reviews** — the bot never posts reviews. On **Finish** a customer taps a star rating (feeds the
  rating on the sales panel) and is pointed to your reviews channel to **post their words
  themselves**, so reviews are genuine, real-person posts. (Give customers send access to that channel.)
- **`/optimizations`** *(owner only)* — posts the sales panel: Essential & Ultimate tiers plus
  Individual Overclocks (CPU/RAM/GPU/Bundle), each with a **Book** button that opens a ticket
  for that package, plus a **Full Breakdown** button. Prices/copy live in `src/config.js`.
- **Tickets** — private channels visible only to the opener and staff. Opened from the panel
  button, with a staff **Claim** button and a confirm-to-close flow. On close, a **transcript**
  is logged to `LOG_CHANNEL_ID`.
  - **Intake form** — booking a package pops a form for CPU / GPU / RAM / monitor / goal, and
    posts a clean specs card into the ticket. Members can add or update specs anytime with the
    **Add / Update Specs** button.
  - **The ticket is the order** — no separate tracker. Status reads top-to-bottom from the ticket
    itself: opened → **Mark Paid** → booked → **Finish**. Staff controls are just **Claim · Mark
    Paid · Finish · Close**.
  - **Finish** — when the job's done, staff hit the **Finish** button (or `/finish`): it frees the
    booked slot and posts a "complete" card **in the ticket** with star buttons (the customer taps
    their rating, then is pointed to the reviews channel to post their own words) plus a one-click
    **Close**. No DMs — everything stays in the ticket.
  - **Session scheduling** — once a ticket is **paid** (Stripe/grant role, or staff **Mark Paid**),
    a **Schedule Session** button lets the customer pick a date + time. Sessions are spaced
    `SLOT_HOURS` apart, so booking one slot **locks out** anything within that window (book 17:00 →
    next free is 19:00); the bot suggests the next open slot on a clash. Reschedule/cancel from the
    booking card, and staff see the whole calendar with **`/bookings`**. Closing the ticket frees
    the slot. A **Stripe** purchase auto-opens a paid ticket and drops the booking prompt straight
    in, so the customer lands on the scheduling step with no extra steps.
  - **Request ASAP** — instead of picking a time, the customer can request to start now. Staff get
    an **Approve & Start Now** button; approving reserves a slot starting immediately (locking the
    window so nothing overlaps) and pings them to get on AnyDesk. Blocked if a scheduled session is
    already within range.
  - **Reminders** — the bot DMs the customer (and nudges the ticket) `REMIND_BEFORE_MIN` minutes
    before their session. A once-a-minute sweep with a persisted flag means reminders survive
    redeploys and never double-send.
- **`/stats`** *(staff)* — a business dashboard: members, total customers, open tickets, review
  average, estimated revenue, and a breakdown of customers by package. Exact customer counts need
  **Server Members Intent** enabled.
- **`/help`** — a quick, ephemeral command reference; staff also see the staff & moderation commands.
- **`/tos`** — posts the Terms & Conditions (clean Components V2 layout).
- **`/rules`** — posts the server rules (same style). Edit both in `src/config.js`.
- **`/giveaway <prize> <duration> [winners]`** — button-entry giveaways that survive restarts
  (persisted to `data/`), auto-pick winners, and `/reroll <message_id>` if needed.
- **Welcome** — when a member joins, a compact welcome card is posted to `WELCOME_CHANNEL_ID`
  ("Welcome @user · You're member #143"). Needs **Server Members Intent** enabled in the
  Developer Portal.
- **Modmail** — a member DMs the bot and it relays into a private staff thread (and back).
- **Verify gate** — `/verifypanel` posts a Verify button that grants the verified role and posts
  a compact welcome.

## Structure

```
src/
  config.js     env vars, packages, constants
  perms.js      owner/staff/ticket + package-role checks
  ui.js         all embeds and button rows
  tickets.js    ticket-channel creation (shared by panel + Stripe)
  bookings.js   session bookings + the spacing/lock rule
  time.js       DST-aware timezone conversion for booked times
  store.js      shared atomic JSON read/write (crash-safe) + writability probe
  reviews.js    review counts/averages
  giveaways.js  giveaway state + scheduling
  modmail.js    DM <-> staff-thread relay
  stripe.js     payment webhook + role assignment
  index.js      client, command registration, interaction + message routing
```

All persisted data goes through `store.js`, which writes atomically (temp file +
rename) so a crash or redeploy mid-write can't corrupt a data file. The bot logs
its resolved `DATA_DIR` and a writability check on startup, and shuts down
cleanly on Railway's SIGTERM. Run the tests with `npm test`.

## Setup

1. **Discord Developer Portal** → your app → **Bot**: copy the token, enable
   **Message Content Intent** (needed for modmail) and **Server Members Intent** (required — the
   bot won't start without it, and the join welcome needs member-add events). Invite it with scopes
   `bot` + `applications.commands` and permissions: View Channels, Send Messages, Read Message
   History, Embed Links, and **Manage Channels** (tickets).
2. **Railway** → deploy this repo → add the variables from `.env.example` (at minimum
   `DISCORD_TOKEN`). Set `OWNER_ID` and `STAFF_ROLE_ID` to enable the owner panel and ticket
   access, and `SCHEDULE_TZ` (e.g. `Europe/Tallinn`) for correct booking times.

Commands register per-guild on startup, so they appear instantly.

## Stripe automation (optional)

When `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are set, the bot runs a webhook server
(`POST /stripe`) and **auto-assigns the package role** after a successful payment.

How it works: the colored Purchase buttons hand the customer a Stripe link containing
`client_reference_id=<discordId>-<packageId>`. When they pay, Stripe calls the webhook, and
the bot adds the matching role (found by name, e.g. a role called "Advanced Optimization"),
DMs the customer, and logs it to `LOG_CHANNEL_ID`.

Setup:
1. Railway → your service → **Settings → Networking → Generate Domain** (the bot listens on
   `$PORT`). Note the URL, e.g. `https://your-app.up.railway.app`.
2. Stripe Dashboard → **Developers → Webhooks → Add endpoint** → URL
   `https://your-app.up.railway.app/stripe`, event **`checkout.session.completed`**. Copy the
   **Signing secret** (`whsec_...`).
3. Railway → Variables: set `STRIPE_SECRET_KEY` (Stripe → Developers → API keys) and
   `STRIPE_WEBHOOK_SECRET`. Optionally `GUILD_ID`.
4. Create roles named to match each package. Give the bot **Manage Roles**, and drag its role
   **above** the package roles in Server Settings → Roles.

## Editing packages / prices

Everything lives in `src/config.js`: `PACKAGES` (optimization tiers) and `OVERCLOCKS`
(individual overclocks). Update it, push, and Railway redeploys.

## Theme

The sleek graphite look is driven by a small theme block in `src/config.js`:

- `BRAND_COLOR` — the single accent color (graphite silver) that runs down the sidebar of
  every panel. `ACCENTS` maps every surface to it, so all embeds share one identical style.
  Change this one value and the whole bot re-skins without touching `src/ui.js`.
- `BRAND_KICKER` — the small uppercase "letterhead" line shown above every panel title.

Every panel shares one style: an uppercase kicker + title header, clean key/value "spec"
cards for all data, one graphite sidebar, and a consistent footer. No banner images — the
panels are text-only for a clean, fast, monochrome feel.

## Optimization roles

Package ownership is read from a member's **role name** (e.g. a role named
"Advanced Optimization" → Advanced package) — used for `/stats` and the booking payment gate.
No hardcoded role IDs required.
