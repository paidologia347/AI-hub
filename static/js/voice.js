// ===== Voice Input (Mic → ASR) + TTS Playback on Responses =====
// - Mic button on chat input: records audio, sends to /api/asr, inserts
//   transcription as user message.
// - Speaker icon on assistant messages: sends text to /api/tts and plays audio.

(function () {
    'use strict';

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    // ----- Mic Recording → ASR -----------------------------------------------

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                await sendAudioForTranscription(blob);
            };

            mediaRecorder.start(250); // collect data every 250ms
            isRecording = true;
            updateMicButton(true);
            if (window.addLog) window.addLog('Mic recording started');
        } catch (err) {
            if (window.showToast) window.showToast('Mic access denied');
            console.warn('Mic error:', err);
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        updateMicButton(false);
        if (window.addLog) window.addLog('Mic recording stopped');
    }

    function toggleRecording() {
        isRecording ? stopRecording() : startRecording();
    }

    async function sendAudioForTranscription(blob) {
        const micBtn = document.getElementById('mic-btn');
        if (micBtn) {
            micBtn.disabled = true;
            micBtn.title = 'Transcribing...';
        }

        try {
            // Upload blob as a file to a temp endpoint, then use ASR
            const formData = new FormData();
            formData.append('audio_file', blob, 'recording.webm');
            formData.append('model', 'fun-asr');
            const dsKey = (typeof window.getProviderPayload === 'function')
                ? (window.getProviderPayload('dashscope').api_key || '') : '';
            if (dsKey) formData.append('api_key', dsKey);

            const resp = await fetch('/api/asr/upload', {
                method: 'POST',
                body: formData,
            });

            if (!resp.ok) {
                const detail = typeof window.readErrorDetail === 'function'
                    ? await window.readErrorDetail(resp) : `HTTP ${resp.status}`;
                if (window.showToast) window.showToast('ASR failed: ' + detail);
                return;
            }

            const data = await resp.json();
            const transcript = data.transcript || '';
            if (transcript) {
                const input = document.getElementById('chat-input');
                if (input) {
                    input.value = (input.value ? input.value + ' ' : '') + transcript;
                    input.focus();
                }
                if (window.showToast) window.showToast('Transcription added');
                if (window.addLog) window.addLog('Voice transcribed: ' + transcript.slice(0, 50));
            } else {
                if (window.showToast) window.showToast('No speech detected');
            }
        } catch (err) {
            if (window.showToast) window.showToast('ASR error: ' + err.message);
        } finally {
            if (micBtn) {
                micBtn.disabled = false;
                micBtn.title = 'Voice input';
            }
        }
    }

    function updateMicButton(recording) {
        const btn = document.getElementById('mic-btn');
        if (!btn) return;
        if (recording) {
            btn.classList.add('recording');
            btn.title = 'Stop recording';
        } else {
            btn.classList.remove('recording');
            btn.title = 'Voice input';
        }
    }

    // ----- TTS Playback on Response ------------------------------------------

    let currentTTSAudio = null;

    async function speakText(text) {
        // Stop any currently playing audio
        if (currentTTSAudio) {
            currentTTSAudio.pause();
            if (currentTTSAudio.src.startsWith('blob:')) URL.revokeObjectURL(currentTTSAudio.src);
            currentTTSAudio = null;
        }

        const cleanText = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (!cleanText) return;

        // Limit to ~2000 chars for TTS
        const truncated = cleanText.length > 2000 ? cleanText.slice(0, 2000) + '...' : cleanText;

        try {
            const dsKey = (typeof window.getProviderPayload === 'function')
                ? (window.getProviderPayload('dashscope').api_key || '') : '';
            const resp = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: truncated,
                    provider: 'qwen3-tts-flash',
                    voice: 'Cherry',
                    language: 'Auto',
                    api_key: dsKey,
                }),
            });

            if (!resp.ok) {
                if (window.showToast) window.showToast('TTS playback failed');
                return;
            }

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            currentTTSAudio = new Audio(url);
            currentTTSAudio.onended = () => {
                URL.revokeObjectURL(url);
                currentTTSAudio = null;
            };
            currentTTSAudio.play();
            if (window.addLog) window.addLog('TTS playback started');
        } catch (err) {
            if (window.showToast) window.showToast('TTS error: ' + err.message);
        }
    }

    function stopSpeaking() {
        if (currentTTSAudio) {
            currentTTSAudio.pause();
            if (currentTTSAudio.src.startsWith('blob:')) URL.revokeObjectURL(currentTTSAudio.src);
            currentTTSAudio = null;
        }
    }

    // Add speaker icon to assistant messages
    function addSpeakerButton(msgDiv) {
        if (!msgDiv) return;
        const bubble = msgDiv.querySelector('.msg-bubble');
        if (!bubble || msgDiv.querySelector('.msg-speak-btn')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'msg-speak-btn';
        btn.title = 'Read aloud';
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.08"/></svg>';
        btn.addEventListener('click', () => speakText(bubble.innerText));

        // Insert after bubble
        const actions = msgDiv.querySelector('.msg-actions') || document.createElement('div');
        if (!actions.classList.contains('msg-actions')) {
            actions.className = 'msg-actions';
            bubble.parentNode.insertBefore(actions, bubble.nextSibling);
        }
        actions.appendChild(btn);
    }

    // Expose
    window.AIHubVoice = {
        toggleRecording,
        startRecording,
        stopRecording,
        speakText,
        stopSpeaking,
        addSpeakerButton,
        get isRecording() { return isRecording; },
    };
})();
