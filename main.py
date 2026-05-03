import os
import io
import json
import asyncio
import base64
import zipfile
import ipaddress
import socket
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

import httpcore
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

load_dotenv()


def _clean_env(name: str) -> str:
    """Read an env var and strip whitespace, BOM, and surrounding quotes.

    Defensive against `.env` files saved with PowerShell `Out-File -Encoding utf8`
    (which prepends a UTF-8 BOM) or with quoted values like `KEY="sk-..."`.
    """
    val = os.getenv(name, "") or ""
    # Strip BOM (rare but happens when the BOM lands inside the value).
    val = val.lstrip("\ufeff")
    val = val.strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
        val = val[1:-1].strip()
    return val


DASHSCOPE_API_KEY = _clean_env("DASHSCOPE_API_KEY")
DASHSCOPE_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_NATIVE_URL = "https://dashscope-intl.aliyuncs.com/api/v1"

# Multi-provider configuration. Each provider exposes an OpenAI-compatible
# /v1/chat/completions endpoint at its base_url (or close enough that the
# AsyncOpenAI client can talk to it). Provider-specific quirks should be
# handled in get_client_for().
PROVIDERS: Dict[str, Dict[str, Any]] = {
    "dashscope": {
        "name": "Alibaba Cloud DashScope",
        "base_url": DASHSCOPE_BASE_URL,
        "env_var": "DASHSCOPE_API_KEY",
        "key_prefix": "sk-",
        "key_url": "https://modelstudio.console.alibabacloud.com/",
    },
    "nvidia": {
        "name": "NVIDIA NIM",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "env_var": "NVIDIA_API_KEY",
        "key_prefix": "nvapi-",
        "key_url": "https://build.nvidia.com/settings/api-keys",
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "env_var": "OPENAI_API_KEY",
        "key_prefix": "sk-",
        "key_url": "https://platform.openai.com/api-keys",
    },
    "anthropic": {
        "name": "Anthropic Claude",
        "base_url": "https://api.anthropic.com/v1",
        "env_var": "ANTHROPIC_API_KEY",
        "key_prefix": "sk-ant-",
        "key_url": "https://console.anthropic.com/settings/keys",
    },
    "google": {
        "name": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "env_var": "GOOGLE_API_KEY",
        "key_prefix": "AIza",
        "key_url": "https://aistudio.google.com/apikey",
    },
    "groq": {
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "env_var": "GROQ_API_KEY",
        "key_prefix": "gsk_",
        "key_url": "https://console.groq.com/keys",
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "env_var": "DEEPSEEK_API_KEY",
        "key_prefix": "sk-",
        "key_url": "https://platform.deepseek.com/api_keys",
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "env_var": "OPENROUTER_API_KEY",
        "key_prefix": "sk-or-",
        "key_url": "https://openrouter.ai/keys",
    },
}


def get_client_for(provider: str, api_key: str = "", base_url_override: str = "") -> AsyncOpenAI:
    """Return an AsyncOpenAI client for the given provider.

    If ``api_key`` is empty, fall back to the provider's environment variable.
    If ``base_url_override`` is set (for "custom" provider), use it directly.
    Raises HTTPException(401) if no key is available.
    """
    if provider == "custom":
        if not base_url_override:
            raise HTTPException(status_code=400, detail="Custom provider requires base_url")
        if not api_key:
            raise HTTPException(status_code=401, detail="API key required for custom provider")
        return AsyncOpenAI(base_url=base_url_override, api_key=api_key)

    config = PROVIDERS.get(provider)
    if not config:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    # Strip whitespace/quotes from request-supplied keys too — clipboard
    # paste sometimes includes a trailing newline.
    api_key = (api_key or "").strip()
    if len(api_key) >= 2 and api_key[0] == api_key[-1] and api_key[0] in ("'", '"'):
        api_key = api_key[1:-1].strip()
    final_key = api_key or _clean_env(config.get("env_var", ""))
    if not final_key:
        raise HTTPException(
            status_code=401,
            detail=f"No API key configured for {config['name']}. Set it on the API Management page.",
        )

    return AsyncOpenAI(base_url=config["base_url"], api_key=final_key)


client: AsyncOpenAI | None = None
http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, http_client
    # Default DashScope client kept for native (non-OAI-compat) endpoints:
    # image gen, video gen, TTS, ASR. These remain DashScope-only.
    if DASHSCOPE_API_KEY:
        client = AsyncOpenAI(base_url=DASHSCOPE_BASE_URL, api_key=DASHSCOPE_API_KEY)
    http_client = httpx.AsyncClient(timeout=120.0)
    yield
    if http_client:
        await http_client.aclose()


app = FastAPI(title="AI Hub", version="3.0.0", lifespan=lifespan)

def _m(id_: str, name: str, type_: str, provider: str) -> dict:
    """Build a model entry. ``provider`` is the provider key from PROVIDERS."""
    return {"id": id_, "name": name, "type": type_, "provider": provider}


AVAILABLE_MODELS = {
    "text": [
        # DashScope (Alibaba Cloud)
        _m("qwen-plus", "Qwen Plus", "Text", "dashscope"),
        _m("qwen-max", "Qwen Max", "Text", "dashscope"),
        _m("qwen-turbo", "Qwen Turbo", "Text", "dashscope"),
        _m("qwen3-235b-a22b", "Qwen3 235B", "Text", "dashscope"),
        _m("qwen3-32b", "Qwen3 32B", "Text", "dashscope"),
        _m("qwen3-14b", "Qwen3 14B", "Text", "dashscope"),
        _m("qwq-plus", "QwQ Plus (Reasoning)", "Reasoning", "dashscope"),
        _m("qwen3-coder-plus", "Qwen3 Coder Plus", "Code", "dashscope"),
        # NVIDIA NIM
        _m("deepseek-ai/deepseek-r1", "DeepSeek R1 (Reasoning)", "Reasoning", "nvidia"),
        _m("deepseek-ai/deepseek-v3.2", "DeepSeek V3.2", "Text", "nvidia"),
        _m("meta/llama-3.3-70b-instruct", "Llama 3.3 70B Instruct", "Text", "nvidia"),
        _m("meta/llama-3.1-405b-instruct", "Llama 3.1 405B Instruct", "Text", "nvidia"),
        _m("meta/llama-3.1-8b-instruct", "Llama 3.1 8B Instruct", "Text", "nvidia"),
        _m("mistralai/mistral-medium-3.5-128b", "Mistral Medium 3.5 128B", "Text", "nvidia"),
        _m("mistralai/mixtral-8x7b-instruct-v0.1", "Mixtral 8x7B Instruct", "Text", "nvidia"),
        _m("nvidia/llama-3.1-nemotron-70b-instruct", "Llama 3.1 Nemotron 70B", "Code", "nvidia"),
        # OpenAI
        _m("gpt-4o", "GPT-4o", "Text", "openai"),
        _m("gpt-4o-mini", "GPT-4o mini", "Text", "openai"),
        _m("gpt-4.1", "GPT-4.1", "Text", "openai"),
        _m("o1-preview", "o1-preview (Reasoning)", "Reasoning", "openai"),
        _m("o1-mini", "o1-mini (Reasoning)", "Reasoning", "openai"),
        # Anthropic Claude
        _m("claude-3-5-sonnet-latest", "Claude 3.5 Sonnet", "Text", "anthropic"),
        _m("claude-3-5-haiku-latest", "Claude 3.5 Haiku", "Text", "anthropic"),
        _m("claude-3-opus-latest", "Claude 3 Opus", "Text", "anthropic"),
        # Google Gemini
        _m("gemini-2.0-flash-exp", "Gemini 2.0 Flash", "Text", "google"),
        _m("gemini-1.5-pro", "Gemini 1.5 Pro", "Text", "google"),
        _m("gemini-1.5-flash", "Gemini 1.5 Flash", "Text", "google"),
        # Groq (fast Llama)
        _m("llama-3.3-70b-versatile", "Llama 3.3 70B (Groq)", "Text", "groq"),
        _m("llama-3.1-70b-versatile", "Llama 3.1 70B (Groq)", "Text", "groq"),
        _m("mixtral-8x7b-32768", "Mixtral 8x7B (Groq)", "Text", "groq"),
        # DeepSeek direct
        _m("deepseek-chat", "DeepSeek V3 Chat", "Text", "deepseek"),
        _m("deepseek-reasoner", "DeepSeek R1 Reasoner", "Reasoning", "deepseek"),
        # OpenRouter (aggregator — model id includes provider prefix)
        _m("openai/gpt-4o", "GPT-4o (via OpenRouter)", "Text", "openrouter"),
        _m("anthropic/claude-3.5-sonnet", "Claude 3.5 Sonnet (via OpenRouter)", "Text", "openrouter"),
        _m("meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B (via OpenRouter)", "Text", "openrouter"),
    ],
    "multimodal": [
        _m("qwen3-omni-flash", "Qwen3 Omni Flash", "Multimodal", "dashscope"),
        _m("moonshotai/kimi-k2.6", "Kimi K2.6 (1T MoE)", "Multimodal", "nvidia"),
    ],
    "vision": [
        _m("qwen3.6-plus", "Qwen3.6 Plus (Vision)", "Vision", "dashscope"),
        _m("meta/llama-3.2-90b-vision-instruct", "Llama 3.2 90B Vision", "Vision", "nvidia"),
        _m("meta/llama-3.2-11b-vision-instruct", "Llama 3.2 11B Vision", "Vision", "nvidia"),
        _m("microsoft/phi-3.5-vision-instruct", "Phi 3.5 Vision", "Vision", "nvidia"),
        _m("gpt-4o", "GPT-4o (Vision)", "Vision", "openai"),
        _m("claude-3-5-sonnet-latest", "Claude 3.5 Sonnet (Vision)", "Vision", "anthropic"),
        _m("gemini-1.5-pro", "Gemini 1.5 Pro (Vision)", "Vision", "google"),
    ],
    "image": [
        _m("wan2.6-t2i", "Wan 2.6 Text-to-Image", "Image", "dashscope"),
        _m("wan2.7-image-pro", "Wan 2.7 Image Pro", "Image", "dashscope"),
        _m("wan2.7-image", "Wan 2.7 Image", "Image", "dashscope"),
        _m("qwen-image-max", "Qwen Image Max", "Image", "dashscope"),
    ],
    "video": [
        _m("wan2.7-t2v", "Wan 2.7 Text-to-Video", "Video", "dashscope"),
        _m("wan2.7-i2v", "Wan 2.7 Image-to-Video", "Video", "dashscope"),
    ],
    "tts": [
        _m("cosyvoice-v3-flash", "CosyVoice v3 Flash", "TTS", "dashscope"),
        _m("qwen3-tts-flash", "Qwen3 TTS Flash", "TTS", "dashscope"),
    ],
    "asr": [
        _m("fun-asr", "Fun-ASR", "ASR", "dashscope"),
    ],
}


# ===== Request Models =====

class ChatRequest(BaseModel):
    message: str
    model: str = "qwen-plus"
    system_prompt: str = ""
    temperature: float = 0.7
    stream: bool = True
    # Multi-provider fields. ``provider`` defaults to dashscope to stay
    # backwards-compatible. ``api_key`` overrides the env var for this request.
    # ``base_url`` is used when provider="custom".
    provider: str = "dashscope"
    api_key: str = ""
    base_url: str = ""


class VisionRequest(BaseModel):
    message: str
    image_url: str
    model: str = "qwen3.6-plus"
    stream: bool = True
    provider: str = "dashscope"
    api_key: str = ""
    base_url: str = ""


class MultimodalRequest(BaseModel):
    message: str
    image_url: str = ""
    audio_url: str = ""
    model: str = "qwen3-omni-flash"
    stream: bool = True
    provider: str = "dashscope"
    api_key: str = ""
    base_url: str = ""


class ImageRequest(BaseModel):
    prompt: str
    model: str = "wan2.6-t2i"
    size: str = "1024x1024"
    quality: str = "standard"
    negative_prompt: str = ""
    api_key: str = ""  # DashScope-only; overrides env var


class VideoRequest(BaseModel):
    prompt: str
    model: str = "wan2.7-t2v"
    image_url: str = ""
    duration: int = 5
    resolution: str = "720P"
    ratio: str = "16:9"
    api_key: str = ""  # DashScope-only; overrides env var


class TTSRequest(BaseModel):
    text: str
    provider: str = "qwen3-tts-flash"
    voice: str = "Cherry"
    api_key: str = ""  # DashScope-only; overrides env var


class ContentRequest(BaseModel):
    topic: str
    content_type: str = "blog"
    model: str = "qwen-plus"
    tone: str = "professional"
    language: str = "id"
    provider: str = "dashscope"
    api_key: str = ""
    base_url: str = ""


class ProviderTestRequest(BaseModel):
    provider: str
    api_key: str
    base_url: str = ""


# ===== Helper: URL validation (SSRF protection) =====

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fd00::/8"),
]


class _PinnedDNSBackend(httpcore.AsyncNetworkBackend):
    """Network backend that routes TCP connections to a pre-validated IP.

    httpcore calls ``connect_tcp(origin_host, port)`` and then
    ``start_tls(server_hostname=origin_host)``.  By overriding only
    ``connect_tcp`` to connect to the already-resolved IP, TLS still
    verifies the certificate against the original hostname (SNI is
    preserved), while the actual TCP connection goes to the pinned IP.
    This closes the TOCTOU / DNS-rebinding gap.
    """

    def __init__(self, ip_address: str) -> None:
        self._ip = ip_address
        self._backend = httpcore.AnyIOBackend()

    async def connect_tcp(
        self, host, port, timeout=None, local_address=None, socket_options=None,
    ):
        return await self._backend.connect_tcp(
            self._ip, port, timeout=timeout,
            local_address=local_address, socket_options=socket_options,
        )

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):
        return await self._backend.connect_unix_socket(
            path, timeout=timeout, socket_options=socket_options,
        )

    async def sleep(self, seconds):
        await self._backend.sleep(seconds)


async def _validate_and_fetch_audio(url: str) -> bytes:
    """Validate URL against SSRF and fetch content via the resolved IP.

    DNS is resolved once, the resulting IP is checked against
    ``_BLOCKED_NETWORKS``, and the HTTP request is routed through a
    pinned-DNS transport so that httpx/httpcore connect to the
    already-validated address (no second DNS lookup).
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed")
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL")

    try:
        addr = ipaddress.ip_address(hostname)
    except ValueError:
        try:
            loop = asyncio.get_running_loop()
            resolved = await loop.getaddrinfo(
                hostname, None, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM,
            )
            addr = ipaddress.ip_address(resolved[0][4][0])
        except (socket.gaierror, IndexError):
            raise HTTPException(status_code=400, detail="Cannot resolve hostname")

    for network in _BLOCKED_NETWORKS:
        if addr in network:
            raise HTTPException(status_code=400, detail="URL points to a blocked address range")

    backend = _PinnedDNSBackend(str(addr))
    pool = httpcore.AsyncConnectionPool(network_backend=backend)
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        target = (parsed.path or "/").encode()
        if parsed.query:
            target += b"?" + parsed.query.encode()
        response = await pool.request(
            method=b"GET",
            url=httpcore.URL(
                scheme=parsed.scheme.encode(),
                host=hostname.encode(),
                port=port,
                target=target,
            ),
            headers=[(b"host", hostname.encode()), (b"user-agent", b"AI-Hub/3.0")],
        )
        if response.status != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch audio from URL")
        max_size = 50 * 1024 * 1024  # 50 MB
        if len(response.content) > max_size:
            raise HTTPException(status_code=400, detail="Audio file too large (max 50 MB)")
        return response.content
    finally:
        await pool.aclose()


# ===== Helper: Native API headers =====

def _resolve_dashscope_key(api_key: str = "") -> str:
    """Resolve a DashScope API key from request override or env var."""
    api_key = (api_key or "").strip().lstrip("\ufeff")
    if len(api_key) >= 2 and api_key[0] == api_key[-1] and api_key[0] in ("'", '"'):
        api_key = api_key[1:-1].strip()
    final = api_key or DASHSCOPE_API_KEY
    if not final:
        raise HTTPException(
            status_code=401,
            detail="No DashScope API key configured. Set it on the API Management page.",
        )
    return final


def native_headers(async_mode: bool = False, api_key: str = "") -> dict:
    h = {
        "Authorization": f"Bearer {_resolve_dashscope_key(api_key)}",
        "Content-Type": "application/json",
    }
    if async_mode:
        h["X-DashScope-Async"] = "enable"
    return h


async def poll_task(task_id: str, max_wait: int = 300, api_key: str = "") -> dict:
    """Poll an async DashScope task until completion."""
    url = f"{DASHSCOPE_NATIVE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {_resolve_dashscope_key(api_key)}"}
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


@app.get("/api/providers")
async def get_providers():
    """Return the list of available providers and metadata for the UI.

    Each entry includes whether the server has a fallback env-var key set, so
    the frontend can hint the user about which providers will work even when
    no localStorage key is configured.
    """
    out = []
    for key, cfg in PROVIDERS.items():
        env_var = cfg.get("env_var", "")
        out.append({
            "id": key,
            "name": cfg["name"],
            "base_url": cfg["base_url"],
            "key_prefix": cfg.get("key_prefix", ""),
            "key_url": cfg.get("key_url", ""),
            "env_set": bool(os.getenv(env_var, "")) if env_var else False,
        })
    out.append({
        "id": "custom",
        "name": "Custom (OpenAI-compatible)",
        "base_url": "",
        "key_prefix": "",
        "key_url": "",
        "env_set": False,
    })
    return {"providers": out}


@app.post("/api/providers/test")
async def test_provider(req: ProviderTestRequest):
    """Verify an API key by issuing a tiny ping request.

    Returns ``{"ok": True}`` on success or HTTPException with the upstream
    error code/message on failure. The request is intentionally cheap (1 token).
    """
    try:
        c = get_client_for(req.provider, req.api_key, req.base_url)
        # Pick a small/cheap default model per provider for the smoke test.
        test_models = {
            "dashscope": "qwen-turbo",
            "nvidia": "meta/llama-3.1-8b-instruct",
            "openai": "gpt-4o-mini",
            "anthropic": "claude-3-5-haiku-latest",
            "google": "gemini-1.5-flash",
            "groq": "llama-3.1-8b-instant",
            "deepseek": "deepseek-chat",
            "openrouter": "openai/gpt-4o-mini",
        }
        model = test_models.get(req.provider, "gpt-4o-mini")
        resp = await c.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
        )
        return {"ok": True, "model": model, "response": (resp.choices[0].message.content or "")[:50]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/chat")
async def chat(req: ChatRequest):
    c = get_client_for(req.provider, req.api_key, req.base_url)

    messages = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    messages.append({"role": "user", "content": req.message})

    if req.stream:
        async def generate():
            stream = await c.chat.completions.create(
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

    response = await c.chat.completions.create(
        model=req.model,
        messages=messages,
        temperature=req.temperature,
    )
    return {"content": response.choices[0].message.content}


@app.post("/api/vision")
async def vision_analyze(req: VisionRequest):
    """Analyze an image using a vision-capable model (OpenAI-compatible)."""
    c = get_client_for(req.provider, req.api_key, req.base_url)

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
            stream = await c.chat.completions.create(
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

    response = await c.chat.completions.create(
        model=req.model,
        messages=messages,
    )
    return {"content": response.choices[0].message.content}


@app.post("/api/multimodal")
async def multimodal_chat(req: MultimodalRequest):
    """Chat with a multimodal model (text + image/audio)."""
    c = get_client_for(req.provider, req.api_key, req.base_url)

    content = []
    if req.image_url:
        content.append({"type": "image_url", "image_url": {"url": req.image_url}})
    if req.audio_url:
        audio_bytes = await _validate_and_fetch_audio(req.audio_url)
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        audio_path = urlparse(req.audio_url).path
        ext = audio_path.rsplit(".", 1)[-1].lower() if "." in audio_path else "mp3"
        fmt = ext if ext in ("mp3", "wav", "flac", "ogg", "m4a", "aac") else "mp3"
        content.append({"type": "input_audio", "input_audio": {"data": audio_b64, "format": fmt}})
    content.append({"type": "text", "text": req.message})

    messages = [{"role": "user", "content": content}]

    # ``modalities`` is a DashScope-specific Qwen Omni parameter; only pass it
    # for that provider/model to avoid 400s from upstreams that don't accept it.
    create_kwargs: dict = {"model": req.model, "messages": messages}
    if req.provider == "dashscope" and "omni" in req.model.lower():
        create_kwargs["modalities"] = ["text"]

    if req.stream:
        async def generate():
            stream_kwargs = dict(create_kwargs, stream=True)
            if req.provider == "dashscope" and "omni" in req.model.lower():
                stream_kwargs["stream_options"] = {"include_usage": True}
            stream = await c.chat.completions.create(**stream_kwargs)
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    data = json.dumps({"content": chunk.choices[0].delta.content})
                    yield f"data: {data}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    response = await c.chat.completions.create(**create_kwargs)
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
        resp = await http_client.post(url, json=payload, headers=native_headers(api_key=req.api_key))
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
    c = get_client_for("dashscope", req.api_key)

    try:
        response = await c.images.generate(
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
        resp = await http_client.post(url, json=payload, headers=native_headers(async_mode=True, api_key=req.api_key))
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
async def video_status(task_id: str, api_key: str = ""):
    """Check video generation task status."""
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {_resolve_dashscope_key(api_key)}"}

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
        resp = await http_client.post(url, json=payload, headers=native_headers(api_key=req.api_key))
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
async def speech_recognition(
    audio_url: str = Form(...),
    model: str = Form("fun-asr"),
    api_key: str = Form(""),
):
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
        resp = await http_client.post(url, json=payload, headers=native_headers(async_mode=True, api_key=api_key))
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
async def asr_status(task_id: str, api_key: str = ""):
    """Check ASR task status and get transcription result."""
    if not http_client:
        raise HTTPException(status_code=500, detail="HTTP client not initialized")

    url = f"{DASHSCOPE_NATIVE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {_resolve_dashscope_key(api_key)}"}

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
    c = get_client_for(req.provider, req.api_key, req.base_url)

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
        stream = await c.chat.completions.create(
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


# ===== File Attachment =====

# Upper bound on individual file size (10 MB) and aggregate text extraction.
# Larger files would blow up the chat context window anyway.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 200_000

# File extensions handled as plain text.
TEXT_EXTS = {
    ".txt", ".md", ".markdown", ".log", ".csv", ".tsv", ".json", ".xml",
    ".yaml", ".yml", ".toml", ".ini", ".html", ".htm", ".js", ".ts",
    ".py", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".sh", ".sql",
}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


def _ext(name: str) -> str:
    if "." not in name:
        return ""
    return "." + name.rsplit(".", 1)[-1].lower()


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - optional dep
        return "[PDF extraction requires `pypdf` (pip install pypdf)]"
    try:
        reader = PdfReader(io.BytesIO(data))
        out = []
        for page in reader.pages:
            try:
                out.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n\n".join(out).strip()
    except Exception as e:
        return f"[Failed to parse PDF: {e}]"


def _extract_docx(data: bytes) -> str:
    try:
        from docx import Document
    except ImportError:  # pragma: no cover
        return "[DOCX extraction requires `python-docx` (pip install python-docx)]"
    try:
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs).strip()
    except Exception as e:
        return f"[Failed to parse DOCX: {e}]"


def _extract_xlsx(data: bytes) -> str:
    try:
        from openpyxl import load_workbook
    except ImportError:  # pragma: no cover
        return "[XLSX extraction requires `openpyxl` (pip install openpyxl)]"
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        out = []
        for sheet in wb.sheetnames:
            ws = wb[sheet]
            out.append(f"## Sheet: {sheet}")
            for row in ws.iter_rows(max_rows=200, values_only=True):
                out.append("\t".join(str(c) if c is not None else "" for c in row))
        return "\n".join(out)
    except Exception as e:
        return f"[Failed to parse XLSX: {e}]"


def _extract_zip(data: bytes) -> str:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        return f"[Invalid ZIP: {e}]"

    parts: List[str] = []
    parts.append(f"## ZIP contents ({len(zf.namelist())} files)")
    for name in zf.namelist()[:50]:  # cap to first 50 entries
        if name.endswith("/"):
            parts.append(f"- {name} (directory)")
            continue
        info = zf.getinfo(name)
        if info.file_size > 1024 * 1024:  # skip files >1MB inside zip
            parts.append(f"- {name} ({info.file_size} bytes — skipped)")
            continue
        ext = _ext(name)
        try:
            inner = zf.read(name)
        except Exception as e:
            parts.append(f"- {name} (read error: {e})")
            continue
        parts.append(f"\n### {name}")
        if ext in TEXT_EXTS:
            try:
                parts.append(inner.decode("utf-8", errors="replace"))
            except Exception:
                parts.append(f"[binary file, {len(inner)} bytes]")
        elif ext == ".pdf":
            parts.append(_extract_pdf(inner))
        elif ext == ".docx":
            parts.append(_extract_docx(inner))
        else:
            parts.append(f"[unsupported file type {ext}, {len(inner)} bytes]")
    return "\n".join(parts)


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Receive an uploaded file and return text content (or base64 image data URI).

    Returns ``{kind: "text"|"image", filename, size, content}`` where content is
    either the extracted text (truncated to MAX_TEXT_CHARS) or a data URI for
    image files. Used by the chat UI to attach docs/images to a prompt.
    """
    name = file.filename or "uploaded"
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
        )

    ext = _ext(name)

    if ext in IMAGE_EXTS:
        mime_map = {".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp", ".gif": "gif", ".bmp": "bmp"}
        mime = mime_map.get(ext, "png")
        b64 = base64.b64encode(data).decode("ascii")
        return {
            "kind": "image",
            "filename": name,
            "size": len(data),
            "content": f"data:image/{mime};base64,{b64}",
        }

    if ext == ".pdf":
        text = _extract_pdf(data)
    elif ext == ".docx":
        text = _extract_docx(data)
    elif ext in (".xlsx", ".xlsm"):
        text = _extract_xlsx(data)
    elif ext == ".zip":
        text = _extract_zip(data)
    elif ext in TEXT_EXTS or not ext:
        text = data.decode("utf-8", errors="replace")
    else:
        # Best effort: try as text, otherwise reject.
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type: {ext or 'unknown'}",
            )

    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS] + f"\n\n[... truncated, original was {len(text)} chars]"

    return {
        "kind": "text",
        "filename": name,
        "size": len(data),
        "content": text,
    }


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")
