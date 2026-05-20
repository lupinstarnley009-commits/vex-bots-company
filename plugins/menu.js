const translate = require("google-translate-api-x");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// ==============================
//  VEX DYNAMIC MENU (NO BUTTONS)
//  FRESH UNIQUE DESIGN
// ==============================

const MENU_IMAGE = "https://i.ibb.co/Myk40VZF/Chat-GPT-Image-May-10-2026-12-07-48-PM.png";
const menuSessions = new Map();        // For category selection
let commandCache = null;
let cacheTimestamp = 0;
const userCooldown = new Map();        // Prevent spam

// Helper: extract text from message
function getMessageText(msg) {
    try {
        return (
            msg?.message?.conversation ||
            msg?.message?.extendedTextMessage?.text ||
            msg?.message?.imageMessage?.caption ||
            msg?.message?.videoMessage?.caption ||
            ""
        ).trim();
    } catch {
        return "";
    }
}

// Safe react
async function safeReact(sock, chat, key, emoji) {
    try {
        await sock.sendMessage(chat, { react: { text: emoji, key } });
    } catch {}
}

// Load all plugins (with 15s cache)
function loadAllCommands(pluginDir) {
    const now = Date.now();
    if (commandCache && (now - cacheTimestamp) < 15000) return commandCache;

    const categories = new Map();
    let totalCommands = 0;
    const files = fs.readdirSync(pluginDir);
    for (const file of files) {
        if (!file.endsWith(".js")) continue;
        try {
            const pluginPath = path.join(pluginDir, file);
            delete require.cache[require.resolve(pluginPath)];
            const plugin = require(pluginPath);
            if (!plugin?.command) continue;
            const cat = (plugin.category || "misc").toLowerCase();
            if (!categories.has(cat)) categories.set(cat, []);
            categories.get(cat).push({
                cmd: plugin.command,
                desc: plugin.description || "No description"
            });
            totalCommands++;
        } catch {}
    }
    const sortedCats = Array.from(categories.keys()).sort();
    commandCache = { categories, totalCommands, sortedCats };
    cacheTimestamp = now;
    return commandCache;
}

// Get real system stats (no fake numbers)
function getRealStats() {
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeStr = days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
    const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    return { uptime: uptimeStr, memory: `${memUsage} MB` };
}

// ==============================
//  BRAND NEW STYLES (UNIQUE)
// ==============================
const STYLES = {
    harsh: {
        react: "⚡",
        head: (user, cmdCount, catCount, stats) =>
`✦ 𝗩𝗘𝗫 𝗛𝗔𝗥𝗦𝗛 𝗧𝗘𝗥𝗠𝗜𝗡𝗔𝗟 ✦
──────────────────
👤 𝗨𝘀𝗲𝗿 : @${user}
⚙️ 𝗠𝗼𝗱𝗲 : 𝗛𝗮𝗿𝘀𝗵
📦 𝗖𝗺𝗱𝘀 : ${cmdCount}
🗂️ 𝗖𝗮𝘁𝘀 : ${catCount}
⏱️ 𝗨𝗽𝘁𝗶𝗺𝗲 : ${stats.uptime}
💾 𝗠𝗲𝗺 : ${stats.memory}
──────────────────`,
        foot: `💡 𝗥𝗲𝗽𝗹𝘆 𝘄𝗶𝘁𝗵 𝗰𝗮𝘁𝗲𝗴𝗼𝗿𝘆 𝗻𝘂𝗺𝗯𝗲𝗿 (𝟬𝟭, 𝟬𝟮...)`
    },
    normal: {
        react: "🌟",
        head: (user, cmdCount, catCount, stats) =>
`✨ 𝗩𝗘𝗫 𝗖𝗢𝗠𝗠𝗔𝗡𝗗 𝗖𝗘𝗡𝗧𝗘𝗥 ✨
───────────────────
👤 𝗨𝘀𝗲𝗿 : @${user}
🤖 𝗦𝘁𝗮𝘁𝘂𝘀 : 𝗔𝗰𝘁𝗶𝘃𝗲
📚 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 : ${cmdCount}
📂 𝗖𝗮𝘁𝗲𝗴𝗼𝗿𝗶𝗲𝘀 : ${catCount}
⏱️ 𝗨𝗽𝘁𝗶𝗺𝗲 : ${stats.uptime}
💾 𝗠𝗲𝗺𝗼𝗿𝘆 : ${stats.memory}
───────────────────`,
        foot: `📌 𝗥𝗲𝗽𝗹𝘆 𝘄𝗶𝘁𝗵 𝗻𝘂𝗺𝗯𝗲𝗿 (𝗲.𝗴. 𝟬𝟯) 𝘁𝗼 𝗼𝗽𝗲𝗻`
    },
    girl: {
        react: "🌸",
        head: (user, cmdCount, catCount, stats) =>
`🌸 𝗩𝗘𝗫 𝗖𝗨𝗧𝗘 𝗠𝗘𝗡𝗨 🌸
─────────────────
👤 @${user}
💖 𝗠𝗼𝗱𝗲 : 𝗚𝗶𝗿𝗹
📖 𝗖𝗺𝗱𝘀 : ${cmdCount}
🎀 𝗖𝗮𝘁𝘀 : ${catCount}
🕰️ 𝗨𝗽 : ${stats.uptime}
🍭 𝗥𝗔𝗠 : ${stats.memory}
─────────────────`,
        foot: `💬 𝗥𝗲𝗽𝗹𝘆 𝘄𝗶𝘁𝗵 𝗻𝘂𝗺𝗯𝗲𝗿, 𝗯𝗮𝗯𝗲~`
    }
};

module.exports = {
    command: "menu",
    alias: ["help", "cmds", "commands"],
    category: "system",
    description: "Show command categories with dynamic selection (reply number)",

    async execute(m, sock, ctx) {
        const { args, userSettings, prefix } = ctx;
        const sender = m.sender.split("@")[0];
        const chatId = m.chat;
        const cooldownKey = `${chatId}_${m.sender}`;

        // Cooldown (2.5s)
        if (userCooldown.has(cooldownKey)) {
            const diff = Date.now() - userCooldown.get(cooldownKey);
            if (diff < 2500) return;
        }
        userCooldown.set(cooldownKey, Date.now());

        const lang = (args[0]?.length === 2 ? args[0] : userSettings?.lang) || "en";
        const style = userSettings?.style || "normal";
        const pluginDir = path.join(__dirname, "../plugins");

        const { categories, totalCommands, sortedCats } = loadAllCommands(pluginDir);
        if (!sortedCats.length) return m.reply("⚠️ No categories found.");

        const stats = getRealStats();
        const ui = STYLES[style] || STYLES.normal;
        await safeReact(sock, chatId, m.key, ui.react);

        // Build category list (fresh design)
        let catList = "";
        sortedCats.forEach((cat, idx) => {
            const num = String(idx + 1).padStart(2, "0");
            const cmdCount = categories.get(cat).length;
            catList += `  ${num} › ${cat.toUpperCase()}  (${cmdCount} cmd)\n`;
        });

        // Main menu content (no boxes, no special chars)
        let menuText = `${ui.head(sender, totalCommands, sortedCats.length, stats)}\n\n📂 𝗖𝗔𝗧𝗘𝗚𝗢𝗥𝗜𝗘𝗦\n${catList}\n──────────────────\n${ui.foot}\n\n🌍 𝗣𝗿𝗲𝗳𝗶𝘅 : ${prefix}\n🔄 𝗦𝗲𝘀𝘀𝗶𝗼𝗻 : 60𝘀`;

        // Translate if needed
        if (lang !== "en") {
            try {
                const translated = await translate(menuText, { to: lang });
                menuText = translated.text;
            } catch {}
        }

        // Send image + caption
        let imageBuffer = null;
        try {
            const resp = await axios.get(MENU_IMAGE, { responseType: "arraybuffer", timeout: 10000 });
            if (resp.headers["content-type"]?.startsWith("image")) imageBuffer = Buffer.from(resp.data);
        } catch {}

        const sentMsg = await sock.sendMessage(chatId, {
            image: imageBuffer || { url: MENU_IMAGE },
            caption: menuText,
            mentions: [m.sender]
        }, { quoted: m });

        // Store session for reply handling
        const sessionId = `${chatId}_${m.sender}`;
        if (menuSessions.has(sessionId)) clearTimeout(menuSessions.get(sessionId).timeout);
        menuSessions.set(sessionId, {
            categories: sortedCats,
            commandsMap: categories,
            lang,
            prefix,
            pluginDir,   // not used further but kept
            msgId: sentMsg.key?.id,
            timeout: setTimeout(() => menuSessions.delete(sessionId), 60000)
        });
    }
};

// ==============================
//  GLOBAL LISTENER (handles replies)
// ==============================
module.exports.listener = async (sock) => {
    sock.ev.on("messages.upsert", async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg?.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const sessionId = `${from}_${sender}`;
            const session = menuSessions.get(sessionId);
            if (!session) return;

            let input = getMessageText(msg);
            if (!input) return;

            // Extract number: supports "03", "3", "menu 3", "menu_03"
            let numMatch = input.match(/\b(\d{1,2})\b/);
            if (!numMatch) return;
            const catIndex = parseInt(numMatch[1]) - 1;
            if (isNaN(catIndex) || catIndex < 0 || catIndex >= session.categories.length) return;

            const selectedCat = session.categories[catIndex];
            const commands = session.commandsMap.get(selectedCat) || [];

            // Build command list (clean and simple)
            let cmdList = `📁 *${selectedCat.toUpperCase()}*  (${commands.length} commands)\n────────────────\n`;
            commands.forEach((cmd, i) => {
                const num = String(i + 1).padStart(2, "0");
                cmdList += `${num} › ${session.prefix}${cmd.cmd}\n   ✦ ${cmd.desc}\n\n`;
            });
            cmdList += `────────────────\n🔁 Reply with "menu" again for categories.`;

            // Translate if needed
            if (session.lang !== "en") {
                try {
                    const translated = await translate(cmdList, { to: session.lang });
                    cmdList = translated.text;
                } catch {}
            }

            await safeReact(sock, from, msg.key, "📌");
            await sock.sendMessage(from, { text: cmdList }, { quoted: msg });

            // Clear session after use
            clearTimeout(session.timeout);
            menuSessions.delete(sessionId);
        } catch (err) {
            console.error("Menu Listener Error:", err);
        }
    });
};