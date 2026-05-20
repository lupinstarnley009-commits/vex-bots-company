const { create, all } = require('mathjs');
const axios = require('axios');

// =========================
// MATHJS CONFIG (BigNumber – safe & precise)
// =========================
const math = create(all, {
    number: 'BigNumber',
    precision: 64
});

// Physics constants – all valid units
math.import({
    c: math.unit('299792458 m/s'),
    g: math.unit('9.80665 m/s^2'),
    G: math.unit('6.67430e-11 N*m^2/kg^2'),
    h: math.unit('6.62607015e-34 J*s'),
    hbar: math.unit('1.054571817e-34 J*s'),
    k: math.unit('1.380649e-23 J/K'),
    Na: math.unit('6.02214076e23 mol^-1'),
    e: math.unit('1.602176634e-19 C'),
    me: math.unit('9.1093837015e-31 kg'),
    mp: math.unit('1.67262192369e-27 kg'),
    mn: math.unit('1.67492749804e-27 kg'),
    R: math.unit('8.314462618 J/mol/K'),
    F: math.unit('96485.33212 C/mol'),
    mu0: math.unit('1.25663706212e-6 N/A^2'),
    epsilon0: math.unit('8.8541878128e-12 F/m'),
    sigma: math.unit('5.670374419e-8 W/m^2/K^4'),
    atm: math.unit('101325 Pa'),
    bar: math.unit('100000 Pa'),
    eV: math.unit('1.602176634e-19 J'),
    au: math.unit('1.495978707e11 m'),
    ly: math.unit('9.4607304725808e15 m'),
    pc: math.unit('3.08567758149137e16 m')
}, { override: true });

// =========================
// ENVIRONMENT (from Render)
// =========================
const ENV = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SAMBANOVA_API_KEY: process.env.SAMBANOVA_API_KEY,
    CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
    CLOUDFLARE_API_KEY: process.env.CLOUDFLARE_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
};

let aiCallCount = {};

// Daily reset of AI call counters (prevents memory leak from growing objects)
setInterval(() => { aiCallCount = {}; }, 86400000);

module.exports = {
    command: "do",
    alias: ["calc", "math", "physics", "solve", "graph", "derive", "integrate"],
    category: "education",
    description: "VEX AI Super Calculator – Math, Physics, ASCII Graphs, Calculus + AI fallback",

    async execute(m, sock, { args, userSettings }) {
        const style = userSettings?.style?.value || userSettings?.style || 'normal';
        const lang = detectLanguage(m, args.join(" "));
        const query = args.join(" ").trim();

        const ui = {
            harsh: {
                react: "☣️",
                prefix: "☣️ 𝙑𝙀𝙓 𝘾𝘼𝙇𝘾:",
                error: "☣️ 𝙋𝙍𝙊𝙑𝙄𝘿𝙀 𝙀𝙌𝙐𝘼𝙏𝙄𝙊𝙉 ☣️\n\n➤ .do 2+2\n➤ .do F=m*g, m=5kg\n➤ .do graph sin(x)\n➤ .do derive x^2\n➤ .do integrate 2x"
            },
            normal: {
                react: "⚛️",
                prefix: "⚛️ VEX CALC:",
                error: "❌ Provide equation\n\n➤ .do 2+2\n➤ .do solve x^2+5x+6=0\n➤ .do graph x^2\n➤ .do derive x^3\n➤ .do integrate sin(x)"
            },
            girl: {
                react: "💖",
                prefix: "💖 𝑽𝑬𝑿 𝑪𝑨𝑳𝑪:",
                error: "💔 𝑾𝒓𝒊𝒕𝒆 𝒆𝒒𝒖𝒂𝒕𝒊𝒐𝒏 𝒃𝒂𝒃𝒆~ 🍭\n\n➤ .do 2+2\n➤ .do E=mc^2"
            }
        };

        const current = ui[style] || ui.normal;

        if (!query) {
            await sock.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
            return m.reply(current.error);
        }

        await sock.sendMessage(m.chat, { react: { text: current.react, key: m.key } });

        try {
            const lower = query.toLowerCase();

            // Route to appropriate handler (no memory heavy branching)
            if (lower.includes('graph') || lower.includes('plot') || lower.includes('chora'))
                await handleASCIIGraph(m, sock, query, current, lang);
            else if (lower.includes('derive') || lower.includes('derivative'))
                await handleDerivative(m, sock, query, current, lang);
            else if (lower.includes('integrate') || lower.includes('integral'))
                await handleIntegral(m, sock, query, current, lang);
            else if (lower.includes('solve') || (lower.includes('=') && lower.includes('x')))
                await handleEquation(m, sock, query, current, lang);
            else if (lower.includes('unit') || lower.includes('convert') || lower.includes(' to '))
                await handleUnitConvert(m, sock, query, current, lang);
            else if (isPhysicsQuery(lower))
                await handlePhysics(m, sock, query, current, lang);
            else if (lower.includes('matrix') || lower.includes('['))
                await handleMatrix(m, sock, query, current, lang);
            else if (lower.includes('statistics') || lower.includes('mean') || lower.includes('std') || lower.includes('median'))
                await handleStatistics(m, sock, query, current, lang);
            // NEW FEATURES (memory-light)
            else if (lower.includes('factor') || lower.includes('prime'))
                await handleFactorization(m, sock, query, current, lang);
            else if (lower.includes('gcd') || lower.includes('lcm'))
                await handleGcdLcm(m, sock, query, current, lang);
            else if (lower.includes('percent') || lower.includes('%'))
                await handlePercent(m, sock, query, current, lang);
            else
                await handleMath(m, sock, query, current, lang);
        } catch (err) {
            console.error("DO ERROR:", err.message);
            await sock.sendMessage(m.chat, {
                text: `${current.prefix} Error: ${String(err.message || err).slice(0, 100)}`
            }, { quoted: m });
        }
    }
};

// =========================
// 1. BASIC MATH
// =========================
async function handleMath(m, sock, query, ui, lang) {
    try {
        const result = math.evaluate(query);
        const resultStr = math.format(result, { precision: 14, notation: 'auto' });

        let response = `${ui.prefix} *MATH*\n\nInput: \`${query}\`\nResult: \`${resultStr}\``;
        if (math.isUnit(result)) response += `\nType: Unit [${result.toString()}]`;
        else if (math.isMatrix(result)) response += `\nType: Matrix ${math.size(result).join('x')}`;
        else if (math.isComplex(result)) response += `\nType: Complex`;

        await sock.sendMessage(m.chat, { text: response }, { quoted: m });
    } catch (mathError) {
        const aiResult = await callAI(`You are VEX AI Calculator. Solve: "${query}". Show steps. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 2. PHYSICS (with units)
// =========================
async function handlePhysics(m, sock, query, ui, lang) {
    try {
        const parts = query.split(',').map(s => s.trim());
        const formula = parts[0];
        const vars = {};
        for (let i = 1; i < parts.length; i++) {
            const [key, val] = parts[i].split('=').map(s => s.trim());
            if (key && val) vars[key] = math.evaluate(val);
        }
        const result = math.evaluate(formula, vars);
        const resultStr = math.format(result, { precision: 6 });

        let response = `${ui.prefix} *PHYSICS*\nFormula: \`${formula}\``;
        if (Object.keys(vars).length) {
            response += `\nGiven:\n` + Object.entries(vars).map(([k,v]) => ` ${k} = ${v}`).join('\n');
        }
        response += `\nResult: \`${resultStr}\``;
        await sock.sendMessage(m.chat, { text: response }, { quoted: m });
    } catch (e) {
        const aiResult = await callAI(`You are VEX AI Physics Expert. Solve: "${query}". Show formulas and units. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI PHYSICS*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 3. EQUATION SOLVER (numerical)
// =========================
async function handleEquation(m, sock, query, ui, lang) {
    try {
        const eqMatch = query.match(/(?:solve\s+)?(.+?)\s*=\s*(.+)/i);
        if (!eqMatch) throw 'Format: solve x^2+5x+6=0';
        const left = eqMatch[1].trim(), right = eqMatch[2].trim();
        const expr = `(${left}) - (${right})`;
        const f = math.parse(expr).compile();
        const solutions = new Set();
        for (let x = -20; x <= 20; x += 0.5) {
            try {
                const y = f.evaluate({ x });
                if (Math.abs(y) < 0.1) {
                    let root = x;
                    for (let i = 0; i < 10; i++) {
                        const fx = f.evaluate({ x: root });
                        const h = 0.0001;
                        const fxh = f.evaluate({ x: root + h });
                        const deriv = (fxh - fx) / h;
                        if (Math.abs(deriv) < 1e-10) break;
                        root = root - fx / deriv;
                    }
                    if (isFinite(root)) solutions.add(parseFloat(root.toFixed(6)));
                }
            } catch {}
        }
        let response = `${ui.prefix} *EQUATION SOLVER*\n${left} = ${right}\n\n`;
        if (solutions.size) {
            const solArr = Array.from(solutions).sort((a,b)=>a-b);
            response += `Solutions: x = ${solArr.join(', ')}\nVerification:\n`;
            for (const x of solArr.slice(0,3)) {
                const check = math.evaluate(left, { x });
                response += ` x=${x}: LHS = ${math.format(check, { precision: 6 })}\n`;
            }
        } else {
            response += `No real solutions in [-20,20]. Try .do graph ${left}-${right}`;
        }
        await sock.sendMessage(m.chat, { text: response }, { quoted: m });
    } catch (e) {
        const aiResult = await callAI(`You are VEX AI. Solve equation: "${query}". Show steps. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 4. ASCII GRAPH (lightweight)
// =========================
async function handleASCIIGraph(m, sock, query, ui, lang) {
    try {
        const funcMatch = query.match(/(?:graph|plot|chora)\s+(.+?)(?:\s+from\s+(-?\d+\.?\d*)\s+to\s+(-?\d+\.?\d*))?$/i);
        if (!funcMatch) throw 'Format: graph sin(x) from -5 to 5';
        const funcStr = funcMatch[1].trim();
        const xMin = funcMatch[2] ? parseFloat(funcMatch[2]) : -10;
        const xMax = funcMatch[3] ? parseFloat(funcMatch[3]) : 10;
        const compiled = math.parse(funcStr).compile();

        const width = 60, height = 20;
        const xStep = (xMax - xMin) / width;
        const points = [];
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i <= width; i++) {
            const x = xMin + i * xStep;
            try {
                const y = compiled.evaluate({ x });
                if (isFinite(y)) {
                    points.push({ x, y });
                    if (y < yMin) yMin = y;
                    if (y > yMax) yMax = y;
                } else points.push({ x, y: null });
            } catch { points.push({ x, y: null }); }
        }
        if (yMin === Infinity) throw 'No valid points';
        const yRange = yMax - yMin || 1;
        yMin -= yRange * 0.1;
        yMax += yRange * 0.1;
        const yStep = (yMax - yMin) / height;

        const grid = Array(height + 1).fill().map(() => Array(width + 1).fill(' '));
        const xZeroCol = Math.round((-xMin) / xStep);
        const yZeroRow = Math.round((yMax) / yStep);
        if (xZeroCol >= 0 && xZeroCol <= width) for (let r = 0; r <= height; r++) grid[r][xZeroCol] = '│';
        if (yZeroRow >= 0 && yZeroRow <= height) for (let c = 0; c <= width; c++) grid[yZeroRow][c] = '─';
        if (xZeroCol>=0 && xZeroCol<=width && yZeroRow>=0 && yZeroRow<=height) grid[yZeroRow][xZeroCol] = '┼';

        for (const p of points) {
            if (p.y === null) continue;
            const col = Math.round((p.x - xMin) / xStep);
            const row = Math.round((yMax - p.y) / yStep);
            if (row>=0 && row<=height && col>=0 && col<=width) grid[row][col] = '*';
        }

        let graphStr = '```\ny = ' + funcStr + `\nx:[${xMin}, ${xMax}] y:[${yMin.toFixed(2)}, ${yMax.toFixed(2)}]\n\n`;
        graphStr += grid.map(row => row.join('')).join('\n') + '\n```';
        let intercepts = '\n*Analysis:*\n';
        const f0 = compiled.evaluate({ x: 0 });
        if (isFinite(f0)) intercepts += `Y-intercept: (0, ${f0.toFixed(3)})\n`;
        const xInts = [];
        for (let i = 0; i < points.length-1; i++) {
            if (points[i].y !== null && points[i+1].y !== null && points[i].y * points[i+1].y < 0)
                xInts.push(points[i].x.toFixed(2));
        }
        if (xInts.length) intercepts += `X-intercepts ≈: ${xInts.slice(0,3).join(', ')}\n`;
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *ASCII GRAPH*\n\n${graphStr}${intercepts}` }, { quoted: m });
    } catch (e) {
        const aiResult = await callAI(`You are VEX AI. User wants ASCII graph: "${query}". Explain function behavior. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI GRAPH*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 5. DERIVATIVE (exact using mathjs)
// =========================
async function handleDerivative(m, sock, query, ui, lang) {
    try {
        const exprMatch = query.match(/deriv(?:ative|e)?\s+(.+?)(?:\s+at\s+x\s*=\s*(-?\d+\.?\d*))?$/i);
        if (!exprMatch) throw 'Format: derive x^2+3x or derive sin(x) at x=0';
        const expr = exprMatch[1].trim();
        const xVal = exprMatch[2] ? parseFloat(exprMatch[2]) : null;
        const deriv = math.derivative(expr, 'x').toString();
        const simplified = math.simplify(deriv).toString();

        let response = `${ui.prefix} *DERIVATIVE*\nf(x) = ${expr}\nf'(x) = ${simplified}`;
        if (xVal !== null) {
            const val = math.evaluate(simplified, { x: xVal });
            response += `\nf'(${xVal}) = ${math.format(val, { precision: 6 })}`;
            response += `\nSlope at x=${xVal} is ${val > 0 ? 'increasing' : val < 0 ? 'decreasing' : 'horizontal'}`;
        }
        await sock.sendMessage(m.chat, { text: response }, { quoted: m });
    } catch (e) {
        const aiResult = await callAI(`You are VEX AI Calculus Expert. Find derivative: "${query}". Show steps. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 6. INTEGRAL (numerical Simpson's rule)
// =========================
async function handleIntegral(m, sock, query, ui, lang) {
    try {
        const exprMatch = query.match(/integrat(?:e|al)?\s+(.+?)(?:\s+from\s+(-?\d+\.?\d*)\s+to\s+(-?\d+\.?\d*))?$/i);
        if (!exprMatch) throw 'Format: integrate 2x or integrate x^2 from 0 to 1';
        const expr = exprMatch[1].trim();
        const a = exprMatch[2] ? parseFloat(exprMatch[2]) : null;
        const b = exprMatch[3] ? parseFloat(exprMatch[3]) : null;

        let response = `${ui.prefix} *INTEGRAL*\n∫ ${expr} dx\n\n`;
        if (a !== null && b !== null) {
            const f = math.parse(expr).compile();
            const n = 1000;
            const h = (b - a) / n;
            let sum = f.evaluate({ x: a }) + f.evaluate({ x: b });
            for (let i = 1; i < n; i++) {
                const x = a + i * h;
                sum += f.evaluate({ x }) * (i % 2 === 0 ? 2 : 4);
            }
            const integral = (h / 3) * sum;
            response += `Definite [${a}, ${b}]: ≈ ${math.format(integral, { precision: 6 })}\nMethod: Simpson's Rule (n=1000)`;
        } else {
            throw 'Symbolic integral requires AI fallback';
        }
        await sock.sendMessage(m.chat, { text: response }, { quoted: m });
    } catch (e) {
        const aiResult = await callAI(`You are VEX AI Calculus Expert. Solve integral: "${query}". Show steps. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 7. UNIT CONVERSION
// =========================
async function handleUnitConvert(m, sock, query, ui, lang) {
    try {
        const match = query.match(/([\d\.e\-\+]+)\s*([a-zA-Z\/\^0-9]+)\s+(?:to|in|as)\s+([a-zA-Z\/\^0-9]+)/i);
        if (!match) throw 'Format: 5kg to g or 10m/s to km/h';
        const val = parseFloat(match[1]);
        const fromUnit = match[2];
        const toUnit = match[3];
        const result = math.evaluate(`${val} ${fromUnit} to ${toUnit}`);
        const resultStr = math.format(result, { precision: 6 });
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *UNIT CONVERT*\n${val} ${fromUnit} = ${resultStr}` }, { quoted: m });
    } catch (e) {
        const aiResult = await callAI(`You are VEX AI. Convert units: "${query}". Show conversion factor. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 8. MATRIX OPERATIONS
// =========================
async function handleMatrix(m, sock, query, ui, lang) {
    try {
        const result = math.evaluate(query);
        const resultStr = math.format(result, { precision: 4 });
        let response = `${ui.prefix} *MATRIX*\nInput: \`${query}\`\nResult:\n\`\`\`\n${resultStr}\n\`\`\``;
        if (math.isMatrix(result)) {
            const size = math.size(result);
            response += `\nSize: ${size.join('x')}`;
            try { response += `\nDeterminant: ${math.format(math.det(result), { precision: 4 })}`; } catch {}
        }
        await sock.sendMessage(m.chat, { text: response }, { quoted: m });
    } catch (e) {
        const aiResult = await callAI(`You are VEX AI Linear Algebra Expert. Solve: "${query}". Explain steps. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 9. STATISTICS
// =========================
async function handleStatistics(m, sock, query, ui, lang) {
    try {
        const dataMatch = query.match(/\[(.*?)\]/);
        if (!dataMatch) throw 'Format: mean [1,2,3,4,5] or std [1,2,3]';
        const data = JSON.parse(`[${dataMatch[1]}]`);
        if (!Array.isArray(data) || data.length === 0) throw 'Invalid data array';
        const cmd = query.toLowerCase();
        let result, op;
        if (cmd.includes('mean')) { result = math.mean(data); op = 'Mean'; }
        else if (cmd.includes('median')) { result = math.median(data); op = 'Median'; }
        else if (cmd.includes('std')) { result = math.std(data); op = 'Standard Deviation'; }
        else if (cmd.includes('var')) { result = math.variance(data); op = 'Variance'; }
        else if (cmd.includes('sum')) { result = math.sum(data); op = 'Sum'; }
        else if (cmd.includes('mode')) { result = math.mode(data); op = 'Mode'; }
        else { result = math.mean(data); op = 'Mean'; }

        let response = `${ui.prefix} *STATISTICS*\nData: [${data.slice(0,10).join(', ')}${data.length>10 ? '...' : ''}]\nCount: ${data.length}\n${op}: ${math.format(result, { precision: 6 })}\nMin: ${math.min(data)}, Max: ${math.max(data)}`;
        await sock.sendMessage(m.chat, { text: response }, { quoted: m });
    } catch (e) {
        const aiResult = await callAI(`You are VEX AI Statistics Expert. Solve: "${query}". Explain concepts. Language: ${lang}`);
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *VEX AI*\n\n${aiResult}` }, { quoted: m });
    }
}

// =========================
// 10. NEW: FACTORIZATION / PRIME
// =========================
async function handleFactorization(m, sock, query, ui, lang) {
    try {
        const numMatch = query.match(/(?:factor|prime)\s+(\d+)/i);
        if (!numMatch) throw 'Format: factor 120 or prime 97';
        const n = parseInt(numMatch[1]);
        if (isNaN(n) || n < 2) throw 'Enter positive integer ≥2';
        const factors = [];
        let temp = n;
        for (let i = 2; i <= Math.sqrt(temp); i++) {
            while (temp % i === 0) { factors.push(i); temp /= i; }
        }
        if (temp > 1) factors.push(temp);
        const isPrime = factors.length === 1;
        let response = `${ui.prefix} *FACTORIZATION*\n${n} = ${factors.join(' × ')}\n`;
        response += isPrime ? `✅ ${n} is a prime number.` : `❌ ${n} is composite.`;
        await sock.sendMessage(m.chat, { text: response }, { quoted: m });
    } catch (e) {
        await sock.sendMessage(m.chat, { text: `${ui.prefix} Error: ${e.message}` }, { quoted: m });
    }
}

// =========================
// 11. NEW: GCD / LCM
// =========================
async function handleGcdLcm(m, sock, query, ui, lang) {
    try {
        const nums = query.match(/\d+/g).map(Number);
        if (!nums || nums.length < 2) throw 'Provide at least two numbers: .do gcd 12 18 24';
        const isGcd = query.toLowerCase().includes('gcd');
        const result = isGcd ? math.gcd(...nums) : math.lcm(...nums);
        const op = isGcd ? 'GCD' : 'LCM';
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *${op}*\nNumbers: ${nums.join(', ')}\n${op}: ${result}` }, { quoted: m });
    } catch (e) {
        await sock.sendMessage(m.chat, { text: `${ui.prefix} Error: ${e.message}` }, { quoted: m });
    }
}

// =========================
// 12. NEW: PERCENTAGE CALCULATIONS
// =========================
async function handlePercent(m, sock, query, ui, lang) {
    try {
        const parts = query.match(/(\d+(?:\.\d+)?)\s*%\s+(?:of|from)\s+(\d+(?:\.\d+)?)/i);
        if (!parts) throw 'Format: 30% of 200 or 15% from 80';
        const percent = parseFloat(parts[1]);
        const total = parseFloat(parts[2]);
        const result = (percent / 100) * total;
        await sock.sendMessage(m.chat, { text: `${ui.prefix} *PERCENTAGE*\n${percent}% of ${total} = ${result}` }, { quoted: m });
    } catch (e) {
        await sock.sendMessage(m.chat, { text: `${ui.prefix} Error: ${e.message}` }, { quoted: m });
    }
}

// =========================
// HELPERS (no memory leaks)
// =========================
function isPhysicsQuery(q) {
    const physicsKeywords = ['force', 'energy', 'velocity', 'acceleration', 'mass', 'weight', 'pressure', 'power',
        'work', 'momentum', 'f=', 'e=', 'v=', 'a=', 'kg', 'm/s', 'newton', 'joule', 'watt', 'pascal', 'coulomb',
        'volt', 'ohm', 'farad', 'henry', 'tesla', 'frequency', 'wavelength', 'density'];
    return physicsKeywords.some(k => q.includes(k));
}

function detectLanguage(m, text = '') {
    const content = text || m.body || m.message?.conversation || '';
    if (/[\u0B80-\u0BFF]/.test(content)) return 'ta';
    if (/[\u0C00-\u0C7F]/.test(content)) return 'te';
    if (/[\u0900-\u097F]/.test(content)) return 'hi';
    if (/[ء-ي]/.test(content)) return 'ar';
    if (/[àáâãäåæçèéêëìíîïñòóôõöùúûüý]/.test(content)) return 'es';
    if (/[äöüß]/.test(content)) return 'de';
    if (/[àâçéèêëîïôûùüÿ]/.test(content)) return 'fr';
    if (/[а-яА-Я]/.test(content)) return 'ru';
    if (/[你我他]/.test(content)) return 'zh';
    if (/[あ-ん]/.test(content)) return 'ja';
    if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(content)) return 'ko';
    if (/\b(ya|na|wa|za|ni|kwa|hii|hiyo|vipi|gani|nini|jibu|hesabu|grafu)\b/i.test(content)) return 'sw';
    return 'en';
}

// =========================
// AI FALLBACK CHAIN (no persistent cache, short timeouts)
// =========================
async function callAI(prompt, maxTokens = 800) {
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
            if ((aiCallCount[model.name] || 0) >= 200) continue;
            const result = await Promise.race([
                model.fn(prompt, maxTokens),
                new Promise((_, rej) => setTimeout(() => rej('Timeout'), 8000))
            ]);
            aiCallCount[model.name] = (aiCallCount[model.name] || 0) + 1;
            if (result && result.length > 10) return result;
        } catch { /* continue */ }
    }
    return "⚠️ VEX AI offline. Try simpler equation or check API keys.";
}

// ----- Individual API calls (each with its own timeout) -----
async function callGroq(prompt, maxTokens) {
    if (!ENV.GROQ_API_KEY) throw 'No key';
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: 'You are VEX AI, expert mathematician.' }, { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.2
    }, { headers: { Authorization: `Bearer ${ENV.GROQ_API_KEY}` }, timeout: 10000 });
    return res.data.choices[0].message.content.trim();
}
async function callCerebras(prompt, maxTokens) {
    if (!ENV.CEREBRAS_API_KEY) throw 'No key';
    const res = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
        model: 'llama3.1-8b', messages: [{ role: 'system', content: 'You are VEX AI.' }, { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.2
    }, { headers: { Authorization: `Bearer ${ENV.CEREBRAS_API_KEY}` }, timeout: 10000 });
    return res.data.choices[0].message.content.trim();
}
async function callSambaNova(prompt, maxTokens) {
    if (!ENV.SAMBANOVA_API_KEY) throw 'No key';
    const res = await axios.post('https://api.sambanova.ai/v1/chat/completions', {
        model: 'Meta-Llama-3.1-8B-Instruct', messages: [{ role: 'system', content: 'You are VEX AI.' }, { role: 'user', content: prompt }],
        max_tokens: maxTokens
    }, { headers: { Authorization: `Bearer ${ENV.SAMBANOVA_API_KEY}` }, timeout: 10000 });
    return res.data.choices[0].message.content.trim();
}
async function callGemini(prompt, maxTokens) {
    if (!ENV.GEMINI_API_KEY) throw 'No key';
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${ENV.GEMINI_API_KEY}`, {
        contents: [{ parts: [{ text: `You are VEX AI. ${prompt}` }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 }
    }, { timeout: 10000 });
    return res.data.candidates[0].content.parts[0].text.trim();
}
async function callOpenRouter(prompt, maxTokens) {
    if (!ENV.OPENROUTER_API_KEY) throw 'No key';
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'meta-llama/llama-3.1-8b-instruct:free', messages: [{ role: 'system', content: 'You are VEX AI.' }, { role: 'user', content: prompt }],
        max_tokens: maxTokens
    }, { headers: { Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}` }, timeout: 10000 });
    return res.data.choices[0].message.content.trim();
}
async function callCloudflare(prompt, maxTokens) {
    if (!ENV.CLOUDFLARE_API_KEY || !ENV.CLOUDFLARE_ACCOUNT_ID) throw 'No key';
    const res = await axios.post(`https://api.cloudflare.com/client/v4/accounts/${ENV.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
        messages: [{ role: 'system', content: 'You are VEX AI.' }, { role: 'user', content: prompt }], max_tokens: maxTokens
    }, { headers: { Authorization: `Bearer ${ENV.CLOUDFLARE_API_KEY}` }, timeout: 10000 });
    return res.data.result.response.trim();
}