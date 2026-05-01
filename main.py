import os
import json
import asyncio
import base64
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
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


app = FastAPI(title="AI Hub", version="3.0.0", lifespan=lifespan)

AVAILABLE_MODELS = {
    "text": [
        {"id": "qwen-plus", "name": "Qwen Plus", "type": "Text", "provider": "Alibaba Cloud"},
        {"id": "qwen-max", "name": "Qwen Max", "type": "Text", "provider": "Alibaba Cloud"},
        {"id": "qwen-turbo", "name": "Qwen Turbo", "type": "Text", "provider": "Alibaba Cloud"},
        {"id": "qwen3-235b-a22b", "name": "Qwen3 235B", "type": "Text", "provider": "Alibaba Cloud"},
        {"id": "qwen3-32b", "name": "Qwen3 32B", "type": "Text", "provider": "Alibaba Cloud"},
        {"id": "qwen3-14b", "name": "Qwen3 14B", "type": "Text", "provider": "Alibaba Cloud"},
        {"id": "qwq-plus", "name": "QwQ Plus (Reasoning)", "type": "Reasoning", "provider": "Alibaba Cloud"},
        {"id": "qwen3-coder-plus", "name": "Qwen3 Coder Plus", "type": "Code", "provider": "Alibaba Cloud"},
    ],
    "multimodal": [
        {"id": "qwen3-omni-flash", "name": "Qwen3 Omni Flash", "type": "Multimodal", "provider": "Alibaba Cloud"},
    ],
    "vision": [
        {"id": "qwen3.6-plus", "name": "Qwen3.6 Plus (Vision)", "type": "Vision", "provider": "Alibaba Cloud"},
    ],
    "image": [
        {"id": "wan2.6-t2i", "name": "Wan 2.6 Text-to-Image", "type": "Image", "provider": "Alibaba Cloud"},
        {"id": "wan2.7-image-pro", "name": "Wan 2.7 Image Pro", "type": "Image", "provider": "Alibaba Cloud"},
        {"id": "wan2.7-image", "name": "Wan 2.7 Image", "type": "Image", "provider": "Alibaba Cloud"},
        {"id": "qwen-image-max", "name": "Qwen Image Max", "type": "Image", "provider": "Alibaba Cloud"},
    ],
    "video": [
        {"id": "wan2.7-t2v", "name": "Wan 2.7 Text-to-Video", "type": "Video", "provider": "Alibaba Cloud"},
        {"id": "wan2.7-i2v", "name": "Wan 2.7 Image-to-Video", "type": "Video", "provider": "Alibaba Cloud"},
    ],
    "tts": [
        {"id": "cosyvoice-v3-flash", "name": "CosyVoice v3 Flash", "type": "TTS", "provider": "Alibaba Cloud"},
        {"id": "qwen3-tts-flash", "name": "Qwen3 TTS Flash", "type": "TTS", "provider": "Alibaba Cloud"},
    ],
    "asr": [
        {"id": "fun-asr", "name": "Fun-ASR", "type": "ASR", "provider": "Alibaba Cloud"},
    ],
}


# ===== Request Models =====

class ChatRequest(BaseModel):
    message: str
    model: str = "qwen-plus"
    system_prompt: str = ""
    temperature: float = 0.7
    stream: bool = True


class VisionRequest(BaseModel):
    message: str
    image_url: str
    model: str = "qwen3.6-plus"
    stream: bool = True


class MultimodalRequest(BaseModel):
    message: str
    image_url: str = ""
    audio_url: str = ""
    model: str = "qwen3-omni-flash"
    stream: bool = True


class ImageRequest(BaseModel):
    prompt: str
    model: str = "wan2.6-t2i"
    size: str = "1024x1024"
    quality: str = "standard"
    negative_prompt: str = ""


class VideoRequest(BaseModel):
    prompt: str
    model: str = "wan2.7-t2v"
    image_url: str = ""
    duration: int = 5
    resolution: str = "720P"
    ratio: str = "16:9"


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


# ===== Helper: Native API headers =====

def native_headers(async_mode: bool = False) -> dict:
    h = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    if async_mode:
        h["X-DashScope-Async"] = "enable"
    return h


async def poll_task(task_id: str, max_wait: int = 300) -> dict:
    """Poll an async DashScope task until completion."""
    url = f"{DASHSCOPE_NATIVE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}
    for _ in range(max_wait // 3):
        await asyncio.sleep(3)
        resp = await http_client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        result = resp.json()
        status = result.get("output", {}).get("task_status", "")
        if status == "SUCCEEDED":
            return result
        if status == "FAILED":
            err_msg = result.get("output", {}).get("message", "Task failed")
            raise HTTPException(status_code=500, detail=err_msg)
    raise HTTPException(status_code=504, detail="Task timed out")


# ===== API Endpoints =====

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


@app.post("/api/vision")
async def vision_analyze(req: VisionRequest):
    """Analyze an image using Qwen3.6-Plus vision model (OpenAI-compatible)."""
    if not client:
        raise HTTPException(status_code=500, detail="AI client not initialized")

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": req.image_url}},
                {"type": "text", "text": req.message},
            ],
        }
    ]

    if req.stream:
        async def generate():
            stream = await client.chat.completions.create(
                model=req.model,
                messages=messages,
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
    )
    return {"content": response.choices[0].message.content}


@app.post("/api/multimodal")
async def multimodal_chat(req: MultimodalRequest):
    """Chat with Qwen3-Omni-Flash multimodal model (text + image/audio)."""
    if not client:
        raise HTTPException(status_code=500, detail="AI client not initialized")

    content = []
    if req.image_url:
        content.append({"type": "image_url", "image_url": {"url": req.image_url}})
    if req.audio_url:
        audio_resp = await http_client.get(req.audio_url)
        if audio_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch audio from URL")
        audio_b64 = base64.b64encode(audio_resp.content).decode("utf-8")
        ext = req.audio_url.rsplit(".", 1)[-1].lower() if "." in req.audio_url else "mp3"
        fmt = ext if ext in ("mp3", "wav", "flac", "ogg", "m4a", "aac") else "mp3"
        content.append({"type": "input_audio", "input_audio": {"data": audio_b64, "format": fmt}})
    content.append({"type": "text", "text": req.message})

    messages = [{"role": "user", "content": content}]

    if req.stream:
        async def generate():
            stream = await client.chat.completions.create(
                model=req.model,
                messages=messages,
                stream=True,
                modalities=["text"],
                stream_options={"include_usage": True},
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
        modalities=["text"],
    )
    return {"content": response.choices[0].message.content}


@app.post("/api/image/generate")
async def generate_image(req: ImageRequest):
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    if req.model == "qwen-image-max":
        return await _generate_qwen_image(req)

    url = f"{DASHSCOPE_NATIVE_URL}/services/aigc/multimodal-generation/generation"

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
        resp = await http_client.post(url, json=payload, headers=native_headers())
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


async def _generate_qwen_image(req: ImageRequest):
    """Generate image using Qwen-Image-Max via OpenAI-compatible endpoint."""
    if not client:
        raise HTTPException(status_code=500, detail="AI client not initialized")

    try:
        response = await client.images.generate(
            model="qwen-image-max",
            prompt=req.prompt,
            n=1,
            size=req.size.replace("*", "x") if "*" in req.size else req.size,
        )
        if response.data and response.data[0].url:
            return {"url": response.data[0].url}
        if response.data and response.data[0].b64_json:
            return {"b64_json": response.data[0].b64_json}
        raise HTTPException(status_code=500, detail="No image generated")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/video/generate")
async def generate_video(req: VideoRequest):
    """Generate video using Wan2.7 models (async task)."""
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/services/aigc/video-generation/video-synthesis"

    input_data = {"prompt": req.prompt}
    if req.image_url and req.model == "wan2.7-i2v":
        input_data["media"] = [{"type": "first_frame", "url": req.image_url}]

    payload = {
        "model": req.model,
        "input": input_data,
        "parameters": {
            "duration": req.duration,
            "resolution": req.resolution,
            "ratio": req.ratio,
        },
    }

    try:
        resp = await http_client.post(url, json=payload, headers=native_headers(async_mode=True))
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        result = resp.json()
        task_id = result.get("output", {}).get("task_id", "")
        if not task_id:
            raise HTTPException(status_code=500, detail="No task_id returned")

        return {"task_id": task_id, "status": "PENDING"}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/video/status/{task_id}")
async def video_status(task_id: str):
    """Check video generation task status."""
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}

    try:
        resp = await http_client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        result = resp.json()
        output = result.get("output", {})
        status = output.get("task_status", "UNKNOWN")

        response = {"task_id": task_id, "status": status}

        if status == "SUCCEEDED":
            video_url = output.get("video_url", "")
            if not video_url:
                results = output.get("results", [])
                if results:
                    video_url = results[0].get("url", "")
            response["video_url"] = video_url

        if status == "FAILED":
            response["error"] = output.get("message", "Task failed")

        return response
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/services/aigc/multimodal-generation/generation"

    payload = {
        "model": req.provider,
        "input": {
            "text": req.text,
            "voice": req.voice,
        },
    }

    try:
        resp = await http_client.post(url, json=payload, headers=native_headers())
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        result = resp.json()
        output = result.get("output", {})
        audio_data = output.get("audio", {})
        audio_url = audio_data.get("url", "") if isinstance(audio_data, dict) else audio_data

        if audio_url:
            audio_resp = await http_client.get(audio_url)
            if audio_resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to download generated audio")
            return StreamingResponse(
                iter([audio_resp.content]),
                media_type="audio/mpeg",
                headers={"Content-Disposition": "attachment; filename=speech.mp3"},
            )

        raise HTTPException(status_code=500, detail="No audio generated")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/asr")
async def speech_recognition(audio_url: str = Form(...), model: str = Form("fun-asr")):
    """Transcribe audio using Fun-ASR (async task)."""
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/services/audio/asr/transcription"

    payload = {
        "model": model,
        "input": {
            "file_urls": [audio_url],
        },
        "parameters": {
            "language_hints": ["en", "id", "zh"],
        },
    }

    try:
        resp = await http_client.post(url, json=payload, headers=native_headers(async_mode=True))
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        result = resp.json()
        task_id = result.get("output", {}).get("task_id", "")
        if not task_id:
            raise HTTPException(status_code=500, detail="No task_id returned")

        return {"task_id": task_id, "status": "PENDING"}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/asr/status/{task_id}")
async def asr_status(task_id: str):
    """Check ASR task status and get transcription result."""
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}

    try:
        resp = await http_client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        result = resp.json()
        output = result.get("output", {})
        status = output.get("task_status", "UNKNOWN")

        response = {"task_id": task_id, "status": status}

        if status == "SUCCEEDED":
            results = output.get("results", [])
            if results:
                transcript_url = results[0].get("transcription_url", "")
                if transcript_url:
                    tr_resp = await http_client.get(transcript_url)
                    if tr_resp.status_code == 200:
                        tr_data = tr_resp.json()
                        transcripts = tr_data.get("transcripts", [])
                        full_text = ""
                        for t in transcripts:
                            sentences = t.get("sentences", [])
                            for s in sentences:
                                full_text += s.get("text", "") + " "
                        response["transcript"] = full_text.strip()
                    else:
                        response["transcript"] = ""
                else:
                    response["transcript"] = ""
            else:
                response["transcript"] = ""

        if status == "FAILED":
            response["error"] = output.get("message", "Task failed")

        return response
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
