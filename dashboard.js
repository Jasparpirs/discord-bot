const express = require("express");
const fs = require("fs");
const path = require("path");
const { db } = require("./store");
const config = require("./config");

function startDashboard(client) {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (req, res) => {
    if (req.query.secret !== config.dashboardSecret) {
      return res.status(401).send("Lisa URL-i ?secret=SINU_SECRET");
    }
    const guilds = [...client.guilds.cache.values()].map(g => `${g.name} (${g.memberCount})`).join("<br>");
    const activeGw = db.giveaways.filter(g => !g.ended).length;
    const tickets = Object.keys(db.tickets).length;
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Aether Dashboard</title>
<style>body{font-family:system-ui;background:#0b0d12;color:#eee;padding:32px;max-width:900px;margin:auto}
.card{background:#161a22;padding:20px;border-radius:16px;margin:12px 0}h1{color:#b388ff}</style></head>
<body><h1>Aether Dashboard</h1>
<div class="card"><b>Bot:</b> ${client.user?.tag || "-"}<br><b>Serverid:</b><br>${guilds}</div>
<div class="card"><b>Avatud ticketid:</b> ${tickets}<br><b>Aktiivsed giveawayd:</b> ${activeGw}<br>
<b>Economy kasutajaid:</b> ${Object.keys(db.economy).length}<br>
<b>Level kasutajaid:</b> ${Object.keys(db.levels).length}<br>
<b>Reaction role paneele:</b> ${db.reactionRoles.length}</div>
<div class="card"><a style="color:#80d8ff" href="/transcripts?secret=${config.dashboardSecret}">Transcriptid</a></div>
</body></html>`);
  });

  app.get("/transcripts", (req, res) => {
    if (req.query.secret !== config.dashboardSecret) return res.status(401).send("Unauthorized");
    const dir = path.join(__dirname, "data", "transcripts");
    if (!fs.existsSync(dir)) return res.send("Transcripte pole.");
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".html"));
    const links = files.map(f => `<li><a style="color:#80d8ff" href="/transcript/${f}?secret=${config.dashboardSecret}">${f}</a></li>`).join("");
    res.send(`<body style="background:#111;color:#eee;font-family:system-ui;padding:24px"><h1>Transcriptid</h1><ul>${links}</ul></body>`);
  });

  app.get("/transcript/:file", (req, res) => {
    if (req.query.secret !== config.dashboardSecret) return res.status(401).send("Unauthorized");
    const file = path.join(__dirname, "data", "transcripts", path.basename(req.params.file));
    if (!fs.existsSync(file)) return res.status(404).send("Puudu");
    res.sendFile(file);
  });

  app.listen(config.dashboardPort, () => {
    console.log(`Dashboard: http://localhost:${config.dashboardPort}/?secret=${config.dashboardSecret}`);
  });
}

module.exports = { startDashboard };
