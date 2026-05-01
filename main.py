import os
import json
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

load_dotenv()

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
DASHSCOPE_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_NATIVE_URL = "https://dashscope-intl.aliyuncs.com/api/v1"

client: AsyncOpenAI | None = None
http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, http_client
    client = AsyncOpenAI(
        base_url=DASHSCOPE_BASE_URL,
        api_key=DASHSCOPE_API_KEY,
    )
    http_client = httpx.AsyncClient(timeout=120.0)
    yield
    await http_client.aclose()


app = FastAPI(title="AI Hub", version="2.0.0", lifespan=lifespan)

AVAILABLE_MODELS = {
    "text": [
        {"id": "qwen-plus", "name": "Qwen Plus", "provider": "Alibaba Cloud"},
        {"id": "qwen-max", "name": "Qwen Max", "provider": "Alibaba Cloud"},
        {"id": "qwen-turbo", "name": "Qwen Turbo", "provider": "Alibaba Cloud"},
        {"id": "qwen3-235b-a22b", "name": "Qwen3 235B", "provider": "Alibaba Cloud"},
        {"id": "qwen3-32b", "name": "Qwen3 32B", "provider": "Alibaba Cloud"},
        {"id": "qwen3-14b", "name": "Qwen3 14B", "provider": "Alibaba Cloud"},
        {"id": "qwq-plus", "name": "QwQ Plus (Reasoning)", "provider": "Alibaba Cloud"},
        {"id": "qwen3-coder-plus", "name": "Qwen3 Coder Plus", "provider": "Alibaba Cloud"},
    ],
    "image": [
        {"id": "wan2.6-t2i", "name": "Wan 2.6 Text-to-Image", "provider": "Alibaba Cloud"},
        {"id": "wan2.7-image-pro", "name": "Wan 2.7 Image Pro", "provider": "Alibaba Cloud"},
        {"id": "wan2.7-image", "name": "Wan 2.7 Image", "provider": "Alibaba Cloud"},
    ],
    "tts": [
        {"id": "cosyvoice-v3-flash", "name": "CosyVoice v3 Flash", "provider": "Alibaba Cloud"},
        {"id": "qwen3-tts-flash", "name": "Qwen3 TTS Flash", "provider": "Alibaba Cloud"},
    ],
}


class ChatRequest(BaseModel):
    message: str
    model: str = "qwen-plus"
    system_prompt: str = ""
    temperature: float = 0.7
    stream: bool = True


class ImageRequest(BaseModel):
    prompt: str
    model: str = "wan2.6-t2i"
    size: str = "1024x1024"
    quality: str = "standard"


class TTSRequest(BaseModel):
    text: str
    provider: str = "qwen3-tts-flash"
    voice: str = "Cherry"


class ContentRequest(BaseModel):
    topic: str
    content_type: str = "blog"
    model: str = "qwen-plus"
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
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/services/aigc/multimodal-generation/generation"
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": req.model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": req.prompt}],
                }
            ]
        },
        "parameters": {
            "size": req.size,
            "n": 1,
            "watermark": False,
        },
    }

    try:
        resp = await http_client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        result = resp.json()
        output = result.get("output", {})
        choices = output.get("choices", [])

        if choices:
            content = choices[0].get("message", {}).get("content", [])
            for item in content:
                if "image" in item:
                    return {"url": item["image"]}

        raise HTTPException(status_code=500, detail="No image generated")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/services/aigc/multimodal-generation/generation"
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": req.provider,
        "input": {
            "text": req.text,
            "voice": req.voice,
        },
    }

    try:
        resp = await http_client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        result = resp.json()
        output = result.get("output", {})
        audio_url = output.get("audio", "")

        if audio_url:
            audio_resp = await http_client.get(audio_url)
            return StreamingResponse(
                iter([audio_resp.content]),
                media_type="audio/mpeg",
                headers={"Content-Disposition": "attachment; filename=speech.mp3"},
            )

        raise HTTPException(status_code=500, detail="No audio generated")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))


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
