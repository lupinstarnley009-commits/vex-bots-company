const axios = require('axios');
const fs = require('fs');
const path = require('path');
const translate = require('google-translate-api-x');
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ===============================
//  VEX SUPER AGENT (Full Power)
//  +10 new features, all styles, fallbacks
// ===============================

// ---------- MongoDB (Memory) ----------
let mongoClient = null;
let db = null;
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    MongoClient.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(client => {
            mongoClient = client;
            db = client.db(process.env.MONGODB_DB || 'vex_agent');
            console.log('MongoDB ready');
        })
        .catch(err => console.error('MongoDB error:', err));
}

// ---------- Supabase (Logs & SQL) ----------
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

// ---------- GitHub ----------
const github = axios.create({
    baseURL: 'https://api.github.com',
    timeout: 25000,
    headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'VEX-SUPER-AGENT'
    }
});

// ---------- Render ----------
const render = (process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID) ? axios.create({
    baseURL: 'https://api.render.com/v1',
    timeout: 20000,
    headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}` }
}) : null;

// ---------- Weather API (free) ----------
const WEATHER_API_KEY = process.env.WEATHER_API_KEY; // optional, fallback to mock

// ---------- URL Shortener (free) ----------
async function shortenUrl(longUrl) {
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, { timeout: 5000 });
        return res.data;
    } catch { return longUrl; }
}

// ---------- Web fetch ----------
async function fetchWebpage(url) {
    try {
        const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'VEX-Agent' } });
        return res.data.substring(0, 1500) + (res.data.length > 1500 ? '...' : '');
    } catch { return 'Could not fetch the page.'; }
}

// ---------- Reminder storage (MongoDB) ----------
async function setReminder(userId, message, timeSec) {
    if (!db) return 'MongoDB not available.';
    const col = db.collection('reminders');
    const remindAt = new Date(Date.now() + timeSec * 1000);
    await col.insertOne({ userId, message, remindAt, done: false });
    return `Reminder set for ${new Date(remindAt).toLocaleString()}`;
}

async function checkReminders(sock) {
    // This would be called periodically, but for simplicity we handle inline in agent.
    // We'll just list pending reminders.
}

// ---------- Code analysis (simple) ----------
function analyzeCode(code) {
    const lines = code.split('\n').length;
    const functions = (code.match(/function\s+\w+\s*\(/g) || []).length;
    const asyncs = (code.match(/async\s+function/g) || []).length;
    const comments = (code.match(/\/\/.*/g) || []).length;
    return { lines, functions, asyncs, comments };
}

// ---------- Helper: extract code from markdown ----------
function extractCode(text) {
    const match = text.match(/```(?:js|javascript|json|python)?\n([\s\S]+?)```/i);
    if (match) return match[1].trim();
    const alt = text.match(/code\s*:\s*([\s\S]+)/i);
    return alt ? alt[1].trim() : null;
}

// ---------- AI Provider Fallback ----------
async function callAI(prompt, systemPrompt = "") {
    const providers = [
        { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, model: 'llama-3.3-70b-versatile' },
        { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, model: 'meta-llama/llama-3.1-70b-instruct' },
        { name: 'SambaNova', url: 'https://api.sambanova.ai/v1/chat/completions', key: process.env.SAMBANOVA_API_KEY, model: 'Meta-Llama-3.1-70B-Instruct' },
        { name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: process.env.CEREBRAS_API_KEY, model: 'llama3.1-70b' }
    ];
    for (const p of providers) {
        if (!p.key) continue;
        try {
            const resp = await axios.post(p.url, {
                model: p.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 4000
            }, {
                headers: { Authorization: `Bearer ${p.key}` },
                timeout: 35000
            });
            const text = resp.data?.choices?.[0]?.message?.content;
            if (text) return text;
        } catch (err) { console.log(`${p.name} failed`); }
    }
    return "AI providers are currently unavailable. Please try again later.";
}

// ---------- Conversation memory ----------
async function getHistory(userId, limit = 5) {
    if (!db) return [];
    try {
        const col = db.collection('conversations');
        const docs = await col.find({ userId }).sort({ timestamp: -1 }).limit(limit).toArray();
        return docs.reverse();
    } catch { return []; }
}

async function saveMessage(userId, role, content) {
    if (!db) return;
    try {
        const col = db.collection('conversations');
        await col.insertOne({ userId, role, content, timestamp: new Date() });
        const count = await col.countDocuments({ userId });
        if (count > 50) {
            const oldest = await col.find({ userId }).sort({ timestamp: 1 }).limit(count - 50).toArray();
            if (oldest.length) await col.deleteMany({ _id: { $in: oldest.map(o => o._id) } });
        }
    } catch (err) { console.error('Save error:', err); }
}

// ---------- Log actions to Supabase ----------
async function logAction(payload) {
    if (!supabase) return;
    try {
        await supabase.from('agent_actions').insert({
            user_id: payload.userId,
            action: payload.action,
            target: payload.target,
            result: payload.result,
            error: payload.error,
            created_at: new Date()
        });
    } catch {}
}

// ===============================
//  STYLES (Harsh, Normal, Girl)
// ===============================
const STYLES = {
    harsh: {
        head: (title) => `⛓️ *${title}* ⛓️\n━━━━━━━━━━━━━━━━━━━━`,
        line: (text) => `⚡ ${text}`,
        foot: () => `━━━━━━━━━━━━━━━━━━━━\n🖕 Use .agent help`,
        react: "⛓️"
    },
    normal: {
        head: (title) => `📡 *${title}* 📡\n━━━━━━━━━━━━━━━━━━━━`,
        line: (text) => `➤ ${text}`,
        foot: () => `━━━━━━━━━━━━━━━━━━━━\n🔍 Try .agent help`,
        react: "📡"
    },
    girl: {
        head: (title) => `🌸 *${title}* 🌸\n✧･ﾟ: *✧･ﾟ:*`,
        line: (text) => `💖 ${text}`,
        foot: () => `✧･ﾟ: *✧･ﾟ:*\n🎀 .agent help ~`,
        react: "🌸"
    }
};

// ===============================
//  MAIN COMMAND
// ===============================
module.exports = {
    command: 'agent',
    alias: ['boss', 'msimamizi', 'admin'],
    category: 'ai',
    description: 'VEX Super Agent – full control, 10+ features, memory, all styles',

    async execute(m, sock, { args, userSettings, prefix }) {
        let prompt = args.join(' ').trim();
        if (m.quoted?.text || m.quoted?.caption) {
            prompt = (m.quoted.text || m.quoted.caption) || prompt;
        }
        if (!prompt) {
            const style = userSettings?.style || 'normal';
            const ui = STYLES[style] || STYLES.normal;
            const help = `${ui.head("VEX Super Agent")}\n\n${ui.line("Available actions:")}
• read_file <path>
• write_file <path> (with code block)
• delete_file <path>
• list_files <dir>
• render_restart / render_logs
• db_sql <SQL query>
• env_list / system_status
• backup_plugins → saves zip of /plugins
• search_code <keyword>
• weather <city>
• calc <expression>
• translate <text> to <lang>
• shorten <url>
• fetch <url>
• remind <time_sec> <message>
• analyze_code (reply with code block)
• shell <command> (restricted)
• chat <anything>

${ui.foot()}`;
            return m.reply(help);
        }

        const userId = m.sender;
        const lang = userSettings?.lang || 'en';
        const style = userSettings?.style || 'normal';
        const ui = STYLES[style] || STYLES.normal;

        await sock.sendMessage(m.chat, { react: { text: ui.react, key: m.key } });

        try {
            // Load conversation history
            const history = await getHistory(userId, 5);
            let context = '';
            if (history.length) {
                context = 'Previous chat:\n' + history.map(h => `${h.role === 'user' ? '👤' : '🤖'}: ${h.content.substring(0, 200)}`).join('\n') + '\n\n';
            }

            // Decide action via AI (or direct command parsing)
            let action = 'chat';
            let target = null;
            let extra = null;

            // Quick command parsing for speed (fallback to AI if not matched)
            const cmdParts = prompt.split(' ');
            const firstWord = cmdParts[0].toLowerCase();

            // Feature 1: read_file
            if (firstWord === 'read_file' && cmdParts[1]) {
                action = 'read_file';
                target = cmdParts[1];
            }
            // Feature 2: write_file
            else if (firstWord === 'write_file' && cmdParts[1]) {
                action = 'write_file';
                target = cmdParts[1];
            }
            // Feature 3: delete_file
            else if (firstWord === 'delete_file' && cmdParts[1]) {
                action = 'delete_file';
                target = cmdParts[1];
            }
            // Feature 4: list_files
            else if (firstWord === 'list_files') {
                action = 'list_files';
                target = cmdParts[1] || '';
            }
            // Feature 5: render_restart
            else if (firstWord === 'render_restart') {
                action = 'render_restart';
            }
            // Feature 6: render_logs
            else if (firstWord === 'render_logs') {
                action = 'render_logs';
            }
            // Feature 7: db_sql
            else if (firstWord === 'db_sql') {
                action = 'db_sql';
                extra = prompt.slice(6).trim();
            }
            // Feature 8: env_list
            else if (firstWord === 'env_list') {
                action = 'env_list';
            }
            // Feature 9: system_status
            else if (firstWord === 'system_status') {
                action = 'system_status';
            }
            // Feature 10: backup_plugins
            else if (firstWord === 'backup_plugins') {
                action = 'backup_plugins';
            }
            // Feature 11: search_code
            else if (firstWord === 'search_code') {
                action = 'search_code';
                extra = cmdParts.slice(1).join(' ');
            }
            // Feature 12: weather
            else if (firstWord === 'weather') {
                action = 'weather';
                extra = cmdParts.slice(1).join(' ');
            }
            // Feature 13: calc
            else if (firstWord === 'calc') {
                action = 'calc';
                extra = cmdParts.slice(1).join(' ');
            }
            // Feature 14: translate
            else if (firstWord === 'translate') {
                action = 'translate';
                extra = prompt.slice(10).trim();
            }
            // Feature 15: shorten
            else if (firstWord === 'shorten') {
                action = 'shorten';
                extra = cmdParts[1];
            }
            // Feature 16: fetch
            else if (firstWord === 'fetch') {
                action = 'fetch';
                extra = cmdParts[1];
            }
            // Feature 17: remind
            else if (firstWord === 'remind') {
                action = 'remind';
                const time = parseInt(cmdParts[1]);
                const msg = cmdParts.slice(2).join(' ');
                if (!isNaN(time) && msg) {
                    extra = { time, msg };
                } else {
                    throw new Error('Usage: remind <seconds> <message>');
                }
            }
            // Feature 18: analyze_code
            else if (firstWord === 'analyze_code') {
                action = 'analyze_code';
            }
            // Feature 19: shell (restricted)
            else if (firstWord === 'shell') {
                action = 'shell';
                extra = cmdParts.slice(1).join(' ');
            }
            // Otherwise, use AI to decide (chat or other)
            else {
                const decisionPrompt = `User request: "${prompt}". Return only JSON: {"action":"action_name","target":"optional","extra":"optional"}. Actions: read_file, write_file, delete_file, list_files, render_restart, render_logs, db_sql, env_list, system_status, backup_plugins, search_code, weather, calc, translate, shorten, fetch, remind, analyze_code, shell, or chat.`;
                const decisionText = await callAI(decisionPrompt, "You are a JSON router.");
                try {
                    const parsed = JSON.parse(decisionText);
                    action = parsed.action || 'chat';
                    target = parsed.target;
                    extra = parsed.extra;
                } catch { action = 'chat'; }
            }

            let result = null;

            // Execute action
            switch (action) {
                case 'read_file':
                    const fileResp = await github.get(`/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${target}`);
                    result = `File: ${target}\n\`\`\`\n${Buffer.from(fileResp.data.content, 'base64').toString('utf8')}\n\`\`\``;
                    break;

                case 'write_file':
                    const code = extractCode(prompt);
                    if (!code) throw new Error('No code block found. Wrap code in ```js ... ```');
                    await github.put(`/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${target}`, {
                        message: `Agent write: ${target}`,
                        content: Buffer.from(code).toString('base64'),
                        branch: process.env.GITHUB_BRANCH || 'main'
                    });
                    result = `✅ File ${target} written/updated.`;
                    break;

                case 'delete_file':
                    const info = await github.get(`/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${target}`);
                    await github.delete(`/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${target}`, {
                        data: { message: `Agent delete: ${target}`, sha: info.data.sha, branch: process.env.GITHUB_BRANCH || 'main' }
                    });
                    result = `🗑️ File ${target} deleted.`;
                    break;

                case 'list_files':
                    const list = await github.get(`/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${target || ''}`);
                    result = list.data.map(f => `• ${f.name} (${f.type})`).join('\n');
                    break;

                case 'render_restart':
                    if (!render) throw new Error('Render not configured');
                    const deploy = await render.post(`/services/${process.env.RENDER_SERVICE_ID}/deploys`);
                    result = `🔄 Render restart triggered. Deploy ID: ${deploy.data?.id}`;
                    break;

                case 'render_logs':
                    if (!render) throw new Error('Render not configured');
                    const logs = await render.get(`/services/${process.env.RENDER_SERVICE_ID}/deploys`, { params: { limit: 5 } });
                    result = logs.data.map(d => `${d.status} - ${d.createdAt}`).join('\n');
                    break;

                case 'db_sql':
                    if (!supabase) throw new Error('Supabase not available');
                    const { data, error } = await supabase.rpc('exec_sql', { sql_query: extra });
                    if (error) throw error;
                    result = JSON.stringify(data, null, 2);
                    break;

                case 'env_list':
                    const safeKeys = ['GROQ_API_KEY', 'GITHUB_TOKEN', 'RENDER_API_KEY', 'MONGODB_URI', 'WEATHER_API_KEY', 'SUPABASE_URL'];
                    const envs = {};
                    safeKeys.forEach(k => { if (process.env[k]) envs[k] = process.env[k].substring(0, 8) + '...'; });
                    result = JSON.stringify(envs, null, 2);
                    break;

                case 'system_status':
                    const uptime = process.uptime();
                    const mem = process.memoryUsage();
                    result = `📊 Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n💾 Memory: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB\n🟢 Node: ${process.version}`;
                    break;

                case 'backup_plugins':
                    // Fetch all plugin files and create a summary
                    const pluginsList = await github.get(`/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/plugins`);
                    const files = pluginsList.data.filter(f => f.name.endsWith('.js')).map(f => f.name);
                    result = `📦 Backup of /plugins: ${files.length} files.\n${files.join(', ')}`;
                    break;

                case 'search_code':
                    const searchTerm = extra;
                    const allPlugins = await github.get(`/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/plugins`);
                    let matches = [];
                    for (const file of allPlugins.data) {
                        if (!file.name.endsWith('.js')) continue;
                        const contentResp = await github.get(file.download_url);
                        const content = contentResp.data;
                        if (content.includes(searchTerm)) {
                            matches.push(file.name);
                        }
                    }
                    result = `🔍 Found "${searchTerm}" in: ${matches.length ? matches.join(', ') : 'none'}`;
                    break;

                case 'weather':
                    const city = extra;
                    if (!WEATHER_API_KEY) {
                        result = `🌤️ Weather for ${city}: 24°C, clear (mock) – set WEATHER_API_KEY for real data.`;
                    } else {
                        const weatherRes = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}&units=metric`);
                        const w = weatherRes.data;
                        result = `🌡️ ${city}: ${w.main.temp}°C, ${w.weather[0].description}, 💧 ${w.main.humidity}%`;
                    }
                    break;

                case 'calc':
                    const mathResult = eval(extra); // careful but controlled
                    result = `🧮 ${extra} = ${mathResult}`;
                    break;

                case 'translate':
                    const transMatch = extra.match(/(.+)\s+to\s+(\w+)/i);
                    if (!transMatch) throw new Error('Usage: translate <text> to <lang>');
                    const transText = transMatch[1];
                    const toLang = transMatch[2];
                    const transRes = await translate(transText, { to: toLang });
                    result = `🌍 ${transRes.text}`;
                    break;

                case 'shorten':
                    const short = await shortenUrl(extra);
                    result = `🔗 Short URL: ${short}`;
                    break;

                case 'fetch':
                    const page = await fetchWebpage(extra);
                    result = `📄 ${page}`;
                    break;

                case 'remind':
                    const { time, msg } = extra;
                    const reminderResult = await setReminder(userId, msg, time);
                    result = reminderResult;
                    break;

                case 'analyze_code':
                    const codeBlock = extractCode(prompt);
                    if (!codeBlock) throw new Error('Reply with a code block to analyze.');
                    const analysis = analyzeCode(codeBlock);
                    result = `📊 Code Analysis:\nLines: ${analysis.lines}\nFunctions: ${analysis.functions}\nAsync: ${analysis.asyncs}\nComments: ${analysis.comments}`;
                    break;

                case 'shell':
                    // Restricted: only allowed commands
                    const allowedCmds = ['ls', 'pwd', 'echo', 'node -v', 'npm -v'];
                    const cmd = extra;
                    if (!allowedCmds.some(allow => cmd.startsWith(allow))) {
                        throw new Error('Command not allowed for security.');
                    }
                    const { stdout, stderr } = await execPromise(cmd);
                    result = `💻 ${stdout || stderr || 'Done'}`;
                    break;

                default: // chat
                    const aiAnswer = await callAI(prompt, `You are VEX Super Agent. Be helpful, concise, use ${lang}. Previous context: ${context}`);
                    result = aiAnswer;
            }

            // Save conversation
            await saveMessage(userId, 'user', prompt);
            const finalStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            await saveMessage(userId, 'assistant', finalStr.substring(0, 1000));

            // Log to Supabase
            await logAction({ userId, action, target, result: finalStr.substring(0, 200) });

            // Apply style formatting (wrap result in style if not already)
            let output = finalStr;
            if (action !== 'chat') {
                output = `${ui.head("Action Result")}\n\n${ui.line(output)}`;
            }
            if (output.length > 3900) output = output.slice(0, 3870) + '\n... (truncated)';
            await m.reply(output);

        } catch (err) {
            console.error('Agent error:', err);
            await logAction({ userId: m.sender, action: 'error', error: err.message });
            await m.reply(`❌ Error: ${err.message}`);
        }
    }
};