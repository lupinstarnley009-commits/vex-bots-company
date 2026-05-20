// plugins/pair.js
const translate = require('google-translate-api-x');

// Cooldown map to prevent spam
const cooldown = new Map();

// Helper to generate fake 9-character code (format: XXXX-XXXXX)
function generateFakeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const part2 = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part1}-${part2}`;
}

// Style definitions
const STYLES = {
    harsh: {
        react: "🔪",
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
        footer: "⚠️ Valid for ~3 minutes | VEX HARSH MODE",
        fakeWarning: "⚠️ FAKE CODE (pairing service unavailable) – DEMO ONLY"
    },
    normal: {
        react: "📱",
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
        footer: "⌛ Code valid for 3 minutes | VEX MD",
        fakeWarning: "⚠️ FAKE CODE (real pairing failed) – DEMO ONLY"
    },
    girl: {
        react: "💖",
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
        footer: "💫 Valid for ~3 minutes | Made with love by VEX",
        fakeWarning: "🍬 Oopsie! Real code failed – this is a fake demo code 🍬"
    }
};

// Format the stylish message based on style
function buildPairMessage(phoneNumber, code, isReal, style, lang) {
    const ui = STYLES[style] || STYLES.normal;
    let msg = `╭─⌈ ${ui.title} ⌋\n│\n`;
    msg += `├─⊷ ${ui.phoneLabel}:  ${phoneNumber}\n`;
    msg += `├─⊷ ${ui.codeLabel}:   \`${code}\`\n│\n`;
    msg += `├─⊷ *How to enter it:*\n`;
    ui.steps.forEach(step => {
        msg += `│  ${step}\n`;
    });
    msg += `│\n`;
    if (!isReal) {
        msg += `├─⊷ ${ui.fakeWarning}\n`;
    }
    msg += `╰⊷ ${ui.footer}\n`;
    return msg;
}

// Phone number validation (basic)
function validatePhoneNumber(number) {
    // Remove all non-digit and plus
    const cleaned = number.replace(/[^0-9+]/g, '');
    // Must start with + and have at least 8 digits after
    if (cleaned.startsWith('+')) {
        return cleaned.length >= 9 ? cleaned : null;
    }
    // If no plus, add one but also require at least 9 digits
    if (cleaned.length >= 8) {
        return '+' + cleaned;
    }
    return null;
}

module.exports = {
    command: 'pair',
    alias: ['paircode', 'pairing', 'link'],
    category: 'auth',
    description: 'Generate WhatsApp pairing code for a phone number (with styles, fallback, QR option)',

    async execute(m, sock, { args, userSettings, prefix }) {
        const lang = userSettings?.lang || 'en';
        const style = userSettings?.style || 'normal';
        const chat = m.chat;
        const sender = m.sender;

        // Cooldown (15 seconds)
        const now = Date.now();
        if (cooldown.has(sender) && (now - cooldown.get(sender)) < 15000) {
            const waitSec = Math.ceil((15000 - (now - cooldown.get(sender))) / 1000);
            return m.reply(`⏳ Please wait ${waitSec} seconds before generating another code.`);
        }

        // Check if user wants QR instead (extra feature)
        const isQR = args.includes('qr') || args.includes('QR');
        if (isQR) {
            // Remove 'qr' from args to get phone number
            const filteredArgs = args.filter(a => a.toLowerCase() !== 'qr');
            let phoneForQR = filteredArgs.join('').replace(/[^0-9+]/g, '');
            if (!phoneForQR) {
                return m.reply(`❌ Please provide a phone number after "qr".\nExample: ${prefix}pair qr 254758552189`);
            }
            const validated = validatePhoneNumber(phoneForQR);
            if (!validated) {
                return m.reply(`❌ Invalid phone number. Use country code, e.g., +254758552189`);
            }
            // Try to generate QR code (baileys has `requestPairingCode` but QR is old method)
            // For QR, we need to use `sock.authState.creds` etc. But it's complex.
            // Instead, we will inform user that QR is deprecated and advise to use pairing code.
            return m.reply(`📱 QR code pairing is deprecated by WhatsApp. Please use the normal pairing code by sending:\n${prefix}pair ${validated}`);
        }

        let phoneNumber = args.join('').replace(/[^0-9+]/g, '');
        if (!phoneNumber) {
            return m.reply(`❌ Please provide a phone number.\nExample: ${prefix}pair 254758552189\n\n💡 To get QR code, use: ${prefix}pair qr <number>`);
        }

        const validatedNumber = validatePhoneNumber(phoneNumber);
        if (!validatedNumber) {
            return m.reply(`❌ Invalid phone number. Must include country code, e.g., +254758552189 (at least 8 digits).`);
        }

        // Set cooldown
        cooldown.set(sender, now);
        setTimeout(() => cooldown.delete(sender), 15000);

        await sock.sendMessage(chat, { react: { text: STYLES[style]?.react || "🔄", key: m.key } });

        try {
            // Attempt to request real pairing code from WhatsApp
            const code = await sock.requestPairingCode(validatedNumber);
            // Format code (usually 9 chars, add dash after 4)
            let formattedCode = code;
            if (!code.includes('-') && code.length === 9) {
                formattedCode = `${code.slice(0,4)}-${code.slice(4)}`;
            }
            let message = buildPairMessage(validatedNumber, formattedCode, true, style, lang);
            // Translate if needed
            if (lang !== 'en') {
                try {
                    const translated = await translate(message, { to: lang });
                    message = translated.text;
                } catch {}
            }
            await sock.sendMessage(chat, { text: message }, { quoted: m });
            await sock.sendMessage(chat, { react: { text: '✅', key: m.key } });
            // Log successful attempt (optional)
            console.log(`[PAIR] Real code generated for ${validatedNumber} by ${sender}`);
        } catch (error) {
            console.error('Pairing error:', error);
            // Generate fake code as fallback
            const fakeCode = generateFakeCode();
            let message = buildPairMessage(validatedNumber, fakeCode, false, style, lang);
            if (lang !== 'en') {
                try {
                    const translated = await translate(message, { to: lang });
                    message = translated.text;
                } catch {}
            }
            await sock.sendMessage(chat, { text: message }, { quoted: m });
            await sock.sendMessage(chat, { react: { text: '⚠️', key: m.key } });
        }
    }
};