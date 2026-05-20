const translate = require('google-translate-api-x');

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

// Always show a full bar (10 blocks) for "runtime" decoration
const FULL_BAR = '█'.repeat(10);

const STYLES = {
    harsh: {
        react: "💫",
        header: "╭─⌈ *💀 VEX HARSH* ⌋",
        barLine: `│ runtime [${FULL_BAR}]`,
        uptimeLabel: "│ ⏱️ UPTIME:",
        statusLine: "│ 🤖 STATUS: Crushing it",
        footer: "╰⊷ *HARSH MODE*",
        err: "> 🔥 Time variable corrupted."
    },
    normal: {
        react: "💦",
        header: "╭─⌈ *📱 VEX MD* ⌋",
        barLine: `│ runtime [${FULL_BAR}]`,
        uptimeLabel: "│ 🕘 UPTIME:",
        statusLine: "│ ✅ STATUS: Active",
        footer: "╰⊷ *VEX MD*",
        err: "> ❌ Time measurement failed."
    },
    girl: {
        react: "🌀",
        header: "╭─⌈ *🌸 VEX CUTE* ⌋",
        barLine: `│ runtime [${FULL_BAR}]`,
        uptimeLabel: "│ 🕰️ UPTIME:",
        statusLine: "│ 💖 STATUS: Dreaming of you",
        footer: "╰⊷ *GIRL MODE*",
        err: "> 🍬 Oops! Timer broke."
    }
};

module.exports = {
    command: "runtime",
    alias: ["uptime", "active"],
    category: "system",
    description: "Show bot uptime with stylish bar",

    async execute(m, sock, { args, userSettings }) {
        const lang = args[0]?.length === 2 ? args[0] : (userSettings?.lang || 'en');
        const style = userSettings?.style || 'normal';
        const ui = STYLES[style] || STYLES.normal;

        const uptimeSec = process.uptime();
        const clock = formatUptime(uptimeSec);

        let message = `${ui.header}\n`;
        message += `${ui.barLine}\n`;
        message += `${ui.uptimeLabel} ${clock}\n`;
        message += `${ui.statusLine}\n`;
        message += `${ui.footer}`;

        if (lang !== 'en') {
            try {
                const translated = await translate(message, { to: lang });
                message = translated.text;
            } catch (err) {
                console.error("Translation error:", err);
            }
        }

        try {
            await sock.sendMessage(m.chat, { react: { text: ui.react, key: m.key } });
            if (userSettings?.silent !== true) {
                await sock.sendMessage(m.chat, { text: message }, { quoted: m });
            }
        } catch (error) {
            console.error("Runtime Error:", error);
            await sock.sendMessage(m.chat, { text: ui.err });
        }
    }
};