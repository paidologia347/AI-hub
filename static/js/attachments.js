// ===== File Attachments =====
// Per-page attachment lists. Each entry is returned by POST /api/upload:
// { kind: 'image'|'text', filename, size, content }

window.attachments = { chat: [], image: [], audio: [] };

const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

window.handleChatFileSelect = (event) => handleFileSelect(event, 'chat');
window.handleImageFileSelect = (event) => handleFileSelect(event, 'image');

async function handleFileSelect(event, page) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    for (const file of files) await uploadOne(file, page);
}

async function uploadOne(file, page) {
    const list = window.attachments[page];
    const totalSize = list.reduce((sum, attachment) => sum + (attachment.size || 0), 0);
    if (totalSize + file.size > MAX_TOTAL_BYTES) {
        showToast(`Total attachments would exceed ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)} MB`);
        return;
    }

    const placeholder = { filename: file.name, size: file.size, kind: 'pending', uploading: true };
    list.push(placeholder);
    renderAttachments(page);

    try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const index = list.indexOf(placeholder);
        if (index >= 0) list[index] = data;
        renderAttachments(page);
        addLog(`Attached ${file.name} (${data.kind})`);
    } catch (error) {
        const index = list.indexOf(placeholder);
        if (index >= 0) list.splice(index, 1);
        renderAttachments(page);
        showToast(`Upload failed: ${error.message}`);
    }
}

function renderAttachments(page) {
    const stripId = page === 'chat' ? 'chat-attachments' : page === 'image' ? 'vision-attachments' : 'audio-attachments';
    const element = document.getElementById(stripId);
    if (!element) return;

    element.innerHTML = '';
    const list = window.attachments[page];
    for (let index = 0; index < list.length; index++) {
        const attachment = list[index];
        const chip = document.createElement('span');
        chip.className = `attachment-chip kind-${attachment.kind || 'text'}` + (attachment.uploading ? ' uploading' : '');
        const icon = attachment.kind === 'image' ? 'IMG' : attachment.uploading ? '...' : 'FILE';
        chip.innerHTML = `
            <span>${icon}</span>
            <span class="chip-name" title="${escapeAttrLocal(attachment.filename)}">${escapeHtmlLocal(attachment.filename)}</span>
            <button class="chip-remove" type="button" data-idx="${index}" data-page="${page}">x</button>
        `;
        element.appendChild(chip);
    }

    element.querySelectorAll('.chip-remove').forEach(button => {
        button.onclick = () => {
            const index = parseInt(button.dataset.idx, 10);
            window.attachments[page].splice(index, 1);
            renderAttachments(page);
        };
    });
}

window.buildChatPayload = function (page, userMessage) {
    const list = window.attachments[page] || [];
    const textBlocks = [];

    for (const attachment of list) {
        if (attachment.uploading) continue;
        if (attachment.kind === 'image') {
            textBlocks.push(`### Attached image: ${attachment.filename}\n\n[Image uploaded as data URI. Use a vision-capable model to analyze image content.]`);
        } else if (attachment.kind === 'text') {
            textBlocks.push(`### Attached file: ${attachment.filename}\n\n${attachment.content}`);
        }
    }

    let prompt = userMessage || '';
    if (textBlocks.length > 0) {
        prompt = textBlocks.join('\n\n---\n\n') + '\n\n---\n\n' + (userMessage || '(see attached file(s))');
    }
    return { prompt, imageDataUri: '' };
};

window.clearAttachments = (page) => {
    window.attachments[page] = [];
    renderAttachments(page);
};

function escapeHtmlLocal(value) {
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
}

function escapeAttrLocal(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
