const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
  SlashCommandBuilder, REST, Routes, Events, AttachmentBuilder
} = require("discord.js");
const ms = require("ms");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { db, persist } = require("./store");
const { makeTranscript } = require("./systems/transcript");
const music = require("./systems/music");
const { startDashboard } = require("./dashboard");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember]
});

const xpCooldown = new Map();

function eco(id) {
  if (!db.economy[id]) db.economy[id] = { coins: config.startBalance, daily: 0 };
  return db.economy[id];
}
function lvl(id) {
  if (!db.levels[id]) db.levels[id] = { xp: 0, level: 1 };
  return db.levels[id];
}
function needed(level) { return level * 150; }

function automodSettings(gid) {
  if (!db.automod[gid]) db.automod[gid] = { invite: true, massMention: true, badwords: ["nigger", "faggot"] };
  return db.automod[gid];
}

const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Kõik käsud"),
  new SlashCommandBuilder().setName("ticket-panel").setDescription("Ticket paneel").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("giveaway").setDescription("Giveaway")
    .addSubcommand(s => s.setName("start").setDescription("Alusta")
      .addStringOption(o => o.setName("aeg").setDescription("10m / 2h / 1d").setRequired(true))
      .addIntegerOption(o => o.setName("voitjad").setDescription("Võitjate arv").setRequired(true))
      .addStringOption(o => o.setName("auhind").setDescription("Auhind").setRequired(true)))
    .addSubcommand(s => s.setName("end").setDescription("Lõpeta").addStringOption(o => o.setName("id").setDescription("Sõnumi ID").setRequired(true)))
    .addSubcommand(s => s.setName("reroll").setDescription("Reroll").addStringOption(o => o.setName("id").setDescription("Sõnumi ID").setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("suggest").setDescription("Ettepanek").addStringOption(o => o.setName("idee").setRequired(true).setDescription("Idee")),
  new SlashCommandBuilder().setName("poll").setDescription("Küsitlus")
    .addStringOption(o => o.setName("kysimus").setRequired(true).setDescription("Küsimus"))
    .addStringOption(o => o.setName("valikud").setRequired(true).setDescription("jah,ei,võibolla")),
  new SlashCommandBuilder().setName("tempvc").setDescription("Ajutine voice"),
  new SlashCommandBuilder().setName("pulse").setDescription("Serveri pulss"),
  new SlashCommandBuilder().setName("balance").setDescription("Sinu raha"),
  new SlashCommandBuilder().setName("daily").setDescription("Igapäevane raha"),
  new SlashCommandBuilder().setName("pay").setDescription("Maksa kellelegi")
    .addUserOption(o => o.setName("kasutaja").setRequired(true).setDescription("Kellele"))
    .addIntegerOption(o => o.setName("summa").setRequired(true).setDescription("Summa")),
  new SlashCommandBuilder().setName("rank").setDescription("Sinu level")
    .addUserOption(o => o.setName("kasutaja").setDescription("Kasutaja")),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Top level / raha")
    .addStringOption(o => o.setName("tyyp").setDescription("xp või coins").addChoices(
      { name: "level", value: "xp" }, { name: "coins", value: "coins" }
    )),
  new SlashCommandBuilder().setName("play").setDescription("Mängi muusikat").addStringOption(o => o.setName("lugu").setRequired(true).setDescription("Nimi või YouTube URL")),
  new SlashCommandBuilder().setName("skip").setDescription("Järgmine lugu"),
  new SlashCommandBuilder().setName("stop").setDescription("Peata muusika"),
  new SlashCommandBuilder().setName("queue").setDescription("Järjekord"),
  new SlashCommandBuilder().setName("warn").setDescription("Hoiata")
    .addUserOption(o => o.setName("kasutaja").setRequired(true).setDescription("Kes"))
    .addStringOption(o => o.setName("pohjus").setRequired(true).setDescription("Põhjus"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("warnings").setDescription("Vaata warne").addUserOption(o => o.setName("kasutaja").setRequired(true).setDescription("Kes")),
  new SlashCommandBuilder().setName("clear").setDescription("Kustuta sõnumeid")
    .addIntegerOption(o => o.setName("arv").setRequired(true).setDescription("1-100"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("reactionrole").setDescription("Reaction role paneel")
    .addRoleOption(o => o.setName("roll").setRequired(true).setDescription("Roll"))
    .addStringOption(o => o.setName("emoji").setRequired(true).setDescription("Emoji"))
    .addStringOption(o => o.setName("tekst").setRequired(true).setDescription("Paneeli tekst"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName("automod").setDescription("Automod on/off")
    .addBooleanOption(o => o.setName("invite").setDescription("Keela invite lingid"))
    .addBooleanOption(o => o.setName("massmention").setDescription("Keela mass-mention"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c => c.toJSON());

client.once(Events.ClientReady, async () => {
  console.log(`Online: ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(config.token);
  for (const [id] of client.guilds.cache) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, id), { body: commands });
  }
  setInterval(checkGiveaways, 10_000);
  startDashboard(client);
});

client.on(Events.GuildMemberAdd, async member => {
  const ch = member.guild.systemChannel;
  if (!ch) return;
  ch.send({
    embeds: [new EmbedBuilder().setColor(0x7c4dff).setTitle("Tere tulemast")
      .setDescription(`${member} liitus. Kokku **${member.guild.memberCount}** liiget.`)
      .setThumbnail(member.user.displayAvatarURL())]
  }).catch(() => {});
});

client.on(Events.VoiceStateUpdate, async (oldS) => {
  if (oldS.channel && oldS.channel.name.startsWith("TEMP │") && oldS.channel.members.size === 0) {
    oldS.channel.delete().catch(() => {});
  }
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  const settings = automodSettings(message.guild.id);
  if (settings.invite && /(discord\.gg|discord\.com\/invite)\//i.test(message.content)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(() => {});
      return message.channel.send(`${message.author}, invite lingid on keelatud.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }
  }
  if (settings.massMention && message.mentions.users.size >= 5) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(() => {});
      return message.channel.send(`${message.author}, mass-mention on keelatud.`);
    }
  }
  if (settings.badwords?.some(w => message.content.toLowerCase().includes(w))) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete().catch(() => {});
    }
  }

  const key = `${message.guild.id}-${message.author.id}`;
  if (!xpCooldown.has(key) || Date.now() - xpCooldown.get(key) > config.xpCooldownMs) {
    xpCooldown.set(key, Date.now());
    const u = lvl(message.author.id);
    const gain = Math.floor(Math.random() * (config.xpPerMessage[1] - config.xpPerMessage[0] + 1)) + config.xpPerMessage[0];
    u.xp += gain;
    if (u.xp >= needed(u.level)) {
      u.xp -= needed(u.level);
      u.level += 1;
      eco(message.author.id).coins += u.level * 25;
      message.channel.send(`${message.author} tõusis levelile **${u.level}** (+${u.level * 25} coins)`).catch(() => {});
    }
    persist();
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const panel = db.reactionRoles.find(r => r.messageId === reaction.message.id && r.emoji === reaction.emoji.name);
  if (!panel) return;
  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.add(panel.roleId).catch(() => {});
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const panel = db.reactionRoles.find(r => r.messageId === reaction.message.id && r.emoji === reaction.emoji.name);
  if (!panel) return;
  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.remove(panel.roleId).catch(() => {});
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === "help") {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x7c4dff).setTitle("Aether — kõik käsud").setDescription(
            "**Ticket / GW**\n`/ticket-panel` `/giveaway start|end|reroll`\n\n**Fun / util**\n`/suggest` `/poll` `/tempvc` `/pulse` `/clear`\n\n**Economy / XP**\n`/balance` `/daily` `/pay` `/rank` `/leaderboard`\n\n**Music**\n`/play` `/skip` `/stop` `/queue`\n\n**Mod**\n`/warn` `/warnings` `/automod` `/reactionrole`\n\n**Dashboard** avaneb hosti pordil `/?secret=...`"
          )],
          ephemeral: true
        });
      }

      if (name === "ticket-panel") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("open_ticket").setLabel("Ava ticket").setStyle(ButtonStyle.Primary).setEmoji("🎫")
        );
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x00e5ff).setTitle("Support").setDescription("Vajuta nuppu, et avada ticket.")],
          components: [row]
        });
      }

      if (name === "giveaway") {
        const sub = interaction.options.getSubcommand();
        if (sub === "start") {
          const duration = ms(interaction.options.getString("aeg"));
          if (!duration) return interaction.reply({ content: "Vale aeg.", ephemeral: true });
          const winners = interaction.options.getInteger("voitjad");
          const prize = interaction.options.getString("auhind");
          const endAt = Date.now() + duration;
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("gw_join").setLabel("Osale").setStyle(ButtonStyle.Success).setEmoji("🎉")
          );
          const embed = new EmbedBuilder().setColor(0xffd166).setTitle("🎉 GIVEAWAY")
            .setDescription(`**Auhind:** ${prize}\n**Võitjaid:** ${winners}\n**Lõpeb:** <t:${Math.floor(endAt / 1000)}:R>\nOsalejaid: **0**`);
          const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
          db.giveaways.push({ messageId: msg.id, channelId: msg.channel.id, prize, winners, endAt, ended: false, entries: [] });
          persist();
          return interaction.reply({ content: "Käivitatud.", ephemeral: true });
        }
        if (sub === "end") {
          const gw = db.giveaways.find(g => g.messageId === interaction.options.getString("id"));
          if (!gw) return interaction.reply({ content: "Ei leitud.", ephemeral: true });
          await endGiveaway(gw);
          return interaction.reply({ content: "Lõpetatud.", ephemeral: true });
        }
        if (sub === "reroll") {
          const gw = db.giveaways.find(g => g.messageId === interaction.options.getString("id"));
          if (!gw || !gw.ended) return interaction.reply({ content: "Lõpetatud GW-d ei leitud.", ephemeral: true });
          const w = pickWinners(gw.entries, 1)[0];
          return interaction.reply(`Uus võitja: ${w ? `<@${w}>` : "pole osalejaid"}`);
        }
      }

      if (name === "suggest") {
        const idea = interaction.options.getString("idee");
        db.suggestions.push({ user: interaction.user.id, idea, at: Date.now() });
        persist();
        const msg = await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0x4caf50).setTitle("Ettepanek").setDescription(idea).setFooter({ text: interaction.user.tag })] });
        await msg.react("✅"); await msg.react("❌");
        return interaction.reply({ content: "Saadetud.", ephemeral: true });
      }

      if (name === "poll") {
        const q = interaction.options.getString("kysimus");
        const opts = interaction.options.getString("valikud").split(",").map(s => s.trim()).filter(Boolean).slice(0, 8);
        const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣"];
        const msg = await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x2196f3).setTitle(q).setDescription(opts.map((o, i) => `${emojis[i]} ${o}`).join("\n"))],
          fetchReply: true
        });
        for (let i = 0; i < opts.length; i++) await msg.react(emojis[i]);
      }

      if (name === "tempvc") {
        const vc = await interaction.guild.channels.create({
          name: `TEMP │ ${interaction.user.username}`,
          type: ChannelType.GuildVoice,
          permissionOverwrites: [
            { id: interaction.guild.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ManageChannels] }
          ]
        });
        return interaction.reply({ content: `VC: ${vc}`, ephemeral: true });
      }

      if (name === "pulse") {
        const events = [
          "⚡ Priority tickets 10 min.",
          "🎁 Staff võib teha mini-GW.",
          "🛰️ Server stabiilne.",
          "🌀 Kasuta /suggest.",
          "🔮 Tee /tempvc ja kogu tiim."
        ];
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x9c27b0).setTitle("Aether Pulse")
            .setDescription(`${events[Math.floor(Math.random() * events.length)]}\nLiikmeid: **${interaction.guild.memberCount}**\nTicketid: **${Object.keys(db.tickets).length}**\nGW: **${db.giveaways.filter(g => !g.ended).length}**`)]
        });
      }

      if (name === "balance") {
        return interaction.reply(`Sul on **${eco(interaction.user.id).coins}** ${config.currency}`);
      }
      if (name === "daily") {
        const u = eco(interaction.user.id);
        if (Date.now() - u.daily < 86400000) return interaction.reply({ content: "Daily juba võetud. Proovi homme.", ephemeral: true });
        const amount = 150 + Math.floor(Math.random() * 100);
        u.daily = Date.now();
        u.coins += amount;
        persist();
        return interaction.reply(`Daily: +**${amount}** ${config.currency}`);
      }
      if (name === "pay") {
        const target = interaction.options.getUser("kasutaja");
        const amount = interaction.options.getInteger("summa");
        if (amount <= 0) return interaction.reply({ content: "Vale summa.", ephemeral: true });
        const from = eco(interaction.user.id);
        if (from.coins < amount) return interaction.reply({ content: "Pole piisavalt.", ephemeral: true });
        from.coins -= amount;
        eco(target.id).coins += amount;
        persist();
        return interaction.reply(`Saatsid ${target} **${amount}** ${config.currency}`);
      }
      if (name === "rank") {
        const user = interaction.options.getUser("kasutaja") || interaction.user;
        const u = lvl(user.id);
        return interaction.reply(`**${user.tag}** — Level ${u.level} | XP ${u.xp}/${needed(u.level)} | ${eco(user.id).coins} coins`);
      }
      if (name === "leaderboard") {
        const type = interaction.options.getString("tyyp") || "xp";
        let list;
        if (type === "coins") {
          list = Object.entries(db.economy).sort((a, b) => b[1].coins - a[1].coins).slice(0, 10)
            .map(([id, v], i) => `**${i + 1}.** <@${id}> — ${v.coins}`).join("\n");
        } else {
          list = Object.entries(db.levels).sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp).slice(0, 10)
            .map(([id, v], i) => `**${i + 1}.** <@${id}> — Lvl ${v.level}`).join("\n");
        }
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffc107).setTitle("Leaderboard").setDescription(list || "Tühi")] });
      }

      if (name === "play") return music.addSong(interaction, interaction.options.getString("lugu"));
      if (name === "skip") {
        const ok = music.skip(interaction.guild.id);
        return interaction.reply(ok ? "Skipped." : "Järjekord tühi.");
      }
      if (name === "stop") {
        const ok = music.stop(interaction.guild.id);
        return interaction.reply(ok ? "Peatatud." : "Midagi ei mängi.");
      }
      if (name === "queue") {
        const q = music.list(interaction.guild.id);
        if (!q.length) return interaction.reply("Tühi.");
        return interaction.reply(q.map((s, i) => `${i === 0 ? "▶️" : `${i}.`} ${s.title}`).join("\n"));
      }

      if (name === "warn") {
        const user = interaction.options.getUser("kasutaja");
        const reason = interaction.options.getString("pohjus");
        if (!db.warns[user.id]) db.warns[user.id] = [];
        db.warns[user.id].push({ by: interaction.user.id, reason, at: Date.now() });
        persist();
        return interaction.reply(`${user} sai warni: **${reason}** (kokku ${db.warns[user.id].length})`);
      }
      if (name === "warnings") {
        const user = interaction.options.getUser("kasutaja");
        const list = (db.warns[user.id] || []).map((w, i) => `${i + 1}. ${w.reason}`).join("\n") || "Puhtad paberid.";
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${user.tag} warnid`).setDescription(list)] });
      }
      if (name === "clear") {
        const n = Math.min(100, Math.max(1, interaction.options.getInteger("arv")));
        await interaction.channel.bulkDelete(n, true);
        return interaction.reply({ content: `Kustutatud ${n}`, ephemeral: true });
      }
      if (name === "reactionrole") {
        const role = interaction.options.getRole("roll");
        const emoji = interaction.options.getString("emoji");
        const tekst = interaction.options.getString("tekst");
        const msg = await interaction.channel.send({
          embeds: [new EmbedBuilder().setColor(role.color || 0x7c4dff).setTitle("Reaction Role").setDescription(`${tekst}\n\nReageeri ${emoji} et saada ${role}`)]
        });
        await msg.react(emoji);
        db.reactionRoles.push({ messageId: msg.id, roleId: role.id, emoji });
        persist();
        return interaction.reply({ content: "Paneel olemas.", ephemeral: true });
      }
      if (name === "automod") {
        const s = automodSettings(interaction.guild.id);
        const inv = interaction.options.getBoolean("invite");
        const mm = interaction.options.getBoolean("massmention");
        if (inv !== null) s.invite = inv;
        if (mm !== null) s.massMention = mm;
        persist();
        return interaction.reply(`Automod: invite=${s.invite}, massMention=${s.massMention}`);
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "open_ticket") {
        if (db.tickets[interaction.user.id]) {
          return interaction.reply({ content: `Sul on ticket: <#${db.tickets[interaction.user.id]}>`, ephemeral: true });
        }
        let category = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === config.ticketCategoryName);
        if (!category) category = await interaction.guild.channels.create({ name: config.ticketCategoryName, type: ChannelType.GuildCategory });
        let support = interaction.guild.roles.cache.find(r => r.name === config.supportRoleName);
        if (!support) support = await interaction.guild.roles.create({ name: config.supportRoleName, color: 0x00bcd4 });

        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20),
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: support.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }
          ]
        });
        db.tickets[interaction.user.id] = channel.id;
        persist();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("claim_ticket").setLabel("Claim").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("close_ticket").setLabel("Sulge + transcript").setStyle(ButtonStyle.Danger)
        );
        await channel.send({
          content: `${interaction.user} | ${support}`,
          embeds: [new EmbedBuilder().setColor(0x00e5ff).setTitle("Ticket").setDescription("Kirjuta probleem. Sulgemisel tehakse transcript.")],
          components: [row]
        });
        return interaction.reply({ content: `Ticket: ${channel}`, ephemeral: true });
      }

      if (interaction.customId === "close_ticket") {
        await interaction.deferReply();
        const file = await makeTranscript(interaction.channel);
        const ownerId = Object.keys(db.tickets).find(uid => db.tickets[uid] === interaction.channel.id);
        if (ownerId) {
          delete db.tickets[ownerId];
          persist();
        }
        await interaction.editReply({ content: "Transcript valmis, kanal kustub 5s pärast.", files: [new AttachmentBuilder(file)] });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      }

      if (interaction.customId === "claim_ticket") {
        return interaction.reply(`${interaction.user} võttis ticketi.`);
      }

      if (interaction.customId === "gw_join") {
        const gw = db.giveaways.find(g => g.messageId === interaction.message.id && !g.ended);
        if (!gw) return interaction.reply({ content: "Läbi.", ephemeral: true });
        if (gw.entries.includes(interaction.user.id)) return interaction.reply({ content: "Juba sees.", ephemeral: true });
        gw.entries.push(interaction.user.id);
        persist();
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setDescription(embed.data.description.replace(/Osalejaid: \*\*\d+\*\*/, `Osalejaid: **${gw.entries.length}**`));
        await interaction.message.edit({ embeds: [embed] });
        return interaction.reply({ content: "Oled sees 🎉", ephemeral: true });
      }
    }
  } catch (e) {
    console.error(e);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction.reply({ content: "Error. Vaata konsooli.", ephemeral: true }).catch(() => {});
    }
  }
});

function pickWinners(entries, count) {
  const pool = [...new Set(entries)];
  const winners = [];
  while (pool.length && winners.length < count) {
    winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return winners;
}

async function endGiveaway(gw) {
  gw.ended = true;
  persist();
  const channel = await client.channels.fetch(gw.channelId).catch(() => null);
  if (!channel) return;
  const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
  const winners = pickWinners(gw.entries, gw.winners);
  const text = winners.length ? winners.map(id => `<@${id}>`).join(", ") : "Pole osalejaid";
  if (msg) {
    const embed = EmbedBuilder.from(msg.embeds[0]).setColor(0x333333).setTitle("🎉 GIVEAWAY LÕPPENUD");
    await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  }
  await channel.send(`**${gw.prize}** lõppes. Võitja(d): ${text}`);
}

async function checkGiveaways() {
  for (const gw of db.giveaways) {
    if (!gw.ended && Date.now() >= gw.endAt) await endGiveaway(gw);
  }
}

client.login(config.token);
