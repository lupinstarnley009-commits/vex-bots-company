// plugins/qread.js
// QR Code Reader with animated bars (5-10 seconds), multi-style, no fake results.

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const jimp = require('jimp');
const jsQR = require('jsqr');
const translate = require('google-translate-api-x');

// Helper: generate animated bar (like ping)
function getProgressBar(percent) {
    const filled = Math.floor(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// Styles configuration
const STYLES = {
    harsh: {
        react: "🗽",
        header: "╭─⌈ *⛓️ VEX QR HARSH* ⌋\n│",
        processing: "DECODING QR...",
        footer: "╰⊷ *HARSH MODE*"
    },
    normal: {
        react: "🐙",
        header: "╭─⌈ *📱 VEX QR READER* ⌋\n│",
        processing: "SCANNING QR CODE...",
        footer: "╰⊷ *NORMAL MODE*"
    },
    girl: {
        react: "🐍",
        header: "╭─⌈ *🌸 VEX CUTE QR* ⌋\n│",
        processing: "READING MAGIC QR...",
        footer: "╰⊷ *GIRL MODE*"
    }
};

module.exports = {
    command: "qread",
    alias: ["scanqr", "readqr", "qrscan"],
    category: "tools",
    description: "Read QR code from an image (reply to QR image)",

    async execute(m, sock, { userSettings, prefix }) {
        const chat = m.chat;
        const style = userSettings?.style || 'normal';
        const lang = userSettings?.lang || 'en';
        const ui = STYLES[style] || STYLES.normal;

        // Check for quoted image
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let mediaMsg = quoted?.imageMessage || m.message?.imageMessage;
        if (!mediaMsg) {
            return m.reply(`❌ Please reply to an image containing a QR code.\nExample: ${prefix}qread (reply to QR image)`);
        }

        // React with style emoji
        await sock.sendMessage(chat, { react: { text: ui.react, key: m.key } });

        // Send initial processing message
        const initMsg = await sock.sendMessage(chat, { text: `⏳ ${ui.processing} (0%)` }, { quoted: m });
        let lastMsgKey = initMsg.key;

        // Download image buffer
        const stream = await downloadContentFromMessage(mediaMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        if (!buffer || buffer.length < 100) {
            await sock.sendMessage(chat, { text: '❌ Failed to download image or image too small.', edit: lastMsgKey });
            return;
        }

        // Simulate progress over 5 seconds (real decoding is fast, but we add animation)
        const totalSteps = 10; // 10 steps = 5 seconds (0.5s each)
        let step = 0;
        const interval = setInterval(async () => {
            step++;
            const percent = Math.min(step * 10, 100);
            const bar = getProgressBar(percent);
            const text = `${ui.header}\n│ > ${ui.processing} [${bar}] ${percent}%\n│\n${ui.footer}`;
            try {
                await sock.sendMessage(chat, { text, edit: lastMsgKey });
            } catch (e) {}
            if (step >= totalSteps) clearInterval(interval);
        }, 500);

        // Actual decoding
        let decodedText = null;
        let errorMsg = null;
        try {
            // Use jimp to read image and get pixel data
            const image = await jimp.read(buffer);
            const { width, height } = image.bitmap;
            const imageData = new Uint8ClampedArray(image.bitmap.data);
            const code = jsQR(imageData, width, height);
            if (code) {
                decodedText = code.data;
            } else {
                errorMsg = 'No QR code found in the image.';
            }
        } catch (err) {
            errorMsg = `Decoding error: ${err.message}`;
        }

        clearInterval(interval);

        // Final message
        let finalText = `${ui.header}\n│`;
        if (decodedText) {
            const barFull = getProgressBar(100);
            finalText += `\n│ > QR DECODED [${barFull}] 100%\n`;
            finalText += `│\n│ 📄 RESULT:\n│ ${decodedText.substring(0, 200)}\n`;
            if (decodedText.length > 200) finalText += `│ ... (truncated)\n`;
            finalText += `│\n${ui.footer}`;
        } else {
            finalText += `\n│ ❌ ${errorMsg || 'QR reading failed'}\n│\n${ui.footer}`;
        }

        // Translate if needed
        if (lang !== 'en') {
            try {
                const translated = await translate(finalText, { to: lang });
                finalText = translated.text;
            } catch {}
        }

        await sock.sendMessage(chat, { text: finalText, edit: lastMsgKey });
        await sock.sendMessage(chat, { react: { text: decodedText ? '✅' : '❌', key: m.key } });
    }
};