const translate = require("google-translate-api-x");
const fs = require("fs");
const path = require("path");

// Session store for reply‑based navigation
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

// Safe reaction (style‑specific emojis)
async function safeReact(sock, chat, key, emoji) {
    try {
        await sock.sendMessage(chat, { react: { text: emoji, key } });
    } catch {}
}

// Load all plugins (cache 15s)
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

// Real system stats (for header)
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
// STYLES (ping‑like design)
// ==============================
const STYLES = {
    harsh: {
        react: "🎏",
        title: "⛓️ VEX HARSH MENU",
        footer: "HARSH MODE",
        lineChar: "│"
    },
    normal: {
        react: "🐰",
        title: "📱 VEX MD",
        footer: "NORMAL MODE",
        lineChar: "│"
    },
    girl: {
        react: "🥨",
        title: "🌸 VEX CUTE MENU",
        footer: "GIRL MODE",
        lineChar: "│"
    }
};

// Build the category list header (no boxes, just lines)
function buildCategoryHeader(styleTitle, user, totalCmds, totalCats, stats, prefix) {
    let header = `╭─⌈ *${styleTitle}* ⌋\n`;
    header += `│ 👤 User : @${user}\n`;
    header += `│ 📦 Commands : ${totalCmds}\n`;
    header += `│ 📂 Categories : ${totalCats}\n`;
    header += `│ ⏱️ Uptime : ${stats.uptime}\n`;
    header += `│ 💾 Memory : ${stats.memory}\n`;
    header += `│ 🔌 Prefix : ${prefix}\n`;
    header += `│\n`;
    return header;
}

function buildCategoryList(sortedCats, categories) {
    let list = `│ ┌───┬─────────────────────┬──────┐\n`;
    list += `│ │ # │ Category            │ Cmds │\n`;
    list += `│ ├───┼─────────────────────┼──────┤\n`;
    sortedCats.forEach((cat, idx) => {
        const num = String(idx + 1).padStart(2, " ");
        const cmdCount = categories.get(cat).length;
        const catName = cat.toUpperCase().padEnd(19, " ");
        list += `│ │ ${num} │ ${catName} │ ${String(cmdCount).padStart(4, " ")} │\n`;
    });
    list += `│ └───┴─────────────────────┴──────┘\n`;
    return list;
}

function buildCommandsList(category, commands, prefix, styleTitle, styleFooter) {
    let output = `╭─⌈ *${styleTitle}* ⌋\n`;
    output += `│ 📁 ${category.toUpperCase()} (${commands.length} commands)\n`;
    output += `│\n`;
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
    description: "Show categorized commands – reply with number or .menu <number>",

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

        const pluginDir = path.join(__dirname, "../plugins");
        const { categories, totalCommands, sortedCats } = loadAllCommands(pluginDir);
        if (!sortedCats.length) return m.reply("⚠️ No categories found.");

        const stats = getRealStats();
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
        const header = buildCategoryHeader(ui.title, sender, totalCommands, sortedCats.length, stats, prefix);
        const catTable = buildCategoryList(sortedCats, categories);
        let menuText = `${header}${catTable}\n│ 💡 Reply with category number (e.g., "03") or use ${prefix}menu <number>\n╰⊷ *${ui.footer}*`;

        if (lang !== "en") {
            try {
                const translated = await translate(menuText, { to: lang });
                menuText = translated.text;
            } catch {}
        }

        // Optional: send image (if you have one) – skip if not needed
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
// GLOBAL LISTENER (handles replies)
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