// ===== History sidebar + system-prompt preset UI =====
// Wires the AIHubHistory + AIHubPresets data layers (history.js) to the chat
// page DOM. Loaded after history.js and app.js so renderConvList/etc. are
// available when the chat page boots.

(function () {
    const Q = (sel) => document.querySelector(sel);
    const QA = (sel) => Array.from(document.querySelectorAll(sel));

    function fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        if (sameDay) {
            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        }
        const oneDay = 24 * 3600 * 1000;
        const diff = Date.now() - ts;
        if (diff < 7 * oneDay) {
            return d.toLocaleDateString(undefined, { weekday: 'short' });
        }
        return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s == null ? '' : String(s);
        return div.innerHTML;
    }

    let currentSearch = '';

    // ---- Sidebar list ----
    function renderConvList() {
        const list = Q('#chs-list');
        if (!list || !window.AIHubHistory) return;
        const all = window.AIHubHistory.listConversations();
        const term = currentSearch.trim().toLowerCase();
        const filtered = !term ? all : all.filter(c => {
            if ((c.title || '').toLowerCase().includes(term)) return true;
            return c.messages.some(m => {
                const tmp = document.createElement('div');
                tmp.innerHTML = m.html || '';
                return (tmp.textContent || '').toLowerCase().includes(term);
            });
        });
        const activeConv = window.AIHubHistory.activeConversation();
        const activeId = activeConv ? activeConv.id : null;

        if (filtered.length === 0) {
            list.innerHTML = `<div class="chs-empty">${window.t ? window.t('chs_empty') : 'No conversations yet'}</div>`;
            return;
        }

        list.innerHTML = filtered.map(c => {
            const title = window.AIHubHistory.deriveTitle(c);
            const time = fmtTime(c.lastTs || c.ts);
            const count = c.messages.length;
            const pinned = c.pinned ? 'pinned' : '';
            const activeCls = c.id === activeId ? 'active' : '';
            return `
                <div class="conv-item ${activeCls} ${pinned}" data-id="${escapeHtml(c.id)}">
                    <div class="conv-main" onclick="window.__convSelect('${escapeHtml(c.id)}')">
                        <div class="conv-title">${escapeHtml(title)}</div>
                        <div class="conv-meta">
                            <span class="conv-time">${escapeHtml(time)}</span>
                            <span class="conv-count">${count} msg</span>
                        </div>
                    </div>
                    <div class="conv-actions">
                        <button class="conv-btn" title="${window.t ? window.t('chs_pin') : 'Pin'}" onclick="event.stopPropagation();window.__convTogglePin('${escapeHtml(c.id)}')">
                            ${c.pinned
                                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6l1 1 1-1v-6h5v-2l-2-2z"/></svg>'
                                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6l1 1 1-1v-6h5v-2l-2-2z"/></svg>'
                            }
                        </button>
                        <button class="conv-btn" title="${window.t ? window.t('chs_rename') : 'Rename'}" onclick="event.stopPropagation();window.__convRename('${escapeHtml(c.id)}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7m-1.5-9.5a2.121 2.121 0 113 3L12 19l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="conv-btn danger" title="${window.t ? window.t('chs_delete') : 'Delete'}" onclick="event.stopPropagation();window.__convDelete('${escapeHtml(c.id)}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function selectConv(id) {
        if (!window.AIHubHistory) return;
        window.AIHubHistory.setActiveConversation(id);
        if (typeof window.restoreActiveConversation === 'function') window.restoreActiveConversation();
        renderConvList();
    }
    window.__convSelect = selectConv;

    function togglePinConv(id) {
        if (!window.AIHubHistory) return;
        window.AIHubHistory.togglePinConversation(id);
        renderConvList();
    }
    window.__convTogglePin = togglePinConv;

    function renameConv(id) {
        if (!window.AIHubHistory) return;
        const conv = window.AIHubHistory.listConversations().find(c => c.id === id);
        if (!conv) return;
        const current = window.AIHubHistory.deriveTitle(conv);
        const next = prompt(window.t ? window.t('chs_rename_prompt') : 'New title:', current);
        if (next == null) return;
        window.AIHubHistory.renameConversation(id, next.trim());
        renderConvList();
    }
    window.__convRename = renameConv;

    function deleteConv(id) {
        if (!window.AIHubHistory) return;
        const ok = confirm(window.t ? window.t('chs_delete_confirm') : 'Delete this conversation?');
        if (!ok) return;
        const wasActive = (window.AIHubHistory.activeConversation() || {}).id === id;
        window.AIHubHistory.deleteConversation(id);
        if (wasActive && typeof window.restoreActiveConversation === 'function') {
            window.restoreActiveConversation();
        }
        renderConvList();
    }
    window.__convDelete = deleteConv;

    function newConv() {
        if (!window.AIHubHistory) return;
        window.AIHubHistory.createConversation();
        if (typeof window.restoreActiveConversation === 'function') window.restoreActiveConversation();
        renderConvList();
    }
    window.startNewConversation = newConv;

    function filterConvs(term) {
        currentSearch = term || '';
        renderConvList();
    }
    window.__convFilter = filterConvs;

    function toggleSidebar() {
        const sidebar = Q('#chat-history-sidebar');
        if (!sidebar) return;
        sidebar.classList.toggle('collapsed');
        try { localStorage.setItem('aihub.chsCollapsed', sidebar.classList.contains('collapsed') ? '1' : '0'); } catch {}
    }
    window.__chsToggle = toggleSidebar;

    // ---- Preset dropdown ----
    function renderPresetSelect() {
        const sel = Q('#preset-select');
        if (!sel || !window.AIHubPresets) return;
        const prev = sel.value;
        const presets = window.AIHubPresets.list();
        const placeholder = window.t ? window.t('preset_none') : '— No preset —';
        sel.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
            presets.map(p => {
                const cls = p.builtin ? 'preset-builtin' : 'preset-custom';
                return `<option value="${escapeHtml(p.id)}" class="${cls}">${escapeHtml(p.name)}${p.builtin ? '' : ' ★'}</option>`;
            }).join('');
        if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    }

    function applyPreset(id) {
        if (!id || !window.AIHubPresets) return;
        const p = window.AIHubPresets.get(id);
        if (!p) return;
        const ta = Q('#system-prompt');
        if (ta) {
            ta.value = p.prompt || '';
            ta.dispatchEvent(new Event('input'));
        }
    }
    window.__presetApply = applyPreset;

    // ---- Preset modal ----
    function openPresetModal() {
        const modal = Q('#preset-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        renderPresetModalList();
    }
    window.__presetModalOpen = openPresetModal;

    function closePresetModal() {
        const modal = Q('#preset-modal');
        if (!modal) return;
        modal.style.display = 'none';
    }
    window.__presetModalClose = closePresetModal;

    function renderPresetModalList() {
        const list = Q('#preset-modal-list');
        if (!list || !window.AIHubPresets) return;
        const presets = window.AIHubPresets.list();
        list.innerHTML = presets.map(p => `
            <div class="preset-row-item ${p.builtin ? 'builtin' : ''}" data-id="${escapeHtml(p.id)}">
                <div class="preset-row-name">${escapeHtml(p.name)}${p.builtin ? '' : ' ★'}</div>
                <div class="preset-row-prompt">${escapeHtml((p.prompt || '').slice(0, 100))}${(p.prompt || '').length > 100 ? '…' : ''}</div>
                <div class="preset-row-actions">
                    <button class="conv-btn" type="button" onclick="window.__presetEdit('${escapeHtml(p.id)}')">${window.t ? window.t('chs_rename') : 'Edit'}</button>
                    ${p.builtin ? '' : `<button class="conv-btn danger" type="button" onclick="window.__presetDelete('${escapeHtml(p.id)}')">${window.t ? window.t('chs_delete') : 'Delete'}</button>`}
                </div>
            </div>
        `).join('');
    }

    function savePresetFromModal() {
        const nameEl = Q('#preset-modal-name');
        const promptEl = Q('#preset-modal-prompt');
        if (!nameEl || !promptEl || !window.AIHubPresets) return;
        const name = nameEl.value.trim();
        const prompt = promptEl.value;
        if (!name) {
            alert(window.t ? window.t('preset_name_required') : 'Name is required');
            return;
        }
        const editingId = nameEl.dataset.editing || '';
        if (editingId && !editingId.startsWith('builtin.')) {
            window.AIHubPresets.update(editingId, { name, prompt });
        } else {
            window.AIHubPresets.add(name, prompt);
        }
        nameEl.value = '';
        promptEl.value = '';
        nameEl.dataset.editing = '';
        renderPresetSelect();
        renderPresetModalList();
    }
    window.__presetSave = savePresetFromModal;

    function editPreset(id) {
        if (!window.AIHubPresets) return;
        const p = window.AIHubPresets.get(id);
        if (!p) return;
        const nameEl = Q('#preset-modal-name');
        const promptEl = Q('#preset-modal-prompt');
        if (!nameEl || !promptEl) return;
        nameEl.value = p.name;
        promptEl.value = p.prompt || '';
        nameEl.dataset.editing = id;
        nameEl.focus();
    }
    window.__presetEdit = editPreset;

    function deletePreset(id) {
        if (!window.AIHubPresets) return;
        if (!confirm(window.t ? window.t('preset_delete_confirm') : 'Delete this preset?')) return;
        window.AIHubPresets.remove(id);
        renderPresetSelect();
        renderPresetModalList();
    }
    window.__presetDelete = deletePreset;

    // ---- Save current system prompt as new preset (quick action) ----
    function saveCurrentAsPreset() {
        const ta = Q('#system-prompt');
        const promptText = ta ? ta.value : '';
        if (!promptText.trim()) {
            alert(window.t ? window.t('preset_empty_prompt') : 'System prompt is empty');
            return;
        }
        const name = prompt(window.t ? window.t('preset_save_prompt') : 'Preset name:');
        if (!name || !name.trim()) return;
        window.AIHubPresets.add(name.trim(), promptText);
        renderPresetSelect();
    }
    window.__presetSaveCurrent = saveCurrentAsPreset;

    // ---- Init ----
    function initHistoryUI() {
        // Restore collapsed state
        try {
            if (localStorage.getItem('aihub.chsCollapsed') === '1') {
                const sb = Q('#chat-history-sidebar');
                if (sb) sb.classList.add('collapsed');
            }
        } catch {}

        renderConvList();
        renderPresetSelect();

        const search = Q('#chs-search');
        if (search) {
            search.addEventListener('input', (e) => filterConvs(e.target.value));
        }
    }

    // Re-render after language change.
    document.addEventListener('aihub:lang-change', () => {
        renderConvList();
        renderPresetSelect();
    });

    // Expose so app.js can refresh after appending a message.
    window.refreshHistorySidebar = renderConvList;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHistoryUI);
    } else {
        initHistoryUI();
    }
})();
