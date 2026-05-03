# AI Hub v3.0 — Multi-Tool AI Platform

A modern web application that provides AI tools across five studios, with built-in support for **9 providers** (Alibaba DashScope, NVIDIA NIM, OpenAI, Anthropic Claude, Google Gemini, Groq, DeepSeek, OpenRouter, plus any custom OpenAI-compatible endpoint).

- Chat / multimodal / vision / image / video / TTS / ASR — all under one UI
- **Settings dashboard** for managing API keys per provider (stored in browser `localStorage`, never on the server)
- File attachments (PDF, DOCX, CSV/XLSX, ZIP, TXT, images) with automatic text extraction
- Dark/Light theme + Indonesia/English language toggle
- Persistent chat history (auto-saved to `localStorage`)
- One-click downloads for generated images, video, and audio

---

## Table of Contents

- [Quick start (local)](#quick-start-local)
- [Add API keys (Settings dashboard)](#add-api-keys-settings-dashboard)
- [Deployment options](#deployment-options)
  - [Option A — Render.com](#option-a--rendercom-easiest-free-tier)
  - [Option B — Fly.io](#option-b--flyio)
  - [Option C — Railway](#option-c--railway)
  - [Option D — Docker on any VPS](#option-d--docker-on-any-vps)
  - [Option E — Cloudflare Tunnel (run locally, expose publicly)](#option-e--cloudflare-tunnel-run-locally-expose-publicly)
  - [Why Vercel / Netlify is NOT recommended](#why-vercel--netlify-is-not-recommended)
- [Environment variables](#environment-variables)
- [API endpoints](#api-endpoints)
- [License](#license)

---

## Quick start (local)

### Linux / macOS

```bash
git clone https://github.com/paidologia347/AI-hub.git
cd AI-hub
pip install -e .
cp .env.example .env
# Edit .env and add at least one API key (DASHSCOPE_API_KEY recommended)
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Windows (PowerShell)

```powershell
git clone https://github.com/paidologia347/AI-hub.git
cd AI-hub
pip install -e .
# Create .env without UTF-8 BOM (PowerShell's Out-File -Encoding utf8 adds a
# BOM that breaks dotenv parsing — use Set-Content -Encoding ascii instead).
Set-Content -Path .env -Value "DASHSCOPE_API_KEY=your_key_here" -Encoding ascii
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000.

> If `uvicorn` or `git` aren't recognised by PowerShell, use full paths
> (`python -m uvicorn ...`, `& "C:\Program Files\Git\bin\git.exe" ...`) or add
> the install dirs to your PATH.

---

## Add API keys (Settings dashboard)

The fastest way to add or rotate API keys is the in-app dashboard — no `.env` editing or restart required.

1. Open the app, click the **gear icon** in the top bar (or "Manajemen API" / "API Management" in the sidebar).
2. For each provider you want to enable, paste the API key into the input box and click **Save**.
3. Click **Test** to verify the key works.

Keys live entirely in your browser's `localStorage`. The server never persists them and only sees them on the request that uses them.

### Supported providers

| Provider | Where to get a key |
|---|---|
| **Alibaba DashScope** | https://modelstudio.console.alibabacloud.com/ |
| **NVIDIA NIM** | https://build.nvidia.com/settings/api-keys |
| **OpenAI** | https://platform.openai.com/api-keys |
| **Anthropic Claude** | https://console.anthropic.com/settings/keys |
| **Google Gemini** | https://aistudio.google.com/apikey |
| **Groq** | https://console.groq.com/keys |
| **DeepSeek** | https://platform.deepseek.com/api_keys |
| **OpenRouter** (aggregator) | https://openrouter.ai/keys |
| **Custom** (any OpenAI-compatible endpoint) | n/a — paste any URL + key |

> NVIDIA NIM has a free tier (~5000 credits and/or rate-limited) that gives you
> immediate access to 50+ models including Llama 3.3 70B, DeepSeek R1, and
> Llama Vision. Best free starting point.

---

## Deployment options

This app is a **stateful, long-running FastAPI server** with Server-Sent Events streaming, async DashScope task polling, and multipart file uploads. It is designed to run as a single Linux container — **not** as a serverless function.

### Option A — Render.com (easiest, free tier)

Free tier sleeps after 15 minutes of inactivity but is otherwise sufficient for personal use.

1. Sign up at https://render.com (GitHub login).
2. Click **New → Web Service** and connect your fork of this repo.
3. Fill in:
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -e .`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free
4. **Environment variables** section: add `DASHSCOPE_API_KEY` (and any others you need). You can also add keys later via the in-app Settings dashboard (recommended for non-production use).
5. Click **Create Web Service**. First deploy takes ~3 minutes.
6. Your app is live at `https://<your-app-name>.onrender.com`.

> Tip: Render's **starter** plan ($7/month) doesn't sleep and gives faster cold starts.

### Option B — Fly.io

Fly's free allowance includes 3 small VMs that don't sleep — best free option for production-ish use.

1. Install `flyctl`: https://fly.io/docs/flyctl/install/
2. From the repo root:
   ```bash
   fly launch
   ```
   Accept the defaults and let it generate a `fly.toml`. Fly will autodetect the Python app and create a Dockerfile if needed.
3. Set secrets:
   ```bash
   fly secrets set DASHSCOPE_API_KEY=sk-...
   fly secrets set NVIDIA_API_KEY=nvapi-...
   ```
4. Deploy:
   ```bash
   fly deploy
   ```
5. Open in browser:
   ```bash
   fly open
   ```

If `fly launch` doesn't auto-detect Python correctly, drop a `Dockerfile` (see [Option D](#option-d--docker-on-any-vps)) and re-run `fly deploy`.

### Option C — Railway

Railway has a $5/month starter (no free tier as of 2025) but is the simplest for "git-push to deploy" workflow.

1. Sign up at https://railway.app (GitHub login).
2. Click **New Project → Deploy from GitHub repo**, pick your fork.
3. Railway auto-detects Python. Set the start command in **Settings → Deploy**:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. Add environment variables under **Variables**.
5. Generate a public domain under **Settings → Networking → Generate Domain**.

### Option D — Docker on any VPS

Use this if you have a Linux box (DigitalOcean droplet, AWS EC2, Hetzner, your own home server, etc.).

Create `Dockerfile` in the repo root:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir uvicorn fastapi python-dotenv openai httpx pypdf python-docx openpyxl python-multipart
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:

```bash
docker build -t aihub .
docker run -d -p 8000:8000 --name aihub \
  -e DASHSCOPE_API_KEY=sk-... \
  --restart unless-stopped \
  aihub
```

Put it behind nginx + Let's Encrypt for HTTPS, or front it with Cloudflare Tunnel ([Option E](#option-e--cloudflare-tunnel-run-locally-expose-publicly)).

### Option E — Cloudflare Tunnel (run locally, expose publicly)

Best when you want to run on your own machine but expose it on the public internet without opening firewall ports.

**Quick tunnel (5 min, random URL, no Cloudflare account needed):**

1. Run the app locally: `uvicorn main:app --host 0.0.0.0 --port 8000`
2. Install cloudflared:
   - Windows: `winget install --id Cloudflare.cloudflared`
   - macOS: `brew install cloudflared`
   - Linux: see https://pkg.cloudflare.com/index.html
3. In a second terminal:
   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```
4. Copy the `https://*.trycloudflare.com` URL printed in the output. Done.

> The URL stays alive only while the `cloudflared` process is running. Closing the terminal kills the tunnel.

**Permanent tunnel (stable URL on your domain):**

If you have a domain on Cloudflare:

```bash
cloudflared tunnel login                                 # one-time browser auth
cloudflared tunnel create aihub                          # create + get UUID
cloudflared tunnel route dns aihub aihub.your-domain.com # bind subdomain
# Create ~/.cloudflared/config.yml:
#   tunnel: <UUID>
#   credentials-file: ~/.cloudflared/<UUID>.json
#   ingress:
#     - hostname: aihub.your-domain.com
#       service: http://localhost:8000
#     - service: http_status:404
cloudflared tunnel run aihub
```

Combine with **Cloudflare Access** (https://one.dash.cloudflare.com → Access → Applications) to require email login for the public URL — keeps your API costs in check.

### Why Vercel / Netlify is NOT recommended

Vercel and Netlify are great for static sites and short-lived serverless functions, but this app needs:

- **Long-running streaming connections** (Server-Sent Events for chat) — most serverless platforms time out at 10–60 seconds and don't keep an SSE stream open.
- **Multipart file uploads up to 10 MB** — Vercel's serverless function payload limit is 4.5 MB by default.
- **Background async polling** for video / ASR tasks (DashScope native API returns task IDs that the server polls until done).
- **A persistent FastAPI process** — Vercel's Python runtime spawns a fresh function instance per request, making in-memory state pointless.

**TL;DR:** if you really want Vercel/Netlify, you'd have to split the app into static frontend + separate stateful backend hosted elsewhere (Render / Fly / Railway). It's much simpler to deploy the whole thing to one of those instead. Use Vercel/Netlify only for purely static sites.

---

## Environment variables

All keys are **optional** — the app works as long as at least one provider has a key, either in `.env` or pasted into the in-app Settings dashboard.

| Variable | Provider | Get a key |
|---|---|---|
| `DASHSCOPE_API_KEY` | Alibaba DashScope (Qwen, Wan video, TTS, ASR) | https://modelstudio.console.alibabacloud.com/ |
| `NVIDIA_API_KEY` | NVIDIA NIM (Llama, DeepSeek, etc.) | https://build.nvidia.com/settings/api-keys |
| `OPENAI_API_KEY` | OpenAI (GPT-4o, o1) | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | Anthropic Claude | https://console.anthropic.com/settings/keys |
| `GOOGLE_API_KEY` | Google Gemini | https://aistudio.google.com/apikey |
| `GROQ_API_KEY` | Groq (fastest Llama hosting) | https://console.groq.com/keys |
| `DEEPSEEK_API_KEY` | DeepSeek (cheapest) | https://platform.deepseek.com/api_keys |
| `OPENROUTER_API_KEY` | OpenRouter (aggregator) | https://openrouter.ai/keys |

> The native DashScope endpoints (image gen, video gen, TTS, ASR) **only** work with `DASHSCOPE_API_KEY`. Other providers cover chat / vision / multimodal.

---

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/providers` | GET | List supported providers + which ones have a server-side env-var key set |
| `/api/providers/test` | POST | Verify a key by sending a 1-token ping to the provider |
| `/api/models` | GET | List all 50+ models grouped by capability |
| `/api/chat` | POST | Chat with any provider (streaming SSE) |
| `/api/vision` | POST | Analyze images (Qwen3.6 Plus, streaming) |
| `/api/multimodal` | POST | Multimodal chat (text + image input) |
| `/api/upload` | POST | Multipart upload — extracts text from PDF/DOCX/CSV/XLSX/ZIP, returns base64 for images |
| `/api/image/generate` | POST | Generate images (Wan + Qwen Image Max) |
| `/api/video/generate` | POST | Generate video (Wan 2.7 T2V/I2V, async) |
| `/api/video/status/{task_id}` | GET | Poll video generation status |
| `/api/tts` | POST | Text-to-Speech (Qwen TTS / CosyVoice) |
| `/api/asr` | POST | Speech recognition (Fun-ASR, async) |
| `/api/asr/status/{task_id}` | GET | Poll ASR status |
| `/api/content/generate` | POST | Generate marketing/content text (streaming) |

---

## License

MIT
