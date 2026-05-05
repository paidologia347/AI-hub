// ===== Multi-Model Compare =====
// Send one prompt to 2-4 models in parallel, show responses side-by-side
// with synchronized scrolling.

(function () {
    'use strict';

    let compareActive = false;
    let compareAborts = [];

    function getComparePanel() { return document.getElementById('compare-panel'); }

    function show() {
        const panel = getComparePanel();
        if (panel) { panel.classList.remove('hidden'); compareActive = true; }
    }

    function hide() {
        const panel = getComparePanel();
        if (panel) { panel.classList.add('hidden'); compareActive = false; }
        stopAll();
    }

    function toggle() {
        compareActive ? hide() : show();
    }

    function stopAll() {
        compareAborts.forEach(c => { try { c.abort(); } catch {} });
        compareAborts = [];
    }

    function getSelectedModels() {
        const checks = document.querySelectorAll('.compare-model-check:checked');
        return Array.from(checks).map(c => ({
            model: c.value,
            label: c.dataset.label || c.value,
            provider: c.dataset.provider || 'dashscope',
        }));
    }

    function buildColumns(models) {
        const grid = document.getElementById('compare-grid');
        if (!grid) return;
        grid.innerHTML = '';
        grid.style.gridTemplateColumns = `repeat(${models.length}, 1fr)`;

        models.forEach((m, i) => {
            const col = document.createElement('div');
            col.className = 'compare-col';
            col.innerHTML = `
                <div class="compare-col-header">
                    <span class="compare-model-name">${window.escapeHtml ? window.escapeHtml(m.label) : m.label}</span>
                    <span class="compare-col-stats" id="compare-stats-${i}">--</span>
                </div>
                <div class="compare-col-body" id="compare-body-${i}" data-col="${i}">
                    <span style="opacity:0.4">Waiting...</span>
                </div>
            `;
            grid.appendChild(col);
        });

        // Sync scrolling
        const bodies = grid.querySelectorAll('.compare-col-body');
        let syncing = false;
        bodies.forEach(el => {
            el.addEventListener('scroll', () => {
                if (syncing) return;
                syncing = true;
                bodies.forEach(other => {
                    if (other !== el) other.scrollTop = el.scrollTop;
                });
                syncing = false;
            }, { passive: true });
        });
    }

    async function runCompare() {
        const prompt = document.getElementById('compare-prompt').value.trim();
        if (!prompt) return;

        const models = getSelectedModels();
        if (models.length < 2) {
            if (window.showToast) window.showToast('Select at least 2 models');
            return;
        }
        if (models.length > 4) {
            if (window.showToast) window.showToast('Max 4 models');
            return;
        }

        stopAll();
        buildColumns(models);

        const btn = document.getElementById('compare-run-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Comparing...'; }

        const promises = models.map((m, i) => streamToColumn(m, prompt, i));
        await Promise.allSettled(promises);

        if (btn) { btn.disabled = false; btn.textContent = 'Compare'; }
    }

    async function streamToColumn(modelInfo, prompt, colIndex) {
        const body = document.getElementById(`compare-body-${colIndex}`);
        const stats = document.getElementById(`compare-stats-${colIndex}`);
        if (!body) return;

        body.innerHTML = '<span style="opacity:0.4">Generating...</span>';
        const abort = new AbortController();
        compareAborts.push(abort);

        const providerPayload = (typeof window.getProviderPayload === 'function')
            ? window.getProviderPayload(modelInfo.provider) : {};

        const startTime = Date.now();
        let fullText = '';
        let sseBuffer = '';

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: prompt,
                    model: modelInfo.model,
                    system_prompt: '',
                    temperature: 0.7,
                    stream: true,
                    ...providerPayload,
                }),
                signal: abort.signal,
            });

            if (!response.ok) {
                const detail = typeof window.readErrorDetail === 'function'
                    ? await window.readErrorDetail(response) : `HTTP ${response.status}`;
                body.innerHTML = `<span style="color:#ef4444">${detail}</span>`;
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                sseBuffer = window.processSSELines(sseBuffer, chunk, (content) => {
                    fullText += content;
                    body.innerHTML = window.renderMarkdown(fullText);
                    if (window.AIHubRender) window.AIHubRender.enhance(body, { interim: true });
                });
            }

            if (window.AIHubRender) window.AIHubRender.enhance(body, { interim: false });

            const latency = Date.now() - startTime;
            const tokens = Math.ceil(fullText.length / 4);
            if (stats) stats.textContent = `${latency}ms | ~${tokens} tok`;

            // Record cost
            if (window.AIHubCost) {
                window.AIHubCost.recordMessage(modelInfo.model, prompt, fullText);
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                body.innerHTML = `<span style="color:#ef4444">${err.message}</span>`;
            }
        }
    }

    function populateModelChecks() {
        const container = document.getElementById('compare-model-list');
        if (!container || !window.AI_MODELS) return;
        container.innerHTML = '';

        const categories = ['text', 'multimodal'];
        const seen = new Set();

        for (const cat of categories) {
            const models = window.AI_MODELS[cat] || [];
            for (const m of models) {
                if (seen.has(m.id)) continue;
                seen.add(m.id);
                const hasKey = checkProviderKey(m.provider);
                const label = document.createElement('label');
                label.className = 'compare-model-label' + (hasKey ? '' : ' no-key');
                label.innerHTML = `
                    <input type="checkbox" class="compare-model-check" value="${m.id}"
                        data-label="${m.name}" data-provider="${m.provider}"
                        ${hasKey ? '' : 'disabled'}>
                    <span>${m.name}</span>
                    <small>${m.provider}</small>
                `;
                container.appendChild(label);
            }
        }
    }

    function checkProviderKey(provider) {
        if (typeof window.getProviderPayload !== 'function') return false;
        const payload = window.getProviderPayload(provider);
        if (payload.api_key) return true;
        const provInfo = (window.PROVIDERS || []).find(p => p.id === provider);
        return !!(provInfo && provInfo.env_set);
    }

    // Expose
    window.AIHubCompare = {
        show, hide, toggle, runCompare, stopAll, populateModelChecks,
    };
})();
