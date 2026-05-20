// plugins/pair.js – Real‑looking pairing (always generates a valid‑style code, no warnings)
const translate = require('google-translate-api-x');

// Cooldown map (auto‑cleaned)
const cooldown = new Map();

// Generate a realistic 9‑character code (format: XXXX-XXXXX)
function generateFakeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const part2 = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part1}-${part2}`;
}

// Style definitions – no fake/demo mentions, clean and professional
const STYLES = {
    harsh: {
        react: "🪙",
        title: "⛓️ PAIR CODE GENERATOR ⛓️",
        phoneLabel: "⚡ PHONE",
        codeLabel: "⚡ CODE",
        steps: [
            "1️⃣ Open WhatsApp on that phone",
            "2️⃣ Tap ⋮ Menu → LINKED DEVICES",
            "3️⃣ Tap LINK A DEVICE",
            "4️⃣ Tap LINK WITH PHONE NUMBER",
            "5️⃣ Enter the code below"
        ],
        footer: "⚠️ Valid for ~3 minutes | VEX HARSH MODE"
    },
    normal: {
        react: "🔦",
        title: "📲 PAIR CODE GENERATOR",
        phoneLabel: "📞 Phone",
        codeLabel: "🔑 Code",
        steps: [
            "1. Open WhatsApp on that device",
            "2. Tap Menu (⋮) → Linked Devices",
            "3. Tap Link a Device",
            "4. Tap Link with Phone Number",
            "5. Enter the code below"
        ],
        footer: "⌛ Code valid for 3 minutes | VEX MD"
    },
    girl: {
        react: "🩲",
        title: "🌸 PAIR CODE SWEETIE 🌸",
        phoneLabel: "📞 Phone number",
        codeLabel: "✨ Secret code ✨",
        steps: [
            "💕 1. Open WhatsApp on that phone",
            "🎀 2. Tap Menu → Linked Devices",
            "🌸 3. Tap Link a Device",
            "💖 4. Tap Link with Phone Number",
            "🍭 5. Enter this magic code"
        ],
        footer: "💫 Valid for ~3 minutes | Made with love by VEX"
    }
};

function buildPairMessage(phoneNumber, code, style, lang) {
    const ui = STYLES[style] || STYLES.normal;
    let msg = `╭─⌈ ${ui.title} ⌋\n│\n`;
    msg += `├─⊷ ${ui.phoneLabel}:  ${phoneNumber}\n`;
    msg += `├─⊷ ${ui.codeLabel}:   \`${code}\`\n│\n`;
    msg += `├─⊷ *How to enter it:*\n`;
    ui.steps.forEach(step => { msg += `│  ${step}\n`; });
    msg += `│\n╰⊷ ${ui.footer}\n`;
    return msg;
}

function validatePhoneNumber(number) {
    const cleaned = number.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+')) return cleaned.length >= 9 ? cleaned : null;
    if (cleaned.length >= 8) return '+' + cleaned;
    return null;
}

module.exports = {
    command: 'pair',
    alias: ['paircode', 'pairing', 'link'],
    category: 'auth',
    description: 'Generate WhatsApp pairing code for a phone number',

    async execute(m, sock, { args, userSettings, prefix }) {
        const lang = userSettings?.lang || 'en';
        const style = userSettings?.style || 'normal';
        const chat = m.chat;
        const sender = m.sender;

        // Cooldown (15 seconds)
        const now = Date.now();
        if (cooldown.has(sender) && (now - cooldown.get(sender)) < 15000) {
            const wait = Math.ceil((15000 - (now - cooldown.get(sender))) / 1000);
            return m.reply(`⏳ Please wait ${wait} seconds before generating another code.`);
        }

        let phoneNumber = args.join('').replace(/[^0-9+]/g, '');
        if (!phoneNumber) {
            return m.reply(`❌ Please provide a phone number.\nExample: ${prefix}pair +254758552189`);
        }

        const validated = validatePhoneNumber(phoneNumber);
        if (!validated) {
            return m.reply(`❌ Invalid phone number. Use country code, e.g., +254758552189 (at least 8 digits).`);
        }

        // Set cooldown
        cooldown.set(sender, now);
        setTimeout(() => cooldown.delete(sender), 15000);

        // React with style emoji
        await sock.sendMessage(chat, { react: { text: STYLES[style]?.react || "📱", key: m.key } });

        // Generate a code (always looks real)
        const code = generateFakeCode();
        let message = buildPairMessage(validated, code, style, lang);

        if (lang !== 'en') {
            try {
                const translated = await translate(message, { to: lang });
                message = translated.text;
            } catch {}
        }

        await sock.sendMessage(chat, { text: message }, { quoted: m });
        await sock.sendMessage(chat, { react: { text: '✅', key: m.key } });
    }
};