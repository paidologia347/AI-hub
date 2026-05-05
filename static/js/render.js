// ===== Rich rendering enhancements =====
// Runs after marked + hljs to add KaTeX (math), Mermaid (diagrams), and a
// "copy" button on every code block. Each enhancer is best-effort: if its
// vendor library hasn't loaded yet (CDN slow / offline) we silently skip.
//
// Public API (window.AIHubRender):
//   enhance(rootEl, { interim })  - run on a freshly-rendered bubble
//   addCopyButtons(rootEl)        - idempotent; safe to call mid-stream
//
// `interim=true` means we're mid-stream and the content is still changing —
// we skip the heavy passes (Mermaid, full KaTeX) and only refresh the cheap
// hljs highlight + copy button. Once `interim=false` we run everything.

(function () {
    'use strict';

    let mermaidReady = false;
    let mermaidIdCounter = 0;

    function tryInitMermaid() {
        if (mermaidReady || typeof window.mermaid === 'undefined') return;
        try {
            const dark = (document.documentElement.getAttribute('data-theme') || 'dark') !== 'light';
            window.mermaid.initialize({
                startOnLoad: false,
                theme: dark ? 'dark' : 'default',
                securityLevel: 'strict',
                fontFamily: 'inherit',
            });
            mermaidReady = true;
        } catch (err) {
            console.warn('Mermaid init failed', err);
        }
    }

    async function renderMermaid(root) {
        if (!root || typeof window.mermaid === 'undefined') return;
        tryInitMermaid();
        if (!mermaidReady) return;
        const blocks = root.querySelectorAll('pre code.language-mermaid:not([data-mermaid-done])');
        for (const block of blocks) {
            const code = block.textContent;
            block.setAttribute('data-mermaid-done', '1');
            const pre = block.closest('pre');
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid-wrapper';
            const id = 'mmd-' + (++mermaidIdCounter);
            try {
                const { svg } = await window.mermaid.render(id, code);
                wrapper.innerHTML = svg;
                if (pre && pre.parentNode) pre.parentNode.replaceChild(wrapper, pre);
            } catch (err) {
                // Leave the original code block in place + add an error note.
                const note = document.createElement('div');
                note.className = 'mermaid-error';
                note.textContent = 'Mermaid render error: ' + (err && err.message ? err.message : err);
                if (pre && pre.parentNode) pre.parentNode.insertBefore(note, pre.nextSibling);
            }
        }
    }

    function renderKatex(root) {
        if (!root || typeof window.renderMathInElement !== 'function') return;
        try {
            window.renderMathInElement(root, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                ],
                throwOnError: false,
                ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
            });
        } catch (err) {
            console.warn('KaTeX render failed', err);
        }
    }

    function addCopyButtons(root) {
        if (!root) return;
        const blocks = root.querySelectorAll('pre:not([data-copy-btn])');
        blocks.forEach(pre => {
            // Skip if this <pre> was already replaced by a mermaid-wrapper.
            if (!pre.querySelector('code')) return;
            pre.setAttribute('data-copy-btn', '1');
            pre.classList.add('has-copy-btn');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'code-copy-btn';
            btn.textContent = window.t ? window.t('btn_copy') : 'Copy';
            btn.title = btn.textContent;
            btn.addEventListener('click', async () => {
                const code = pre.querySelector('code');
                const text = code ? code.innerText : pre.innerText;
                try {
                    await navigator.clipboard.writeText(text);
                    const orig = btn.textContent;
                    btn.textContent = window.t ? window.t('btn_copied') : 'Copied!';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.textContent = orig;
                        btn.classList.remove('copied');
                    }, 1200);
                } catch {}
            });
            pre.appendChild(btn);
        });
    }

    function highlightCode(root) {
        if (!root || typeof window.hljs === 'undefined') return;
        root.querySelectorAll('pre code:not([data-highlighted])').forEach(block => {
            try {
                window.hljs.highlightElement(block);
                block.setAttribute('data-highlighted', '1');
            } catch {}
        });
    }

    function enhance(rootEl, opts) {
        const interim = !!(opts && opts.interim);
        if (!rootEl) return;
        // Cheap passes always: hljs + copy buttons.
        // hljs gates on data-highlighted so re-running is fine, but during a
        // stream the same <pre> mutates so the data-highlighted attr can stick
        // on stale text. Strip the marker on streaming bubbles.
        if (interim) {
            rootEl.querySelectorAll('pre code[data-highlighted]').forEach(b => b.removeAttribute('data-highlighted'));
        }
        highlightCode(rootEl);
        addCopyButtons(rootEl);
        if (interim) return;
        renderKatex(rootEl);
        renderMermaid(rootEl);
    }

    // Re-init mermaid theme when user toggles dark/light.
    document.addEventListener('aihub:theme-change', () => {
        mermaidReady = false; // force re-init on next render call
    });

    window.AIHubRender = { enhance, addCopyButtons };
})();
