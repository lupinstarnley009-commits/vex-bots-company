// plugins/ping.js
const translate = require('google-translate-api-x');

// Generate a visual bar based on milliseconds
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

// Styles with unique react emojis
const STYLES = {
    harsh: {
        react: "🪅",
        header: "╭─⌈ *⛓️ VEX HARSH PING* ⌋\n│",
        label: "⚡ LATENCY",
        footer: "╰⊷ *HARSH MODE*"
    },
    normal: {
        react: "🐑",
        header: "╭─⌈ *📱 VEX PING* ⌋\n│",
        label: "📡 LATENCY",
        footer: "╰⊷ *NORMAL MODE*"
    },
    girl: {
        react: "🥾",
        header: "╭─⌈ *🌸 VEX CUTE PING* ⌋\n│",
        label: "💕 LATENCY",
        footer: "╰⊷ *GIRL MODE*"
    }
};

module.exports = {
    command: "ping",
    alias: ["latency", "speed"],
    category: "system",
    description: "Real-time ping with 10‑second animated bar (single message)",

    async execute(m, sock, { args, userSettings }) {
        const lang = args[0]?.length === 2 ? args[0] : (userSettings?.lang || 'en');
        const style = userSettings?.style || 'normal';
        const ui = STYLES[style] || STYLES.normal;

        // Send initial reaction
        await sock.sendMessage(m.chat, { react: { text: ui.react, key: m.key } });

        // If silent mode, only react
        if (userSettings?.silent === true) return;

        // Send the initial message (will be edited 10 times)
        const start = Date.now();
        let intervalId;
        let step = 0;
        const totalSteps = 10; // 10 updates = 10 seconds

        const sendUpdate = async (key, elapsedMs) => {
            const currentMs = elapsedMs;
            const bar = getSpeedBar(currentMs);
            let text = `${ui.header}\n`;
            text += `│ > ${ui.label}: ${currentMs} ms [${bar}]\n`;
            text += `│ > Duration: ${step+1}/10 sec\n`;
            text += `│\n${ui.footer}`;

            // Translate if needed
            if (lang !== 'en') {
                try {
                    const tr = await translate(text, { to: lang });
                    text = tr.text;
                } catch {}
            }
            await sock.sendMessage(m.chat, { text, edit: key });
        };

        const initialMsg = await sock.sendMessage(m.chat, { text: "⏳ Measuring ping..." });
        const msgKey = initialMsg.key;

        intervalId = setInterval(async () => {
            const elapsed = Date.now() - start;
            step++;
            await sendUpdate(msgKey, elapsed);
            if (step >= totalSteps) {
                clearInterval(intervalId);
                // Final update (keeps the bar as is, no extra message)
                await sendUpdate(msgKey, elapsed);
            }
        }, 1000);
    }
};