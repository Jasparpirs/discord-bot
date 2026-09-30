AETHER BOT — Pella / Pelican setup
==================================

KEEL / RUNTIME: Node.js (MITTE Python)
Soovitus: Node.js 20 või 22
Main file: index.js
Start: npm install && node index.js

1. Ava config.js ja pane token:
   token: process.env.TOKEN || "SINU_BOT_TOKEN"

   Parem: Pellas Environment Variables
   TOKEN=sinu_token
   PORT=3000
   DASH_SECRET=mingi_salasona

2. Discord Developer Portal intentid ON:
   - Message Content
   - Server Members
   - Presence

3. Serveris loo roll nimega Support (või muuda config.js)

4. Dashboard:
   http://SINU_HOST:PORT/?secret=aether123
   (või DASH_SECRET mida sa seadsid)

Käsud:
/help
/ticket-panel
/giveaway start
/play /skip /stop /queue
/balance /daily /pay /rank /leaderboard
/warn /warnings /clear /automod
/reactionrole
/suggest /poll /tempvc /pulse

Music vajab, et botil oleks Connect + Speak voice õigused.
YouTube võib vahel katki minna (YouTube muudab asju).
