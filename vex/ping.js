// VEX MINI BOT - PING COMMAND
// Enhanced with dynamic speed bar, multi-style reactions, and real-time updating for 10 seconds.

const path = require('path');
const fs = require('fs');

// Helper: generate speed bar based on ping (ms)
function getSpeedBar(ping) {
    let filledBlocks;
    if (ping <= 50) filledBlocks = 10;
    else if (ping <= 100) filledBlocks = 9;
    else if (ping <= 200) filledBlocks = 7;
    else if (ping <= 300) filledBlocks = 5;
    else if (ping <= 500) filledBlocks = 3;
    else filledBlocks = 1;
    const emptyBlocks = 10 - filledBlocks;
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
    return bar;
}

// Styles configuration
const STYLES = {
    harsh: {
        react: "🥾",
        header: "╭─⌈ *⛓️ VEX HARSH PING* ⌋\n│",
        latencyLabel: "⚡ LATENCY",
        barLabel: "📡 SPEED BAR",
        footer: "╰⊷ *HARSH MODE ACTIVE*"
    },
    normal: {
        react: "🚨",
        header: "╭─⌈ *🚨 VEX PING MONITOR* ⌋\n│",
        latencyLabel: "📶 LATENCY",
        barLabel: "📊 SPEED BAR",
        footer: "╰⊷ *NORMAL MODE*"
    },
    girl: {
        react: "💖",
        header: "╭─⌈ *🌸 VEX CUTE PING* ⌋\n│",
        latencyLabel: "💕 LATENCY",
        barLabel: "🎀 SPEED BAR",
        footer: "╰⊷ *GIRL MODE*"
    }
};

module.exports = {
    command: "ping",
    alias: ["latency", "speed"],
    category: "system",
    description: "Check system latency with dynamic speed bar (updates for 10 seconds)",

    async execute(m, sock, { userSettings }) {
        const chat = m.chat;
        const sender = m.sender;
        const style = userSettings?.style || 'normal';
        const ui = STYLES[style] || STYLES.normal;

        // Initial reaction (style-specific)
        await sock.sendMessage(chat, { react: { text: ui.react, key: m.key } });

        // Initial "measuring" message
        const initMsg = await sock.sendMessage(chat, { text: "⏳ Measuring ping for 10 seconds..." }, { quoted: m });

        let lastMsgKey = initMsg.key;
        const startTime = Date.now();
        let intervalCount = 0;
        const totalIntervals = 10; // 10 seconds

        const updatePing = async () => {
            intervalCount++;
            const currentPing = Date.now() - startTime;
            const bar = getSpeedBar(currentPing);
            const pingMs = currentPing;

            let text = `${ui.header}\n`;
            text += `│ • ${ui.latencyLabel}: ${pingMs} ms\n`;
            text += `│ • ${ui.barLabel}: [${bar}]\n`;
            text += `│ • Duration: ${intervalCount}/10 sec\n`;
            text += `│\n`;
            text += `${ui.footer}\n\n_Powered by VEX Engine_`;

            // Edit the previous message (send new message with same key)
            await sock.sendMessage(chat, { text: text, edit: lastMsgKey });
            // Update lastMsgKey? Actually after edit, the key remains the same. We keep it.

            if (intervalCount < totalIntervals) {
                setTimeout(updatePing, 1000);
            } else {
                // Final message after 10 seconds - no more edits
                const finalPing = Date.now() - startTime;
                const finalBar = getSpeedBar(finalPing);
                let finalText = `${ui.header}\n`;
                finalText += `│ • ${ui.latencyLabel}: ${finalPing} ms\n`;
                finalText += `│ • ${ui.barLabel}: [${finalBar}]\n`;
                finalText += `│ • Measurement: COMPLETE\n`;
                finalText += `│\n`;
                finalText += `${ui.footer}\n\n✅ Final reading after 10 seconds.\n_Powered by VEX Engine_`;
                await sock.sendMessage(chat, { text: finalText, edit: lastMsgKey });
            }
        };

        // Start the first update after 1 second
        setTimeout(updatePing, 1000);
    }
};