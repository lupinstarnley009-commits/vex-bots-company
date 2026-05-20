// plugins/alive.js – Wolfbot style clean alive command (no extra stats)
const translate = require('google-translate-api-x');

const STYLES = {
    harsh: {
        react: "🫨",
        icon: "💀",
        name: "VEX HARSH",
        status: "Online & Crushing",
        footer: "VEX HARSH is alive!"
    },
    normal: {
        react: "👣",
        icon: "📱",
        name: "VEX MD",
        status: "Online",
        footer: "VEX MD is alive!"
    },
    girl: {
        react: "🧟",
        icon: "🌸",
        name: "VEX CUTE",
        status: "Online & Loving",
        footer: "VEX CUTE is alive!"
    }
};

module.exports = {
    command: "alive",
    alias: ["botalive", "systemalive", "vexalive"],
    category: "system",
    description: "Check if bot is alive (Wolfbot style)",

    async execute(m, sock, { userSettings }) {
        const lang = userSettings?.lang || "en";
        const style = userSettings?.style || "normal";
        const ui = STYLES[style] || STYLES.normal;

        // React with style emoji
        await sock.sendMessage(m.chat, { react: { text: ui.react, key: m.key } });

        // Build minimal Wolfbot-style message
        let text = `╭─⌈ ${ui.icon} *${ui.name}* ⌋\n│ ✅ Status : ${ui.status}\n╰⊷ *${ui.footer}*`;

        // Translate if needed
        if (lang !== "en") {
            try {
                const translated = await translate(text, { to: lang });
                text = translated.text;
            } catch {}
        }

        await sock.sendMessage(m.chat, { text }, { quoted: m });
    }
};