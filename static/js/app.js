// Tab navigation
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});
document.getElementById('mobile-nav').addEventListener('change', (e) => switchTab(e.target.value));

function switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const activeTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (activeTab) activeTab.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById('mobile-nav').value = tabId;
}

// Temperature slider
const tempSlider = document.getElementById('chat-temp');
const tempValue = document.getElementById('temp-value');
tempSlider.addEventListener('input', () => { tempValue.textContent = tempSlider.value; });

// Chat
let isStreaming = false;

function setPrompt(text) {
    document.getElementById('chat-input').value = text;
    document.getElementById('chat-input').focus();
}

function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
}

function addMessage(role, content) {
    const container = document.getElementById('chat-messages');
    const placeholder = container.querySelector('.text-center');
    if (placeholder) placeholder.remove();

    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    const avatarText = role === 'user' ? 'U' : 'AI';
    div.innerHTML = `
        <div class="avatar">${avatarText}</div>
        <div class="bubble">${role === 'user' ? escapeHtml(content) : content}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderMarkdown(text) {
    try {
        const html = marked.parse(text, { breaks: true, gfm: true });
        return html;
    } catch {
        return escapeHtml(text);
    }
}

async function sendChat() {
    if (isStreaming) return;
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    addMessage('user', message);

    const model = document.getElementById('chat-model').value;
    const systemPrompt = document.getElementById('system-prompt').value;
    const temperature = parseFloat(document.getElementById('chat-temp').value);

    const msgDiv = addMessage('assistant', '<div class="typing-indicator"><span></span><span></span><span></span></div>');
    const bubble = msgDiv.querySelector('.bubble');

    isStreaming = true;
    document.getElementById('send-btn').disabled = true;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, model, system_prompt: systemPrompt, temperature, stream: true }),
        });

        if (!response.ok) {
            const err = await response.json();
            bubble.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(err.detail || 'Unknown error')}</span>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullText += parsed.content;
                            bubble.innerHTML = renderMarkdown(fullText);
                        }
                    } catch {}
                }
            }
            document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
        }

        // Highlight code blocks
        bubble.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    } catch (err) {
        bubble.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
        isStreaming = false;
        document.getElementById('send-btn').disabled = false;
    }
}

// TTS
function updateTTSVoices() {
    const provider = document.getElementById('tts-provider').value;
    const voiceSelect = document.getElementById('tts-voice');
    const voices = {
        'openai': [
            { value: 'alloy', label: 'Alloy' },
            { value: 'echo', label: 'Echo' },
            { value: 'fable', label: 'Fable' },
            { value: 'onyx', label: 'Onyx' },
            { value: 'nova', label: 'Nova' },
            { value: 'shimmer', label: 'Shimmer' },
        ],
        'aws-polly': [
            { value: 'Joanna', label: 'Joanna (EN)' },
            { value: 'Matthew', label: 'Matthew (EN)' },
            { value: 'Ivy', label: 'Ivy (EN)' },
            { value: 'Lea', label: 'Lea (FR)' },
            { value: 'Vicki', label: 'Vicki (DE)' },
            { value: 'Lucia', label: 'Lucia (ES)' },
        ],
        'elevenlabs': [
            { value: 'Rachel', label: 'Rachel' },
            { value: 'Drew', label: 'Drew' },
            { value: 'Clyde', label: 'Clyde' },
            { value: 'Paul', label: 'Paul' },
            { value: 'Domi', label: 'Domi' },
            { value: 'Dave', label: 'Dave' },
        ],
    };

    voiceSelect.innerHTML = '';
    for (const v of voices[provider] || []) {
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
    const btn = document.getElementById('tts-btn');

    btn.disabled = true;
    btn.innerHTML = '<div class="loader" style="width:1rem;height:1rem;border-width:2px;"></div> Generating...';

    try {
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, provider, voice }),
        });

        if (!response.ok) {
            const err = await response.text();
            alert('TTS Error: ' + err);
            return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = document.getElementById('tts-audio');
        audio.src = url;
        document.getElementById('tts-result').classList.remove('hidden');
        audio.play();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg> Generate Speech';
    }
}

// Content Generator
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
    btn.innerHTML = '<div class="loader" style="width:1rem;height:1rem;border-width:2px;"></div> Generating...';
    resultDiv.classList.remove('hidden');
    outputDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    try {
        const response = await fetch('/api/content/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, content_type: contentType, tone, language }),
        });

        if (!response.ok) {
            const err = await response.json();
            outputDiv.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(err.detail || 'Unknown error')}</span>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullText += parsed.content;
                            outputDiv.innerHTML = renderMarkdown(fullText);
                        }
                    } catch {}
                }
            }
        }

        outputDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    } catch (err) {
        outputDiv.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg> Generate Content';
    }
}

function copyContent() {
    const text = document.getElementById('content-output').innerText;
    navigator.clipboard.writeText(text);
    showToast('Content copied to clipboard!');
}

// Image Generator
async function generateImage() {
    const prompt = document.getElementById('img-prompt').value.trim();
    if (!prompt) return;

    const model = document.getElementById('img-model').value;
    const size = document.getElementById('img-size').value;
    const quality = document.getElementById('img-quality').value;
    const btn = document.getElementById('img-btn');

    btn.disabled = true;
    btn.innerHTML = '<div class="loader" style="width:1rem;height:1rem;border-width:2px;"></div> Generating...';

    try {
        const response = await fetch('/api/image/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model, size, quality }),
        });

        if (!response.ok) {
            const err = await response.json();
            alert('Error: ' + (err.detail || 'Unknown error'));
            return;
        }

        const data = await response.json();
        const imgEl = document.getElementById('img-output');

        if (data.url) {
            imgEl.src = data.url;
        } else if (data.b64_json) {
            imgEl.src = `data:image/png;base64,${data.b64_json}`;
        }
        document.getElementById('img-result').classList.remove('hidden');
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"/></svg> Generate Image';
    }
}

// Marketing Copy
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
        'landing': `Write landing page copy for "${product}". Details: ${details}. Language: ${language}. Include: hero headline, subheadline, 3 feature sections with icons, social proof section, FAQ, and final CTA.`,
        'headline': `Generate 10 powerful headlines and taglines for "${product}". Details: ${details}. Language: ${language}. Mix emotional, benefit-driven, and curiosity-based approaches.`,
        'cta': `Create 10 call-to-action variations for "${product}". Details: ${details}. Language: ${language}. Include button text, supporting copy, and urgency elements.`,
        'brand': `Write a brand story for "${product}". Details: ${details}. Language: ${language}. Include: origin story, mission, vision, values, and brand voice guidelines.`,
    };

    btn.disabled = true;
    btn.innerHTML = '<div class="loader" style="width:1rem;height:1rem;border-width:2px;"></div> Generating...';
    resultDiv.classList.remove('hidden');
    outputDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: prompts[template],
                model: 'gpt-4.1-nano',
                system_prompt: 'You are an expert marketing copywriter. Create professional, persuasive marketing content. Use markdown formatting.',
                temperature: 0.8,
                stream: true,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            outputDiv.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(err.detail || 'Unknown error')}</span>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullText += parsed.content;
                            outputDiv.innerHTML = renderMarkdown(fullText);
                        }
                    } catch {}
                }
            }
        }

        outputDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    } catch (err) {
        outputDiv.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Generate Copy';
    }
}

function copyMarketing() {
    const text = document.getElementById('mkt-output').innerText;
    navigator.clipboard.writeText(text);
    showToast('Marketing copy copied to clipboard!');
}

// Toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-accent-blue text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg z-50 animate-fadeIn';
    toast.style.animation = 'fadeIn 0.3s ease, fadeIn 0.3s ease reverse 1.7s forwards';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// Initialize
updateTTSVoices();
updateMarketingTemplate();
