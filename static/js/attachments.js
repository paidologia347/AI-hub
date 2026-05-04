// ===== File Attachments =====
// Per-page attachment lists. Each entry is the result of POST /api/upload:
//   { kind: 'image'|'text', filename, size, content }
// `content` is a data URI for images or extracted text otherwise.

window.attachments = { chat: [], image: [], audio: [] };

const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15 MB per page

window.handleChatFileSelect = (e) => handleFileSelect(e, 'chat');
window.handleImageFileSelect = (e) => handleFileSelect(e, 'image');

async function handleFileSelect(e, page) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) await uploadOne(file, page);
}

async function uploadOne(file, page) {
    const list = window.attachments[page];
    const totalSize = list.reduce((sum, a) => sum + (a.size || 0), 0);
    if (totalSize + file.size > MAX_TOTAL_BYTES) {
        showToast(`Total attachments would exceed ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)} MB`);
        return;
    }

    const placeholder = { filename: file.name, size: file.size, kind: 'pending', uploading: true };
    list.push(placeholder);
    renderAttachments(page);

    try {
        const fd = new FormData();
        fd.append('file', file);
        const resp = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const idx = list.indexOf(placeholder);
        if (idx >= 0) list[idx] = data;
        renderAttachments(page);
        addLog(`Attached ${file.name} (${data.kind})`);
    } catch (err) {
        const idx = list.indexOf(placeholder);
        if (idx >= 0) list.splice(idx, 1);
        renderAttachments(page);
        showToast(`Upload failed: ${err.message}`);
    }
}

function renderAttachments(page) {
    const stripId = page === 'chat' ? 'chat-attachments' : page === 'image' ? 'vision-attachments' : 'audio-attachments';
    const el = document.getElementById(stripId);
    if (!el) return;
    el.innerHTML = '';
    const list = window.attachments[page];
    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const chip = document.createElement('span');
        chip.className = `attachment-chip kind-${a.kind || 'text'}` + (a.uploading ? ' uploading' : '');
        if (a.indexing) chip.classList.add('uploading');
        const icon = a.kind === 'image' ? '🖼'
            : a.uploading ? '⏳'
            : a.indexing ? '⏳'
            : '📄';
        // Index button only on chat page, only for text attachments that
        // aren't currently uploading/indexing. RAG itself is exposed via
        // window.AIHubRAG (loaded on Text Generation page only).
        const showIndexBtn = page === 'chat'
            && a.kind === 'text'
            && !a.uploading
            && !a.indexing
            && typeof window.AIHubRAG !== 'undefined';
        const indexBtn = showIndexBtn
            ? `<button class="chip-index" type="button" data-idx="${i}" data-page="${page}" title="${escapeAttrLocal(window.t ? window.t('rag_index_title') : 'Index for retrieval (RAG)')}">📚</button>`
            : '';
        chip.innerHTML = `
            <span>${icon}</span>
            <span class="chip-name" title="${escapeAttrLocal(a.filename)}">${escapeHtmlLocal(a.filename)}</span>
            ${indexBtn}
            <button class="chip-remove" type="button" data-idx="${i}" data-page="${page}">×</button>
        `;
        el.appendChild(chip);
    }
    el.querySelectorAll('.chip-remove').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.idx, 10);
            window.attachments[page].splice(idx, 1);
            renderAttachments(page);
        };
    });
    el.querySelectorAll('.chip-index').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.idx, 10);
            indexOne(page, idx);
        };
    });
}

async function indexOne(page, idx) {
    const list = window.attachments[page];
    const att = list[idx];
    if (!att || att.kind !== 'text' || att.indexing) return;
    if (!window.AIHubRAG) {
        showToast('RAG not available on this page');
        return;
    }
    att.indexing = true;
    renderAttachments(page);
    try {
        const doc = await window.AIHubRAG.indexAttachment(att);
        // Remove the chip once indexed; the doc lives in the KB modal now.
        const realIdx = list.indexOf(att);
        if (realIdx >= 0) list.splice(realIdx, 1);
        renderAttachments(page);
        if (typeof window.refreshKBPanel === 'function') window.refreshKBPanel();
        addLog(`Indexed ${doc.filename} (${doc.chunks.length} chunks)`);
        showToast(`Indexed ${doc.filename}`);
    } catch (err) {
        att.indexing = false;
        renderAttachments(page);
        showToast(`Index failed: ${err.message}`);
    }
}

// Builds the prompt + image_url for a chat request, given the current message.
// Returns { prompt, imageDataUri } where imageDataUri is non-empty if the user
// attached an image (used for /api/vision or /api/multimodal).
window.buildChatPayload = function (page, userMessage) {
    const list = window.attachments[page] || [];
    let imageDataUri = '';
    const textBlocks = [];

    for (const a of list) {
        if (a.uploading) continue;
        if (a.kind === 'image') {
            // Only one image gets attached to the request (vision endpoints
            // accept one image_url per turn). Subsequent images are ignored.
            if (!imageDataUri) imageDataUri = a.content;
        } else if (a.kind === 'text') {
            textBlocks.push(`### Attached file: ${a.filename}\n\n${a.content}`);
        }
    }

    let prompt = userMessage || '';
    if (textBlocks.length > 0) {
        prompt = textBlocks.join('\n\n---\n\n') + '\n\n---\n\n' + (userMessage || '(see attached file(s))');
    }
    return { prompt, imageDataUri };
};

window.clearAttachments = (page) => {
    window.attachments[page] = [];
    renderAttachments(page);
};

function escapeHtmlLocal(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
}
function escapeAttrLocal(s) {
    return String(s || '').replace(/"/g, '&quot;').replace(/&/g, '&amp;');
}
