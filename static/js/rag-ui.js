// ===== RAG (Knowledge Base) UI =====
// Wires the RAG store (window.AIHubRAG) to the toolbar button + modal so the
// user can see what's indexed, remove individual docs, or clear the whole
// knowledge base. Loaded only on the Text Generation page.

(function () {
    'use strict';

    if (!window.AIHubRAG) return; // RAG layer is required

    function fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const day = d.toLocaleDateString();
        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${day} ${time}`;
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s == null ? '' : String(s);
        return div.innerHTML;
    }

    function fmtBytes(n) {
        if (!n || n < 1024) return `${n || 0} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1024 / 1024).toFixed(2)} MB`;
    }

    function refreshBadge() {
        const badge = document.getElementById('kb-badge');
        if (!badge) return;
        const stats = window.AIHubRAG.stats();
        if (stats.docs > 0) {
            badge.textContent = String(stats.docs);
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    function renderKBList() {
        const listEl = document.getElementById('kb-list');
        const summaryEl = document.getElementById('kb-summary');
        if (!listEl) return;
        const docs = window.AIHubRAG.list();
        const stats = window.AIHubRAG.stats();
        if (summaryEl) {
            const t = window.t || ((k) => k);
            summaryEl.textContent = docs.length === 0
                ? t('rag_empty')
                : `${docs.length} ${docs.length === 1 ? t('rag_doc_one') : t('rag_doc_many')} · ${stats.chunks} ${t('rag_chunks')} · ${fmtBytes(stats.bytes)}`;
        }
        if (docs.length === 0) {
            listEl.innerHTML = `<div class="kb-empty">${escapeHtml(window.t ? window.t('rag_empty_long') : 'No indexed files yet. Upload a PDF/DOCX/TXT and click 📚 on the chip to index it for retrieval.')}</div>`;
            return;
        }
        listEl.innerHTML = '';
        for (const d of docs) {
            const row = document.createElement('div');
            row.className = 'kb-row';
            row.innerHTML = `
                <div class="kb-row-main">
                    <div class="kb-row-name" title="${escapeHtml(d.filename)}">📄 ${escapeHtml(d.filename)}</div>
                    <div class="kb-row-meta">${d.chunks} ${escapeHtml(window.t ? window.t('rag_chunks') : 'chunks')} · ${fmtBytes(d.chars)} · ${escapeHtml(fmtTime(d.indexedAt))}</div>
                </div>
                <button class="kb-row-remove" type="button" data-id="${escapeHtml(d.id)}" title="${escapeHtml(window.t ? window.t('rag_remove') : 'Remove')}">×</button>
            `;
            listEl.appendChild(row);
        }
        listEl.querySelectorAll('.kb-row-remove').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                window.AIHubRAG.removeDoc(id);
                renderKBList();
                refreshBadge();
            };
        });
    }

    function openKBModal() {
        const modal = document.getElementById('kb-modal');
        if (!modal) return;
        renderKBList();
        modal.style.display = 'flex';
    }
    function closeKBModal() {
        const modal = document.getElementById('kb-modal');
        if (!modal) return;
        modal.style.display = 'none';
    }
    function clearKB() {
        const t = window.t || ((k) => k);
        if (!confirm(t('rag_clear_confirm'))) return;
        window.AIHubRAG.clearAll();
        renderKBList();
        refreshBadge();
    }

    // Expose for HTML onclick + cross-module calls.
    window.__kbOpen = openKBModal;
    window.__kbClose = closeKBModal;
    window.__kbClear = clearKB;
    window.refreshKBPanel = function () {
        renderKBList();
        refreshBadge();
    };

    document.addEventListener('aihub:lang-change', renderKBList);

    function init() {
        refreshBadge();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
