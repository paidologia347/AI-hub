// ===== Image Gallery: History + Re-generate + Download/Copy =====
// Persists generated images with metadata (prompt, model, timestamp, URL)
// in localStorage and shows them in the Image Studio gallery.

(function () {
    'use strict';

    const STORE_KEY = 'aihub.gallery.v1';
    const MAX_ITEMS = 100;

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (d && Array.isArray(d.images)) return d;
            }
        } catch {}
        return { images: [] };
    }

    function saveStore(store) {
        try {
            while (store.images.length > MAX_ITEMS) store.images.pop();
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
        } catch {}
    }

    let STORE = loadStore();

    // ----- Public API --------------------------------------------------------

    function addImage(entry) {
        // entry: { url, prompt, model, ts?, revisedPrompt? }
        const item = {
            id: 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
            url: entry.url,
            prompt: entry.prompt || '',
            model: entry.model || 'unknown',
            revisedPrompt: entry.revisedPrompt || '',
            ts: entry.ts || Date.now(),
        };
        STORE.images.unshift(item);
        saveStore(STORE);
        renderGallery();
        return item;
    }

    function removeImage(id) {
        STORE.images = STORE.images.filter(img => img.id !== id);
        saveStore(STORE);
        renderGallery();
    }

    function clearAll() {
        STORE = { images: [] };
        saveStore(STORE);
        renderGallery();
    }

    function list() {
        return STORE.images;
    }

    function getById(id) {
        return STORE.images.find(img => img.id === id) || null;
    }

    // ----- Re-generate / Variation -------------------------------------------

    function reGenerate(id) {
        const img = getById(id);
        if (!img) return;
        // Fill the prompt input and trigger generate
        const promptInput = document.getElementById('image-prompt');
        const modelSelect = document.getElementById('image-model');
        if (promptInput) promptInput.value = img.prompt;
        if (modelSelect) {
            const opt = [...modelSelect.options].find(o => o.value === img.model);
            if (opt) modelSelect.value = img.model;
        }
        if (window.showToast) window.showToast('Prompt loaded - click Generate');
    }

    function createVariation(id) {
        const img = getById(id);
        if (!img) return;
        const promptInput = document.getElementById('image-prompt');
        if (promptInput) {
            promptInput.value = `Create a variation of: ${img.prompt}. Make it slightly different in style or composition.`;
        }
        if (window.showToast) window.showToast('Variation prompt loaded');
    }

    // ----- Gallery Rendering -------------------------------------------------

    function renderGallery() {
        const grid = document.getElementById('gallery-grid');
        const countEl = document.getElementById('gallery-count');
        if (!grid) return;

        const images = STORE.images;
        if (countEl) countEl.textContent = `${images.length} image${images.length !== 1 ? 's' : ''}`;

        if (images.length === 0) {
            grid.innerHTML = `<div class="gallery-placeholder"><p>${window.t ? window.t('gallery_placeholder') : 'No images generated yet'}</p></div>`;
            return;
        }

        grid.innerHTML = '';
        for (const img of images) {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.dataset.id = img.id;

            const imgEl = document.createElement('img');
            imgEl.src = img.url;
            imgEl.alt = img.prompt || 'Generated image';
            imgEl.loading = 'lazy';

            const overlay = document.createElement('div');
            overlay.className = 'gallery-overlay';

            const meta = document.createElement('div');
            meta.className = 'gallery-meta';
            meta.innerHTML = `
                <div class="gallery-meta-prompt" title="${escHtml(img.prompt)}">${escHtml(img.prompt.slice(0, 60))}${img.prompt.length > 60 ? '...' : ''}</div>
                <div class="gallery-meta-info">${escHtml(img.model)} &middot; ${fmtTime(img.ts)}</div>
            `;

            const actions = document.createElement('div');
            actions.className = 'gallery-actions';
            actions.innerHTML = `
                <button class="gallery-action-btn" data-action="download" title="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg></button>
                <button class="gallery-action-btn" data-action="copy" title="Copy URL"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button>
                <button class="gallery-action-btn" data-action="regen" title="Re-generate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg></button>
                <button class="gallery-action-btn" data-action="variation" title="Variation"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg></button>
                <button class="gallery-action-btn gallery-action-delete" data-action="delete" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
            `;

            overlay.appendChild(meta);
            overlay.appendChild(actions);
            item.appendChild(imgEl);
            item.appendChild(overlay);
            grid.appendChild(item);
        }

        // Event delegation
        grid.addEventListener('click', handleGalleryClick);
    }

    function handleGalleryClick(e) {
        const btn = e.target.closest('.gallery-action-btn');
        if (!btn) return;
        const item = btn.closest('.gallery-item');
        if (!item) return;
        const id = item.dataset.id;
        const action = btn.dataset.action;

        if (action === 'download') {
            const img = getById(id);
            if (img && window.downloadUrl) window.downloadUrl(img.url, `aihub-image-${Date.now()}.png`);
        } else if (action === 'copy') {
            const img = getById(id);
            if (img) {
                navigator.clipboard.writeText(img.url);
                if (window.showToast) window.showToast('URL copied');
            }
        } else if (action === 'regen') {
            reGenerate(id);
        } else if (action === 'variation') {
            createVariation(id);
        } else if (action === 'delete') {
            removeImage(id);
        }
    }

    function escHtml(s) {
        const div = document.createElement('div');
        div.textContent = s || '';
        return div.innerHTML;
    }

    function fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        renderGallery();
    });

    window.AIHubGallery = {
        addImage,
        removeImage,
        clearAll,
        list,
        getById,
        reGenerate,
        createVariation,
        renderGallery,
    };
})();
