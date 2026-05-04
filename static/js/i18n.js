// ===== i18n + theme toggle =====
// Both preferences are persisted to localStorage and applied to
// <html data-theme="..." data-lang="..."> on load.

const I18N_KEY = 'aihub.lang';
const THEME_KEY = 'aihub.theme';

const I18N_DICT = {
    id: {
        // Sidebar
        nav_text_generation: 'Generasi Teks',
        nav_image_studio: 'Studio Gambar',
        nav_video_engine: 'Mesin Video',
        nav_audio_lab: 'Lab Audio',
        nav_api_management: 'Manajemen API',
        sidebar_status_online: 'Online',
        sidebar_link_docs: 'Dokumentasi',
        sidebar_link_settings: 'Pengaturan',
        sidebar_powered_by: 'DITENAGAI OLEH',

        // Topbar
        topbar_settings: 'Pengaturan',
        topbar_notifications: 'Notifikasi',
        topbar_theme: 'Ganti tema',
        topbar_lang: 'Ganti bahasa',

        // Common labels
        label_configurations: 'Konfigurasi',
        label_model_selector: 'PILIH MODEL',
        label_system_prompt: 'PROMPT SISTEM',
        label_temperature: 'TEMPERATURE',
        label_max_tokens: 'MAX TOKENS',
        label_image_attachment: 'LAMPIRAN GAMBAR',
        label_quick_prompts: 'PROMPT CEPAT',
        label_image_prompt: 'PROMPT GAMBAR',
        label_negative_prompt: 'NEGATIVE PROMPT',
        label_image_size: 'UKURAN GAMBAR',
        label_image_count: 'JUMLAH GAMBAR',
        label_video_prompt: 'PROMPT VIDEO',
        label_video_model: 'MODEL VIDEO',
        label_first_frame: 'GAMBAR FRAME PERTAMA',
        label_resolution: 'RESOLUSI',
        label_duration: 'DURASI',
        label_text_to_speech: 'TEXT-TO-SPEECH',
        label_tts_voice: 'SUARA',
        label_tts_language: 'BAHASA',
        label_tts_text: 'TEKS',
        label_speech_recognition: 'PENGENALAN SUARA',
        label_audio_url: 'URL AUDIO',
        label_content_generator: 'GENERATOR KONTEN',
        label_marketing_copy: 'COPYWRITING PEMASARAN',

        // Buttons
        btn_generate: 'Hasilkan',
        btn_generate_image: 'Hasilkan Gambar',
        btn_generate_video: 'Hasilkan Video',
        btn_generate_speech: 'Hasilkan Suara',
        btn_generate_content: 'Hasilkan Konten',
        btn_transcribe: 'Transkripsi',
        btn_analyze_image: 'Analisis Gambar',
        btn_new_chat: 'Chat Baru',
        btn_download: 'Unduh',
        btn_download_audio: 'Unduh Audio',
        btn_save: 'Simpan',
        btn_test: 'Tes',
        btn_clear: 'Hapus',
        btn_copy: 'Salin',
        btn_show: 'Tampilkan',
        btn_hide: 'Sembunyikan',
        btn_attach: 'Lampirkan file (gambar, PDF, DOCX, CSV, ZIP, TXT)',

        // Placeholders
        ph_chat_input: 'Kirim pesan (Ctrl + Enter untuk hasilkan...)',
        ph_image_prompt: 'Jelaskan gambar yang ingin dihasilkan...',
        ph_negative_prompt: 'Yang tidak diinginkan dalam gambar...',
        ph_video_prompt: 'Jelaskan video yang ingin dihasilkan...',
        ph_first_frame: 'URL gambar untuk frame pertama...',
        ph_tts_text: 'Masukkan teks untuk dijadikan suara...',
        ph_asr_url: 'URL file audio (https://...)',
        ph_image_url_chat: 'Paste URL gambar untuk multimodal...',
        ph_system_prompt: 'Anda adalah asisten yang membantu...',

        // Stats / panels
        stat_total_models: 'TOTAL MODEL',
        stat_capabilities: 'KAPABILITAS',
        stat_providers: 'PROVIDER',
        stat_avg_latency: 'LATENSI RATA-RATA',
        panel_recent_logs: 'LOG TERAKHIR',
        panel_generated_gallery: 'Galeri Hasil',
        panel_generated_video: 'Video Hasil',
        panel_available_models: 'MODEL TERSEDIA',

        // Misc
        chat_placeholder_p: 'Kirim pesan untuk mulai',
        chat_placeholder_span: 'Pilih model dan atur parameter',
        gallery_placeholder: 'Belum ada gambar yang dihasilkan',
        confirm_clear_history: 'Hapus riwayat chat? Tindakan ini tidak dapat dibatalkan.',
        msg_chat_count_one: 'pesan tersimpan',
        msg_chat_count_many: 'pesan tersimpan',

        // Conversation history sidebar
        chs_new_chat: 'Chat baru',
        chs_toggle: 'Buka/tutup riwayat',
        chs_search_placeholder: 'Cari percakapan...',
        chs_empty: 'Belum ada percakapan',
        chs_pin: 'Tandai',
        chs_unpin: 'Lepas tanda',
        chs_rename: 'Ganti judul',
        chs_delete: 'Hapus',
        chs_rename_prompt: 'Judul baru:',
        chs_delete_confirm: 'Hapus percakapan ini?',

        // System prompt presets
        preset_none: '— Tanpa preset —',
        preset_save_current: 'Simpan prompt saat ini sebagai preset',
        preset_manage: 'Kelola preset',
        preset_modal_title: 'Preset Prompt Sistem',
        preset_name_label: 'NAMA PRESET',
        preset_name_ph: 'mis. Peringkas',
        preset_prompt_label: 'TEKS PROMPT',
        preset_prompt_ph: 'Anda adalah...',
        preset_save_prompt: 'Nama preset:',
        preset_name_required: 'Nama preset wajib diisi',
        preset_empty_prompt: 'Prompt sistem masih kosong',
        preset_delete_confirm: 'Hapus preset ini?',

        // Settings dashboard
        settings_title: 'Pengaturan Dashboard',
        settings_desc: 'Tempel API key untuk tiap penyedia. Kunci hanya disimpan di browser Anda (localStorage) dan tidak pernah disimpan di server.',
        settings_banner_title: 'Cara menambahkan API key:',
        settings_banner_step1: 'Klik "Get key →" pada provider yang Anda inginkan, login, lalu salin kunci dari console mereka.',
        settings_banner_step2: 'Tempel ke kotak input pada kartu provider (atau klik 📌 Tempel).',
        settings_banner_step3: 'Klik tombol Simpan. Opsional klik tombol Tes untuk verifikasi kunci berfungsi.',
        settings_providers_title: 'Penyedia API',
        settings_providers_hint: 'Tiap provider menyediakan endpoint kompatibel-OpenAI. Set kunci untuk mengaktifkan modelnya di dropdown.',
        settings_loading: 'Memuat penyedia...',
        settings_models_title: 'Model Tersedia',
        stat_total_models_sub: 'Semua Kategori',
        stat_capabilities_sub: 'Teks, Visi, Gambar, Video, TTS, ASR, Multimodal',
        stat_providers_sub: 'Kunci Terkonfigurasi',
        btn_paste: 'Tempel dari clipboard',
    },
    en: {
        nav_text_generation: 'Text Generation',
        nav_image_studio: 'Image Studio',
        nav_video_engine: 'Video Engine',
        nav_audio_lab: 'Audio Lab',
        nav_api_management: 'API Management',
        sidebar_status_online: 'Online',
        sidebar_link_docs: 'Documentation',
        sidebar_link_settings: 'Settings',
        sidebar_powered_by: 'POWERED BY',

        topbar_settings: 'Settings',
        topbar_notifications: 'Notifications',
        topbar_theme: 'Toggle theme',
        topbar_lang: 'Toggle language',

        label_configurations: 'Configurations',
        label_model_selector: 'MODEL SELECTOR',
        label_system_prompt: 'SYSTEM PROMPT',
        label_temperature: 'TEMPERATURE',
        label_max_tokens: 'MAX TOKENS',
        label_image_attachment: 'IMAGE ATTACHMENT',
        label_quick_prompts: 'QUICK PROMPTS',
        label_image_prompt: 'IMAGE PROMPT',
        label_negative_prompt: 'NEGATIVE PROMPT',
        label_image_size: 'IMAGE SIZE',
        label_image_count: 'IMAGE COUNT',
        label_video_prompt: 'VIDEO PROMPT',
        label_video_model: 'VIDEO MODEL',
        label_first_frame: 'FIRST FRAME IMAGE',
        label_resolution: 'RESOLUTION',
        label_duration: 'DURATION',
        label_text_to_speech: 'TEXT-TO-SPEECH',
        label_tts_voice: 'VOICE',
        label_tts_language: 'LANGUAGE',
        label_tts_text: 'TEXT',
        label_speech_recognition: 'SPEECH RECOGNITION',
        label_audio_url: 'AUDIO URL',
        label_content_generator: 'CONTENT GENERATOR',
        label_marketing_copy: 'MARKETING COPY',

        btn_generate: 'Generate',
        btn_generate_image: 'Generate Image',
        btn_generate_video: 'Generate Video',
        btn_generate_speech: 'Generate Speech',
        btn_generate_content: 'Generate Content',
        btn_transcribe: 'Transcribe',
        btn_analyze_image: 'Analyze Image',
        btn_new_chat: 'New Chat',
        btn_download: 'Download',
        btn_download_audio: 'Download Audio',
        btn_save: 'Save',
        btn_test: 'Test',
        btn_clear: 'Clear',
        btn_copy: 'Copy',
        btn_show: 'Show',
        btn_hide: 'Hide',
        btn_attach: 'Attach file (image, PDF, DOCX, CSV, ZIP, TXT)',

        ph_chat_input: 'Send a message (Ctrl + Enter to generate...)',
        ph_image_prompt: 'Describe the image you want to generate...',
        ph_negative_prompt: 'What you don\u2019t want in the image...',
        ph_video_prompt: 'Describe the video you want to generate...',
        ph_first_frame: 'Image URL for the first frame...',
        ph_tts_text: 'Enter text to convert to speech...',
        ph_asr_url: 'Audio file URL (https://...)',
        ph_image_url_chat: 'Paste image URL for multimodal...',
        ph_system_prompt: 'You are a helpful assistant...',

        stat_total_models: 'TOTAL MODELS',
        stat_capabilities: 'CAPABILITIES',
        stat_providers: 'PROVIDERS',
        stat_avg_latency: 'AVG LATENCY',
        panel_recent_logs: 'RECENT LOGS',
        panel_generated_gallery: 'Generated Gallery',
        panel_generated_video: 'Generated Video',
        panel_available_models: 'AVAILABLE MODELS',

        chat_placeholder_p: 'Send a message to start generating',
        chat_placeholder_span: 'Select a model and configure parameters',
        gallery_placeholder: 'No images generated yet',
        confirm_clear_history: 'Clear chat history? This cannot be undone.',
        msg_chat_count_one: 'message saved',
        msg_chat_count_many: 'messages saved',

        // Conversation history sidebar
        chs_new_chat: 'New chat',
        chs_toggle: 'Toggle history',
        chs_search_placeholder: 'Search conversations...',
        chs_empty: 'No conversations yet',
        chs_pin: 'Pin',
        chs_unpin: 'Unpin',
        chs_rename: 'Rename',
        chs_delete: 'Delete',
        chs_rename_prompt: 'New title:',
        chs_delete_confirm: 'Delete this conversation?',

        // System prompt presets
        preset_none: '— No preset —',
        preset_save_current: 'Save current as preset',
        preset_manage: 'Manage presets',
        preset_modal_title: 'System Prompt Presets',
        preset_name_label: 'PRESET NAME',
        preset_name_ph: 'e.g. Summarizer',
        preset_prompt_label: 'PROMPT TEXT',
        preset_prompt_ph: 'You are...',
        preset_save_prompt: 'Preset name:',
        preset_name_required: 'Name is required',
        preset_empty_prompt: 'System prompt is empty',
        preset_delete_confirm: 'Delete this preset?',

        // Settings dashboard
        settings_title: 'Settings Dashboard',
        settings_desc: 'Paste your API keys for each provider below. Keys are stored only in your browser (localStorage) and never sent anywhere except the provider you\u2019re calling.',
        settings_banner_title: 'How to add an API key:',
        settings_banner_step1: 'Click "Get key →" on the provider you want, sign in, and copy the key from their console.',
        settings_banner_step2: 'Paste it into the input box on the matching card (or click 📌 Paste).',
        settings_banner_step3: 'Click the Save button. Optionally click Test to verify the key works.',
        settings_providers_title: 'API Providers',
        settings_providers_hint: 'Each provider exposes an OpenAI-compatible endpoint. Set a key to enable models from that provider in the dropdowns.',
        settings_loading: 'Loading providers...',
        settings_models_title: 'Available Models',
        stat_total_models_sub: 'All Categories',
        stat_capabilities_sub: 'Text, Vision, Image, Video, TTS, ASR, Multimodal',
        stat_providers_sub: 'Configured Keys',
        btn_paste: 'Paste from clipboard',
    },
};

function getLang() {
    try {
        const v = localStorage.getItem(I18N_KEY);
        return v === 'id' || v === 'en' ? v : 'id';
    } catch { return 'id'; }
}

function setLang(lang) {
    try { localStorage.setItem(I18N_KEY, lang); } catch {}
    document.documentElement.setAttribute('data-lang', lang);
    applyTranslations();
    updateLangButton();
}

function applyTranslations() {
    const lang = getLang();
    const dict = I18N_DICT[lang] || I18N_DICT.id;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key] !== undefined) el.setAttribute('title', dict[key]);
    });
    document.documentElement.setAttribute('lang', lang);
    if (typeof window.updateChatHistoryInfo === 'function') {
        window.updateChatHistoryInfo();
    }
    document.dispatchEvent(new CustomEvent('aihub:lang-change', { detail: { lang } }));
}

window.t = function (key) {
    const dict = I18N_DICT[getLang()] || I18N_DICT.id;
    return dict[key] !== undefined ? dict[key] : key;
};

// Expose current language to other modules (e.g. preset name localization).
window.__getLang = getLang;

function updateLangButton() {
    const btn = document.getElementById('lang-toggle-btn');
    if (!btn) return;
    btn.textContent = getLang() === 'id' ? 'ID' : 'EN';
}

window.toggleLang = function () {
    setLang(getLang() === 'id' ? 'en' : 'id');
};

// ===== Theme =====

function getTheme() {
    try {
        const v = localStorage.getItem(THEME_KEY);
        return v === 'light' || v === 'dark' ? v : 'dark';
    } catch { return 'dark'; }
}

function setTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButton();
}

function updateThemeButton() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    const sun = btn.querySelector('.icon-sun');
    const moon = btn.querySelector('.icon-moon');
    const isLight = getTheme() === 'light';
    if (sun) sun.style.display = isLight ? 'none' : '';
    if (moon) moon.style.display = isLight ? '' : 'none';
}

window.toggleTheme = function () {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
};

// Apply on load (run before DOMContentLoaded paint to avoid flicker).
document.documentElement.setAttribute('data-theme', getTheme());
document.documentElement.setAttribute('data-lang', getLang());

document.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
    updateLangButton();
    updateThemeButton();
});
