# AI Hub - Multi-Tool AI Platform

A modern web application that provides AI tools across three studios, powered by the [Puter API](https://developer.puter.com/ai/).

## Features

### AI Text Studio
- Chat with multiple LLMs (GPT-4.1, Claude Sonnet 4, Gemini 2.0, Grok 3, DeepSeek)
- Streaming responses with markdown rendering
- Code syntax highlighting
- Quick prompts for coding tasks (explain, debug, refactor, test writing)
- Adjustable temperature and system prompts

### AI Media Studio
- **Text-to-Speech**: OpenAI TTS, AWS Polly, ElevenLabs with multiple voices
- **Content Generator**: Blog posts, social media, video scripts, emails, ad copy, marketing plans
- Multi-language support (Indonesian, English, Spanish, French)

### AI Creative Studio
- **Image Generator**: DALL-E 3, GPT Image 1, Grok 2 Image
- **Marketing Copy AI**: Product descriptions, landing page copy, headlines, CTAs, brand stories

## Tech Stack

- **Backend**: FastAPI (Python)
- **AI API**: Puter OpenAI-compatible endpoint
- **Frontend**: Vanilla JS + Tailwind CSS
- **Streaming**: Server-Sent Events (SSE)

## Setup

1. Clone the repository:
```bash
git clone https://github.com/paidologia347/ai-hub.git
cd ai-hub
```

2. Install dependencies:
```bash
pip install -e .
```

3. Set your Puter auth token:
```bash
cp .env.example .env
# Edit .env and add your PUTER_AUTH_TOKEN
# Get your token at https://puter.com/dashboard
```

4. Run the app:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

5. Open http://localhost:8000

## Environment Variables

| Variable | Description |
|---|---|
| `PUTER_AUTH_TOKEN` | Your Puter authentication token ([get it here](https://puter.com/dashboard)) |

## License

MIT
