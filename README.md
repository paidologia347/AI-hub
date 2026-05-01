# AI Hub - Multi-Tool AI Platform

A modern web application that provides AI tools across three studios, powered by [Alibaba Cloud Model Studio](https://www.alibabacloud.com/en/product/modelstudio) (DashScope API).

## Features

### AI Text Studio
- Chat with Qwen models (Qwen Plus, Max, Turbo, Qwen3 235B/32B/14B, QwQ Reasoning, Qwen3 Coder)
- Streaming responses with markdown rendering
- Code syntax highlighting
- Quick prompts for coding tasks (explain, debug, refactor, test writing)
- Adjustable temperature and system prompts

### AI Media Studio
- **Text-to-Speech**: Qwen3 TTS Flash, CosyVoice v3 Flash with multiple voices
- **Content Generator**: Blog posts, social media, video scripts, emails, ad copy, marketing plans
- Multi-language support (Indonesian, English, Spanish, French)

### AI Creative Studio
- **Image Generator**: Wan 2.6 Text-to-Image, Wan 2.7 Image Pro, Wan 2.7 Image
- **Marketing Copy AI**: Product descriptions, landing page copy, headlines, CTAs, brand stories

## Tech Stack

- **Backend**: FastAPI (Python)
- **AI API**: Alibaba Cloud Model Studio (OpenAI-compatible + DashScope native)
- **Frontend**: Vanilla JS + Tailwind CSS
- **Streaming**: Server-Sent Events (SSE)

## Setup

1. Clone the repository:
```bash
git clone https://github.com/paidologia347/AI-hub.git
cd AI-hub
```

2. Install dependencies:
```bash
pip install -e .
```

3. Set your DashScope API key:
```bash
cp .env.example .env
# Edit .env and add your DASHSCOPE_API_KEY
# Get your API key at https://modelstudio.console.alibabacloud.com/
```

4. Run the app:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

5. Open http://localhost:8000

## Environment Variables

| Variable | Description |
|---|---|
| `DASHSCOPE_API_KEY` | Your Alibaba Cloud Model Studio API key ([get it here](https://modelstudio.console.alibabacloud.com/)) |

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/chat` | POST | Chat with LLM (streaming SSE) |
| `/api/image/generate` | POST | Generate images (Wan models) |
| `/api/tts` | POST | Text-to-Speech (Qwen TTS / CosyVoice) |
| `/api/content/generate` | POST | Generate content (streaming SSE) |
| `/api/models` | GET | List available models |

## License

MIT
