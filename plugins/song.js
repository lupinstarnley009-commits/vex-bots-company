const yts = require('yt-search');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { promisify } = require('util');
const streamPipeline = promisify(require('stream').pipeline);

const TMP_DIR = path.join(__dirname, '../tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Caches for search results and downloaded buffers
const searchCache = new Map();     // key: query, value: { video, timestamp }
const audioCache = new Map();      // key: videoUrl, value: { buffer, timestamp }
const CACHE_TTL = 10 * 60 * 1000;  // 10 minutes

// Clean caches periodically
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of searchCache.entries())
        if (now - v.timestamp > CACHE_TTL) searchCache.delete(k);
    for (const [k, v] of audioCache.entries())
        if (now - v.timestamp > CACHE_TTL) audioCache.delete(k);
}, 60000);

// ---------- 5 download fallback methods ----------
async function downloadAudioWithFallback(videoUrl, attempts = 0) {
    // Check cache first
    const cacheKey = videoUrl;
    if (audioCache.has(cacheKey)) {
        const cached = audioCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`Audio cache hit for ${videoUrl}`);
            return cached.buffer;
        } else {
            audioCache.delete(cacheKey);
        }
    }

    const methods = [
        // Method 1: ytdl-core (standard, high audio quality)
        async () => {
            const stream = ytdl(videoUrl, {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25
            });
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
        },
        // Method 2: ytdl-core with different User-Agent and low watermark (less memory)
        async () => {
            const stream = ytdl(videoUrl, {
                filter: 'audioonly',
                quality: 'highestaudio',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                },
                highWaterMark: 1 << 20 // 1MB
            });
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
        },
        // Method 3: youtube-dl-exec (if installed) – music‑optimised
        async () => {
            try {
                const { youtubedl } = require('youtube-dl-exec');
                const output = await youtubedl(videoUrl, {
                    format: 'bestaudio',
                    extractAudio: true,
                    audioFormat: 'mp3',
                    audioQuality: 0,
                    output: '-',
                    noWarnings: true,
                    noCallHome: true
                });
                return Buffer.from(output);
            } catch (err) {
                throw new Error('youtube-dl-exec failed: ' + err.message);
            }
        },
        // Method 4: Public API (p.oceansaver.in) – works when ytdl fails
        async () => {
            const apiUrl = `https://p.oceansaver.in/ajax/download.php?url=${encodeURIComponent(videoUrl)}&format=mp3`;
            const resp = await axios.get(apiUrl, { timeout: 25000 });
            if (resp.data && resp.data.download_url) {
                const audioResp = await axios.get(resp.data.download_url, { responseType: 'arraybuffer', timeout: 60000 });
                return Buffer.from(audioResp.data);
            }
            throw new Error('API returned no download URL');
        },
        // Method 5: Alternative API (yt5s, but we use a reliable free one)
        async () => {
            // Use `ytdl-core` with a different quality (lowestaudio) as last resort
            const stream = ytdl(videoUrl, {
                filter: 'audioonly',
                quality: 'lowestaudio',
                highWaterMark: 1 << 20
            });
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
        }
    ];

    let lastError = null;
    for (let i = attempts; i < methods.length; i++) {
        try {
            console.log(`Audio download: trying method ${i+1} for ${videoUrl}`);
            const buffer = await methods[i]();
            if (buffer && buffer.length > 10000) {
                audioCache.set(cacheKey, { buffer, timestamp: Date.now() });
                return buffer;
            }
        } catch (err) {
            lastError = err;
            console.log(`Method ${i+1} failed: ${err.message}`);
        }
    }
    throw new Error(`All 5 audio methods failed. Last error: ${lastError?.message}`);
}

module.exports = {
    command: "song",
    alias: ["audio", "nyimbo", "play", "music"],
    category: "download",
    description: "Search and download audio with 5 fallback methods + caching",

    async execute(m, sock, { args, userSettings }) {
        const lang = userSettings?.lang || 'en';
        const style = userSettings?.style || 'harsh';

        const modes = {
            harsh: {
                title: "🎧 𝕬𝖚𝖉𝖎𝖔 𝕰𝖝𝖊𝖈𝖚𝖙𝖎𝖔𝖓𝖊𝖗 🎧",
                searching: "🔍 𝕾𝖊𝖆𝖗𝖈𝖍𝖎𝖓𝖌... 🦾",
                downloading: "📥 𝕯𝖔𝖜𝖓𝖑𝖔𝖆𝖉𝖎𝖓𝖌 (5 𝖊𝖓𝖌𝖎𝖓𝖊𝖘)... ⚙️",
                success: "✅ 𝕾𝖔𝖓𝖌 𝖘𝖊𝖓𝖙! 🎶",
                err: "💢 𝖂𝖍𝖆𝖙 𝖙𝖍𝖊 𝖋𝖚𝖈𝖐 𝖎𝖘 𝖙𝖍𝖎𝖘? 𝕾𝖊𝖓𝖉 𝖆 𝖗𝖊𝖆𝖑 𝖓𝖆𝖒𝖊. 🖕"
            },
            normal: {
                title: "🎵 Music Finder",
                searching: "🔍 Searching...",
                downloading: "📥 Downloading (multi-engine)...",
                success: "✅ Song sent!",
                err: "❌ Video not found."
            },
            girl: {
                title: "🎼 𝐿𝓊𝓅𝒾𝓃'𝓈 𝑀𝑒𝓁𝑜𝒹𝓎 🎼",
                searching: "🔍 𝐿𝑜𝑜𝓀𝒾𝓃𝑔 𝒻𝑜𝓇 𝓎𝑜𝓊𝓇 𝓈𝑜𝓃𝑔... 💕",
                downloading: "📥 𝓉𝓇𝓎𝒾𝓃𝑔 5 𝓌𝒶𝓎𝓈 𝓉𝑜 𝒹𝑜𝓌𝓃𝓁𝑜𝒶𝒹... ✨",
                success: "🌸 𝐻𝑒𝓇𝑒'𝓈 𝓎𝑜𝓊𝓇 𝓈𝑜𝓃𝑔, 𝒹𝒶𝓇𝓁𝒾𝓃𝑔~ 🎶",
                err: "🌸 𝑜𝑜𝓅𝓈𝒾𝑒! 𝒾 𝒸𝒶𝓃'𝓉 𝒻𝒾𝓃𝒹 𝓉𝒽𝒶𝓉 𝓈𝑜𝓃𝑔~ 🍭"
            }
        };

        const current = modes[style] || modes.normal;
        let cleanupFiles = [];

        const addCleanup = (file) => cleanupFiles.push(file);
        const cleanup = async () => {
            for (const file of cleanupFiles) {
                try { if (fs.existsSync(file)) await fs.promises.unlink(file); } catch {}
            }
        };

        try {
            const query = args.join(" ");
            if (!query) return m.reply(current.err);

            await sock.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });
            const statusMsg = await m.reply(current.searching);

            // Check cache for search result
            let video;
            const cacheKey = query.toLowerCase();
            if (searchCache.has(cacheKey) && (Date.now() - searchCache.get(cacheKey).timestamp) < CACHE_TTL) {
                video = searchCache.get(cacheKey).video;
                console.log(`Search cache hit for "${query}"`);
            } else {
                const search = await yts(query);
                video = search.videos[0];
                if (!video) {
                    await m.reply(current.err);
                    return;
                }
                searchCache.set(cacheKey, { video, timestamp: Date.now() });
            }

            // Send thumbnail with info (no delete)
            let thumb = video.thumbnail;
            try {
                const thumbRes = await fetch(video.thumbnail);
                thumb = Buffer.from(await thumbRes.arrayBuffer());
            } catch {}

            let infoText = `*${current.title}*\n\n`;
            infoText += `📌 *Title:* ${video.title}\n`;
            infoText += `⏳ *Duration:* ${video.timestamp}\n`;
            infoText += `👀 *Views:* ${video.views?.toLocaleString() || 'Unknown'}\n\n`;
            infoText += `🎵 _Using 5 download engines, please wait..._`;

            await sock.sendMessage(m.chat, { image: thumb, caption: infoText }, { quoted: m });

            // Download audio using fallback methods
            const downloadMsg = await m.reply(current.downloading);
            await sock.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            let audioBuffer;
            try {
                audioBuffer = await downloadAudioWithFallback(video.url);
            } catch (dlErr) {
                await m.reply(`❌ All download methods failed.\nError: ${dlErr.message}`);
                return;
            }

            const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
            const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(2);

            // Send audio (no deletion of previous messages)
            await sock.sendMessage(m.chat, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `${safeTitle}.mp3`
            }, { quoted: m });

            await sock.sendMessage(m.chat, {
                text: `${current.success}\n📁 ${safeTitle}.mp3\n📦 Size: ${fileSizeMB} MB`
            }, { quoted: m });

            await sock.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
            await cleanup();

        } catch (error) {
            console.error("SONG ERROR:", error);
            await sock.sendMessage(m.chat, { react: { text: "🚫", key: m.key } }).catch(()=>{});
            await m.reply("❌ Failed to process request. Try again later.");
            await cleanup();
        }
    }
};