const yts = require('yt-search');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Cache for search results and download URLs (to avoid re-downloading)
const searchCache = new Map();     // key: query, value: { videos, timestamp }
const downloadCache = new Map();   // key: videoUrl+format, value: { buffer, timestamp }
const CACHE_TTL = 10 * 60 * 1000;  // 10 minutes

// Clean caches periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of searchCache.entries()) {
        if (now - val.timestamp > CACHE_TTL) searchCache.delete(key);
    }
    for (const [key, val] of downloadCache.entries()) {
        if (now - val.timestamp > CACHE_TTL) downloadCache.delete(key);
    }
}, 60000);

// Temporary directory for file storage
const TMP_DIR = './tmp';
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Helper: get a unique cache key for download
function getDownloadCacheKey(url, format) {
    return `${url}|${format}`;
}

// 5 different download methods (fallback chain)
async function downloadWithFallback(videoUrl, format, attempts = 0) {
    // Check cache first
    const cacheKey = getDownloadCacheKey(videoUrl, format);
    if (downloadCache.has(cacheKey)) {
        const cached = downloadCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`Cache hit for ${videoUrl} (${format})`);
            return cached.buffer;
        } else {
            downloadCache.delete(cacheKey);
        }
    }

    const methods = [
        // Method 1: ytdl with highest quality for audio or specific quality for video
        async () => {
            const options = format === 'mp3' 
                ? { filter: 'audioonly', quality: 'highestaudio' }
                : { quality: '18' }; // 360p mp4
            const stream = ytdl(videoUrl, options);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
        },
        // Method 2: ytdl with lowest quality (fallback if highest fails)
        async () => {
            const options = format === 'mp3'
                ? { filter: 'audioonly', quality: 'lowestaudio' }
                : { quality: 'lowest' };
            const stream = ytdl(videoUrl, options);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
        },
        // Method 3: ytdl with custom highWaterMark and different User-Agent
        async () => {
            const options = {
                filter: format === 'mp3' ? 'audioonly' : 'audioandvideo',
                quality: format === 'mp3' ? 'highestaudio' : '22', // 720p
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                },
                highWaterMark: 1 << 20 // 1MB
            };
            const stream = ytdl(videoUrl, options);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
        },
        // Method 4: Use youtubedl-core if available (npm i youtube-dl-exec)
        async () => {
            try {
                const { youtubedl } = require('youtube-dl-exec');
                const output = await youtubedl(videoUrl, {
                    format: format === 'mp3' ? 'bestaudio' : 'best[height<=720]',
                    output: '-',
                    noWarnings: true,
                    noCallHome: true
                });
                return Buffer.from(output);
            } catch (e) {
                throw new Error('youtube-dl-exec failed');
            }
        },
        // Method 5: Use a public API (example: p.oceansaver.in) – only as last resort
        async () => {
            const apiUrl = `https://p.oceansaver.in/ajax/download.php?url=${encodeURIComponent(videoUrl)}&format=${format === 'mp3' ? 'mp3' : 'mp4'}`;
            const response = await axios.get(apiUrl, { timeout: 30000 });
            if (response.data && response.data.download_url) {
                const downloadUrl = response.data.download_url;
                const fileRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 60000 });
                return Buffer.from(fileRes.data);
            }
            throw new Error('API returned no download URL');
        }
    ];

    let lastError = null;
    for (let i = attempts; i < methods.length; i++) {
        try {
            console.log(`Trying download method ${i+1} for ${videoUrl} (${format})`);
            const buffer = await methods[i]();
            if (buffer && buffer.length > 10000) {
                // Store in cache
                downloadCache.set(cacheKey, { buffer, timestamp: Date.now() });
                return buffer;
            }
        } catch (err) {
            lastError = err;
            console.log(`Method ${i+1} failed: ${err.message}`);
        }
    }
    throw new Error(`All 5 download methods failed. Last error: ${lastError?.message}`);
}

module.exports = {
    command: "video",
    alias: ["playvideo", "youtube", "ytv"],
    category: "download",
    description: "Search YouTube and download MP3/MP4 with 5 fallback methods and caching",

    async execute(m, sock, { args, userSettings }) {
        const lang = userSettings?.lang || 'en';
        const style = userSettings?.style || 'harsh';
        const prefix = userSettings?.prefix || '.';
        const sender = m.sender;
        const chat = m.chat;

        const styles = {
            harsh: {
                title: "⛓️ VEX VIDEO DESTROYER ⛓️",
                searchMsg: "⛓️ Scanning YouTube...",
                listHeader: "⚡ RESULTS FOUND",
                formatPrompt: "SELECT OUTPUT:\n1. MP3 (Audio)\n2. MP4 (Video)",
                downloading: "⛓️ Downloading with 5 engines...",
                react: "⛓️",
                err: "💢 Provide video name or number",
                successAudio: "🎧 Audio ready",
                successVideo: "🎬 Video ready"
            },
            normal: {
                title: "🎥 YouTube Downloader",
                searchMsg: "🔍 Searching...",
                listHeader: "📋 Search Results",
                formatPrompt: "Select format:\n1. MP3\n2. MP4",
                downloading: "📥 Downloading (multi-engine)...",
                react: "🎥",
                err: "❌ Please provide a video name or number",
                successAudio: "✅ Audio sent",
                successVideo: "✅ Video sent"
            },
            girl: {
                title: "🎀 YouTube Sweetie 🎀",
                searchMsg: "🌸 Looking for your video...",
                listHeader: "✨ Found these ✨",
                formatPrompt: "Choose format:\n1. MP3 🎶\n2. MP4 🎥",
                downloading: "🌸 Downloading for you...",
                react: "🌸",
                err: "💕 What video should I search?",
                successAudio: "🎶 Here's your song~",
                successVideo: "🎬 Watch this, babe~"
            }
        };
        const current = styles[style] || styles.normal;

        // Session storage (for user interaction: selecting from list)
        const userSessions = new Map();

        try {
            const input = args.join(' ').trim();
            let session = userSessions.get(sender);

            // ---------- Step 2: Format selection ----------
            if (session && session.step === 'format' && /^[12]$/.test(input)) {
                const format = parseInt(input) === 1 ? 'mp3' : 'mp4';
                const video = session.selectedVideo;
                if (!video) throw new Error('Session expired');

                await sock.sendMessage(chat, { react: { text: "⏳", key: m.key } });
                const statusMsg = await m.reply(current.downloading + `\n\nTitle: ${video.title}\nFormat: ${format.toUpperCase()}`);

                try {
                    // Attempt download with 5 fallback methods
                    const buffer = await downloadWithFallback(video.url, format);
                    const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 50);
                    const fileName = `${safeTitle}.${format}`;
                    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

                    // Send the media
                    if (format === 'mp3') {
                        await sock.sendMessage(chat, {
                            audio: buffer,
                            mimetype: 'audio/mpeg',
                            fileName: fileName,
                            ptt: false
                        }, { quoted: m });
                        await m.reply(`${current.successAudio}\n📁 ${fileName}\n📦 Size: ${fileSizeMB} MB`);
                    } else {
                        await sock.sendMessage(chat, {
                            video: buffer,
                            caption: `🎬 ${video.title}\n📦 Size: ${fileSizeMB} MB`,
                            mimetype: 'video/mp4',
                            fileName: fileName
                        }, { quoted: m });
                        await m.reply(`${current.successVideo}\n📁 ${fileName}\n📦 Size: ${fileSizeMB} MB`);
                    }
                } catch (downloadErr) {
                    await m.reply(`❌ Download failed after 5 methods.\nError: ${downloadErr.message}`);
                } finally {
                    userSessions.delete(sender);
                }
                return;
            }

            // ---------- Step 1: Video selection from list ----------
            if (session && session.step === 'select' && /^\d+$/.test(input)) {
                const idx = parseInt(input) - 1;
                if (idx < 0 || idx >= session.results.length) {
                    return m.reply(`Invalid number. Choose 1-${session.results.length}`);
                }
                const selected = session.results[idx];
                userSessions.set(sender, { step: 'format', selectedVideo: selected });
                await sock.sendMessage(chat, {
                    text: `*${selected.title}*\n\n${current.formatPrompt}\n\nReply with 1 or 2`
                }, { quoted: m });
                return;
            }

            // ---------- New search ----------
            if (!input) return m.reply(current.err);
            if (/^\d+$/.test(input) && !session) {
                return m.reply("⚠️ No active search. Use .video <song name> first.");
            }

            // Perform search (with caching)
            let videos;
            const cacheKey = input.toLowerCase();
            if (searchCache.has(cacheKey) && (Date.now() - searchCache.get(cacheKey).timestamp) < CACHE_TTL) {
                videos = searchCache.get(cacheKey).videos;
            } else {
                await sock.sendMessage(chat, { react: { text: current.react, key: m.key } });
                const searchMsg = await m.reply(current.searchMsg);
                const searchResults = await yts(input);
                videos = searchResults.videos
                    .filter(v => v.seconds < 3600 && v.title && v.url)
                    .slice(0, 6);
                if (!videos.length) {
                    await m.reply("❌ No results found.");
                    return;
                }
                searchCache.set(cacheKey, { videos, timestamp: Date.now() });
                // We don't delete the searchMsg, just leave it.
            }

            // Build result list
            let list = `*${current.title}*\n\n${current.listHeader}:\n\n`;
            videos.forEach((v, i) => {
                list += `*${i+1}.* ${v.title}\n⏱️ ${v.timestamp} | 👁️ ${v.views?.toLocaleString() || '0'}\n\n`;
            });
            list += `_Reply with the number (e.g., "2") to select._\n_Or type ${prefix}video <number> directly._`;

            // Send thumbnail and list
            let thumb = videos[0].thumbnail;
            try {
                const res = await fetch(thumb);
                thumb = Buffer.from(await res.arrayBuffer());
                await sock.sendMessage(chat, { image: thumb, caption: list }, { quoted: m });
            } catch (e) {
                await sock.sendMessage(chat, { text: list }, { quoted: m });
            }

            // Store session
            userSessions.set(sender, { step: 'select', results: videos });
            setTimeout(() => {
                if (userSessions.get(sender)?.step === 'select') userSessions.delete(sender);
            }, 300000);

        } catch (err) {
            console.error("Video command error:", err);
            await sock.sendMessage(chat, { react: { text: "❌", key: m.key } });
            await m.reply("❌ Failed to process request. Try again later.");
        }
    }
};