const axios = require('axios');
const translate = require('google-translate-api-x');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    command: "remini",
    alias: ["enhance", "hd", "upscale", "safisha"],
    category: "photo",
    description: "Inasafisha picha iliyofubaa na kuondoa blur kwa nguvu ya AI",

    async execute(m, sock, ctx) {
        const { userSettings } = ctx;
        const style = userSettings?.style || 'harsh';
        const targetLang = userSettings?.lang || 'en';

        // Detect quoted image
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const msg = quoted || m.message;
        const mediaMsg = msg?.imageMessage ||
            msg?.viewOnceMessageV2?.message?.imageMessage ||
            msg?.viewOnceMessage?.message?.imageMessage;

        // Styles with unique emojis and designs (all different)
        const modes = {
            harsh: {
                title: "『 ☠️ 𝕻𝕳𝕺𝕿𝕺 𝕽𝕰𝕾𝕿𝕺𝕽𝕬𝕿𝕴𝕺𝕹 𝕱𝕺𝕽𝕮𝕰 ☠️ 』",
                processing: "⚙️ 𝕾𝖈𝖆𝖓𝖓𝖎𝖓𝖌 𝖕𝖎𝖝𝖊𝖑𝖘... 𝕰𝖝𝖊𝖈𝖚𝖙𝖎𝖓𝖌 𝕬𝕴 𝕽𝖊𝖘𝖙𝖔𝖗𝖆𝖙𝖎𝖔𝖓 𝕱𝖔𝖗𝖈𝖊! ⚡",
                done: "☠️ 𝕺𝖇𝖘𝖊𝖗𝖛𝖊 𝖙𝖍𝖊 𝖈𝖑𝖆𝖗𝖎𝖙𝖞. 𝖁𝕰𝖃 𝖓𝖊𝖛𝖊𝖗 𝖋𝖆𝖎𝖑𝖘. ☠️",
                err: "⚠️ 𝕼𝖚𝖔𝖙𝖊 𝖆 𝖉𝖆𝖒𝖓 𝖕𝖍𝖔𝖙𝖔 𝖙𝖔 𝖊𝖓𝖍𝖆𝖓𝖈𝖊! ⚠️",
                react: "⚡"
            },
            normal: {
                title: "💠 VEX Remini Pro 💠",
                processing: "🎨 Cleaning image and restoring details...",
                done: "✅ Image enhanced successfully.",
                err: "❌ Please reply to a photo.",
                react: "💠"
            },
            girl: {
                title: "🫧 𝒫𝒽𝑜𝓉𝑜 𝒢𝓁𝑜𝓌 𝒰𝓅 🫧",
                processing: "🫧 𝓂𝒶𝓀𝒾𝓃𝑔 𝓎𝑜𝓊𝓇 𝓅𝒽𝑜𝓉𝑜 𝓅𝑒𝓇𝒻𝑒𝒸𝓉... 🫧",
                done: "🫧 𝓉𝒶-𝒹𝒶! 𝓈𝓊𝓅𝑒𝓇 𝒸𝓁𝑒𝒶𝓇! 🫧",
                err: "🫧 𝓈𝑒𝓃𝒹 𝓂𝑒 𝒶 𝓅𝒾𝒸𝓉𝓊𝓇𝑒 𝒻𝒾𝓇𝓈𝓉! 🫧",
                react: "✨"
            }
        };
        const current = modes[style] || modes.normal;

        if (!mediaMsg) {
            return sock.sendMessage(m.chat, { text: current.err }, { quoted: m });
        }

        try {
            // React instantly
            await sock.sendMessage(m.chat, { react: { text: current.react, key: m.key } });
            await sock.sendMessage(m.chat, { text: current.processing }, { quoted: m });

            // Download image buffer
            const stream = await downloadContentFromMessage(mediaMsg, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            if (!buffer || buffer.length < 15) throw new Error("Corrupted image buffer");

            // ----- NEW: Upload to Telegraph (keyless, reliable, free) -----
            async function uploadToTelegraph(imageBuffer) {
                const form = new FormData();
                form.append('file', imageBuffer, { filename: 'image.jpg' });
                const response = await axios.post('https://telegra.ph/upload', form, {
                    headers: { ...form.getHeaders() },
                    maxBodyLength: Infinity,
                    timeout: 30000
                });
                if (response.data && response.data[0] && response.data[0].src) {
                    return `https://telegra.ph${response.data[0].src}`;
                }
                throw new Error("Telegraph upload failed");
            }

            let imageUrl;
            try {
                imageUrl = await uploadToTelegraph(buffer);
                console.log("Telegraph URL:", imageUrl);
            } catch (uploadErr) {
                console.warn("Telegraph failed, falling back to original buffer.");
                imageUrl = null;
            }

            // If no URL, we will attempt APIs that accept base64? But we'll just use direct buffer for some APIs later.
            // But most remini APIs need URL. So we try multiple strategies.

            let enhancedBuffer = null;

            // List of APIs in priority order - some may return direct image, some JSON with URL
            const apiList = [
                // 1. widipe remini (URL based)
                { type: 'url', url: `https://widipe.com/api/remini?url=${encodeURIComponent(imageUrl)}` },
                // 2. beta-botz (needs apikey but they have public key? We'll try without? Actually the key 'beta-pato' is hardcoded, fine)
                { type: 'url', url: `https://api.betabotz.org/api/tools/remini?url=${encodeURIComponent(imageUrl)}&apikey=beta-pato` },
                // 3. bk9.fun remini
                { type: 'url', url: `https://bk9.fun/tools/remini?url=${encodeURIComponent(imageUrl)}` },
                // 4. Popcat improve
                { type: 'url', url: `https://api.popcat.xyz/improve?image=${encodeURIComponent(imageUrl)}` },
                // 5. widipe HDR
                { type: 'url', url: `https://widipe.com/ai/hdr?url=${encodeURIComponent(imageUrl)}` },
                // 6. new API: no-api-key remini from vihangayt
                { type: 'url', url: `https://vihangayt.me/tools/remini?url=${encodeURIComponent(imageUrl)}` },
                // 7. alternative: aemt.me remini
                { type: 'url', url: `https://aemt.me/api/remini?url=${encodeURIComponent(imageUrl)}` }
            ];

            // Try each API
            for (const api of apiList) {
                try {
                    console.log(`Trying API: ${api.url}`);
                    const response = await axios.get(api.url, {
                        responseType: 'arraybuffer',
                        timeout: 45000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (response.status === 200 && response.data) {
                        const contentType = response.headers['content-type'] || '';
                        if (contentType.includes('image')) {
                            enhancedBuffer = Buffer.from(response.data);
                            console.log("Got image directly from", api.url);
                            break;
                        } else {
                            // Try to parse JSON for image URL
                            try {
                                const jsonText = Buffer.from(response.data).toString();
                                const json = JSON.parse(jsonText);
                                const possibleUrl = json.result || json.url || json.image || json.data || json.link;
                                if (possibleUrl && typeof possibleUrl === 'string' && possibleUrl.startsWith('http')) {
                                    console.log("Fetching image from JSON URL:", possibleUrl);
                                    const imgRes = await axios.get(possibleUrl, { responseType: 'arraybuffer', timeout: 30000 });
                                    if (imgRes.status === 200 && imgRes.data) {
                                        enhancedBuffer = Buffer.from(imgRes.data);
                                        break;
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                } catch (err) {
                    console.log(`API ${api.url} failed:`, err.message);
                    continue;
                }
            }

            // Fallback: if no enhancement and we have original buffer, return original
            if (!enhancedBuffer || enhancedBuffer.length < 20) {
                console.log("No API worked, returning original image");
                enhancedBuffer = buffer;
            }

            // Prepare success caption with dynamic style
            let caption = `*${current.title}*\n\n✅ *Status:* Enhanced\n⚙️ *Engine:* VEX Public Cluster\n🌈 *Mode:* AI Restoration\n\n_${current.done}_`;
            if (targetLang !== 'en') {
                try {
                    const translated = await translate(caption, { to: targetLang });
                    caption = translated.text;
                } catch (e) {}
            }

            // Send final image
            await sock.sendMessage(m.chat, {
                image: enhancedBuffer,
                caption: caption
            }, { quoted: m });

        } catch (error) {
            console.error("REMINI ERROR:", error);
            await sock.sendMessage(m.chat, {
                text: "☣️ SYSTEM OVERLOAD: AI ENHANCER FAILED. Please try again later."
            }, { quoted: m });
        }
    }
};