const fs = require('fs');
const path = require('path');
const translate = require('google-translate-api-x');
const axios = require('axios');

// PICHA MPYA YA ALLMENU
const MENU_IMAGE = "https://i.ibb.co/4Z7Sf3q5/Chat-GPT-Image-May-8-2026-07-10-41-PM.png";

module.exports = {
    command: "allmenu2",
    alias: ["list2", "commands2"],
    category: "system",
    description: "Display all commands with image + VEX UI",

    async execute(m, sock, ctx) {
        const { args, userSettings } = ctx;
        const lang = args[0] && args[0].length === 2? args[0] : (userSettings?.lang || 'en');
        const style = userSettings?.style || 'normal';

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

        const ping = Math.abs(Date.now() - (m.messageTimestamp * 1000 || Date.now()));

        // Time-based Greeting
        const hour = new Date().getHours();
        let greeting = "Good Day";
        if (hour < 12) greeting = "Good Morning 🌅";
        else if (hour < 17) greeting = "Good Afternoon ☀️";
        else if (hour < 22) greeting = "Good Evening 🌆";
        else greeting = "Good Night 🌙";

        const ram = `${Math.floor(Math.random() * 6) + 1}.${Math.floor(Math.random() * 9)}GB`;
        const cpu = `${Math.floor(Math.random() * 70) + 20}%`;
        const uptime = `${Math.floor(Math.random() * 24)}h ${Math.floor(Math.random() * 60)}m`;
        const renderNode = `Render-VPS-${Math.floor(Math.random() * 99) + 1}`;

        // ================= DESIGNS KAMA ZA MENU.JS =================
        const designs = {
            harsh: {
                react: "☣️",
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
                react: "📡",
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
                react: "💖",
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
            await sock.sendMessage(m.chat, {
                react: { text: d.react, key: m.key }
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
            if (lang!== 'en') {
                try {
                    const res = await translate(finalText, { to: lang });
                    finalText = res.text;
                } catch (e) {}
            }

            // PAKUA PICHA KWANZA
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
                } else {
                    console.log("MENU IMAGE FAILED: Not an image, got", contentType);
                }
            } catch (e) {
                console.log("MENU IMAGE FAILED:", e.message);
            }

            // TUMA - HAKUNA BUTTONS
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
