# AI Hub v3.0 - Multi-Tool AI Platform

A modern web application that provides AI tools across five studios, powered by [Alibaba Cloud Model Studio](https://www.alibabacloud.com/en/product/modelstudio) (DashScope API).

## Features

### Text Generation
- Chat with Qwen models (Qwen Plus, Max, Turbo, Qwen3 235B/32B/14B, QwQ Reasoning, Qwen3 Coder)
- **Multimodal chat** with Qwen3 Omni Flash (text + image input)
- Streaming responses with markdown rendering
- Code syntax highlighting
- Quick prompts for coding tasks

### Image Studio
- **Image Generation**: Wan 2.6/2.7 Text-to-Image + **Qwen Image Max**
- **Visual Understanding**: Analyze images with Qwen3.6 Plus (describe, extract text, answer questions)
- Gallery view for generated images

### Video Engine
- **Video Generation**: Wan 2.7 Text-to-Video and Image-to-Video (async task with polling)
- **Content Generator**: Blog posts, social media, video scripts, emails, ad copy, marketing plans
- **Marketing Copy AI**: Product descriptions, landing page copy, headlines, CTAs, brand stories

### Audio Lab
- **Text-to-Speech**: Qwen3 TTS Flash, CosyVoice v3 Flash with multiple voices
- **Speech Recognition**: Fun-ASR multi-language audio transcription (async task)
- Supports MP3, WAV, AAC, FLAC, M4A formats

### API Management
- Dashboard showing all 18+ AI models across 7 capability categories
- Model status monitoring and API configuration

## Tech Stack

- **Backend**: FastAPI (Python)
- **AI API**: Alibaba Cloud Model Studio (OpenAI-compatible + DashScope native)
- **Frontend**: Vanilla JS + Custom CSS (Nexus AI Core design system)
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
| `/api/vision` | POST | Analyze images with Qwen3.6 Plus (streaming) |
| `/api/multimodal` | POST | Multimodal chat with Qwen3 Omni Flash |
| `/api/image/generate` | POST | Generate images (Wan + Qwen Image Max) |
| `/api/video/generate` | POST | Generate video (Wan 2.7 T2V/I2V, async) |
| `/api/video/status/{task_id}` | GET | Poll video generation task status |
| `/api/tts` | POST | Text-to-Speech (Qwen TTS / CosyVoice) |
| `/api/asr` | POST | Speech recognition (Fun-ASR, async) |
| `/api/asr/status/{task_id}` | GET | Poll ASR transcription task status |
| `/api/content/generate` | POST | Generate content (streaming SSE) |
| `/api/models` | GET | List available models |

## License

MIT
