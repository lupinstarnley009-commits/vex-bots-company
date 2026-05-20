const translate = require("google-translate-api-x");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Session storage for reply‑based navigation
const menuSessions = new Map();
let commandCache = null;
let cacheTimestamp = 0;
const userCooldown = new Map();

// Helper: extract plain text from any message
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

// Safe reaction
async function safeReact(sock, chat, key, emoji) {
    try {
        await sock.sendMessage(chat, { react: { text: emoji, key } });
    } catch {}
}

// Load all plugins (cache 15 seconds)
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

// Real system stats (used in header)
function getSystemStats() {
    const totalMem = os.totalmem() / (1024 * 1024);
    const freeMem = os.freemem() / (1024 * 1024);
    const usedMem = totalMem - freeMem;
    const memPercent = ((usedMem / totalMem) * 100).toFixed(0);
    const ramUsage = `${usedMem.toFixed(1)}MB / ${totalMem.toFixed(1)}MB`;
    const uptimeSec = process.uptime();
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const uptimeStr = days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
    return { memPercent, ramUsage, uptime: uptimeStr };
}

// ==============================
// STYLES (Wolfbot‑inspired)
// ==============================
const STYLES = {
    harsh: {
        react: "🎏",
        title: "⛓️ VEX HARSH MENU",
        footer: "HARSH MODE",
        owner: "VEX"
    },
    normal: {
        react: "🐰",
        title: "📱 VEX MD",
        footer: "NORMAL MODE",
        owner: "VEX"
    },
    girl: {
        react: "🥨",
        title: "🌸 VEX CUTE MENU",
        footer: "GIRL MODE",
        owner: "VEX"
    }
};

// Build the main menu header (Wolfbot style)
function buildHeader(user, styleTitle, prefix, stats, mode, owner) {
    const platform = os.platform() === "linux" ? "🐧 Linux" : os.platform();
    const status = "🟢 Active";
    const timezone = "Africa/Dar_es_Salaam";
    return `╭─⌈ *${styleTitle}* ⌋
│ 👤 User : @${user}
│ 👑 Owner : ${owner}
│ ⚙️ Mode : ${mode}
│ 🔌 Prefix : [${prefix}]
│ 📦 Version : 1.1.5
│ 💻 Platform : ${platform}
│ ✅ Status : ${status}
│ 🕒 Timezone : ${timezone}
│ ⏱️ Uptime : ${stats.uptime}
│ 💾 RAM : ${stats.memPercent}%
│ 📊 Memory : ${stats.ramUsage}
│
`;
}

// List categories (numbered, one per line)
function buildCategoryList(sortedCats, categories) {
    let list = "";
    sortedCats.forEach((cat, idx) => {
        const num = String(idx + 1).padStart(2, " ");
        const cmdCount = categories.get(cat).length;
        list += `│ ${num}. ${cat.toUpperCase()} (${cmdCount} commands)\n`;
    });
    return list;
}

// Show commands of a selected category (simple numbered list)
function buildCommandsList(category, commands, prefix, styleTitle, styleFooter) {
    let output = `╭─⌈ *${styleTitle}* ⌋\n`;
    output += `│ 📁 ${category.toUpperCase()} (${commands.length} commands)\n│\n`;
    commands.forEach((cmd, i) => {
        const num = String(i + 1).padStart(2, "0");
        output += `│ ${num} › ${prefix}${cmd.cmd}\n`;
        output += `│     ${cmd.desc.substring(0, 55)}\n`;
        if (i !== commands.length - 1) output += `│\n`;
    });
    output += `│\n╰⊷ *${styleFooter}*\n🔁 Type "${prefix}menu" to return.`;
    return output;
}

module.exports = {
    command: "menu",
    alias: ["help", "cmds", "commands"],
    category: "system",
    description: "Show command categories with Wolfbot‑style layout",

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
        const ui = STYLES[style] || STYLES.normal;
        const mode = style.charAt(0).toUpperCase() + style.slice(1); // "Normal", "Harsh", "Girl"

        const pluginDir = path.join(__dirname, "../plugins");
        const { categories, totalCommands, sortedCats } = loadAllCommands(pluginDir);
        if (!sortedCats.length) return m.reply("⚠️ No categories found.");

        const stats = getSystemStats();
        await safeReact(sock, chatId, m.key, ui.react);

        // Direct category selection via .menu <number>
        const directNum = args[0] && /^\d+$/.test(args[0]) ? parseInt(args[0]) - 1 : null;
        if (directNum !== null && directNum >= 0 && directNum < sortedCats.length) {
            const selectedCat = sortedCats[directNum];
            const commands = categories.get(selectedCat) || [];
            let cmdList = buildCommandsList(selectedCat, commands, prefix, ui.title, ui.footer);
            if (lang !== "en") {
                try {
                    const translated = await translate(cmdList, { to: lang });
                    cmdList = translated.text;
                } catch {}
            }
            await sock.sendMessage(chatId, { text: cmdList }, { quoted: m });
            return;
        }

        // Build main menu (categories)
        const header = buildHeader(sender, ui.title, prefix, stats, mode, ui.owner);
        const catList = buildCategoryList(sortedCats, categories);
        let menuText = `${header}${catList}│\n│ 💡 Reply with category number (e.g., "03") or use ${prefix}menu <number>\n╰⊷ *${ui.footer}*`;

        if (lang !== "en") {
            try {
                const translated = await translate(menuText, { to: lang });
                menuText = translated.text;
            } catch {}
        }

        // Send as plain text (no image needed)
        const sentMsg = await sock.sendMessage(chatId, { text: menuText, mentions: [m.sender] }, { quoted: m });

        // Store session for reply‑based selection
        const sessionId = `${chatId}_${m.sender}`;
        if (menuSessions.has(sessionId)) clearTimeout(menuSessions.get(sessionId).timeout);
        menuSessions.set(sessionId, {
            categories: sortedCats,
            commandsMap: categories,
            lang,
            prefix,
            styleTitle: ui.title,
            styleFooter: ui.footer,
            msgId: sentMsg.key?.id,
            timeout: setTimeout(() => menuSessions.delete(sessionId), 60000)
        });
    }
};

// ==============================
// GLOBAL LISTENER (handles replies to menu)
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

            // Extract number (e.g., "03", "3", "menu 3")
            let numMatch = input.match(/\b(\d{1,2})\b/);
            if (!numMatch) return;
            const catIndex = parseInt(numMatch[1]) - 1;
            if (isNaN(catIndex) || catIndex < 0 || catIndex >= session.categories.length) return;

            const selectedCat = session.categories[catIndex];
            const commands = session.commandsMap.get(selectedCat) || [];

            let cmdList = buildCommandsList(selectedCat, commands, session.prefix, session.styleTitle, session.styleFooter);
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