// ===== RAG (file-aware chat) =====
// Browser-side knowledge base for the chat page. Documents are chunked,
// embedded via /api/embeddings, and stored as plain JSON in localStorage.
// At chat time the user message is embedded and the top-K most similar
// chunks are injected into the system prompt as additional context.
//
// All vectors are kept in-memory for cosine math; localStorage is the
// durable store. The 5 MB byte budget below evicts the oldest documents
// (LRU by indexedAt) when over budget so we never blow past the browser
// quota.
//
// Public API (window.AIHubRAG):
//   list()                        -> [{id, filename, chunks, indexedAt, ...}, ...]
//   has(filename)                 -> boolean
//   getByFilename(filename)       -> doc | null
//   indexAttachment(attachment)   -> Promise<doc>
//   removeDoc(id)                 -> void
//   clearAll()                    -> void
//   retrieveContext(query, topK)  -> Promise<{contextText, hits: [...]}>
//   stats()                       -> {docs, chunks, bytes}

(function () {
    'use strict';

    const STORE_KEY = 'aihub.rag.docs.v1';
    const STORE_LIMIT_BYTES = 5 * 1024 * 1024; // ~5 MB cap
    const CHUNK_SIZE = 800;        // chars per chunk
    const CHUNK_OVERLAP = 120;     // chars of overlap between adjacent chunks
    const MAX_CHUNKS_PER_DOC = 200;
    const EMBED_BATCH = 16;
    const DEFAULT_TOP_K = 5;
    const MIN_QUERY_CHARS = 3;

    // ----- Storage ----------------------------------------------------------

    function safeParse(raw, fallback) {
        if (!raw) return fallback;
        try { return JSON.parse(raw) ?? fallback; } catch { return fallback; }
    }

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            const data = safeParse(raw, null);
            if (data && Array.isArray(data.docs)) {
                return { v: 1, docs: data.docs };
            }
        } catch {}
        return { v: 1, docs: [] };
    }

    function saveStore(store) {
        try {
            let payload = JSON.stringify(store);
            // Evict oldest non-recent docs (smallest indexedAt) until we fit.
            while (payload.length > STORE_LIMIT_BYTES && store.docs.length > 1) {
                let oldestIdx = 0;
                for (let i = 1; i < store.docs.length; i++) {
                    if ((store.docs[i].indexedAt || 0) < (store.docs[oldestIdx].indexedAt || 0)) {
                        oldestIdx = i;
                    }
                }
                store.docs.splice(oldestIdx, 1);
                payload = JSON.stringify(store);
            }
            localStorage.setItem(STORE_KEY, payload);
        } catch (err) {
            console.warn('RAG save failed', err);
        }
    }

    let STORE = loadStore();

    // ----- Chunking ---------------------------------------------------------

    function chunkText(text) {
        const clean = String(text || '').replace(/\r\n/g, '\n').trim();
        if (!clean) return [];
        const out = [];
        let i = 0;
        while (i < clean.length && out.length < MAX_CHUNKS_PER_DOC) {
            let end = Math.min(i + CHUNK_SIZE, clean.length);
            // Try to end on a sentence/paragraph boundary if possible.
            if (end < clean.length) {
                const slice = clean.slice(i, end);
                const lastBreak = Math.max(
                    slice.lastIndexOf('\n\n'),
                    slice.lastIndexOf('. '),
                    slice.lastIndexOf('? '),
                    slice.lastIndexOf('! ')
                );
                if (lastBreak > CHUNK_SIZE * 0.5) {
                    end = i + lastBreak + 1;
                }
            }
            const piece = clean.slice(i, end).trim();
            if (piece) out.push(piece);
            if (end >= clean.length) break;
            i = Math.max(end - CHUNK_OVERLAP, i + 1);
        }
        return out;
    }

    // ----- Vector math ------------------------------------------------------

    function dot(a, b) {
        let s = 0;
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) s += a[i] * b[i];
        return s;
    }
    function norm(a) { return Math.sqrt(dot(a, a)) || 1; }
    function cosine(a, b) { return dot(a, b) / (norm(a) * norm(b)); }

    // ----- Embedding fetch --------------------------------------------------

    function getProviderPayload() {
        // Reuse the same per-provider key/base_url settings the chat page uses.
        if (typeof window.getProviderPayload === 'function') {
            return window.getProviderPayload('dashscope') || {};
        }
        return {};
    }

    async function embedBatch(inputs) {
        const payload = {
            inputs,
            model: 'text-embedding-v3',
            provider: 'dashscope',
            ...getProviderPayload(),
        };
        const resp = await fetch('/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        return data.vectors || [];
    }

    async function embedAll(inputs) {
        const out = [];
        for (let i = 0; i < inputs.length; i += EMBED_BATCH) {
            const batch = inputs.slice(i, i + EMBED_BATCH);
            const vecs = await embedBatch(batch);
            out.push(...vecs);
        }
        return out;
    }

    // ----- Public API -------------------------------------------------------

    function genId() {
        return 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function list() {
        return STORE.docs.map(d => ({
            id: d.id,
            filename: d.filename,
            kind: d.kind,
            chunks: d.chunks ? d.chunks.length : 0,
            chars: d.chars || 0,
            indexedAt: d.indexedAt,
        }));
    }

    function has(filename) {
        return STORE.docs.some(d => d.filename === filename);
    }

    function getByFilename(filename) {
        return STORE.docs.find(d => d.filename === filename) || null;
    }

    function removeDoc(id) {
        const idx = STORE.docs.findIndex(d => d.id === id);
        if (idx >= 0) {
            STORE.docs.splice(idx, 1);
            saveStore(STORE);
        }
    }

    function clearAll() {
        STORE = { v: 1, docs: [] };
        saveStore(STORE);
    }

    function stats() {
        let chunks = 0;
        for (const d of STORE.docs) chunks += d.chunks ? d.chunks.length : 0;
        let bytes = 0;
        try { bytes = (localStorage.getItem(STORE_KEY) || '').length; } catch {}
        return { docs: STORE.docs.length, chunks, bytes };
    }

    async function indexAttachment(attachment) {
        if (!attachment || attachment.kind !== 'text' || !attachment.content) {
            throw new Error('Only text attachments can be indexed');
        }

        const chunks = chunkText(attachment.content);
        if (chunks.length === 0) throw new Error('No extractable text in this file');

        // Embed first; only mutate the store after the network call succeeds
        // so a transient embedding failure can't wipe the previous version of
        // a file that's already in the KB.
        const vectors = await embedAll(chunks);
        if (vectors.length !== chunks.length) {
            throw new Error(`Embedding count mismatch (${vectors.length} vs ${chunks.length})`);
        }

        // De-duplicate by filename now that we have a fresh successful index.
        // Re-find here because STORE.docs may have shifted during the await
        // (e.g. another removeDoc() call from the user).
        const existing = STORE.docs.findIndex(d => d.filename === attachment.filename);
        if (existing >= 0) STORE.docs.splice(existing, 1);

        const doc = {
            id: genId(),
            filename: attachment.filename,
            kind: attachment.kind,
            chars: attachment.content.length,
            chunks: chunks.map((text, i) => ({ text, vec: vectors[i] })),
            indexedAt: Date.now(),
        };
        STORE.docs.unshift(doc);
        saveStore(STORE);
        return doc;
    }

    async function retrieveContext(query, topK) {
        const k = topK || DEFAULT_TOP_K;
        const q = String(query || '').trim();
        if (q.length < MIN_QUERY_CHARS) return { contextText: '', hits: [] };
        if (STORE.docs.length === 0) return { contextText: '', hits: [] };

        const [queryVec] = await embedAll([q]);
        if (!queryVec) return { contextText: '', hits: [] };

        const scored = [];
        for (const doc of STORE.docs) {
            for (let i = 0; i < doc.chunks.length; i++) {
                const ch = doc.chunks[i];
                const score = cosine(queryVec, ch.vec);
                scored.push({ score, filename: doc.filename, chunkIndex: i, text: ch.text });
            }
        }
        scored.sort((a, b) => b.score - a.score);
        const hits = scored.slice(0, k);

        if (hits.length === 0) return { contextText: '', hits: [] };

        const blocks = hits.map((h, i) =>
            `[Source ${i + 1}: ${h.filename}, chunk ${h.chunkIndex + 1}]\n${h.text}`
        );
        const contextText =
            'You have access to the following retrieved excerpts from the user\'s files. ' +
            'Use them to answer when relevant; cite the source filename when you do. ' +
            'If the excerpts do not contain the answer, say so and answer from general knowledge.\n\n' +
            blocks.join('\n\n---\n\n');

        return { contextText, hits };
    }

    window.AIHubRAG = {
        list,
        has,
        getByFilename,
        indexAttachment,
        removeDoc,
        clearAll,
        retrieveContext,
        stats,
    };
})();
