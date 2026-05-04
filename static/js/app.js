// ===== Page Navigation =====
function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.topbar-tab').forEach(t => t.classList.remove('active'));

    const page = document.getElementById(`page-${pageId}`);
    if (page) page.classList.add('active');

    document.querySelectorAll(`.nav-item[data-page="${pageId}"]`).forEach(n => n.classList.add('active'));
    document.querySelectorAll(`.topbar-tab[data-page="${pageId}"]`).forEach(t => t.classList.add('active'));

    addLog(`Switched to ${pageId.replace(/-/g, ' ')}`);
}

// ===== Utilities =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderMarkdown(text) {
    try {
        const html = marked.parse(text, { breaks: true, gfm: true });
        const template = document.createElement('template');
        template.innerHTML = html;
        template.content.querySelectorAll('script,iframe,object,embed,form').forEach(el => el.remove());
        template.content.querySelectorAll('*').forEach(el => {
            for (const attr of [...el.attributes]) {
                if (attr.name.startsWith('on') || attr.value.trim().toLowerCase().startsWith('javascript:')) {
                    el.removeAttribute(attr.name);
                }
            }
        });
        return template.innerHTML;
    } catch {
        return escapeHtml(text);
    }
}

// Read an error detail from a Response without throwing on empty/non-JSON
// bodies. Always returns a string suitable for display.
async function readErrorDetail(response) {
    let text = '';
    try {
        text = await response.text();
    } catch {
        return `HTTP ${response.status}`;
    }
    if (!text) return `HTTP ${response.status}`;
    try {
        const data = JSON.parse(text);
        if (data && typeof data === 'object') {
            return data.detail || data.message || data.error || text;
        }
    } catch {
        // not JSON, fall through
    }
    return text;
}

function processSSELines(buffer, chunk, callback) {
    buffer += chunk;
    const parts = buffer.split('\n');
    const remainder = parts.pop();
    for (const line of parts) {
        if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
                const parsed = JSON.parse(data);
                if (parsed.content) callback(parsed.content);
            } catch {}
        }
    }
    return remainder;
}

function addLog(msg) {
    const logs = document.getElementById('logs-area');
    if (!logs) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    entry.textContent = `[${time}] ${msg}`;
    logs.prepend(entry);
    if (logs.children.length > 20) logs.lastChild.remove();
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#00d4ff;color:#000;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:600;z-index:200;animation:fadeIn .3s ease';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// ===== Chat =====
let isStreaming = false;

function setPrompt(text) {
    document.getElementById('chat-input').value = text;
    document.getElementById('chat-input').focus();
}

function handleChatKeydown(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        sendChat();
    }
}

function addMessage(role, content) {
    const container = document.getElementById('chat-messages');
    const placeholder = container.querySelector('.chat-placeholder');
    if (placeholder) placeholder.remove();

    const div = document.createElement('div');
    div.className = `message ${role}`;
    const avatarText = role === 'user' ? 'U' : 'AI';
    div.innerHTML = `
        <div class="msg-avatar">${avatarText}</div>
        <div class="msg-bubble">${role === 'user' ? escapeHtml(content) : content}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

async function sendChat() {
    if (isStreaming) return;
    const input = document.getElementById('chat-input');
    const userMessage = input.value.trim();
    const attachList = (window.attachments && window.attachments.chat) || [];
    if (!userMessage && attachList.length === 0) return;

    input.value = '';

    // Take the streaming guard immediately, before any async work, so a
    // double-click on Generate (or a Ctrl+Enter spam) during the RAG
    // embedding round-trip can't fire a duplicate submission.
    isStreaming = true;
    document.getElementById('send-btn').disabled = true;

    const model = document.getElementById('chat-model').value;
    let systemPrompt = document.getElementById('system-prompt').value;
    const temperature = parseFloat(document.getElementById('chat-temp').value);

    // RAG: if any indexed files exist, retrieve top-K matching chunks and
    // prepend them to the system prompt as additional context. Failures are
    // non-fatal — we just continue without retrieved context.
    if (window.AIHubRAG && window.AIHubRAG.stats().chunks > 0 && userMessage) {
        try {
            const { contextText, hits } = await window.AIHubRAG.retrieveContext(userMessage);
            if (contextText) {
                systemPrompt = (systemPrompt ? systemPrompt + '\n\n' : '') + contextText;
                addLog(`RAG: ${hits.length} chunk${hits.length > 1 ? 's' : ''} from ${
                    new Set(hits.map(h => h.filename)).size
                } file(s) retrieved`);
            }
        } catch (err) {
            addLog(`RAG retrieve failed: ${err.message}`);
        }
    }

    // Combine the user's typed message with any extracted file text. If an
    // image was attached, route to /api/vision (or /api/multimodal for omni).
    const built = (typeof window.buildChatPayload === 'function')
        ? window.buildChatPayload('chat', userMessage)
        : { prompt: userMessage, imageDataUri: '' };
    // Fallback: if no image attached, allow the existing URL input to act as one.
    if (!built.imageDataUri) {
        const urlInput = document.getElementById('chat-image-url');
        if (urlInput && urlInput.value.trim()) built.imageDataUri = urlInput.value.trim();
    }

    const displayMsg = userMessage + (attachList.length > 0
        ? `\n\n_(with ${attachList.length} attachment${attachList.length > 1 ? 's' : ''})_`
        : '');
    addMessage('user', displayMsg);
    if (typeof window.recordChatMessage === 'function') {
        window.recordChatMessage('user', escapeHtml(displayMsg));
    }

    const provider = (typeof window.providerForModel === 'function')
        ? window.providerForModel(model) : 'dashscope';
    const providerPayload = (typeof window.getProviderPayload === 'function')
        ? window.getProviderPayload(provider) : {};

    const msgDiv = addMessage('assistant', '<span style="opacity:0.4">Generating...</span>');
    const bubble = msgDiv.querySelector('.msg-bubble');

    addLog(`Chat request: ${model} (${provider})`);

    const startTime = Date.now();

    try {
        let endpoint = '/api/chat';
        let body = {
            message: built.prompt,
            model,
            system_prompt: systemPrompt,
            temperature,
            stream: true,
            ...providerPayload,
        };

        // Routing based on model + attachments:
        //   1. Qwen Omni: /api/multimodal (handles text+image+audio)
        //   2. Image attached + non-omni model: /api/vision
        //   3. Otherwise: /api/chat
        if (model === 'qwen3-omni-flash') {
            endpoint = '/api/multimodal';
            body = { message: built.prompt, image_url: built.imageDataUri, model, stream: true, ...providerPayload };
        } else if (built.imageDataUri) {
            endpoint = '/api/vision';
            // Pick a vision model on the same provider when possible.
            const visionModel = pickVisionModelForProvider(provider) || 'qwen3.6-plus';
            const visionProvider = (typeof window.providerForModel === 'function')
                ? window.providerForModel(visionModel) : 'dashscope';
            const visionPayload = (typeof window.getProviderPayload === 'function')
                ? window.getProviderPayload(visionProvider) : {};
            body = { message: built.prompt, image_url: built.imageDataUri, model: visionModel, stream: true, ...visionPayload };
            addLog(`Vision routed to ${visionModel} (${visionProvider})`);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            bubble.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(detail)}</span>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let sseBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            sseBuffer = processSSELines(sseBuffer, chunk, (content) => {
                fullText += content;
                bubble.innerHTML = renderMarkdown(fullText);
            });
            document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
        }

        bubble.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));

        const latency = Date.now() - startTime;
        document.getElementById('stat-latency').textContent = `${latency}ms`;
        document.getElementById('stat-tokens').textContent = `~${Math.ceil(fullText.length / 4)}`;
        addLog(`Response: ${latency}ms, ~${Math.ceil(fullText.length / 4)} tokens`);
        if (typeof window.recordChatMessage === 'function' && fullText) {
            window.recordChatMessage('assistant', bubble.innerHTML);
        }
    } catch (err) {
        bubble.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
        isStreaming = false;
        document.getElementById('send-btn').disabled = false;
        if (typeof window.clearAttachments === 'function') window.clearAttachments('chat');
    }
}

// Pick a vision-capable model id from the same provider as ``provider``.
// Falls back to qwen3.6-plus (DashScope) when none is configured.
function pickVisionModelForProvider(provider) {
    const cat = (window.AI_MODELS && window.AI_MODELS.vision) || [];
    const sameProvider = cat.find(m => m.provider === provider);
    if (sameProvider) return sameProvider.id;
    // Find any vision model on a configured provider.
    for (const m of cat) {
        if (typeof window.getProviderPayload === 'function') {
            const p = window.getProviderPayload(m.provider);
            if (p.api_key) return m.id;
        }
    }
    return cat[0] ? cat[0].id : 'qwen3.6-plus';
}

// Refresh all model dropdowns on the page based on currently configured
// providers. Called on init and after any provider key change.
window.refreshAllModelDropdowns = function () {
    // Only repopulate the dynamic OAI-compatible dropdowns. Native DashScope
    // selects (image/video/tts) keep their hardcoded options because those
    // endpoints are DashScope-only.
    const targets = [
        { id: 'chat-model', categories: ['text', 'multimodal'] },
        { id: 'vision-model', categories: ['vision'] },
    ];
    for (const t of targets) {
        const el = document.getElementById(t.id);
        if (el && typeof window.populateModelSelect === 'function') {
            const prev = el.value;
            window.populateModelSelect(el, t.categories, { onlyConfigured: true });
            if (prev && [...el.options].some(o => o.value === prev)) el.value = prev;
            el.dispatchEvent(new Event('change'));
        }
    }
    // Show a hint on the chat model selector if the chosen model is from a
    // provider without a configured key.
    const chatHint = document.getElementById('chat-model-hint');
    const chatModel = document.getElementById('chat-model');
    if (chatHint && chatModel && chatModel.value && typeof window.providerForModel === 'function') {
        const prov = window.providerForModel(chatModel.value);
        const payload = window.getProviderPayload(prov);
        const provInfo = (window.PROVIDERS || []).find(p => p.id === prov);
        const hasKey = !!payload.api_key || !!(provInfo && provInfo.env_set);
        if (!hasKey) {
            chatHint.style.display = 'block';
            chatHint.textContent = `⚠ Set a ${(provInfo && provInfo.name) || prov} API key on the API Management page.`;
        } else {
            chatHint.style.display = 'none';
        }
    }
};

// ===== TTS =====
// All Qwen3-TTS-Flash voices speak Chinese, English, French, German, Russian,
// Italian, Spanish, Portuguese, Japanese and Korean. Use the LANGUAGE selector
// (or Auto) to control pronunciation/intonation.
const QWEN3_TTS_VOICES = [
    { value: 'Cherry',    label: 'Cherry (Female, warm)' },
    { value: 'Serena',    label: 'Serena (Female, gentle)' },
    { value: 'Chelsie',   label: 'Chelsie (Female, soft)' },
    { value: 'Momo',      label: 'Momo (Female, lively)' },
    { value: 'Vivian',    label: 'Vivian (Female, mature)' },
    { value: 'Bella',     label: 'Bella (Female, sweet)' },
    { value: 'Jennifer',  label: 'Jennifer (Female, elegant)' },
    { value: 'Katerina',  label: 'Katerina (Female, intense)' },
    { value: 'Maia',      label: 'Maia (Female, youthful)' },
    { value: 'Moon',      label: 'Moon (Female, bright)' },
    { value: 'Ethan',     label: 'Ethan (Male, sunny)' },
    { value: 'Ryan',      label: 'Ryan (Male, smooth)' },
    { value: 'Kai',       label: 'Kai (Male, deep)' },
    { value: 'Aiden',     label: 'Aiden (Male, magnetic)' },
    { value: 'Nofish',    label: 'Nofish (Male, casual)' },
];

function updateTTSVoices() {
    const voiceSelect = document.getElementById('tts-voice');
    if (!voiceSelect) return;
    voiceSelect.innerHTML = '';
    for (const v of QWEN3_TTS_VOICES) {
        const opt = document.createElement('option');
        opt.value = v.value;
        opt.textContent = v.label;
        voiceSelect.appendChild(opt);
    }
}

async function generateTTS() {
    const text = document.getElementById('tts-text').value.trim();
    if (!text) return;

    const provider = document.getElementById('tts-provider').value;
    const voice = document.getElementById('tts-voice').value;
    const langEl = document.getElementById('tts-language');
    const language = langEl ? langEl.value : 'Auto';
    const btn = document.getElementById('tts-btn');

    btn.disabled = true;
    btn.innerHTML = '<span>Generating...</span>';
    addLog(`TTS request: ${provider} (${language})`);

    try {
        const dsKey = (typeof window.getProviderPayload === 'function')
            ? (window.getProviderPayload('dashscope').api_key || '') : '';
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, provider, voice, language, api_key: dsKey }),
        });

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            alert('TTS Error: ' + detail);
            return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = document.getElementById('tts-audio');
        if (audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
        audio.src = url;
        document.getElementById('tts-result').classList.remove('hidden');
        audio.play();
        addLog('TTS audio generated');
    } catch (err) {
        alert('Error: ' + (err && err.message ? err.message : String(err)));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg><span>Generate Speech</span>';
    }
}

// ===== Content Generator =====
async function generateContent() {
    const topic = document.getElementById('content-topic').value.trim();
    if (!topic) return;

    const contentType = document.getElementById('content-type').value;
    const tone = document.getElementById('content-tone').value;
    const language = document.getElementById('content-lang').value;
    const btn = document.getElementById('content-btn');
    const resultDiv = document.getElementById('content-result');
    const outputDiv = document.getElementById('content-output');

    btn.disabled = true;
    btn.innerHTML = '<span>Generating...</span>';
    resultDiv.classList.remove('hidden');
    outputDiv.innerHTML = '<span style="opacity:0.4">Generating content...</span>';
    addLog(`Content request: ${contentType}`);

    try {
        const provider = (typeof window.providerForModel === 'function')
            ? window.providerForModel('qwen-plus') : 'dashscope';
        const providerPayload = (typeof window.getProviderPayload === 'function')
            ? window.getProviderPayload(provider) : {};
        const response = await fetch('/api/content/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, content_type: contentType, tone, language, ...providerPayload }),
        });

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            outputDiv.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(detail)}</span>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let sseBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            sseBuffer = processSSELines(sseBuffer, chunk, (content) => {
                fullText += content;
                outputDiv.innerHTML = renderMarkdown(fullText);
            });
        }

        outputDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        addLog('Content generated');
    } catch (err) {
        outputDiv.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Generate Content</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>';
    }
}

function copyContent() {
    const text = document.getElementById('content-output').innerText;
    navigator.clipboard.writeText(text);
    showToast('Content copied!');
}

// ===== Image Generator =====
let imageCount = 0;

async function generateImage() {
    const prompt = document.getElementById('img-prompt').value.trim();
    if (!prompt) return;

    const model = document.getElementById('img-model').value;
    const size = document.getElementById('img-size').value;
    const btn = document.getElementById('img-btn');

    btn.disabled = true;
    btn.innerHTML = '<span>Generating...</span>';
    addLog(`Image request: ${model}`);

    try {
        const dsKey = (typeof window.getProviderPayload === 'function')
            ? (window.getProviderPayload('dashscope').api_key || '') : '';
        const response = await fetch('/api/image/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model, size, api_key: dsKey }),
        });

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            alert('Error: ' + detail);
            return;
        }

        const data = await response.json();
        const grid = document.getElementById('gallery-grid');
        const placeholder = grid.querySelector('.gallery-placeholder');
        if (placeholder) placeholder.remove();

        const item = document.createElement('div');
        item.className = 'gallery-item';
        const img = document.createElement('img');
        let imgSrc = '';
        if (data.url) imgSrc = data.url;
        else if (data.b64_json) imgSrc = `data:image/png;base64,${data.b64_json}`;
        img.src = imgSrc;
        img.alt = prompt;
        item.appendChild(img);

        const overlay = document.createElement('div');
        overlay.className = 'gallery-overlay';
        const dlBtn = document.createElement('button');
        dlBtn.className = 'gallery-action-btn';
        dlBtn.title = 'Download image';
        dlBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>';
        dlBtn.onclick = (e) => {
            e.stopPropagation();
            const filename = `aihub-image-${Date.now()}.png`;
            downloadUrl(imgSrc, filename);
        };
        overlay.appendChild(dlBtn);
        item.appendChild(overlay);
        grid.prepend(item);

        imageCount++;
        document.getElementById('gallery-count').textContent = `${imageCount} image${imageCount > 1 ? 's' : ''}`;
        addLog('Image generated');
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Generate Image</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>';
    }
}

function enhancePrompt() {
    const prompt = document.getElementById('img-prompt').value.trim();
    if (!prompt) return;
    document.getElementById('img-prompt').value = prompt + ', highly detailed, 8k resolution, cinematic lighting, photorealistic, masterpiece';
    addLog('Prompt enhanced');
}

// ===== Visual Understanding =====
async function analyzeImage() {
    const imageUrl = document.getElementById('vision-url').value.trim();
    const question = document.getElementById('vision-prompt').value.trim();
    if (!imageUrl || !question) {
        alert('Please provide both an image URL and a question.');
        return;
    }

    const btn = document.getElementById('vision-btn');
    const resultDiv = document.getElementById('vision-result');
    const outputDiv = document.getElementById('vision-output');

    btn.disabled = true;
    btn.innerHTML = '<span>Analyzing...</span>';
    resultDiv.classList.remove('hidden');
    outputDiv.innerHTML = '<span style="opacity:0.4">Analyzing image...</span>';
    addLog('Vision analysis: qwen3.6-plus');

    try {
        const visionModel = (document.getElementById('vision-model') && document.getElementById('vision-model').value) || 'qwen3.6-plus';
        const provider = (typeof window.providerForModel === 'function')
            ? window.providerForModel(visionModel) : 'dashscope';
        const providerPayload = (typeof window.getProviderPayload === 'function')
            ? window.getProviderPayload(provider) : {};
        const response = await fetch('/api/vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: question, image_url: imageUrl, model: visionModel, stream: true, ...providerPayload }),
        });

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            outputDiv.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(detail)}</span>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let sseBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            sseBuffer = processSSELines(sseBuffer, chunk, (content) => {
                fullText += content;
                outputDiv.innerHTML = renderMarkdown(fullText);
            });
        }

        outputDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        addLog('Vision analysis complete');
    } catch (err) {
        outputDiv.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><span>Analyze Image</span>';
    }
}

function copyVision() {
    const text = document.getElementById('vision-output').innerText;
    navigator.clipboard.writeText(text);
    showToast('Analysis copied!');
}

// ===== Video Generation =====
document.addEventListener('DOMContentLoaded', () => {
    const videoModel = document.getElementById('video-model');
    if (videoModel) {
        videoModel.addEventListener('change', () => {
            const imageGroup = document.getElementById('video-image-group');
            if (videoModel.value === 'wan2.7-i2v') {
                imageGroup.classList.remove('hidden');
            } else {
                imageGroup.classList.add('hidden');
            }
        });
    }
});

async function generateVideo() {
    const prompt = document.getElementById('video-prompt').value.trim();
    if (!prompt) return;

    const model = document.getElementById('video-model').value;
    const duration = parseInt(document.getElementById('video-duration').value);
    const resolution = document.getElementById('video-resolution').value;
    const ratio = document.getElementById('video-ratio').value;
    const imageUrl = document.getElementById('video-image-url').value.trim();

    const btn = document.getElementById('video-btn');
    const statusDiv = document.getElementById('video-status');
    const statusText = document.getElementById('video-status-text');
    const resultDiv = document.getElementById('video-result');

    btn.disabled = true;
    btn.innerHTML = '<span>Submitting...</span>';
    statusDiv.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    statusText.textContent = 'Submitting video generation task...';
    addLog(`Video request: ${model}`);

    try {
        const body = { prompt, model, duration, resolution, ratio };
        if (imageUrl && model === 'wan2.7-i2v') {
            body.image_url = imageUrl;
        }

        const dsKey = (typeof window.getProviderPayload === 'function')
            ? (window.getProviderPayload('dashscope').api_key || '') : '';
        body.api_key = dsKey;
        const response = await fetch('/api/video/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            statusText.textContent = 'Error: ' + detail;
            statusDiv.querySelector('.task-spinner').style.display = 'none';
            return;
        }

        const data = await response.json();
        const taskId = data.task_id;
        statusText.textContent = `Task submitted (${taskId.slice(0, 8)}...). Generating video...`;
        addLog(`Video task: ${taskId}`);

        await pollVideoStatus(taskId);
    } catch (err) {
        statusText.textContent = 'Error: ' + err.message;
        statusDiv.querySelector('.task-spinner').style.display = 'none';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Generate Video</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>';
    }
}

async function pollVideoStatus(taskId) {
    const statusText = document.getElementById('video-status-text');
    const statusDiv = document.getElementById('video-status');
    const resultDiv = document.getElementById('video-result');
    const player = document.getElementById('video-player');

    const maxPolls = 100;
    for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, 3000));

        try {
            const dsKey = (typeof window.getProviderPayload === 'function')
                ? (window.getProviderPayload('dashscope').api_key || '') : '';
            const resp = await fetch(`/api/video/status/${taskId}` + (dsKey ? `?api_key=${encodeURIComponent(dsKey)}` : ''));
            const data = await resp.json();

            if (data.status === 'SUCCEEDED') {
                statusDiv.classList.add('hidden');
                resultDiv.classList.remove('hidden');
                player.src = data.video_url;
                const dlBtn = document.getElementById('video-download-btn');
                if (dlBtn) dlBtn.style.display = '';
                addLog('Video generated successfully');
                return;
            }

            if (data.status === 'FAILED') {
                statusText.textContent = 'Failed: ' + (data.error || 'Unknown error');
                statusDiv.querySelector('.task-spinner').style.display = 'none';
                addLog('Video generation failed');
                return;
            }

            statusText.textContent = `Generating video... (${(i + 1) * 3}s elapsed)`;
        } catch (err) {
            statusText.textContent = 'Poll error: ' + err.message;
        }
    }

    statusText.textContent = 'Timed out waiting for video generation.';
    statusDiv.querySelector('.task-spinner').style.display = 'none';
}

// ===== Speech Recognition =====
async function transcribeAudio() {
    const audioUrl = document.getElementById('asr-url').value.trim();
    if (!audioUrl) {
        alert('Please provide an audio file URL.');
        return;
    }

    const model = document.getElementById('asr-model').value;
    const btn = document.getElementById('asr-btn');
    const statusDiv = document.getElementById('asr-status');
    const statusText = document.getElementById('asr-status-text');
    const resultDiv = document.getElementById('asr-result');

    btn.disabled = true;
    btn.innerHTML = '<span>Submitting...</span>';
    statusDiv.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    statusText.textContent = 'Submitting transcription task...';
    addLog(`ASR request: ${model}`);

    try {
        const formData = new FormData();
        formData.append('audio_url', audioUrl);
        formData.append('model', model);
        const dsKey = (typeof window.getProviderPayload === 'function')
            ? (window.getProviderPayload('dashscope').api_key || '') : '';
        if (dsKey) formData.append('api_key', dsKey);

        const response = await fetch('/api/asr', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            statusText.textContent = 'Error: ' + detail;
            statusDiv.querySelector('.task-spinner').style.display = 'none';
            return;
        }

        const data = await response.json();
        const taskId = data.task_id;
        statusText.textContent = `Task submitted (${taskId.slice(0, 8)}...). Transcribing...`;
        addLog(`ASR task: ${taskId}`);

        await pollASRStatus(taskId);
    } catch (err) {
        statusText.textContent = 'Error: ' + err.message;
        statusDiv.querySelector('.task-spinner').style.display = 'none';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z"/></svg><span>Transcribe Audio</span>';
    }
}

async function pollASRStatus(taskId) {
    const statusText = document.getElementById('asr-status-text');
    const statusDiv = document.getElementById('asr-status');
    const resultDiv = document.getElementById('asr-result');
    const outputDiv = document.getElementById('asr-output');

    const maxPolls = 100;
    for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, 3000));

        try {
            const dsKey = (typeof window.getProviderPayload === 'function')
                ? (window.getProviderPayload('dashscope').api_key || '') : '';
            const resp = await fetch(`/api/asr/status/${taskId}` + (dsKey ? `?api_key=${encodeURIComponent(dsKey)}` : ''));
            const data = await resp.json();

            if (data.status === 'SUCCEEDED') {
                statusDiv.classList.add('hidden');
                resultDiv.classList.remove('hidden');
                outputDiv.textContent = data.transcript || 'No transcript available.';
                addLog('Transcription complete');
                return;
            }

            if (data.status === 'FAILED') {
                statusText.textContent = 'Failed: ' + (data.error || 'Unknown error');
                statusDiv.querySelector('.task-spinner').style.display = 'none';
                addLog('Transcription failed');
                return;
            }

            statusText.textContent = `Transcribing... (${(i + 1) * 3}s elapsed)`;
        } catch (err) {
            statusText.textContent = 'Poll error: ' + err.message;
        }
    }

    statusText.textContent = 'Timed out waiting for transcription.';
    statusDiv.querySelector('.task-spinner').style.display = 'none';
}

function copyASR() {
    const text = document.getElementById('asr-output').innerText;
    navigator.clipboard.writeText(text);
    showToast('Transcript copied!');
}

// ===== Marketing Copy =====
function updateMarketingTemplate() {
    const template = document.getElementById('mkt-template').value;
    const details = document.getElementById('mkt-details');
    const placeholders = {
        'product': 'Key features, benefits, target audience, price point...',
        'landing': 'Main value proposition, target audience, key benefits, CTA...',
        'headline': 'Product/service description, target emotion, key benefit...',
        'cta': 'What action you want users to take, urgency factor...',
        'brand': 'Brand origin, mission, values, target audience...',
    };
    details.placeholder = placeholders[template] || '';
}

async function generateMarketing() {
    const product = document.getElementById('mkt-product').value.trim();
    const details = document.getElementById('mkt-details').value.trim();
    if (!product) return;

    const template = document.getElementById('mkt-template').value;
    const language = document.getElementById('mkt-lang').value;
    const btn = document.getElementById('mkt-btn');
    const resultDiv = document.getElementById('mkt-result');
    const outputDiv = document.getElementById('mkt-output');

    const prompts = {
        'product': `Write a compelling product description for "${product}". Details: ${details}. Language: ${language}. Include: headline, key features (as bullet points), benefits, and a closing CTA.`,
        'landing': `Write landing page copy for "${product}". Details: ${details}. Language: ${language}. Include: hero headline, subheadline, 3 feature sections, social proof, FAQ, and CTA.`,
        'headline': `Generate 10 powerful headlines and taglines for "${product}". Details: ${details}. Language: ${language}. Mix emotional, benefit-driven, and curiosity-based approaches.`,
        'cta': `Create 10 call-to-action variations for "${product}". Details: ${details}. Language: ${language}. Include button text, supporting copy, and urgency elements.`,
        'brand': `Write a brand story for "${product}". Details: ${details}. Language: ${language}. Include: origin story, mission, vision, values, and brand voice guidelines.`,
    };

    btn.disabled = true;
    btn.innerHTML = '<span>Generating...</span>';
    resultDiv.classList.remove('hidden');
    outputDiv.innerHTML = '<span style="opacity:0.4">Generating copy...</span>';
    addLog(`Marketing request: ${template}`);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: prompts[template],
                model: 'qwen-plus',
                system_prompt: 'You are an expert marketing copywriter. Create professional, persuasive marketing content. Use markdown formatting.',
                temperature: 0.8,
                stream: true,
            }),
        });

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            outputDiv.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(detail)}</span>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let sseBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            sseBuffer = processSSELines(sseBuffer, chunk, (content) => {
                fullText += content;
                outputDiv.innerHTML = renderMarkdown(fullText);
            });
        }

        outputDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        addLog('Marketing copy generated');
    } catch (err) {
        outputDiv.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Generate Copy</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>';
    }
}

function copyMarketing() {
    const text = document.getElementById('mkt-output').innerText;
    navigator.clipboard.writeText(text);
    showToast('Marketing copy copied!');
}

// ===== Download Helpers =====
// downloadUrl: triggers a browser download for any URL. Tries the simple
// <a download=...> path first, then falls back to fetching the resource as
// a Blob (needed for cross-origin URLs from DashScope OSS).
window.downloadUrl = async function (url, filename) {
    if (!url) { showToast('Nothing to download'); return; }
    try {
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            triggerDownload(url, filename);
            return;
        }
        // Cross-origin: fetch as blob so the file actually saves with the
        // chosen filename instead of opening in a new tab.
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err) {
        // CORS-blocked fallback: open in new tab and let the user save.
        window.open(url, '_blank', 'noopener');
        addLog(`Download fallback (new tab): ${err.message}`);
    }
};

function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `aihub-${Date.now()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

window.downloadVideo = function () {
    const player = document.getElementById('video-player');
    if (!player || !player.src) { showToast('No video to download'); return; }
    window.downloadUrl(player.src, `aihub-video-${Date.now()}.mp4`);
};

window.downloadTTS = function () {
    const audio = document.getElementById('tts-audio');
    if (!audio || !audio.src) { showToast('No audio to download'); return; }
    window.downloadUrl(audio.src, `aihub-tts-${Date.now()}.mp3`);
};

// ===== Chat History (multi-conversation, see history.js) =====
// The chat page renders the *active* conversation from AIHubHistory. Other
// pages keep their existing storage; this is text-generation specific.

function renderActiveConversationInto(container) {
    if (!window.AIHubHistory) return;
    const conv = window.AIHubHistory.activeConversation();
    container.innerHTML = '';
    if (!conv || conv.messages.length === 0) {
        container.innerHTML = `
            <div class="chat-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                <p>${window.t ? window.t('chat_placeholder_p') : 'Send a message to start generating'}</p>
                <span>${window.t ? window.t('chat_placeholder_span') : 'Select a model and configure parameters'}</span>
            </div>`;
        return;
    }
    for (const m of conv.messages) {
        const div = document.createElement('div');
        div.className = `message ${m.role}`;
        const avatarText = m.role === 'user' ? 'U' : 'AI';
        div.innerHTML = `
            <div class="msg-avatar">${avatarText}</div>
            <div class="msg-bubble">${m.html}</div>
        `;
        container.appendChild(div);
        if (m.role === 'assistant') {
            div.querySelectorAll('pre code').forEach(block => {
                if (window.hljs) hljs.highlightElement(block);
            });
        }
    }
    container.scrollTop = container.scrollHeight;
}

function restoreActiveConversation() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    renderActiveConversationInto(container);
    updateChatHistoryInfo();
}
window.restoreActiveConversation = restoreActiveConversation;

function updateChatHistoryInfo() {
    const info = document.getElementById('chat-history-info');
    if (!info || !window.AIHubHistory) return;
    const conv = window.AIHubHistory.activeConversation();
    const count = conv ? conv.messages.length : 0;
    if (count === 0) { info.textContent = ''; return; }
    const label = (typeof window.t === 'function')
        ? window.t(count > 1 ? 'msg_chat_count_many' : 'msg_chat_count_one')
        : (count > 1 ? 'messages saved' : 'message saved');
    info.textContent = `${count} ${label}`;
}
window.updateChatHistoryInfo = updateChatHistoryInfo;

// Start a fresh conversation in the sidebar (does not delete previous chats).
window.startNewChat = function () {
    if (!window.AIHubHistory) return;
    window.AIHubHistory.createConversation();
    restoreActiveConversation();
    if (typeof window.refreshHistorySidebar === 'function') window.refreshHistorySidebar();
    addLog('Started new chat');
};

// Append a message to the *active* conversation and refresh sidebar/info.
window.recordChatMessage = function (role, html) {
    if (!window.AIHubHistory) return;
    window.AIHubHistory.appendMessageToActive(role, html);
    updateChatHistoryInfo();
    if (typeof window.refreshHistorySidebar === 'function') window.refreshHistorySidebar();
};

// ===== Initialize =====
updateTTSVoices();
updateMarketingTemplate();
restoreActiveConversation();
addLog('AI Hub v3.0 initialized');
