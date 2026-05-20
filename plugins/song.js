const yts = require('yt-search');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '../tmp');

// Ensure tmp dir exists
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

module.exports = {
    command: "song",
    alias: ["audio", "nyimbo", "play", "music"],
    category: "download",
    description: "Search and download audio directly",

    async execute(m, sock, { args, userSettings, prefix }) {

        const lang = userSettings?.lang || 'en';
        const style = userSettings?.style || 'harsh';

        const modes = {
            harsh: {
                title: "🎧 𝕬𝖚𝖉𝖎𝖔 𝕰𝖝𝖊𝖈𝖚𝖙𝖎𝖔𝖓𝖊𝖗 🎧",
                searching: "🔍 𝕾𝖊𝖆𝖗𝖈𝖍𝖎𝖓𝖌... 🦾",
                downloading: "📥 𝕯𝖔𝖜𝖓𝖑𝖔𝖆𝖉𝖎𝖓𝖌 𝖆𝖚𝖉𝖎𝖔... ⚙️",
                success: "✅ 𝕾𝖔𝖓𝖌 𝖘𝖊𝖓𝖙! 🎶",
                err: "💢 𝖂𝖍𝖆𝖙 𝖙𝖍𝖊 𝖋𝖚𝖈𝖐 𝖎𝖘 𝖙𝖍𝖎𝖘? 𝕾𝖊𝖓𝖉 𝖆 𝖗𝖊𝖆𝖑 𝖓𝖆𝖒𝖊. 🖕"
            },
            normal: {
                title: "🎵 Music Finder 🎵",
                searching: "🔍 Searching...",
                downloading: "📥 Downloading audio...",
                success: "✅ Song sent!",
                err: "❌ Video not found."
            },
            girl: {
                title: "🎼 𝐿𝓊𝓅𝒾𝓃'𝓈 𝑀𝑒𝓁𝑜𝒹𝓎 🎼",
                searching: "🔍 𝐿𝑜𝑜𝓀𝒾𝓃𝑔 𝒻𝑜𝓇 𝓎𝑜𝓊𝓇 𝓈𝑜𝓃𝑔... 💕",
                downloading: "📥 𝒹𝑜𝓌𝓃𝓁𝑜𝒶𝒹𝒾𝓃𝑔 𝒶𝓊𝒹𝒾𝑜... ✨",
                success: "🌸 𝐻𝑒𝓇𝑒'𝓈 𝓎𝑜𝓊𝓇 𝓈𝑜𝓃𝑔, 𝒹𝒶𝓇𝓁𝒾𝓃𝑔~ 🎶",
                err: "🌸 𝑜𝑜𝓅𝓈𝒾𝑒! 𝒾 𝒸𝒶𝓃'𝓉 𝒻𝒾𝓃𝒹 𝓉𝒽𝒶𝓉 𝓈𝑜𝓃𝑔~ 🍭"
            }
        };

        const current = modes[style] || modes.normal;
        let cleanupFiles = [];

        const addCleanup = (file) => cleanupFiles.push(file);
        const cleanup = async () => {
            for (const file of cleanupFiles) {
                try {
                    if (fs.existsSync(file)) await fs.promises.unlink(file);
                } catch {}
            }
        };

        try {
            const query = args.join(" ");
            if (!query) return m.reply(current.err);

            await sock.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });
            const statusMsg = await m.reply(current.searching);

            // Search for the video
            const search = await yts(query);
            const video = search.videos[0];
            if (!video) return m.reply(current.err);

            // Send thumbnail with info
            let thumb = video.thumbnail;
            try {
                const thumbRes = await fetch(video.thumbnail);
                thumb = Buffer.from(await thumbRes.arrayBuffer());
            } catch {}

            let infoText = `*${current.title}*\n\n`;
            infoText += `📌 *Title:* ${video.title}\n`;
            infoText += `⏳ *Duration:* ${video.timestamp}\n`;
            infoText += `👀 *Views:* ${video.views?.toLocaleString() || 'Unknown'}\n\n`;
            infoText += `🎵 _Downloading audio, please wait..._`;

            await sock.sendMessage(m.chat, {
                image: thumb,
                caption: infoText
            }, { quoted: m });

            // Update status to downloading
            try { await sock.sendMessage(m.chat, { delete: statusMsg.key }); } catch {}
            const downloadingMsg = await m.reply(current.downloading);
            await sock.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // Download audio only
            const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
            const audioPath = path.join(TMP_DIR, `audio_${Date.now()}.mp3`);
            addCleanup(audioPath);

            await new Promise((resolve, reject) => {
                const stream = ytdl(video.url, {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    highWaterMark: 1 << 25
                });
                const writeStream = fs.createWriteStream(audioPath);
                stream.pipe(writeStream);
                stream.on('error', reject);
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            const stats = fs.statSync(audioPath);
            if (stats.size < 10000) throw new Error("Invalid audio file");

            // Delete status message and send audio
            try { await sock.sendMessage(m.chat, { delete: downloadingMsg.key }); } catch {}

            await sock.sendMessage(m.chat, {
                audio: fs.readFileSync(audioPath),
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `${safeTitle}.mp3`
            }, { quoted: m });

            await sock.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
            await cleanup();

        } catch (error) {
            console.error("SONG ERROR:", error);
            try {
                await sock.sendMessage(m.chat, { react: { text: "🚫", key: m.key } });
            } catch {}
            await cleanup();
            return m.reply("❌ Failed to process request. Try again later.");
        }
    }
};