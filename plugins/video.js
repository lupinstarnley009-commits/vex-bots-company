const yts = require('yt-search');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const translate = require('google-translate-api-x');

// Session store: { userId: { step, results, selectedVideo, temp } }
const userSessions = new Map();

module.exports = {
    command: "video",
    alias: ["playvideo", "youtube", "ytv"],
    category: "download",
    description: "Search YouTube and download MP3/MP4 with dual selection (reply or prefix+number)",

    async execute(m, sock, { args, userSettings }) {
        const lang = userSettings?.lang || 'en';
        const style = userSettings?.style || 'harsh';
        const prefix = userSettings?.prefix || '.';
        const sender = m.sender;
        const chat = m.chat;

        const styles = {
            harsh: {
                title: "⛓️ 𝖁𝕰𝖃 𝖁𝕴𝕯𝕰𝕺 𝕯𝕰𝕾𝕿𝕽𝕺𝖄𝕰𝕽 ⛓️",
                searchMsg: "🔍 𝕾𝖊𝖆𝖗𝖈𝖍𝖎𝖓𝖌...",
                listHeader: "📋 𝖁𝕴𝕯𝕰𝕺 𝕽𝕰𝕾𝖀𝕷𝕿𝕾",
                formatPrompt: "⚡ 𝖁𝕰𝖃 𝕱𝕺𝕽𝕸𝕬𝕿:\n1. MP3 🎧\n2. MP4 🎬",
                downloading: "📥 𝕯𝖔𝖜𝖓𝖑𝖔𝖆𝖉𝖎𝖓𝖌... ⚙️",
                react: "🦾",
                err: "💢 𝕿𝖞𝖕𝖊 𝖆 𝖛𝖎𝖉𝖊𝖔 𝖓𝖆𝖒𝖊 𝖔𝖗 𝖓𝖚𝖒𝖇𝖊𝖗 🤬",
                successAudio: "🎧 𝕬𝖚𝖉𝖎𝖔 𝖗𝖊𝖆𝖉𝖞!",
                successVideo: "🎬 𝖁𝖎𝖉𝖊𝖔 𝖗𝖊𝖆𝖉𝖞!"
            },
            normal: {
                title: "🎥 YouTube Downloader",
                searchMsg: "🔍 Searching...",
                listHeader: "📋 Search Results",
                formatPrompt: "Select format:\n1. MP3 (Audio)\n2. MP4 (Video)",
                downloading: "📥 Downloading, please wait...",
                react: "🎥",
                err: "❌ Please provide a video name or number",
                successAudio: "✅ Audio sent!",
                successVideo: "✅ Video sent!"
            },
            girl: {
                title: "🎀 𝒴𝑜𝓊𝒯𝓊𝒷𝑒 𝒮𝓌𝑒𝑒𝓉𝒾𝑒 🎀",
                searchMsg: "🔍 𝐿𝑜𝑜𝓀𝒾𝓃𝑔 𝒻𝑜𝓇 𝓎𝑜𝓊𝓇 𝓋𝒾𝒹𝑒𝑜... 💕",
                listHeader: "✨ ℱ𝑜𝓊𝓃𝒹 𝓉𝒽𝑒𝓈𝑒 𝓋𝒾𝒹𝑒𝑜𝓈 ✨",
                formatPrompt: "𝒞𝒽𝑜𝑜𝓈𝑒 𝒻𝑜𝓇𝓂𝒶𝓉:\n1. MP3 🎶\n2. MP4 🎥",
                downloading: "📥 𝒹𝑜𝓌𝓃𝓁𝑜𝒶𝒹𝒾𝓃𝑔 𝒻𝑜𝓇 𝓎𝑜𝓊... ✨",
                react: "💖",
                err: "🌸 𝓌𝒽𝒶𝓉 𝓈𝒽𝑜𝓊𝓁𝒹 𝐼 𝓈𝑒𝒶𝓇𝒸𝒽?",
                successAudio: "🎶 𝐻𝑒𝓇𝑒'𝓈 𝓎𝑜𝓊𝓇 𝓈𝑜𝓃𝑔~",
                successVideo: "🎬 𝒲𝒶𝓉𝒸𝒽 𝓉𝒽𝒾𝓈, 𝒷𝒶𝒷𝑒~"
            }
        };
        const current = styles[style] || styles.normal;

        const tmpDir = './tmp';
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        let cleanupFiles = [];
        const addCleanup = (f) => cleanupFiles.push(f);
        const cleanup = async () => {
            for (const f of cleanupFiles) {
                try { if (fs.existsSync(f)) await fs.promises.unlink(f); } catch {}
            }
        };

        try {
            // Get user session data
            let session = userSessions.get(sender);
            const input = args.join(' ').trim();

            // ========== CASE 1: User is selecting a format (step = 'format') ==========
            if (session && session.step === 'format' && /^[12]$/.test(input)) {
                const format = parseInt(input);
                const video = session.selectedVideo;
                if (!video) throw new Error('Session expired');

                await sock.sendMessage(chat, { react: { text: "⏳", key: m.key } });
                const statusMsg = await m.reply(current.downloading);

                const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
                let filePath, sendPromise;

                if (format === 1) { // MP3
                    filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
                    addCleanup(filePath);
                    await new Promise((res, rej) => {
                        const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 });
                        const write = fs.createWriteStream(filePath);
                        stream.pipe(write);
                        stream.on('error', rej);
                        write.on('finish', res);
                        write.on('error', rej);
                    });
                    const stats = fs.statSync(filePath);
                    if (stats.size < 10000) throw new Error('Invalid audio');
                    sendPromise = sock.sendMessage(chat, {
                        audio: fs.readFileSync(filePath),
                        mimetype: 'audio/mpeg',
                        ptt: false,
                        fileName: `${safeTitle}.mp3`
                    }, { quoted: m });
                } else { // MP4
                    filePath = path.join(tmpDir, `video_${Date.now()}.mp4`);
                    addCleanup(filePath);
                    await new Promise((res, rej) => {
                        const stream = ytdl(video.url, { quality: '18', highWaterMark: 1 << 25 });
                        const write = fs.createWriteStream(filePath);
                        stream.pipe(write);
                        stream.on('error', rej);
                        write.on('finish', res);
                        write.on('error', rej);
                    });
                    const stats = fs.statSync(filePath);
                    if (stats.size < 10000) throw new Error('Invalid video');
                    sendPromise = sock.sendMessage(chat, {
                        video: fs.readFileSync(filePath),
                        caption: `🎬 ${video.title}`,
                        mimetype: 'video/mp4',
                        fileName: `${safeTitle}.mp4`
                    }, { quoted: m });
                }

                try { await sock.sendMessage(chat, { delete: statusMsg.key }); } catch {}
                await sendPromise;
                await sock.sendMessage(chat, { react: { text: "✅", key: m.key } });
                userSessions.delete(sender);
                await cleanup();
                return;
            }

            // ========== CASE 2: User is selecting a video from results (step = 'select') ==========
            if (session && session.step === 'select' && /^\d+$/.test(input)) {
                const idx = parseInt(input) - 1;
                if (idx < 0 || idx >= session.results.length) {
                    return m.reply(`❌ Invalid number. Choose 1-${session.results.length}`);
                }
                const selected = session.results[idx];
                // Move to format selection
                userSessions.set(sender, {
                    step: 'format',
                    selectedVideo: selected
                });
                // Send format choice message
                let formatMsg = `*${selected.title}*\n\n${current.formatPrompt}\n\n_Reply with 1 or 2_`;
                await sock.sendMessage(chat, { text: formatMsg }, { quoted: m });
                return;
            }

            // ========== CASE 3: New search query or direct number selection without prior session ==========
            // If user sends a number but no session -> treat as error or new search? Better as error.
            if (/^\d+$/.test(input) && !session) {
                return m.reply("⚠️ No active search. Use `.video <song name>` first.");
            }

            // Otherwise, it's a new search query
            if (!input) {
                return m.reply(current.err);
            }

            // Perform YouTube search
            await sock.sendMessage(chat, { react: { text: current.react, key: m.key } });
            const searchMsg = await m.reply(current.searchMsg);

            const searchResults = await yts(input);
            let videos = searchResults.videos.filter(v => v.seconds < 3600 && v.title && v.url).slice(0, 6);
            if (!videos.length) {
                await sock.sendMessage(chat, { delete: searchMsg.key }).catch(()=>{});
                return m.reply("❌ No results found.");
            }

            // Build results listing
            let list = `*${current.title}*\n\n${current.listHeader}:\n\n`;
            videos.forEach((v, i) => {
                list += `*${i+1}.* ${v.title}\n⏱️ ${v.timestamp}  |  👁️ ${v.views?.toLocaleString() || '0'}\n\n`;
            });
            list += `_Reply with the number (e.g., "2") to select._\n_Or type ${prefix}video <number> directly._`;

            // Delete searching message and send results
            await sock.sendMessage(chat, { delete: searchMsg.key }).catch(()=>{});
            // Send thumbnail of first result as image
            let thumb = videos[0].thumbnail;
            try {
                const res = await fetch(videos[0].thumbnail);
                thumb = Buffer.from(await res.arrayBuffer());
            } catch(e) { thumb = null; }

            if (thumb) {
                await sock.sendMessage(chat, { image: thumb, caption: list }, { quoted: m });
            } else {
                await sock.sendMessage(chat, { text: list }, { quoted: m });
            }

            // Save session for this user
            userSessions.set(sender, {
                step: 'select',
                results: videos
            });
            // Auto-expire after 5 minutes
            setTimeout(() => {
                if (userSessions.get(sender)?.step === 'select') userSessions.delete(sender);
            }, 300000);

        } catch (error) {
            console.error("Video Command Error:", error);
            await sock.sendMessage(chat, { react: { text: "❌", key: m.key } }).catch(()=>{});
            await m.reply("❌ Failed to process request. Try again later.");
            await cleanup();
        }
    }
};