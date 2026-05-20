const translate = require('google-translate-api-x');

module.exports = {
    command: "runtime",
    category: "system",
    description: "Check how long the bot has been active",

    async execute(m, sock, { args, userSettings }) {
        const lang = args[0] && args[0].length === 2 ? args[0] : (userSettings?.lang || 'en');
        const style = userSettings?.style || 'harsh';

        // Uptime calculation (same logic, untouched)
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const clock = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        // ---- BRAND NEW, UNIQUE STYLES ----
        // Each style has completely different phrasing, structure, and emojis.
        // No two styles resemble each other.
        const modes = {
            harsh: {
                text: `⚡ *[ SYSTEM HARSH LOGS ]* ⚡\n┌───────────────┐\n│ ⏱️  UPTIME   │\n│  ${clock}  │\n└───────────────┘\n🤖 _Status: Irritated but functional._\n💢 _Stop wasting my cycles._`,
                react: "⚡",
                err: "🔥 _Time variable corrupted. Reboot recommended, idiot._"
            },
            normal: {
                text: `📊 *━━━━━━━━━━━━━━━━━━━━*\n       📍  SYSTEM UPTIME  📍\n━━━━━━━━━━━━━━━━━━━━━━━━\n   🕘  ${clock}\n━━━━━━━━━━━━━━━━━━━━━━━━\n   ✅ All systems nominal.\n   📡 No critical errors detected.`,
                react: "📊",
                err: "❌ _Time measurement module failed. Check logs._"
            },
            girl: {
                text: `☆*:.｡.o(≧▽≦)o.｡.:*☆\n       💖  𝓤𝓹𝓽𝓲𝓶𝓮 𝓜𝓮𝓶𝓸  💖\n     ⋆｡°✩  ✩°｡⋆\n       🕰️  *${clock}*  🕰️\n     ⋆｡°✩  ✩°｡⋆\n   🌸 _I've been dreaming of you for_ 🌸\n   🎀 _every single second, hehe~_ 🎀\n          ╰(*´︶`*)╯♡`,
                react: "💖",
                err: "🍬 _Oops! My little timer broke while counting hearts for you~_ 💔"
            }
        };

        const currentMode = modes[style] || modes.normal;

        try {
            // Send unique reaction emoji
            await sock.sendMessage(m.chat, { react: { text: currentMode.react, key: m.key } });

            if (userSettings?.silent === true) return;

            let finalMessage = currentMode.text;

            // Translation engine preserved
            if (lang !== 'en') {
                const res = await translate(finalMessage, { to: lang });
                finalMessage = res.text;
            }

            await sock.sendMessage(m.chat, { text: finalMessage }, { quoted: m });

        } catch (error) {
            console.error("Runtime Error:", error);
            await sock.sendMessage(m.chat, { text: currentMode.err });
        }
    }
};