const axios = require("axios");
const translate = require("google-translate-api-x");

const ENV = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SAMBANOVA_API_KEY: process.env.SAMBANOVA_API_KEY,
    CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
    CLOUDFLARE_API_KEY: process.env.CLOUDFLARE_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    BOT_NAME: process.env.BOT_NAME || 'VEX AI'
};

// =========================
// SAFE AXIOS INSTANCE
// =========================
const api = axios.create({
    timeout: 15000,
    headers: {
        "User-Agent": "VEX-AI-ANIME-SEARCH"
    }
});

// =========================
// LOCAL CACHE
// =========================
const responseCache = new Map();

// =========================
// LOCAL DATABASE - INSTANT
// =========================
const LOCAL_ANIME = [
    { title: "Naruto", year: 2002, eps: 220, genre: ["Action", "Adventure", "Ninja"], rating: 8.3, synopsis: "Young ninja seeks recognition and dreams of becoming Hokage.", studio: "Pierrot" },
    { title: "One Piece", year: 1999, eps: 1000, genre: ["Action", "Adventure", "Pirate"], rating: 9.0, synopsis: "Pirate crew searches for legendary treasure One Piece.", studio: "Toei" },
    { title: "Attack on Titan", year: 2013, eps: 87, genre: ["Action", "Dark Fantasy", "Military"], rating: 9.1, synopsis: "Humanity fights against man-eating Titans behind walls.", studio: "Wit Studio" },
    { title: "Demon Slayer", year: 2019, eps: 44, genre: ["Action", "Supernatural", "Historical"], rating: 8.7, synopsis: "Boy becomes demon slayer to save sister turned demon.", studio: "Ufotable" },
    { title: "Jujutsu Kaisen", year: 2020, eps: 47, genre: ["Action", "Supernatural", "School"], rating: 8.6, synopsis: "Student joins sorcerers to fight curses.", studio: "MAPPA" },
    { title: "Death Note", year: 2006, eps: 37, genre: ["Psychological", "Thriller", "Supernatural"], rating: 9.0, synopsis: "Student finds notebook that kills anyone whose name is written.", studio: "Madhouse" },
    { title: "Dragon Ball Z", year: 1989, eps: 291, genre: ["Action", "Martial Arts", "Sci-Fi"], rating: 8.8, synopsis: "Saiyan warrior protects Earth from powerful enemies.", studio: "Toei" },
    { title: "My Hero Academia", year: 2016, eps: 138, genre: ["Action", "Superhero", "School"], rating: 8.4, synopsis: "Boy born without powers in superhero world.", studio: "Bones" },
    { title: "Spy x Family", year: 2022, eps: 37, genre: ["Action", "Comedy", "Family"], rating: 8.5, synopsis: "Spy creates fake family for mission.", studio: "Wit Studio" },
    { title: "Chainsaw Man", year: 2022, eps: 12, genre: ["Action", "Dark Fantasy", "Gore"], rating: 8.7, synopsis: "Devil hunter merges with chainsaw devil.", studio: "MAPPA" }
];

// =========================
// API FALLBACKS
// =========================
const ANIME_APIS = [
    {
        name: 'JIKAN',
        handler: async (query) => {
            const { data } = await api.get(
                `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`
            );
            const a = data?.data?.[0];
            if (!a) throw new Error('NOT_FOUND');
            return {
                title: a.title,
                year: a.year || a.aired?.from?.split("-")[0],
                eps: a.episodes,
                genre: a.genres?.map(g => g.name) || [],
                rating: a.score,
                synopsis: a.synopsis?.slice(0, 500),
                studio: a.studios?.[0]?.name || "Unknown",
                image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url,
                sourceUrl: a.url
            };
        }
    },
    {
        name: 'ANILIST',
        handler: async (query) => {
            const res = await api.post(
                'https://graphql.anilist.co',
                {
                    query: `
                    query ($search: String) {
                      Media(search: $search, type: ANIME) {
                        title { romaji english }
                        startDate { year }
                        episodes
                        genres
                        averageScore
                        description
                        status
                        studios {
                          nodes { name }
                        }
                        coverImage {
                          large
                        }
                      }
                    }`,
                    variables: { search: query }
                }
            );
            const a = res.data?.data?.Media;
            if (!a) throw new Error("NOT_FOUND");
            return {
                title: a.title.english || a.title.romaji,
                year: a.startDate?.year,
                eps: a.episodes,
                genre: a.genres || [],
                rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : "N/A",
                synopsis: a.description?.replace(/<[^>]*>/g, '').slice(0, 500),
                studio: a.studios?.nodes?.[0]?.name || "Unknown",
                image: a.coverImage?.large,
                status: a.status
            };
        }
    },
    {
        name: 'KITSU',
        handler: async (query) => {
            const { data } = await api.get(
                `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=1`
            );
            const a = data?.data?.[0]?.attributes;
            if (!a) throw new Error("NOT_FOUND");
            return {
                title: a.canonicalTitle,
                year: a.startDate?.split("-")[0],
                eps: a.episodeCount,
                genre: [],
                rating: a.averageRating ? (a.averageRating / 10).toFixed(1) : "N/A",
                synopsis: a.synopsis?.slice(0, 500),
                studio: "Kitsu",
                image: a.posterImage?.large,
                status: a.status
            };
        }
    },
    {
        name: 'CONSUMET',
        handler: async (query) => {
            const { data } = await api.get(
                `https://api.consumet.org/anime/gogoanime/${encodeURIComponent(query)}`
            );
            const a = data?.results?.[0];
            if (!a) throw new Error("NOT_FOUND");
            return {
                title: a.title,
                year: "Unknown",
                eps: a.totalEpisodes || "Unknown",
                genre: a.genres || [],
                rating: "N/A",
                synopsis: a.releaseDate || "No synopsis",
                studio: "Unknown",
                image: a.image
            };
        }
    }
];

// =========================
// AI LIMITER
// =========================
let aiCallCount = {};

// =========================
// MODULE EXPORT
// =========================
module.exports = {
    command: "animesearch",
    alias: ["anisearch", "aninfo", "as", "findanime", "animefind", "animeinfo"],
    category: "anime",
    description: "VEX AI AnimeSearch - GOD MODE SEARCH ENGINE",

    async execute(m, sock, { args, userSettings, prefix }) {
        try {
            const chatId = m.chat;
            const userId = m.sender;
            const usedPrefix = prefix || '.';
            const style = userSettings?.style || 'normal';
            const targetLang = userSettings?.lang || 'en';

            const query = args.join(" ").trim();

            if (!query) {
                return await sock.sendMessage(chatId, {
                    text: `🔍 *VEX ANIME SEARCH*\n\n➤ ${usedPrefix}animesearch Naruto\n➤ ${usedPrefix}as One Piece\n➤ ${usedPrefix}as Bleach ai\n➤ ${usedPrefix}as genre:action\n➤ ${usedPrefix}as year:2020\n➤ ${usedPrefix}as random\n➤ ${usedPrefix}as top\n\n🔥 Features:\n• Local Database\n• Multi API Fallback\n• AI Fallback\n• Smart Cache\n• Genre Filter\n• Year Filter\n• Random Search\n• Top Anime\n• Auto Translation\n• Smart Recovery\n\n⚡ Powered by ${ENV.BOT_NAME}`
                }, { quoted: m });
            }

            const modes = {
                harsh: { title: "☣️ 𝕍𝔼𝕏 ℍ𝔸ℝ𝕊ℍ 𝕊𝔼𝔸ℝℂℍ ☣️", line: "━", react: "💀" },
                normal: { title: "⚡ VEX ANIME SEARCH ⚡", line: "─", react: "🔍" },
                girl: { title: "🫧 𝐕𝐄𝐗 𝐊𝐀𝐖𝐀𝐈 𝐒𝐄𝐀𝐑𝐂𝐇 🫧", line: "┄", react: "🎀" }
            };

            const current = modes[style] || modes.normal;

            await sock.sendMessage(chatId, { react: { text: current.react, key: m.key } });

            const wantAI = query.toLowerCase().includes("ai");
            const wantTop = query.toLowerCase().includes("top");
            const wantRandom = query.toLowerCase().includes("random");
            const genreFilter = query.match(/genre:(\w+)/i)?.[1];
            const yearFilter = query.match(/year:(\d{4})/i)?.[1];
            const searchTerm = query.replace(/ai|top|random|genre:\w+|year:\d{4}/gi, '').trim();

            if (responseCache.has(query)) {
                const cached = responseCache.get(query);
                return await sock.sendMessage(chatId, cached, { quoted: m });
            }

            let animeData = null;
            let source = '';
            let layer = 0;

            if (wantRandom) {
                animeData = LOCAL_ANIME[Math.floor(Math.random() * LOCAL_ANIME.length)];
                source = "LOCAL_RANDOM";
                layer = 1;
            }

            if (wantTop && !animeData) {
                animeData = [...LOCAL_ANIME].sort((a, b) => b.rating - a.rating)[0];
                source = "LOCAL_TOP";
                layer = 1;
            }

            if (!animeData && !wantAI) {
                let filtered = LOCAL_ANIME;
                if (searchTerm) filtered = filtered.filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase()));
                if (genreFilter) filtered = filtered.filter(a => a.genre.some(g => g.toLowerCase().includes(genreFilter.toLowerCase())));
                if (yearFilter) filtered = filtered.filter(a => String(a.year) === String(yearFilter));
                if (filtered.length > 0) {
                    animeData = filtered[0];
                    source = 'LOCAL_DB';
                    layer = 1;
                }
            }

            if (!animeData) {
                for (let i = 0; i < ANIME_APIS.length; i++) {
                    try {
                        const result = await ANIME_APIS[i].handler(searchTerm || query);
                        if (result?.title) {
                            animeData = result;
                            source = ANIME_APIS[i].name;
                            layer = i + 2;
                            break;
                        }
                    } catch (err) { continue; }
                }
            }

            if (!animeData) {
                try {
                    const aiPrompt = `Provide anime info for "${searchTerm || query}"\n\nReturn STRICT JSON ONLY:\n{\n"title":"name",\n"year":2000,\n"eps":24,\n"genre":["Action"],\n"rating":8.5,\n"synopsis":"plot",\n"studio":"studio"\n}`;
                    const aiResult = await callAI(aiPrompt, 400);
                    const clean = aiResult.replace(/```json/gi, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(clean);
                    if (parsed?.title) {
                        animeData = parsed;
                        source = "VEX_AI_RENDER";
                        layer = 7;
                    }
                } catch (err) {}
            }

            if (!animeData) {
                animeData = LOCAL_ANIME[0];
                source = "EMERGENCY_CACHE";
                layer = 13;
            }

            // Ensure genre is an array
            if (!animeData.genre) animeData.genre = [];
            if (!Array.isArray(animeData.genre)) animeData.genre = [animeData.genre];

            const renderCaption = () => {
                return `*${current.title}*\n${current.line.repeat(20)}\n\n📺 *Title:* ${animeData.title || "Unknown"}\n📅 *Year:* ${animeData.year || "Unknown"}\n📊 *Episodes:* ${animeData.eps || "Unknown"}\n⭐ *Rating:* ${animeData.rating || "N/A"}/10\n🎭 *Genre:* ${animeData.genre.join(", ") || "Unknown"}\n🎬 *Studio:* ${animeData.studio || "Unknown"}\n\n📝 *Synopsis:*\n${animeData.synopsis || "No description"}\n\n🌐 *Source:* ${source}\n⚙️ *Layer:* ${layer}/13\n\n${current.line.repeat(20)}\n\n⚡ Powered By ${ENV.BOT_NAME}\n_Use '${usedPrefix}as ${animeData.title} ai'_`;
            };

            let finalText = renderCaption();
            try {
                if (targetLang !== 'en') {
                    const translated = await translate(finalText, { to: targetLang });
                    finalText = translated.text;
                }
            } catch (err) {}

            let finalPayload;
            if (animeData.image && typeof animeData.image === 'string' && animeData.image.startsWith('http')) {
                finalPayload = { image: { url: animeData.image }, caption: finalText, mentions: [userId] };
            } else {
                finalPayload = { text: finalText, mentions: [userId] };
            }

            await sock.sendMessage(chatId, finalPayload, { quoted: m });
            responseCache.set(query, finalPayload);
            await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error("AnimeSearch Error:", error);
            try {
                await sock.sendMessage(m.chat, { text: `⚠️ *VEX SEARCH EMERGENCY*\n\n☣️ System recovered from fatal crash.\n\nTry:\n.as Naruto\n.as One Piece\n.as random\n\n⚡ Engine stabilized successfully.` }, { quoted: m });
            } catch {}
        }
    }
};

// =========================
// AI FALLBACK FUNCTIONS (KEEP ALL PROVIDERS)
// =========================
async function callAI(prompt, maxTokens = 400) {
    const models = [
        { name: 'GROQ', fn: callGroq },
        { name: 'GEMINI', fn: callGemini },
        { name: 'OPENROUTER', fn: callOpenRouter },
        { name: 'CEREBRAS', fn: callCerebras },
        { name: 'SAMBANOVA', fn: callSambaNova },
        { name: 'CLOUDFLARE', fn: callCloudflare }
    ];

    for (const model of models) {
        try {
            if (aiCallCount[model.name] >= 500) continue;
            const result = await Promise.race([
                model.fn(prompt, maxTokens),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000))
            ]);
            aiCallCount[model.name] = (aiCallCount[model.name] || 0) + 1;
            if (result && result.length > 20) return result;
        } catch (err) { continue; }
    }
    throw new Error("AI_GENERATION_FAILED");
}

async function callGroq(prompt, maxTokens) {
    if (!ENV.GROQ_API_KEY) throw new Error("NO_KEY");
    const res = await api.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7
    }, { headers: { Authorization: `Bearer ${ENV.GROQ_API_KEY}` } });
    return res.data.choices[0].message.content.trim();
}

async function callGemini(prompt, maxTokens) {
    if (!ENV.GEMINI_API_KEY) throw new Error("NO_KEY");
    const res = await api.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${ENV.GEMINI_API_KEY}`, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
    });
    return res.data.candidates[0].content.parts[0].text.trim();
}

async function callOpenRouter(prompt, maxTokens) {
    if (!ENV.OPENROUTER_API_KEY) throw new Error("NO_KEY");
    const res = await api.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens
    }, { headers: { Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}` } });
    return res.data.choices[0].message.content.trim();
}

async function callCerebras(prompt, maxTokens) {
    if (!ENV.CEREBRAS_API_KEY) throw new Error("NO_KEY");
    const res = await api.post('https://api.cerebras.ai/v1/chat/completions', {
        model: 'llama3.1-8b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7
    }, { headers: { Authorization: `Bearer ${ENV.CEREBRAS_API_KEY}` } });
    return res.data.choices[0].message.content.trim();
}

async function callSambaNova(prompt, maxTokens) {
    if (!ENV.SAMBANOVA_API_KEY) throw new Error("NO_KEY");
    const res = await api.post('https://api.sambanova.ai/v1/chat/completions', {
        model: 'Meta-Llama-3.1-8B-Instruct',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens
    }, { headers: { Authorization: `Bearer ${ENV.SAMBANOVA_API_KEY}` } });
    return res.data.choices[0].message.content.trim();
}

async function callCloudflare(prompt, maxTokens) {
    if (!ENV.CLOUDFLARE_API_KEY || !ENV.CLOUDFLARE_ACCOUNT_ID) throw new Error("NO_KEY");
    const res = await api.post(`https://api.cloudflare.com/client/v4/accounts/${ENV.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens
    }, { headers: { Authorization: `Bearer ${ENV.CLOUDFLARE_API_KEY}` } });
    return res.data.result.response.trim();
}

setInterval(() => { aiCallCount = {}; }, 86400000);