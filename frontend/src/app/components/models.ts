export type Provider = "DashScope" | "FreeModel" | "NVIDIA NIM";

export const PROVIDER_TONE: Record<Provider, { text: string; bg: string; ring: string }> = {
  "DashScope": { text: "text-orange-300", bg: "bg-orange-500/10", ring: "ring-orange-500/20" },
  "FreeModel": { text: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
  "NVIDIA NIM": { text: "text-lime-300", bg: "bg-lime-500/10", ring: "ring-lime-500/20" },
};

export type ModelInfo = {
  id: string;
  name: string;
  provider: Provider;
  type: "text" | "image" | "tts";
};

export const MODELS: ModelInfo[] = [
  { id: "qwen-plus", name: "Qwen Plus", provider: "DashScope", type: "text" },
  { id: "qwen-max", name: "Qwen Max", provider: "DashScope", type: "text" },
  { id: "qwen-turbo", name: "Qwen Turbo", provider: "DashScope", type: "text" },
  { id: "qwen3-235b-a22b", name: "Qwen3 235B", provider: "DashScope", type: "text" },
  { id: "qwen3-32b", name: "Qwen3 32B", provider: "DashScope", type: "text" },
  { id: "qwen3-14b", name: "Qwen3 14B", provider: "DashScope", type: "text" },
  { id: "qwq-plus", name: "QwQ Plus", provider: "DashScope", type: "text" },
  { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus", provider: "DashScope", type: "text" },
  { id: "gpt-5.5", name: "GPT-5.5", provider: "FreeModel", type: "text" },
  { id: "gpt-5.4", name: "GPT-5.4", provider: "FreeModel", type: "text" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "FreeModel", type: "text" },
  { id: "gpt-5.3-codex", name: "GPT-5.3 Codex", provider: "FreeModel", type: "text" },
  { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "NVIDIA NIM", type: "text" },
  { id: "meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B", provider: "NVIDIA NIM", type: "text" },
  { id: "nvidia/llama-3.1-nemotron-nano-8b-v1", name: "Nemotron Nano 8B", provider: "NVIDIA NIM", type: "text" },
  { id: "nvidia/llama-3.1-nemotron-51b-instruct", name: "Nemotron 51B", provider: "NVIDIA NIM", type: "text" },
  { id: "wan2.6-t2i", name: "Wan 2.6 Text-to-Image", provider: "DashScope", type: "image" },
  { id: "wan2.7-image-pro", name: "Wan 2.7 Image Pro", provider: "DashScope", type: "image" },
  { id: "wan2.7-image", name: "Wan 2.7 Image", provider: "DashScope", type: "image" },
  { id: "qwen3-tts-flash", name: "Qwen3 TTS Flash", provider: "DashScope", type: "tts" },
  { id: "cosyvoice-v3-flash", name: "CosyVoice v3 Flash", provider: "DashScope", type: "tts" },
];

export const PROVIDER_STORAGE: Record<Provider, string> = {
  "DashScope": "aihub.dashscopeApiKey",
  "FreeModel": "aihub.freemodelApiKey",
  "NVIDIA NIM": "aihub.nvidiaApiKey",
};

export function readProviderKey(provider: Provider) {
  try {
    return localStorage.getItem(PROVIDER_STORAGE[provider]) || "";
  } catch {
    return "";
  }
}
