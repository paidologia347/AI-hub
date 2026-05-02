// ===== Multi-Provider API Key Management =====
// Stores API keys in localStorage and exposes helpers for the rest of the app.
// All sensitive values stay in the browser; the server only sees them when
// they accompany a chat/vision/upload request.

const LS_PREFIX = 'aihub.apiKey.';
const LS_CUSTOM_BASE = 'aihub.customBaseUrl';

// Hydrated by loadProviders() on page init.
window.PROVIDERS = [];
// Hydrated by loadModels() on page init.
window.AI_MODELS = { text: [], multimodal: [], vision: [], image: [], video: [], tts: [], asr: [] };

// ----- localStorage helpers -----
function getKey(providerId) {
    try { return localStorage.getItem(LS_PREFIX + providerId) || ''; }
    catch { return ''; }
}

function setKey(providerId, value) {
    try {
        if (value) localStorage.setItem(LS_PREFIX + providerId, value);
        else localStorage.removeItem(LS_PREFIX + providerId);
    } catch {}
}

function getCustomBaseUrl() {
    try { return localStorage.getItem(LS_CUSTOM_BASE) || ''; }
    catch { return ''; }
}

function setCustomBaseUrl(value) {
    try {
        if (value) localStorage.setItem(LS_CUSTOM_BASE, value);
        else localStorage.removeItem(LS_CUSTOM_BASE);
    } catch {}
}

// Returns true if a provider has a key configured (either localStorage or env_set).
function isConfigured(providerId) {
    if (getKey(providerId)) return true;
    const p = window.PROVIDERS.find(x => x.id === providerId);
    return !!(p && p.env_set);
}

// Returns the request payload pieces for sending to the backend for a given
// provider+model combination.
window.getProviderPayload = function (providerId) {
    const key = getKey(providerId);
    const out = { provider: providerId, api_key: key };
    if (providerId === 'custom') out.base_url = getCustomBaseUrl();
    return out;
};

// Look up a model in AI_MODELS and return its provider id. Falls back to
// 'dashscope' for unknown ids (preserves backwards compatibility).
window.providerForModel = function (modelId) {
    for (const cat of Object.values(window.AI_MODELS || {})) {
        for (const m of cat) {
            if (m.id === modelId) return m.provider;
        }
    }
    return 'dashscope';
};

// ----- API -----
async function loadProviders() {
    try {
        const resp = await fetch('/api/providers');
        const data = await resp.json();
        window.PROVIDERS = data.providers || [];
    } catch (e) {
        console.error('Failed to load providers', e);
        window.PROVIDERS = [];
    }
}

async function loadModels() {
    try {
        const resp = await fetch('/api/models');
        window.AI_MODELS = await resp.json();
    } catch (e) {
        console.error('Failed to load models', e);
    }
}

// Filter and populate a <select> with models from a category list.
// `categories` is an array of category names (e.g. ['text', 'multimodal']).
// Only models whose provider is configured (key in localStorage OR env_set on
// the server) are included by default; if no providers are configured, all
// models from those categories are shown so the user still sees options.
window.populateModelSelect = function (selectEl, categories, opts = {}) {
    if (!selectEl) return;
    const wantOnlyConfigured = opts.onlyConfigured !== false;
    const groupByProvider = opts.groupByProvider !== false;

    const all = [];
    for (const cat of categories) {
        for (const m of (window.AI_MODELS[cat] || [])) all.push(m);
    }

    let filtered = wantOnlyConfigured ? all.filter(m => isConfigured(m.provider)) : all;
    if (filtered.length === 0) filtered = all;  // graceful fallback

    selectEl.innerHTML = '';
    if (groupByProvider) {
        const byProvider = new Map();
        for (const m of filtered) {
            if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
            byProvider.get(m.provider).push(m);
        }
        for (const [provId, models] of byProvider) {
            const provName = (window.PROVIDERS.find(p => p.id === provId) || {}).name || provId;
            const og = document.createElement('optgroup');
            og.label = provName;
            for (const m of models) {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                opt.dataset.provider = m.provider;
                og.appendChild(opt);
            }
            selectEl.appendChild(og);
        }
    } else {
        for (const m of filtered) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            opt.dataset.provider = m.provider;
            selectEl.appendChild(opt);
        }
    }
};

// ----- Provider cards UI (API Management page) -----
function renderProviderCards() {
    const container = document.getElementById('provider-cards');
    if (!container) return;
    container.innerHTML = '';

    for (const p of window.PROVIDERS) {
        const localKey = getKey(p.id);
        const card = document.createElement('div');
        card.className = 'provider-card' + (localKey ? ' has-key' : '');
        card.dataset.provider = p.id;

        let statusBadge = '';
        if (localKey) statusBadge = '<span class="provider-status connected">CONNECTED</span>';
        else if (p.env_set) statusBadge = '<span class="provider-status env">ENV VAR</span>';
        else statusBadge = '<span class="provider-status disconnected">NOT SET</span>';

        const customRow = p.id === 'custom' ? `
            <div class="provider-key-row">
                <input type="text" class="provider-key-input" data-role="base-url"
                       placeholder="https://your-endpoint.com/v1"
                       value="${escapeAttr(getCustomBaseUrl())}">
            </div>` : '';

        const helpLink = p.key_url ? `<a href="${escapeAttr(p.key_url)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent);">Get key →</a>` : '';

        card.innerHTML = `
            <div class="provider-card-header">
                <span class="provider-name">${escapeHtml(p.name)}</span>
                ${statusBadge}
            </div>
            <span class="provider-base-url">${escapeHtml(p.base_url || 'custom endpoint')}</span>
            ${customRow}
            <div class="provider-key-row">
                <input type="password" class="provider-key-input" data-role="key"
                       placeholder="${escapeAttr(p.key_prefix ? p.key_prefix + '...' : 'API key')}"
                       value="${escapeAttr(localKey)}">
                <button class="provider-icon-btn" data-action="toggle" title="Show/hide key">👁</button>
                <button class="provider-icon-btn" data-action="copy" title="Copy key">📋</button>
            </div>
            <div class="provider-actions">
                <button class="provider-btn primary" data-action="save">Save</button>
                <button class="provider-btn" data-action="test">Test</button>
                <button class="provider-btn danger" data-action="clear">Clear</button>
            </div>
            <div class="provider-test-result" data-role="result" style="display:none;"></div>
            ${helpLink ? `<div>${helpLink}</div>` : ''}
        `;
        container.appendChild(card);
    }
    updateProviderStat();
}

// Delegated handler for provider card actions.
function handleProviderCardClick(e) {
    const card = e.target.closest('.provider-card');
    if (!card) return;
    const action = e.target.dataset.action;
    if (!action) return;
    const providerId = card.dataset.provider;
    const keyInput = card.querySelector('input[data-role="key"]');
    const baseUrlInput = card.querySelector('input[data-role="base-url"]');
    const result = card.querySelector('[data-role="result"]');

    if (action === 'toggle') {
        keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    } else if (action === 'copy') {
        if (!keyInput.value) { showToast('No key to copy'); return; }
        navigator.clipboard.writeText(keyInput.value);
        showToast('Key copied');
    } else if (action === 'save') {
        setKey(providerId, keyInput.value.trim());
        if (baseUrlInput) setCustomBaseUrl(baseUrlInput.value.trim());
        showToast('Saved');
        renderProviderCards();
        if (typeof refreshAllModelDropdowns === 'function') refreshAllModelDropdowns();
    } else if (action === 'clear') {
        setKey(providerId, '');
        if (baseUrlInput) setCustomBaseUrl('');
        showToast('Cleared');
        renderProviderCards();
        if (typeof refreshAllModelDropdowns === 'function') refreshAllModelDropdowns();
    } else if (action === 'test') {
        const key = keyInput.value.trim();
        if (!key) {
            showProviderResult(result, false, 'Enter an API key first');
            return;
        }
        result.style.display = 'block';
        result.className = 'provider-test-result';
        result.textContent = 'Testing...';
        const body = { provider: providerId, api_key: key };
        if (baseUrlInput) body.base_url = baseUrlInput.value.trim();
        fetch('/api/providers/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
            .then(async r => {
                const data = await r.json().catch(() => ({}));
                if (r.ok && data.ok) {
                    showProviderResult(result, true, `OK (${data.model || 'ping'})`);
                } else {
                    showProviderResult(result, false, data.detail || `HTTP ${r.status}`);
                }
            })
            .catch(err => showProviderResult(result, false, err.message));
    }
}

function showProviderResult(el, ok, msg) {
    el.style.display = 'block';
    el.className = 'provider-test-result ' + (ok ? 'ok' : 'err');
    el.textContent = msg;
}

function updateProviderStat() {
    const total = window.PROVIDERS.filter(p => isConfigured(p.id)).length;
    const el = document.getElementById('stat-providers');
    if (el) el.textContent = total;
}

// Render the read-only Available Models table on the API Management page.
function renderModelsTable() {
    const body = document.getElementById('models-table-body');
    if (!body) return;
    const all = [];
    for (const [cat, models] of Object.entries(window.AI_MODELS || {})) {
        for (const m of models) all.push({ ...m, category: cat });
    }
    body.innerHTML = '';
    for (const m of all) {
        const tagClass = TAG_CLASS[m.type] || 'text-tag';
        const provName = (window.PROVIDERS.find(p => p.id === m.provider) || {}).name || m.provider;
        const status = isConfigured(m.provider) ? 'active' : 'pending';
        const statusLabel = status === 'active' ? 'Active' : 'No Key';
        const row = document.createElement('div');
        row.className = 'model-row';
        row.innerHTML = `
            <span>${escapeHtml(m.name)}</span>
            <span class="tag ${tagClass}">${escapeHtml(m.type)}</span>
            <span>${escapeHtml(provName)}</span>
            <span class="status-badge ${status}">${statusLabel}</span>
        `;
        body.appendChild(row);
    }
    const totalEl = document.getElementById('stat-total-models');
    if (totalEl) totalEl.textContent = all.length;
}

const TAG_CLASS = {
    'Text': 'text-tag',
    'Reasoning': 'reason-tag',
    'Code': 'code-tag',
    'Vision': 'vision-tag',
    'Multimodal': 'multi-tag',
    'Image': 'img-tag',
    'Video': 'video-tag',
    'TTS': 'tts-tag',
    'ASR': 'asr-tag',
};

function escapeAttr(s) {
    return String(s || '').replace(/"/g, '&quot;').replace(/&/g, '&amp;');
}

// ----- Public init -----
window.initProviders = async function () {
    await Promise.all([loadProviders(), loadModels()]);
    renderProviderCards();
    renderModelsTable();
    const cardsEl = document.getElementById('provider-cards');
    if (cardsEl) cardsEl.addEventListener('click', handleProviderCardClick);
    if (typeof refreshAllModelDropdowns === 'function') refreshAllModelDropdowns();
};
