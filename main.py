import os
import json
import base64
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

load_dotenv()

PUTER_API_BASE = "https://api.puter.com"
PUTER_OPENAI_BASE = f"{PUTER_API_BASE}/puterai/openai/v1/"
PUTER_AUTH_TOKEN = os.getenv("PUTER_AUTH_TOKEN", "")

client: AsyncOpenAI | None = None
http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, http_client
    client = AsyncOpenAI(
        base_url=PUTER_OPENAI_BASE,
        api_key=PUTER_AUTH_TOKEN,
    )
    http_client = httpx.AsyncClient(timeout=120.0)
    yield
    await http_client.aclose()


app = FastAPI(title="AI Hub", version="1.0.0", lifespan=lifespan)

AVAILABLE_MODELS = {
    "text": [
        {"id": "gpt-4.1-nano", "name": "GPT-4.1 Nano", "provider": "OpenAI"},
        {"id": "gpt-4.1-mini", "name": "GPT-4.1 Mini", "provider": "OpenAI"},
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "Anthropic"},
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "provider": "Google"},
        {"id": "grok-3-mini", "name": "Grok 3 Mini", "provider": "xAI"},
        {"id": "deepseek-chat", "name": "DeepSeek Chat", "provider": "DeepSeek"},
        {"id": "deepseek-reasoner", "name": "DeepSeek Reasoner", "provider": "DeepSeek"},
    ],
    "image": [
        {"id": "gpt-image-1", "name": "GPT Image 1", "provider": "OpenAI"},
        {"id": "dall-e-3", "name": "DALL-E 3", "provider": "OpenAI"},
        {"id": "grok-2-image", "name": "Grok 2 Image", "provider": "xAI"},
    ],
    "tts": [
        {"id": "aws-polly", "name": "AWS Polly", "provider": "AWS"},
        {"id": "openai", "name": "OpenAI TTS", "provider": "OpenAI"},
        {"id": "elevenlabs", "name": "ElevenLabs", "provider": "ElevenLabs"},
    ],
}


class ChatRequest(BaseModel):
    message: str
    model: str = "gpt-4.1-nano"
    system_prompt: str = ""
    temperature: float = 0.7
    stream: bool = True


class ImageRequest(BaseModel):
    prompt: str
    model: str = "dall-e-3"
    size: str = "1024x1024"
    quality: str = "standard"


class TTSRequest(BaseModel):
    text: str
    provider: str = "openai"
    voice: str = "alloy"
    model: str = "gpt-4o-mini-tts"


class ContentRequest(BaseModel):
    topic: str
    content_type: str = "blog"
    model: str = "gpt-4.1-nano"
    tone: str = "professional"
    language: str = "id"


@app.get("/api/models")
async def get_models():
    return AVAILABLE_MODELS


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not client:
        raise HTTPException(status_code=500, detail="AI client not initialized")

    messages = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    messages.append({"role": "user", "content": req.message})

    if req.stream:
        async def generate():
            stream = await client.chat.completions.create(
                model=req.model,
                messages=messages,
                temperature=req.temperature,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    data = json.dumps({"content": chunk.choices[0].delta.content})
                    yield f"data: {data}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    response = await client.chat.completions.create(
        model=req.model,
        messages=messages,
        temperature=req.temperature,
    )
    return {"content": response.choices[0].message.content}


@app.post("/api/image/generate")
async def generate_image(req: ImageRequest):
    if not client:
        raise HTTPException(status_code=500, detail="AI client not initialized")
    try:
        response = await client.images.generate(
            model=req.model,
            prompt=req.prompt,
            size=req.size,
            quality=req.quality,
            n=1,
        )
        image_data = response.data[0]
        result = {}
        if image_data.url:
            result["url"] = image_data.url
        if image_data.b64_json:
            result["b64_json"] = image_data.b64_json
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    headers = {
        "Authorization": f"Bearer {PUTER_AUTH_TOKEN}",
        "Content-Type": "application/json",
    }

    if req.provider == "openai":
        url = f"{PUTER_OPENAI_BASE}audio/speech"
        payload = {
            "model": req.model,
            "input": req.text,
            "voice": req.voice,
            "response_format": "mp3",
        }
        resp = await http_client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return StreamingResponse(
            iter([resp.content]),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"},
        )

    if req.provider == "aws-polly":
        url = f"{PUTER_API_BASE}/puterai/txt2speech"
        payload = {
            "text": req.text,
            "voice": req.voice or "Joanna",
            "engine": "neural",
            "language": "en-US",
        }
        resp = await http_client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return StreamingResponse(
            iter([resp.content]),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"},
        )

    if req.provider == "elevenlabs":
        url = f"{PUTER_OPENAI_BASE}audio/speech"
        payload = {
            "model": "eleven_multilingual_v2",
            "input": req.text,
            "voice": req.voice or "Rachel",
            "response_format": "mp3",
        }
        resp = await http_client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return StreamingResponse(
            iter([resp.content]),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"},
        )

    raise HTTPException(status_code=400, detail=f"Unknown TTS provider: {req.provider}")


@app.post("/api/content/generate")
async def generate_content(req: ContentRequest):
    if not client:
        raise HTTPException(status_code=500, detail="AI client not initialized")

    prompts = {
        "blog": f"Write a comprehensive blog post about: {req.topic}. Tone: {req.tone}. Language: {req.language}. Include a title, introduction, main sections with subheadings, and conclusion. Use markdown formatting.",
        "social": f"Create 5 engaging social media posts about: {req.topic}. Tone: {req.tone}. Language: {req.language}. Include hashtags and emojis. Format each post clearly with a separator.",
        "script": f"Write a video script about: {req.topic}. Tone: {req.tone}. Language: {req.language}. Include: Hook (first 3 seconds), Introduction, Main content with timestamps, Call to action, and Outro.",
        "email": f"Write a professional email about: {req.topic}. Tone: {req.tone}. Language: {req.language}. Include subject line, greeting, body, and sign-off.",
        "ad": f"Create 3 advertising copy variations for: {req.topic}. Tone: {req.tone}. Language: {req.language}. Include headline, body copy, and call-to-action for each.",
        "marketing": f"Create a comprehensive marketing plan outline for: {req.topic}. Tone: {req.tone}. Language: {req.language}. Include target audience, key messages, channels, and KPIs.",
    }

    system_prompt = "You are a professional content creator and copywriter. Create high-quality, engaging content."
    user_prompt = prompts.get(req.content_type, prompts["blog"])

    async def generate():
        stream = await client.chat.completions.create(
            model=req.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.8,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                data = json.dumps({"content": chunk.choices[0].delta.content})
                yield f"data: {data}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")
