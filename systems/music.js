const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require("@discordjs/voice");
const play = require("play-dl");

const queues = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, { songs: [], player: createAudioPlayer(), connection: null, textChannel: null });
    const q = queues.get(guildId);
    q.player.on(AudioPlayerStatus.Idle, () => playNext(guildId));
    q.player.on("error", (e) => console.error("Music error:", e.message));
  }
  return queues.get(guildId);
}

async function playNext(guildId) {
  const q = queues.get(guildId);
  if (!q) return;
  q.songs.shift();
  if (!q.songs.length) {
    if (q.connection) q.connection.destroy();
    queues.delete(guildId);
    return;
  }
  await startTrack(guildId, q.songs[0]);
}

async function startTrack(guildId, song) {
  const q = getQueue(guildId);
  try {
    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });
    q.player.play(resource);
    if (q.textChannel) q.textChannel.send(`▶️ Mängib: **${song.title}**`).catch(() => {});
  } catch (e) {
    if (q.textChannel) q.textChannel.send(`Ei saanud mängida: ${song.title}`).catch(() => {});
    playNext(guildId);
  }
}

async function addSong(interaction, query) {
  const member = interaction.member;
  const voice = member.voice.channel;
  if (!voice) return interaction.reply({ content: "Mine enne voice kanalisse.", ephemeral: true });

  await interaction.deferReply();
  let info;
  try {
    if (query.startsWith("http")) {
      const v = await play.video_info(query);
      info = { title: v.video_details.title, url: v.video_details.url };
    } else {
      const results = await play.search(query, { limit: 1 });
      if (!results.length) return interaction.editReply("Ei leidnud lugu.");
      info = { title: results[0].title, url: results[0].url };
    }
  } catch {
    return interaction.editReply("Otsing ebaõnnestus. Proovi teist linki/nime.");
  }

  const q = getQueue(interaction.guild.id);
  q.textChannel = interaction.channel;
  q.songs.push(info);

  if (!q.connection) {
    q.connection = joinVoiceChannel({
      channelId: voice.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator
    });
    q.connection.subscribe(q.player);
    try {
      await entersState(q.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      return interaction.editReply("Ei saanud voice'i ühendada.");
    }
    await startTrack(interaction.guild.id, info);
    return interaction.editReply(`▶️ Alustan: **${info.title}**`);
  }

  return interaction.editReply(`➕ Järjekorda: **${info.title}** (koht ${q.songs.length})`);
}

function skip(guildId) {
  const q = queues.get(guildId);
  if (!q) return false;
  q.player.stop();
  return true;
}

function stop(guildId) {
  const q = queues.get(guildId);
  if (!q) return false;
  q.songs = [];
  q.player.stop();
  if (q.connection) q.connection.destroy();
  queues.delete(guildId);
  return true;
}

function list(guildId) {
  const q = queues.get(guildId);
  if (!q || !q.songs.length) return [];
  return q.songs;
}

module.exports = { addSong, skip, stop, list };
