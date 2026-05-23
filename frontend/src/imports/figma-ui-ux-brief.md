# AI Hub Figma UI/UX Brief

## Tujuan Desain

Bangun ulang UI/UX AI Hub sebagai aplikasi kerja lokal untuk mengakses banyak provider AI, bukan landing page. Fokus utama adalah membuat chat, upload file, manajemen API key, image generation, TTS, dan content tools terasa cepat, jelas, dan aman untuk dipakai berulang setiap hari.

## Prinsip Produk

- **Work-first**: halaman pertama langsung berupa workspace yang bisa dipakai, bukan hero marketing.
- **Local confidence**: tampilkan status server lokal, provider key, dan koneksi secara jelas tanpa membuat pengguna panik.
- **Provider-aware**: pengguna harus selalu tahu model yang dipilih memakai provider apa dan key mana yang dibutuhkan.
- **Attachment-first chat**: upload file harus terasa seperti bagian natural dari chat, bukan fitur tambahan yang tersembunyi.
- **Low friction recovery**: error harus memberi langkah perbaikan, misalnya "paste API key di API Management" atau "file terlalu besar, maksimal 10 MB".
- **Readable density**: interface boleh padat, tetapi spacing, hierarchy, dan status harus mudah dipindai.

## Target Pengguna

- Pengguna lokal Windows yang menjalankan AI Hub di `127.0.0.1:8000`.
- Pengguna non-teknis yang perlu copy-paste API key.
- Pengguna power user yang sering berpindah model/provider.
- Pengguna yang ingin chat dengan dokumen, gambar, kode, PDF, DOCX, XLSX, ZIP, dan file teks.

## Arsitektur Layar

### 1. App Shell

- Sidebar kiri untuk navigasi utama:
  - Text Generation
  - Image Studio
  - Video Engine / Content & TTS
  - API Management
- Topbar untuk:
  - Nama aplikasi
  - Tab cepat antar workspace
  - Settings
  - Notification/status
- Main canvas untuk tool aktif.
- Right/status rail opsional untuk latency, token, recent logs, dan provider status.

### 2. Text Generation

Layout desktop:
- Kolom kiri: konfigurasi model.
- Tengah: chat canvas.
- Kanan: live stats dan recent logs.

Komponen wajib:
- Model selector dengan grouping provider:
  - Alibaba Cloud
  - FreeModel
  - NVIDIA NIM
- Badge provider di dekat model aktif.
- System prompt textarea.
- Temperature slider.
- Attachment strip di atas input chat.
- Tombol Attach di sebelah input.
- Input chat multiline.
- Tombol Generate.
- Empty state yang tenang dan ringkas.

Attachment behavior:
- Setelah file dipilih, tampilkan chip:
  - Icon tipe file
  - Nama file
  - Ukuran file
  - Status: uploading, ready, failed
  - Tombol remove
- Jika file berhasil diproses, chip berubah menjadi ready.
- Jika file gagal, tampilkan chip error atau toast dengan alasan.
- Setelah chat sukses dikirim, attachment dapat dibersihkan otomatis.

### 3. Image Studio

Layout:
- Panel prompt dan setting di kiri.
- Gallery hasil di kanan.

Komponen:
- Prompt textarea.
- Model selector.
- Size selector.
- Generate button.
- Gallery grid dengan preview, copy URL, dan download action.
- Empty state untuk gallery.

### 4. Video Engine / Content & TTS

Gabungkan tool yang berorientasi content:
- Content Generator
- Text-to-Speech
- Marketing Copy

Prinsip:
- Jangan membuat semua tool terlihat sama berat.
- Prioritaskan satu primary panel dan beberapa compact side panels.
- Output harus punya tombol Copy, Download jika relevan, dan retry.

### 5. API Management

Ini layar paling penting untuk pengguna non-teknis.

Komponen wajib:
- Provider status cards:
  - DashScope
  - FreeModel
  - NVIDIA NIM
- API key input per provider.
- Tombol Save, Paste, Clear.
- Status saved/missing.
- Pesan bantuan:
  - "Jika tombol Paste diblokir browser, klik kolom key, tekan Ctrl+V, lalu Save."
- Daftar model dengan kolom:
  - Model
  - Type
  - Provider
  - Key status
  - Availability
- Warning jika model dipilih tetapi key provider belum ada.

## Flow Utama

### Flow: Simpan API Key

1. Pengguna buka API Management.
2. Pengguna paste key ke field provider.
3. Klik Save atau tekan Enter.
4. Field dikosongkan untuk keamanan.
5. Status berubah menjadi `saved`.
6. Toast: `[Provider] key saved`.

State yang perlu didesain:
- Empty
- Focus
- Paste blocked
- Saved
- Cleared
- Invalid/empty

### Flow: Chat Dengan Attachment

1. Pengguna buka Text Generation.
2. Pilih model.
3. Klik Attach.
4. Pilih file.
5. File muncul sebagai chip uploading.
6. Setelah selesai, chip menjadi ready.
7. Pengguna ketik instruksi.
8. Klik Generate.
9. Konten file disisipkan ke prompt.
10. Response streaming muncul di chat.

State yang perlu didesain:
- No attachment
- Uploading
- Ready
- File too large
- Unsupported type
- Chat streaming
- API key missing

### Flow: Provider Missing

1. Pengguna memilih model FreeModel/NVIDIA.
2. Key provider belum disimpan.
3. Saat Generate, tampilkan error inline di chat:
   - "NVIDIA NIM API key is missing. Paste it in API Management."
4. Berikan tombol shortcut ke API Management.

## Komponen Design System

### Navigation

- Sidebar item
- Topbar tab
- Icon button
- Active state
- Disabled state

### Controls

- Select
- Textarea
- Input password
- Slider
- Button:
  - Primary
  - Secondary
  - Ghost
  - Danger
  - Icon-only
- File attach button
- Attachment chip
- Toast
- Loading overlay

### Data Display

- Model table row
- Status badge
- Provider badge
- Stat card
- Log entry
- Empty state
- Error inline block

### Chat

- User message bubble
- Assistant message bubble
- Streaming cursor/loading
- Markdown/code block
- Attachment preview strip
- Copy response button

## Visual Direction

Pertahankan karakter "local AI cockpit", tetapi buat lebih bersih dan profesional.

Rekomendasi:
- Background gelap netral, bukan terlalu biru/ungu satu warna.
- Accent cyan boleh dipakai untuk focus/active, tetapi kombinasikan dengan neutral gray dan status colors.
- Gunakan radius kecil sampai sedang, maksimal 8px untuk cards dan controls.
- Hindari decorative gradient blobs/orbs.
- Font:
  - UI: Inter
  - Code/status: JetBrains Mono
- Kontras teks harus jelas di layar laptop.

Status colors:
- Success: green
- Warning: amber
- Error: red
- Info/active: cyan
- Neutral/missing: slate/gray

## Responsive Rules

Desktop:
- Sidebar tetap di kiri.
- Text Generation dapat 3 kolom.
- API Management memakai grid 2-3 kolom.

Tablet:
- Sidebar menjadi compact.
- Text Generation menjadi 2 kolom.
- Stats/logs pindah ke bawah chat.

Mobile:
- Sidebar berubah menjadi bottom/nav drawer.
- Semua panel single-column.
- Attachment chip harus wrap rapi.
- Model selector dan Generate button tetap mudah dijangkau.

## Accessibility

- Semua tombol icon harus punya tooltip/title.
- Field API key harus punya label jelas.
- Error tidak hanya warna, harus ada teks.
- Focus ring jelas untuk keyboard navigation.
- Ukuran tap target minimal 40px.
- Contrast ratio minimum 4.5:1 untuk teks utama.

## Copywriting UI

Gunakan teks singkat dan langsung.

Contoh:
- `Attach`
- `Generate`
- `Save key`
- `Paste key`
- `Key saved`
- `Key missing`
- `File too large`
- `Unsupported file type`
- `Upload failed`

Hindari teks panjang di dalam card. Bantuan panjang cukup di tooltip atau helper text kecil.

## Handoff Figma

Frame yang perlu dibuat:
- `Desktop / Text Generation`
- `Desktop / Text Generation with Attachments`
- `Desktop / API Management`
- `Desktop / Image Studio`
- `Desktop / Content & TTS`
- `Mobile / Text Generation`
- `Mobile / API Management`
- `Component Library`

Variants yang perlu dibuat:
- Button: default, hover, active, disabled, loading
- Input: empty, focus, filled, error, disabled
- Attachment chip: uploading, ready text, ready image, error
- Provider card: missing, saved, active, error
- Chat bubble: user, assistant, streaming, error
- Toast: info, success, warning, error

## Acceptance Checklist

- Pengguna bisa menemukan tempat paste API key dalam 5 detik.
- Pengguna bisa upload file dari chat tanpa membaca dokumentasi.
- Setiap model menunjukkan provider yang dibutuhkan.
- Error API key membawa pengguna ke solusi.
- Attachment chip tidak merusak layout pada nama file panjang.
- Chat tetap nyaman dipakai pada laptop 1366px.
- Mobile tidak memiliki overlap teks atau tombol.
- Tidak ada UI card bersarang yang membuat layout terasa berat.
