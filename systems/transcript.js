const fs = require("fs");
const path = require("path");

async function makeTranscript(channel) {
  const messages = [];
  let lastId;
  while (true) {
    const fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!fetched || fetched.size === 0) break;
    messages.push(...fetched.values());
    lastId = fetched.last().id;
    if (fetched.size < 100) break;
  }
  messages.reverse();

  const rows = messages.map(m => {
    const time = new Date(m.createdTimestamp).toISOString();
    const content = (m.content || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const atts = [...m.attachments.values()].map(a => `<a href="${a.url}">${a.name}</a>`).join(" ");
    return `<div class="msg"><span class="time">${time}</span> <b>${m.author.tag}</b>: ${content} ${atts}</div>`;
  }).join("\n");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket ${channel.name}</title>
<style>body{font-family:system-ui;background:#111;color:#eee;padding:24px}
.msg{padding:8px 0;border-bottom:1px solid #333}.time{color:#888;font-size:12px}</style></head>
<body><h1>${channel.name}</h1>${rows || "<p>Tühi ticket</p>"}</body></html>`;

  const dir = path.join(__dirname, "..", "data", "transcripts");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${channel.id}.html`);
  fs.writeFileSync(file, html);
  return file;
}

module.exports = { makeTranscript };
