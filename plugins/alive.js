const os = require("os");
const axios = require("axios");
const translate = require("google-translate-api-x");

// Default menu image (optional, can be removed)
const MENU_IMAGE = "https://i.ibb.co/4Z7Sf3q5/Chat-GPT-Image-May-8-2026-07-10-41-PM.png";

// Helper: generate speed bar (same as ping command)
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

// Styles (unique emojis)
const STYLES = {
    harsh: {
        react: "🫨",
        header: "╭─⌈ *💀 VEX HARSH* ⌋\n│",
        statusText: "ALIVE & CRUSHING",
        footer: "╰⊷ *HARSH MODE*"
    },
    normal: {
        react: "👣",
        header: "╭─⌈ *📱 VEX MD* ⌋\n│",
        statusText: "STATUS ALIVE",
        footer: "╰⊷ *VEX MD*"
    },
    girl: {
        react: "🧟",
        header: "╭─⌈ *🌸 VEX CUTE* ⌋\n│",
        statusText: "LIVING & LOVING",
        footer: "╰⊷ *GIRL MODE*"
    }
};

module.exports = {
    command: "alive",
    alias: ["botalive", "systemalive", "vexalive"],
    category: "system",
    description: "Real system status with ping bar (no fake data)",

    async execute(m, sock, { userSettings }) {
        const lang = userSettings?.lang || "en";
        const style = userSettings?.style || "normal";
        const ui = STYLES[style] || STYLES.normal;

        // 1. Real ping measurement (no fake)
        let pingMs = "N/A";
        let bar = "░░░░░░░░░░";
        try {
            const start = Date.now();
            await axios.get("https://api.github.com", { timeout: 8000, headers: { 'User-Agent': 'VEX-Bot' } });
            pingMs = Date.now() - start;
            bar = getSpeedBar(pingMs);
        } catch (e) {
            pingMs = "Timeout";
            bar = "░░░░░░░░░░";
        }

        // 2. Real system stats
        const totalMem = os.totalmem() / 1024 / 1024;
        const freeMem = os.freemem() / 1024 / 1024;
        const usedMem = totalMem - freeMem;
        const memPercent = ((usedMem / totalMem) * 100).toFixed(1);
        const ramUsed = `${usedMem.toFixed(0)}MB / ${totalMem.toFixed(0)}MB`;

        const cpuLoad = os.loadavg()[0].toFixed(2);
        const platform = os.platform();
        const nodeVer = process.version;
        const uptimeSec = process.uptime();
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        const uptime = `${days}d ${hours}h ${minutes}m`;

        // 3. Render environment (real env vars)
        const renderService = process.env.RENDER_SERVICE_NAME || "Render Free";
        const renderRegion = process.env.RENDER_REGION || "Singapore";

        // 4. Build message exactly as requested format
        let caption = `${ui.header}\n`;
        caption += `│ > ${pingMs}ms [${bar}]\n`;
        caption += `│    >  ${ui.statusText}\n`;
        caption += `│\n`;
        caption += `│ 📡 PING: ${pingMs}ms\n`;
        caption += `│ 💾 RAM: ${ramUsed} (${memPercent}%)\n`;
        caption += `│ 🧠 CPU LOAD: ${cpuLoad}\n`;
        caption += `│ 💻 OS: ${platform}\n`;
        caption += `│ 🔥 NODE: ${nodeVer}\n`;
        caption += `│ ⏱️ UPTIME: ${uptime}\n`;
        caption += `│ ☁️ RENDER: ${renderService} (${renderRegion})\n`;
        caption += `│\n`;
        caption += `${ui.footer}`;

        // Translate if needed
        if (lang !== "en") {
            try {
                const translated = await translate(caption, { to: lang });
                caption = translated.text;
            } catch {}
        }

        // React with style emoji
        await sock.sendMessage(m.chat, { react: { text: ui.react, key: m.key } });

        // Try to send with image (optional, fallback to text)
        let imageBuffer = null;
        try {
            const imgRes = await axios.get(MENU_IMAGE, { responseType: "arraybuffer", timeout: 10000 });
            if (imgRes.headers['content-type']?.startsWith('image/'))
                imageBuffer = Buffer.from(imgRes.data);
        } catch {}

        if (imageBuffer) {
            await sock.sendMessage(m.chat, { image: imageBuffer, caption, mentions: [m.sender] }, { quoted: m });
        } else {
            await sock.sendMessage(m.chat, { text: caption, mentions: [m.sender] }, { quoted: m });
        }
    }
};