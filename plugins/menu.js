const fs = require('fs');
const path = require('path');
const os = require('os');
const translate = require('google-translate-api-x');
const axios = require('axios');

// PICHA MPYA YA ALLMENU (sawa kabisa)
const MENU_IMAGE = "https://i.ibb.co/4Z7Sf3q5/Chat-GPT-Image-May-8-2026-07-10-41-PM.png";

// Helper: get real RAM usage
function getRealRam() {
    const totalMem = os.totalmem() / (1024 * 1024 * 1024); // GB
    const freeMem = os.freemem() / (1024 * 1024 * 1024);
    const usedMem = totalMem - freeMem;
    return `${usedMem.toFixed(1)}GB / ${totalMem.toFixed(1)}GB`;
}

// Real CPU load (1 minute average)
function getRealCpu() {
    const load = os.loadavg()[0];
    return `${load.toFixed(1)}%`;
}

// Real uptime
function getRealUptime() {
    const uptimeSec = process.uptime();
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

// Real host (Render service name if available)
function getRealHost() {
    return process.env.RENDER_SERVICE_NAME || os.hostname() || 'VEX-HOST';
}

module.exports = {
    command: "menu",
    alias: ["allmenu", "list", "commands"],
    category: "system",
    description: "Display all commands with image + VEX UI (real system data)",

    async execute(m, sock, ctx) {
        const { args, userSettings } = ctx;
        const lang = args[0] && args[0].length === 2? args[0] : (userSettings?.lang || 'en');
        const style = userSettings?.style || 'normal';

        // Map style to react emoji as requested: 🩻 harsh, 🐰 normal, 🫟 girl
        const styleReact = {
            harsh: "🩻",
            normal: "🐰",
            girl: "🫟"
        };
        const reactEmoji = styleReact[style] || "🐰";

        const pluginDir = path.join(__dirname, '../plugins');
        let menuData = {};
        let totalCommands = 0;

        // Safe Plugin Scan
        try {
            const files = fs.readdirSync(pluginDir).filter(file => file.endsWith('.js'));
            for (const file of files) {
                try {
                    const pluginPath = path.join(pluginDir, file);
                    delete require.cache[require.resolve(pluginPath)];
                    const plugin = require(pluginPath);
                    if (plugin.command && plugin.category) {
                        const cat = plugin.category.toLowerCase();
                        if (!menuData[cat]) menuData[cat] = [];
                        if (!menuData[cat].includes(plugin.command)) {
                            menuData[cat].push(plugin.command);
                            totalCommands++;
                        }
                    }
                } catch (e) { continue; }
            }
        } catch (err) {
            return sock.sendMessage(m.chat, { text: "⚠️ Failed to load menu" });
        }

        // Real ping (based on message timestamp)
        const ping = Math.abs(Date.now() - (m.messageTimestamp * 1000 || Date.now()));

        // Real system stats (no fake)
        const ram = getRealRam();
        const cpu = getRealCpu();
        const uptime = getRealUptime();
        const renderNode = getRealHost();

        // ================= DESIGNS (same layout, now with real data) =================
        const designs = {
            harsh: {
                head: `
╭━━━〔 ☣️ VEX CORE ☣️ 〕━━━╮
┃ 👤 USER: @${m.sender.split('@')[0]}
┃ ⚡ MODE: HARSH EXECUTION
┃ 🔥 ENGINE: VEX AI OVERLORD
┃ 📦 COMMANDS: ${totalCommands}
┃ 📂 CATEGORIES: ${Object.keys(menuData).length}
┃ 🖥️ HOST: ${renderNode}
┃ 💾 RAM: ${ram}
┃ 🧠 CPU: ${cpu}
┃ 📡 PING: ${ping}ms
┃ ⏳ UPTIME: ${uptime}
╰━━━━━━━━━━━━━━━━━━━━╯
`,
                foot: `
╭━━━━━━━━━━━━━━━━━━━━╮
┃ ☣️ All Commands Listed
┃ ⚡ Total: ${totalCommands}
┃ 🔥 Powered by Vex AI
╰━━━━━━━━━━━━━━━━━━━━╯
`
            },
            normal: {
                head: `
╭━━━〔 📋 VEX PANEL 📋 〕━━━╮
┃ 👤 USER: @${m.sender.split('@')[0]}
┃ 🚀 STATUS: ONLINE
┃ 📦 COMMANDS: ${totalCommands}
┃ 📂 CATEGORIES: ${Object.keys(menuData).length}
┃ 🖥️ SERVER: ${renderNode}
┃ 💾 MEMORY: ${ram}
┃ 📡 LATENCY: ${ping}ms
┃ ⏳ UPTIME: ${uptime}
╰━━━━━━━━━━━━━━━━━━━━╯
`,
                foot: `
╭━━━━━━━━━━━━━━━━━━━━╮
┃ 📜 All Commands Shown
┃ 📦 Total: ${totalCommands}
┃ ⚡ VEX AI SYSTEM
╰━━━━━━━━━━━━━━━━━━━━╯
`
            },
            girl: {
                head: `
🌸 ╭━━〔 💖 VEX MENU 💖 〕━━╮ 🌸
💖 USER: @${m.sender.split('@')[0]}
✨ STATUS: EVERYTHING CUTE~
🌷 COMMANDS: ${totalCommands}
🎀 CATEGORIES: ${Object.keys(menuData).length}
🧸 SERVER: ${renderNode}
💾 MEMORY: ${ram}
📡 SPEED: ${ping}ms
🌸 UPTIME: ${uptime}
╰━━━━━━━━━━━━━━━━━━━━╯
`,
                foot: `
🎀 All Commands Listed Sweetie~
🌷 Total: ${totalCommands}
💖 Powered by Vex AI
`
            }
        };

        const d = designs[style] || designs.normal;

        try {
            // React with the correct emoji
            await sock.sendMessage(m.chat, {
                react: { text: reactEmoji, key: m.key }
            });

            await m.reply('⏳');

            let body = "\n";
            Object.keys(menuData).sort().forEach(cat => {
                body += `╭━━━〔 📂 ${cat.toUpperCase()} 〕━━━╮\n`;

                menuData[cat].sort().forEach((cmd, i) => {
                    body += `│ ${String(i + 1).padStart(2, "0")} ➤.${cmd}\n`;
                });

                body += `╰━━━━━━━━━━━━━━━━━━━━╯\n`;
            });

            let finalText = `${d.head}${body}\n${d.foot}`;

            // Translation Support
            if (lang !== 'en') {
                try {
                    const res = await translate(finalText, { to: lang });
                    finalText = res.text;
                } catch (e) {}
            }

            // Download image (fallback if fails)
            let imageBuffer = null;
            try {
                const response = await axios.get(MENU_IMAGE, {
                    responseType: "arraybuffer",
                    timeout: 20000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'image/jpeg,image/png,image/*'
                    }
                });
                const contentType = response.headers['content-type'];
                if (contentType && contentType.startsWith('image/')) {
                    imageBuffer = Buffer.from(response.data);
                }
            } catch (e) {
                console.log("MENU IMAGE FAILED:", e.message);
            }

            if (imageBuffer) {
                await sock.sendMessage(m.chat, {
                    image: imageBuffer,
                    caption: finalText,
                    mentions: [m.sender]
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.chat, {
                    text: finalText,
                    mentions: [m.sender]
                }, { quoted: m });
            }

        } catch (err) {
            console.error(err);
            sock.sendMessage(m.chat, { text: "❌ Failed to generate menu" });
        }
    }
};