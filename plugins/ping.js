// plugins/ping.js – Wolfbot style with animated bar (VEX MD)
const axios = require('axios');
const translate = require('google-translate-api-x');

// Generate bar based on milliseconds
function getSpeedBar(ms) {
    let filled;
    if (ms <= 50) filled = 10;
    else if (ms <= 100) filled = 9;
    else if (ms <= 200) filled = 7;
    else if (ms <= 300) filled = 5;
    else if (ms <= 500) filled = 3;
    else filled = 1;
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// Measure real ping (fast and reliable)
async function measurePing() {
    const start = Date.now();
    try {
        await axios.get('https://api.github.com', { timeout: 5000, headers: { 'User-Agent': 'VEX-MD' } });
        return Date.now() - start;
    } catch {
        return 999;
    }
}

// Styles (reaction emojis only, but we also use them for the header icon)
const STYLES = {
    harsh: { react: "🪅", icon: "⚡" },
    normal: { react: "🐑", icon: "📡" },
    girl: { react: "🥾", icon: "🌸" }
};

module.exports = {
    command: "ping",
    alias: ["latency", "speed"],
    category: "system",
    description: "Wolfbot‑style real‑time animated ping (10 seconds)",

    async execute(m, sock, { args, userSettings }) {
        const lang = args[0]?.length === 2 ? args[0] : (userSettings?.lang || 'en');
        const style = userSettings?.style || 'normal';
        const ui = STYLES[style] || STYLES.normal;

        // React with style emoji
        await sock.sendMessage(m.chat, { react: { text: ui.react, key: m.key } });
        if (userSettings?.silent === true) return;

        // Bot name (localised)
        let botName = "VEX MD";
        if (lang !== 'en') {
            try {
                const tr = await translate(botName, { to: lang });
                botName = tr.text;
            } catch {}
        }

        // Send initial message with Wolfbot‑style box
        const initialMsg = await sock.sendMessage(m.chat, { text: `╭─⌈ ${ui.icon} *${botName}* ⌋\n│ 0ms [░░░░░░░░░░]\n╰⊷ *${botName}*` });
        const msgKey = initialMsg.key;

        let step = 0;
        const totalSteps = 10; // 10 seconds

        const update = async () => {
            const ping = await measurePing();
            const bar = getSpeedBar(ping);
            const text = `╭─⌈ ${ui.icon} *${botName}* ⌋\n│ ${ping}ms [${bar}]\n╰⊷ *${botName}*`;
            await sock.sendMessage(m.chat, { text, edit: msgKey });
            step++;
            if (step < totalSteps) {
                setTimeout(update, 1000);
            }
        };

        update(); // start animation
    }
};