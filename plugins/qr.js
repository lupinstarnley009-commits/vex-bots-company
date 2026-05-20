const QRCode = require('qrcode');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const crypto = require('crypto');

module.exports = {
    command: "qr",
    alias: ["qrcode", "makeqr"],
    category: "tools",
    description: "Generate QR code with VEX logo at center",

    async execute(m, sock, { userSettings, lang, prefix }) {
        const style = userSettings?.style || 'normal';
        const targetLang = lang || 'en';

        // Styles with required emojis: harsh ☘️, normal 🧭, girl 🍌
        const modes = {
            harsh: {
                title: "☘️ 𝕍𝔼𝕏 ℚℝ 𝔾𝔼ℕ𝔼ℝ𝔸𝕋𝕆ℝ ☘️",
                line: "━",
                noText: "⚠️ 𝖂𝖊𝖐𝖆 𝖙𝖊𝖝𝖙 𝖆𝖚 𝖗𝖊𝖕𝖑𝖞 𝖒𝖊𝖘𝖆𝖌𝖊/𝖒𝖊𝖉𝖎𝖆",
                usage: `𝕰𝖝𝖆𝖒𝖕𝖑𝖊: ${prefix}qr https://google.com\n𝕬𝖚 reply message yoyote na ${prefix}qr`,
                done: "☠️ 𝕍𝔼𝕏 ℚℝ 𝕚𝖒𝖊𝖙𝖊𝖓𝖌𝖊𝖓𝖊𝖟𝖜𝖆",
                react: "☘️"
            },
            normal: {
                title: "🧭 VEX QR GENERATOR 🧭",
                line: "─",
                noText: "⚠️ Weka text au reply message/media yoyote",
                usage: `Mfano: ${prefix}qr https://google.com\nAu reply message na ${prefix}qr`,
                done: "✅ VEX QR Code imetengenezwa",
                react: "🧭"
            },
            girl: {
                title: "🍌 𝒱𝐸𝒳 𝒬𝑅 𝒢𝑒𝓃𝑒𝓇𝒶𝓉𝑜𝓇 🍌",
                line: "┄",
                noText: "🍌 𝒜𝓌 𝓌𝑒𝓀𝒶 𝓉𝑒𝓍𝓉 𝒶𝓊 𝓇𝑒𝓅𝓁𝓎 𝓂𝑒𝓈𝒶𝑔𝑒 𝓅𝓇𝒾𝓃𝒸𝑒𝓈~ 🍌",
                usage: `🍌 𝑀𝒻𝒶𝓃𝑜: ${prefix}qr https://google.com 🍌`,
                done: "🍌 𝒱𝐸𝒳 𝒬𝑅 𝓎𝒶𝓀𝑜 𝓉𝒶𝓎𝒶𝓇𝒾~ 🍌",
                react: "🍌"
            }
        };

        const current = modes[style] || modes.normal;
        const tempDir = './temp';
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        try {
            await sock.sendMessage(m.chat, { react: { text: current.react, key: m.key } });

            let qrText = '';
            const quoted = m.quoted ? m.quoted : m;

            // Extract content from reply or direct text
            if (m.quoted) {
                if (quoted.message?.conversation) {
                    qrText = quoted.message.conversation;
                } else if (quoted.message?.extendedTextMessage?.text) {
                    qrText = quoted.message.extendedTextMessage.text;
                } else if (quoted.message?.imageMessage) {
                    qrText = `IMAGE:${quoted.message.imageMessage.fileSha256?.toString('base64').slice(0, 32) || 'image'}`;
                } else if (quoted.message?.videoMessage) {
                    qrText = `VIDEO:${quoted.message.videoMessage.fileSha256?.toString('base64').slice(0, 32) || 'video'}`;
                } else if (quoted.message?.stickerMessage) {
                    qrText = `STICKER:${quoted.message.stickerMessage.fileSha256?.toString('base64').slice(0, 32) || 'sticker'}`;
                } else if (quoted.message?.documentMessage) {
                    qrText = `DOC:${quoted.message.documentMessage.fileName || 'document'}`;
                } else if (quoted.message?.viewOnceMessageV2) {
                    const v1 = quoted.message.viewOnceMessageV2.message;
                    qrText = v1?.imageMessage ? 'VIEWONCE_IMAGE' : v1?.videoMessage ? 'VIEWONCE_VIDEO' : 'VIEWONCE_CONTENT';
                } else if (quoted.message?.viewOnceMessage) {
                    qrText = 'VIEWONCE_CONTENT';
                } else {
                    const msgType = Object.keys(quoted.message || {})[0];
                    qrText = `MSG_TYPE:${msgType || 'unknown'}`;
                }
            } else {
                // Direct text after command
                qrText = m.text.slice(prefix.length + 2).trim();
            }

            if (!qrText) {
                const msg = `*${current.title}*\n${current.line.repeat(15)}\n${current.noText}\n\n${current.usage}`;
                return await m.reply(msg);
            }

            const id = crypto.randomBytes(6).toString('hex');
            const qrPath = path.join(tempDir, `qr_${id}.png`);
            const outPath = path.join(tempDir, `out_${id}.png`);

            // Generate QR with high error correction (allows logo overlay)
            await QRCode.toFile(qrPath, qrText, {
                errorCorrectionLevel: 'H',
                type: 'png',
                width: 512,
                margin: 1,
                color: { dark: '#000000', light: '#FFFFFF' }
            });

            // Load QR image
            const qrImage = await Jimp.read(qrPath);
            const logoSize = 110;
            // Create a simple "VEX" logo using Jimp
            const logo = new Jimp(logoSize, logoSize, '#FFFFFF');
            const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
            logo.print(font, 0, 0, {
                text: 'VEX',
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
            }, logoSize, logoSize);

            // Center logo on QR
            const x = (qrImage.bitmap.width - logoSize) / 2;
            const y = (qrImage.bitmap.height - logoSize) / 2;
            qrImage.composite(logo, x, y);

            await qrImage.writeAsync(outPath);
            const finalBuffer = fs.readFileSync(outPath);

            // Send final QR with styled caption
            const caption = `*${current.title}*\n${current.line.repeat(15)}\n${current.done}\n\n📝 *Content:* ${qrText.slice(0, 80)}${qrText.length > 80 ? '...' : ''}`;
            await sock.sendMessage(m.chat, {
                image: finalBuffer,
                caption: caption
            }, { quoted: m });

            // Cleanup temp files
            [qrPath, outPath].forEach(p => fs.existsSync(p) && fs.unlinkSync(p));

        } catch (error) {
            console.error("VEX QR ERROR:", error);
            await m.reply("❌ QR Generator failed. Make sure text is not too long and try again.");
        }
    }
};