const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load(file, fallback) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function save(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

const db = {
  giveaways: load("giveaways.json", []),
  tickets: load("tickets.json", {}),
  suggestions: load("suggestions.json", []),
  economy: load("economy.json", {}),
  levels: load("levels.json", {}),
  reactionRoles: load("reactionRoles.json", []),
  warns: load("warns.json", {}),
  automod: load("automod.json", {}),
  ticketLogs: load("ticketLogs.json", {})
};

function persist() {
  save("giveaways.json", db.giveaways);
  save("tickets.json", db.tickets);
  save("suggestions.json", db.suggestions);
  save("economy.json", db.economy);
  save("levels.json", db.levels);
  save("reactionRoles.json", db.reactionRoles);
  save("warns.json", db.warns);
  save("automod.json", db.automod);
  save("ticketLogs.json", db.ticketLogs);
}

module.exports = { db, save, persist, DATA_DIR };
