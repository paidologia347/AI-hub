// ===== Token Counter + Cost Estimation + Export/Import =====
// Tracks per-message token counts (estimated via char/4 heuristic unless the
// backend returns usage data), maps them to approximate USD costs using each
// model's published pricing, and exposes session totals + export/import of
// all localStorage data.

(function () {
    'use strict';

    const STORE_KEY = 'aihub.cost.v1';

    // Approximate pricing per 1M tokens (USD).  Input/output split where known.
    // Source: Alibaba Cloud Model Studio pricing page (May 2025).
    const PRICING = {
        // DashScope text
        'qwen-plus':        { input: 0.80, output: 2.00 },
        'qwen-max':         { input: 2.00, output: 6.00 },
        'qwen-turbo':       { input: 0.30, output: 0.60 },
        'qwen3-235b-a22b':  { input: 2.00, output: 6.00 },
        'qwen3-32b':        { input: 0.56, output: 2.24 },
        'qwen3-14b':        { input: 0.28, output: 1.12 },
        'qwq-plus':         { input: 2.00, output: 6.00 },
        'qwen3-coder-plus': { input: 2.00, output: 6.00 },
        // DashScope vision / multimodal
        'qwen3.6-plus':     { input: 0.80, output: 2.00 },
        'qwen3-omni-flash': { input: 0.60, output: 1.80 },
        // DashScope image
        'wan2.7-image-pro':   { input: 0, output: 0, perImage: 0.016 },
        'qwen-image-max':     { input: 0, output: 0, perImage: 0.02 },
        // DashScope video
        'wan2.7-t2v':         { input: 0, output: 0, perSecond: 0.04 },
        'wan2.7-i2v':         { input: 0, output: 0, perSecond: 0.04 },
        // DashScope TTS
        'qwen3-tts-flash':   { input: 0, output: 0, perChar: 0.00001 },
        // NVIDIA
        'deepseek-ai/deepseek-r1': { input: 0.55, output: 2.19 },
        'deepseek-ai/deepseek-v3.2': { input: 0.30, output: 0.88 },
        // OpenAI
        'gpt-4o':            { input: 2.50, output: 10.00 },
        'gpt-4o-mini':       { input: 0.15, output: 0.60 },
        'gpt-4.1':           { input: 2.00, output: 8.00 },
        'gpt-4.1-mini':      { input: 0.40, output: 1.60 },
        'gpt-4.1-nano':      { input: 0.10, output: 0.40 },
        'o4-mini':           { input: 1.10, output: 4.40 },
        // Anthropic
        'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
        'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
        // Google
        'gemini-2.5-flash':  { input: 0.15, output: 0.60 },
        'gemini-2.5-pro':    { input: 1.25, output: 10.00 },
        // Groq
        'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
        'llama-3.1-8b-instant':    { input: 0.05, output: 0.08 },
        // DeepSeek
        'deepseek-chat':     { input: 0.27, output: 1.10 },
        'deepseek-reasoner': { input: 0.55, output: 2.19 },
    };

    // Fallback for unknown models
    const DEFAULT_PRICING = { input: 1.00, output: 3.00 };

    // ----- Storage -----------------------------------------------------------

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (d && typeof d.totalInputTokens === 'number') return d;
            }
        } catch {}
        return { totalInputTokens: 0, totalOutputTokens: 0, totalCostUSD: 0, messages: [] };
    }

    function saveStore(store) {
        try {
            // Keep only last 500 message entries to avoid bloating localStorage
            if (store.messages.length > 500) {
                store.messages = store.messages.slice(-500);
            }
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
        } catch {}
    }

    let STORE = loadStore();

    // ----- Token estimation --------------------------------------------------

    function estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }

    function getPricing(model) {
        return PRICING[model] || DEFAULT_PRICING;
    }

    function calcCost(model, inputTokens, outputTokens) {
        const p = getPricing(model);
        return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
    }

    // ----- Public API --------------------------------------------------------

    function recordMessage(model, inputText, outputText, actualUsage) {
        const inputTokens = (actualUsage && actualUsage.prompt_tokens)
            ? actualUsage.prompt_tokens
            : estimateTokens(inputText);
        const outputTokens = (actualUsage && actualUsage.completion_tokens)
            ? actualUsage.completion_tokens
            : estimateTokens(outputText);
        const cost = calcCost(model, inputTokens, outputTokens);

        const entry = {
            ts: Date.now(),
            model,
            inputTokens,
            outputTokens,
            cost,
        };

        STORE.totalInputTokens += inputTokens;
        STORE.totalOutputTokens += outputTokens;
        STORE.totalCostUSD += cost;
        STORE.messages.push(entry);
        saveStore(STORE);

        updateUI();
        return entry;
    }

    function sessionStats() {
        return {
            totalInput: STORE.totalInputTokens,
            totalOutput: STORE.totalOutputTokens,
            totalTokens: STORE.totalInputTokens + STORE.totalOutputTokens,
            totalCost: STORE.totalCostUSD,
            messageCount: STORE.messages.length,
        };
    }

    function resetSession() {
        STORE = { totalInputTokens: 0, totalOutputTokens: 0, totalCostUSD: 0, messages: [] };
        saveStore(STORE);
        updateUI();
    }

    // ----- Export / Import all data ------------------------------------------

    function exportAllData() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('aihub.')) {
                try { data[key] = JSON.parse(localStorage.getItem(key)); }
                catch { data[key] = localStorage.getItem(key); }
            }
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aihub-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (window.showToast) window.showToast('Data exported');
    }

    function importAllData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                let count = 0;
                for (const [key, val] of Object.entries(data)) {
                    if (key.startsWith('aihub.')) {
                        localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
                        count++;
                    }
                }
                STORE = loadStore();
                updateUI();
                if (window.showToast) window.showToast(`Imported ${count} items`);
                // Reload to apply all restored state
                setTimeout(() => location.reload(), 500);
            } catch (err) {
                alert('Import failed: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ----- UI update ---------------------------------------------------------

    function formatCost(usd) {
        if (usd < 0.001) return '$0.00';
        if (usd < 0.01) return `$${usd.toFixed(4)}`;
        return `$${usd.toFixed(3)}`;
    }

    function formatTokens(n) {
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return String(n);
    }

    function updateUI() {
        const stats = sessionStats();
        const tokenEl = document.getElementById('cost-total-tokens');
        const costEl = document.getElementById('cost-total-usd');
        const msgCountEl = document.getElementById('cost-msg-count');
        if (tokenEl) tokenEl.textContent = formatTokens(stats.totalTokens);
        if (costEl) costEl.textContent = formatCost(stats.totalCost);
        if (msgCountEl) msgCountEl.textContent = stats.messageCount;

        // Update the stat bar on the chat page too
        const statTokens = document.getElementById('stat-tokens');
        if (statTokens && stats.totalTokens > 0) {
            statTokens.title = `Session: ${formatTokens(stats.totalTokens)} tokens, ${formatCost(stats.totalCost)}`;
        }
    }

    // Initial UI update
    document.addEventListener('DOMContentLoaded', updateUI);

    // ----- Expose API --------------------------------------------------------

    window.AIHubCost = {
        recordMessage,
        sessionStats,
        resetSession,
        exportAllData,
        importAllData,
        estimateTokens,
        getPricing,
        formatCost,
        formatTokens,
        PRICING,
    };
})();
