// ===== Multi-Conversation History + System Prompt Presets =====
// All data lives in localStorage. The chat page consumes the active
// conversation; everything else (sidebar list, search, presets) is a thin UI
// shell on top of these helpers.

const CONV_KEY = 'aihub.conversations.v2';
const CONV_LIMIT = 200;
const CONV_BUDGET_BYTES = 4 * 1024 * 1024; // ~4MB cap total
const PRESET_KEY = 'aihub.systemPrompts.v1';
const LEGACY_HISTORY_KEY = 'aihub.chatHistory.text';

// ----- Built-in system prompt presets ---------------------------------------
const BUILTIN_PRESETS = [
    {
        id: 'builtin.general',
        name_id: 'Asisten Umum',
        name_en: 'General Assistant',
        prompt: '',
    },
    {
        id: 'builtin.coder',
        name_id: 'Asisten Coding',
        name_en: 'Coding Assistant',
        prompt: 'You are an expert software engineer. Provide concise, idiomatic code with brief explanations. Prefer modern best practices and call out edge cases. When unsure, ask one clarifying question before writing code.',
    },
    {
        id: 'builtin.translator',
        name_id: 'Penerjemah',
        name_en: 'Translator',
        prompt: 'You are a precise bilingual translator. Translate the user\u2019s text faithfully while preserving tone and intent. If the source language is ambiguous, ask first. Show only the translation by default.',
    },
    {
        id: 'builtin.tutor',
        name_id: 'Tutor Edukatif',
        name_en: 'Educational Tutor',
        prompt: 'You are a patient tutor. Break complex topics into small steps, use analogies, and check understanding with a brief question at the end. Adapt difficulty to the learner\u2019s level.',
    },
    {
        id: 'builtin.marketer',
        name_id: 'Penulis Pemasaran',
        name_en: 'Marketing Writer',
        prompt: 'You are a marketing copywriter. Write punchy, benefit-led copy with clear calls to action. Default tone: confident, friendly. Offer 2\u20133 variants when asked.',
    },
    {
        id: 'builtin.writer',
        name_id: 'Penulis Kreatif',
        name_en: 'Creative Writer',
        prompt: 'You are a thoughtful creative writer. Use vivid sensory detail, varied sentence rhythm, and deliberate word choice. Match the genre and voice the user requests.',
    },
    {
        id: 'builtin.researcher',
        name_id: 'Asisten Riset',
        name_en: 'Research Assistant',
        prompt: 'You are a careful research assistant. Summarize sources accurately, cite caveats, and separate fact from speculation. Prefer numbered lists for findings.',
    },
];

// ----- Storage helpers ------------------------------------------------------
function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
        const data = JSON.parse(raw);
        return data ?? fallback;
    } catch {
        return fallback;
    }
}

function loadConvStore() {
    const raw = (() => { try { return localStorage.getItem(CONV_KEY); } catch { return null; } })();
    const data = safeParse(raw, null);
    if (data && Array.isArray(data.conversations)) {
        return {
            v: 2,
            conversations: data.conversations,
            activeId: data.activeId || (data.conversations[0] && data.conversations[0].id) || null,
        };
    }
    // Migrate from legacy single-conversation history if present.
    const legacyRaw = (() => { try { return localStorage.getItem(LEGACY_HISTORY_KEY); } catch { return null; } })();
    const legacy = safeParse(legacyRaw, null);
    if (legacy && Array.isArray(legacy.messages) && legacy.messages.length > 0) {
        const conv = newConversation('Migrated chat');
        conv.messages = legacy.messages.map(m => ({
            role: m.role,
            html: m.html,
            ts: m.ts || Date.now(),
        }));
        conv.lastTs = conv.messages[conv.messages.length - 1].ts;
        const store = { v: 2, conversations: [conv], activeId: conv.id };
        saveConvStore(store);
        return store;
    }
    return { v: 2, conversations: [], activeId: null };
}

function saveConvStore(store) {
    try {
        // Keep only up to CONV_LIMIT, dropping oldest non-pinned first.
        let convs = store.conversations.slice();
        if (convs.length > CONV_LIMIT) {
            const pinned = convs.filter(c => c.pinned);
            const rest = convs
                .filter(c => !c.pinned)
                .sort((a, b) => (b.lastTs || b.ts) - (a.lastTs || a.ts));
            convs = pinned.concat(rest).slice(0, CONV_LIMIT);
        }
        let payload = JSON.stringify({ v: 2, conversations: convs, activeId: store.activeId });
        // Drop oldest non-pinned conversations until we fit the byte budget.
        // The array is ordered newest-first (see CONV_LIMIT sort + unshift in
        // createConversation), so search from the tail to find the oldest.
        while (payload.length > CONV_BUDGET_BYTES && convs.length > 1) {
            let idx = -1;
            for (let i = convs.length - 1; i >= 0; i--) {
                if (!convs[i].pinned) { idx = i; break; }
            }
            if (idx < 0) break;
            convs.splice(idx, 1);
            payload = JSON.stringify({ v: 2, conversations: convs, activeId: store.activeId });
        }
        localStorage.setItem(CONV_KEY, payload);
    } catch (err) {
        console.warn('Conversation save failed', err);
    }
}

function genId() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function newConversation(title) {
    const now = Date.now();
    return {
        id: genId(),
        title: title || '',
        ts: now,
        lastTs: now,
        pinned: false,
        systemPrompt: '',
        model: '',
        messages: [],
    };
}

// ----- Public API: conversation manager ------------------------------------
let CONV_STORE = loadConvStore();

function ensureActive() {
    if (!CONV_STORE.activeId || !CONV_STORE.conversations.find(c => c.id === CONV_STORE.activeId)) {
        if (CONV_STORE.conversations.length === 0) {
            const conv = newConversation('');
            CONV_STORE.conversations.push(conv);
            CONV_STORE.activeId = conv.id;
            saveConvStore(CONV_STORE);
        } else {
            CONV_STORE.activeId = CONV_STORE.conversations[0].id;
            saveConvStore(CONV_STORE);
        }
    }
    return CONV_STORE.conversations.find(c => c.id === CONV_STORE.activeId);
}

function activeConversation() { return ensureActive(); }

function listConversations() {
    return CONV_STORE.conversations.slice().sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.lastTs || b.ts) - (a.lastTs || a.ts);
    });
}

function setActiveConversation(id) {
    if (!CONV_STORE.conversations.find(c => c.id === id)) return null;
    CONV_STORE.activeId = id;
    saveConvStore(CONV_STORE);
    return activeConversation();
}

function createConversation() {
    const conv = newConversation('');
    CONV_STORE.conversations.unshift(conv);
    CONV_STORE.activeId = conv.id;
    saveConvStore(CONV_STORE);
    return conv;
}

function deleteConversation(id) {
    const idx = CONV_STORE.conversations.findIndex(c => c.id === id);
    if (idx < 0) return;
    CONV_STORE.conversations.splice(idx, 1);
    if (CONV_STORE.activeId === id) {
        CONV_STORE.activeId = (CONV_STORE.conversations[0] && CONV_STORE.conversations[0].id) || null;
    }
    saveConvStore(CONV_STORE);
}

function renameConversation(id, title) {
    const conv = CONV_STORE.conversations.find(c => c.id === id);
    if (!conv) return;
    conv.title = (title || '').trim().slice(0, 80);
    saveConvStore(CONV_STORE);
}

function togglePinConversation(id) {
    const conv = CONV_STORE.conversations.find(c => c.id === id);
    if (!conv) return;
    conv.pinned = !conv.pinned;
    saveConvStore(CONV_STORE);
}

function appendMessageToActive(role, html) {
    const conv = ensureActive();
    const ts = Date.now();
    conv.messages.push({ role, html, ts });
    conv.lastTs = ts;
    if (!conv.title && role === 'user') {
        // Auto-derive title from first user message (strip HTML, trim, ≤ 60 chars).
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const text = (tmp.textContent || tmp.innerText || '').trim().replace(/\s+/g, ' ');
        conv.title = text.slice(0, 60) || 'New chat';
    }
    saveConvStore(CONV_STORE);
}

function clearActiveMessages() {
    const conv = ensureActive();
    conv.messages = [];
    conv.lastTs = Date.now();
    saveConvStore(CONV_STORE);
}

function deriveTitle(conv) {
    if (conv.title) return conv.title;
    const firstUser = conv.messages.find(m => m.role === 'user');
    if (!firstUser) return 'New chat';
    const tmp = document.createElement('div');
    tmp.innerHTML = firstUser.html;
    const text = (tmp.textContent || tmp.innerText || '').trim().replace(/\s+/g, ' ');
    return text.slice(0, 60) || 'New chat';
}

// ----- Public API: presets --------------------------------------------------
function loadPresets() {
    const raw = (() => { try { return localStorage.getItem(PRESET_KEY); } catch { return null; } })();
    const data = safeParse(raw, null);
    const custom = (data && Array.isArray(data.presets)) ? data.presets : [];
    return { custom };
}

function savePresets(custom) {
    try {
        localStorage.setItem(PRESET_KEY, JSON.stringify({ v: 1, presets: custom }));
    } catch (err) {
        console.warn('Preset save failed', err);
    }
}

function localizedPresetName(p) {
    if (p.name) return p.name;
    const lang = (typeof window.__getLang === 'function') ? window.__getLang() : 'id';
    return lang === 'en' ? p.name_en : p.name_id;
}

function listPresets() {
    const { custom } = loadPresets();
    return [
        ...BUILTIN_PRESETS.map(p => ({ id: p.id, name: localizedPresetName(p), prompt: p.prompt, builtin: true })),
        ...custom.map(p => ({ id: p.id, name: p.name || 'Untitled', prompt: p.prompt || '', builtin: false })),
    ];
}

function getPreset(id) {
    return listPresets().find(p => p.id === id) || null;
}

function addCustomPreset(name, prompt) {
    const { custom } = loadPresets();
    const entry = { id: 'p_' + Date.now().toString(36), name: (name || 'Untitled').slice(0, 60), prompt: prompt || '' };
    custom.push(entry);
    savePresets(custom);
    return entry;
}

function updateCustomPreset(id, patch) {
    const { custom } = loadPresets();
    const p = custom.find(x => x.id === id);
    if (!p) return false;
    if (typeof patch.name === 'string') p.name = patch.name.slice(0, 60);
    if (typeof patch.prompt === 'string') p.prompt = patch.prompt;
    savePresets(custom);
    return true;
}

function deleteCustomPreset(id) {
    const { custom } = loadPresets();
    const idx = custom.findIndex(x => x.id === id);
    if (idx < 0) return false;
    custom.splice(idx, 1);
    savePresets(custom);
    return true;
}

// ----- Expose to other scripts ---------------------------------------------
window.AIHubHistory = {
    activeConversation,
    listConversations,
    setActiveConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    togglePinConversation,
    appendMessageToActive,
    clearActiveMessages,
    deriveTitle,
};

window.AIHubPresets = {
    list: listPresets,
    get: getPreset,
    add: addCustomPreset,
    update: updateCustomPreset,
    remove: deleteCustomPreset,
};
