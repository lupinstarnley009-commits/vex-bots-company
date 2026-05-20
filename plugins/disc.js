const fs = require('fs');
const path = require('path');
const translate = require('google-translate-api-x');

// Cache for commands metadata (lazy load, refresh every 5 min)
let commandsCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cooldown map: userId -> timestamp
const cooldownMap = new Map();
const COOLDOWN_MS = 3000; // 3 seconds

// Plugin directory path (relative to this file)
const PLUGIN_DIR = path.join(__dirname, '../plugins');

module.exports = {
    command: "disc",
    alias: ["describe", "cmdinfo", "commandinfo", "whatis"],
    category: "system",
    description: "Show command descriptions, all commands, or category list (lazy load, cooldown)",

    async execute(m, sock, { args, userSettings, prefix }) {
        const sender = m.sender;
        const chat = m.chat;
        const lang = userSettings?.lang || 'en';
        const style = userSettings?.style || 'normal';

        // Cooldown check
        const now = Date.now();
        if (cooldownMap.has(sender) && (now - cooldownMap.get(sender)) < COOLDOWN_MS) {
            return; // silent ignore
        }
        cooldownMap.set(sender, now);
        if (cooldownMap.size > 100) {
            for (const [uid, time] of cooldownMap.entries()) {
                if (now - time > 60000) cooldownMap.delete(uid);
            }
        }

        // Load command metadata (lazy + cache)
        let cmdData;
        try {
            cmdData = loadCommandsMetadata();
        } catch (err) {
            console.error("Failed to load commands:", err);
            return m.reply("❌ Could not load command information. Please try again later.");
        }

        const { commandMap, aliasMap, categories, allCommandsList } = cmdData;
        const query = args.join(' ').trim().toLowerCase();

        // No arguments -> help menu
        if (!query) {
            const helpText = await generateHelpMenu(prefix, categories, style, lang);
            await sock.sendMessage(chat, { text: helpText }, { quoted: m });
            return;
        }

        // "all" -> all commands
        if (query === 'all') {
            const allText = await generateAllCommands(prefix, categories, style, lang);
            await sock.sendMessage(chat, { text: allText }, { quoted: m });
            return;
        }

        // "menu" or "categories" -> category list
        if (query === 'menu' || query === 'categories') {
            const catText = await generateCategoryList(prefix, categories, style, lang);
            await sock.sendMessage(chat, { text: catText }, { quoted: m });
            return;
        }

        // Specific command or alias
        let targetCmd = commandMap.get(query);
        if (!targetCmd) targetCmd = aliasMap.get(query);
        if (targetCmd) {
            const cmdInfo = await generateCommandInfo(targetCmd, prefix, style, lang);
            await sock.sendMessage(chat, { text: cmdInfo }, { quoted: m });
            return;
        }

        // Category name match
        const categoryNames = Object.keys(categories);
        const matchedCat = categoryNames.find(cat => cat.toLowerCase() === query);
        if (matchedCat) {
            const catText = await generateCategoryCommands(matchedCat, categories[matchedCat], prefix, style, lang);
            await sock.sendMessage(chat, { text: catText }, { quoted: m });
            return;
        }

        // Not found -> suggest similar
        const suggestions = findSimilarCommands(query, commandMap, aliasMap);
        let reply = `❌ Command "${query}" not found.\n`;
        if (suggestions.length) {
            reply += `\n💡 Did you mean:\n${suggestions.map(s => `   • ${prefix}${s}`).join('\n')}`;
        } else {
            reply += `\n📋 Use ${prefix}disc all to see all commands.`;
        }
        await sock.sendMessage(chat, { text: reply }, { quoted: m });
    }
};

// ========================
// METADATA LOADER (lazy, cached)
// ========================
function loadCommandsMetadata() {
    const now = Date.now();
    if (commandsCache && (now - lastCacheTime) < CACHE_TTL) {
        return commandsCache;
    }

    const commandMap = new Map();
    const aliasMap = new Map();
    const categories = {};
    const allCommandsList = [];

    if (!fs.existsSync(PLUGIN_DIR)) {
        throw new Error(`Plugin directory not found: ${PLUGIN_DIR}`);
    }

    const files = fs.readdirSync(PLUGIN_DIR);
    for (const file of files) {
        if (!file.endsWith('.js')) continue;
        try {
            const filePath = path.join(PLUGIN_DIR, file);
            delete require.cache[require.resolve(filePath)];
            const plugin = require(filePath);
            if (!plugin || !plugin.command) continue;

            const cmdName = plugin.command.toLowerCase();
            const aliases = (plugin.alias || []).map(a => a.toLowerCase());
            const category = (plugin.category || 'misc').toLowerCase();
            const description = plugin.description || 'No description provided.';

            const cmdObj = { name: cmdName, aliases, category, description, file };
            commandMap.set(cmdName, cmdObj);
            allCommandsList.push(cmdObj);
            for (const alias of aliases) aliasMap.set(alias, cmdName);
            if (!categories[category]) categories[category] = [];
            categories[category].push(cmdObj);
        } catch (err) {
            console.error(`Error loading plugin ${file}:`, err.message);
        }
    }

    for (const cat in categories) {
        categories[cat].sort((a, b) => a.name.localeCompare(b.name));
    }

    commandsCache = { commandMap, aliasMap, categories, allCommandsList };
    lastCacheTime = Date.now();
    return commandsCache;
}

// ========================
// STYLES (unique designs)
// ========================
const STYLES = {
    harsh: {
        head: (title) => `☠️ *${title}* ☠️\n━━━━━━━━━━━━━━━━━━━━`,
        line: (text) => `⚡ ${text}`,
        foot: (prefix) => `━━━━━━━━━━━━━━━━━━━━\n🖕 Use ${prefix}disc <command> for details`,
    },
    normal: {
        head: (title) => `📋 *${title}*\n━━━━━━━━━━━━━━━━━━━━`,
        line: (text) => `➤ ${text}`,
        foot: (prefix) => `━━━━━━━━━━━━━━━━━━━━\n🔍 Try ${prefix}disc <command>`,
    },
    girl: {
        head: (title) => `🌸 *${title}* 🌸\n✧･ﾟ: *✧･ﾟ:*`,
        line: (text) => `💖 ${text}`,
        foot: (prefix) => `✧･ﾟ: *✧･ﾟ:*\n🎀 ${prefix}disc <command> cutie~`,
    }
};

// Helper: translate if needed
async function translateText(text, lang) {
    if (lang === 'en') return text;
    try {
        const res = await translate(text, { to: lang });
        return res.text;
    } catch {
        return text;
    }
}

// ========================
// GENERATORS (all accept prefix)
// ========================
async function generateHelpMenu(prefix, categories, style, lang) {
    const ui = STYLES[style] || STYLES.normal;
    const catList = Object.keys(categories).sort()
        .map(cat => `• ${cat} (${categories[cat].length} cmds)`)
        .join('\n');
    let text = `${ui.head("Command Help")}\n\n`;
    text += `Usage: ${prefix}disc <command|alias|all|category|menu>\n\n`;
    text += `📂 *Categories:*\n${catList}\n\n`;
    text += `${ui.line("Example:")} ${prefix}disc all\n`;
    text += `${ui.line("Example:")} ${prefix}disc song\n`;
    text += `${ui.line("Example:")} ${prefix}disc system\n\n`;
    text += ui.foot(prefix);
    return await translateText(text, lang);
}

async function generateAllCommands(prefix, categories, style, lang) {
    const ui = STYLES[style] || STYLES.normal;
    let text = `${ui.head("All Commands")}\n\n`;
    for (const cat of Object.keys(categories).sort()) {
        text += `📁 *${cat.toUpperCase()}* (${categories[cat].length})\n`;
        for (const cmd of categories[cat]) {
            text += `  ${ui.line(`${prefix}${cmd.name} - ${cmd.description.substring(0, 60)}`)}\n`;
        }
        text += `\n`;
    }
    text += ui.foot(prefix);
    if (text.length > 4000) text = text.substring(0, 3900) + "\n... (truncated)";
    return await translateText(text, lang);
}

async function generateCategoryList(prefix, categories, style, lang) {
    const ui = STYLES[style] || STYLES.normal;
    let text = `${ui.head("Categories")}\n\n`;
    for (const cat of Object.keys(categories).sort()) {
        text += `${ui.line(`${cat} (${categories[cat].length} commands)`)}\n`;
    }
    text += `\n${ui.foot(prefix)}`;
    return await translateText(text, lang);
}

async function generateCategoryCommands(category, commands, prefix, style, lang) {
    const ui = STYLES[style] || STYLES.normal;
    let text = `${ui.head(`Category: ${category.toUpperCase()}`)}\n\n`;
    for (const cmd of commands) {
        text += `${ui.line(`${prefix}${cmd.name}`)}\n   └ ${cmd.description}\n\n`;
    }
    text += ui.foot(prefix);
    return await translateText(text, lang);
}

async function generateCommandInfo(cmdObj, prefix, style, lang) {
    const ui = STYLES[style] || STYLES.normal;
    let text = `${ui.head("Command Details")}\n\n`;
    text += `📌 *Name:* ${prefix}${cmdObj.name}\n`;
    if (cmdObj.aliases.length) {
        text += `🔖 *Aliases:* ${cmdObj.aliases.map(a => prefix + a).join(', ')}\n`;
    }
    text += `📂 *Category:* ${cmdObj.category}\n`;
    text += `📝 *Description:* ${cmdObj.description}\n`;
    if (cmdObj.file) text += `📁 *File:* ${cmdObj.file}\n`;
    text += `\n${ui.foot(prefix)}`;
    return await translateText(text, lang);
}

function findSimilarCommands(query, commandMap, aliasMap) {
    const allCmdNames = Array.from(commandMap.keys());
    const allAliases = Array.from(aliasMap.keys());
    const all = [...allCmdNames, ...allAliases];
    const lowerQuery = query.toLowerCase();
    const suggestions = all.filter(c => c.startsWith(lowerQuery) || c.includes(lowerQuery));
    return suggestions.slice(0, 5);
}