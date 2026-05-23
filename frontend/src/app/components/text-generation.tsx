import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Send, Copy, AlertTriangle, Sparkles, KeyRound } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./ui/select";
import { ScrollArea } from "./ui/scroll-area";
import { toast } from "sonner";
import { cn } from "./ui/utils";
import { ProviderBadge } from "./provider-badge";
import { AttachmentChip, type Attachment } from "./attachment-chip";
import { MODELS, readProviderKey, type Provider } from "./models";

type Msg = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  attachments?: { name: string }[];
  streaming?: boolean;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SUPPORTED = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "md", "csv", "zip", "png", "jpg", "jpeg", "webp", "svg", "json", "js", "ts", "tsx", "py"];

export function TextGeneration({
  keys,
  onOpenKeys,
}: {
  keys: Record<Provider, boolean>;
  onOpenKeys: () => void;
}) {
  const textModels = MODELS.filter((m) => m.type === "text");
  const [modelId, setModelId] = useState(textModels[0].id);
  const model = textModels.find((m) => m.id === modelId)!;
  const [systemPrompt, setSystemPrompt] = useState("You are a precise, concise local assistant.");
  const [temperature, setTemperature] = useState(0.7);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const keyMissing = !keys[model.provider];

  const stats = useMemo(() => {
    const total = messages.length;
    const tokens = messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
    return { total, tokens };
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const id = crypto.randomUUID();
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (f.size > MAX_FILE_BYTES) {
        setAttachments((a) => [...a, { id, name: f.name, size: f.size, status: "error", error: "File too large (max 10 MB)" }]);
        return;
      }
      if (!SUPPORTED.includes(ext)) {
        setAttachments((a) => [...a, { id, name: f.name, size: f.size, status: "error", error: "Unsupported file type" }]);
        return;
      }
      setAttachments((a) => [...a, { id, name: f.name, size: f.size, status: "uploading" }]);
      uploadAttachment(id, f);
    });
  }

  async function uploadAttachment(id: string, file: File) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Upload failed (${response.status})`);
      }
      const data = await response.json();
      setAttachments((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, status: "ready", kind: data.kind, content: data.content, size: data.size ?? item.size }
            : item,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setAttachments((items) =>
        items.map((item) => (item.id === id ? { ...item, status: "error", error: message } : item)),
      );
    }
  }

  function removeAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  function send() {
    if (!input.trim() && attachments.filter((a) => a.status === "ready").length === 0) return;
    if (attachments.some((a) => a.status === "uploading")) {
      toast.info("Wait for uploads to finish");
      return;
    }
    if (keyMissing) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", content: input || "(attachments only)" },
        {
          id: crypto.randomUUID(),
          role: "error",
          content: `${model.provider} API key is missing. Paste it in API Management.`,
        },
      ]);
      setInput("");
      return;
    }
    const ready = attachments.filter((a) => a.status === "ready");
    const apiKey = readProviderKey(model.provider);
    const attachmentText = ready
      .map((file) => {
        if (file.kind === "image") {
          return `### Attached image: ${file.name}\n\n[Image uploaded. Current chat endpoint receives this as context metadata.]`;
        }
        return `### Attached file: ${file.name}\n\n${file.content || ""}`;
      })
      .join("\n\n---\n\n");
    const finalPrompt = attachmentText
      ? `${attachmentText}\n\n---\n\n${input || "(see attached file(s))"}`
      : input;
    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: input || "(see attachments)",
      attachments: ready.map((r) => ({ name: r.name })),
    };
    const asstId = crypto.randomUUID();
    setMessages((m) => [...m, userMsg, { id: asstId, role: "assistant", content: "", streaming: true }]);
    setInput("");
    streamChat(asstId, {
      message: finalPrompt,
      model: model.id,
      system_prompt: systemPrompt,
      temperature,
      stream: true,
      api_key: apiKey,
    });
  }

  async function streamChat(messageId: string, payload: Record<string, unknown>) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Chat failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response stream unavailable");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.content) {
              fullText += parsed.content;
              setMessages((items) => items.map((item) => (item.id === messageId ? { ...item, content: fullText } : item)));
            }
          } catch {
            // Ignore non-JSON stream lines.
          }
        }
      }

      setMessages((items) => items.map((item) => (item.id === messageId ? { ...item, streaming: false } : item)));
      setAttachments([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setMessages((items) =>
        items.map((item) => (item.id === messageId ? { ...item, role: "error", content: message, streaming: false } : item)),
      );
    }
  }

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-px bg-border">
      {/* Left: model config */}
      <div className="bg-background p-4 space-y-5 overflow-y-auto">
        <section className="space-y-2">
          <label className="text-xs text-muted-foreground">Model</label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["DashScope", "FreeModel", "NVIDIA NIM"] as Provider[]).map((p) => (
                <SelectGroup key={p}>
                  <SelectLabel>{p}</SelectLabel>
                  {textModels.filter((m) => m.provider === p).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between">
            <ProviderBadge provider={model.provider} />
            {keyMissing ? (
              <button onClick={onOpenKeys} className="text-[11px] text-amber-300 hover:text-amber-200 inline-flex items-center gap-1">
                <KeyRound className="size-3" /> Key missing
              </button>
            ) : (
              <span className="text-[11px] text-emerald-400 font-mono">key ok</span>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <label className="text-xs text-muted-foreground">System prompt</label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            className="resize-none text-sm"
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Temperature</span>
            <span className="font-mono">{temperature.toFixed(2)}</span>
          </div>
          <Slider min={0} max={1.5} step={0.05} value={[temperature]} onValueChange={(v) => setTemperature(v[0])} />
        </section>

        <section className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between"><span>Max tokens</span><span className="font-mono text-foreground">4096</span></div>
          <div className="flex items-center justify-between"><span>Top-p</span><span className="font-mono text-foreground">0.95</span></div>
          <div className="flex items-center justify-between"><span>Stop</span><span className="font-mono text-foreground">—</span></div>
        </section>
      </div>

      {/* Center: chat */}
      <div className="bg-background flex flex-col min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <EmptyChat keyMissing={keyMissing} onOpenKeys={onOpenKeys} provider={model.provider} />
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((m) => <Bubble key={m.id} msg={m} onOpenKeys={onOpenKeys} />)}
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 bg-card/30">
          <div className="max-w-3xl mx-auto space-y-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a) => <AttachmentChip key={a.id} att={a} onRemove={removeAttachment} />)}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-lg border border-border bg-background focus-within:border-cyan-500/40 focus-within:ring-1 focus-within:ring-cyan-500/30 transition-colors">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Attach file"
                className="h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="size-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={`Ask ${model.name}… Shift+Enter for newline`}
                rows={1}
                className="flex-1 bg-transparent outline-none resize-none py-3 text-sm max-h-40"
              />
              <Button onClick={send} className="m-1.5 h-8 gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-cyan-950">
                <Send className="size-3.5" /> Generate
              </Button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span>Max 10 MB · pdf, docx, xlsx, zip, code, images</span>
              <span>{input.length} chars</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: stats + logs */}
      <div className="bg-background p-4 space-y-4 overflow-y-auto hidden lg:block">
        <div>
          <div className="text-xs text-muted-foreground mb-2">Live stats</div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Messages" value={stats.total.toString()} />
            <Stat label="~ Tokens" value={stats.tokens.toString()} />
            <Stat label="Provider" value={model.provider.split(" ")[0]} />
            <Stat label="Temp" value={temperature.toFixed(2)} />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-2">Recent logs</div>
          <ScrollArea className="h-64 rounded-md border border-border bg-card/30 p-2 font-mono text-[11px] leading-relaxed">
            <LogLine tone="info">boot ok · http://127.0.0.1:8000</LogLine>
            <LogLine tone="ok">providers loaded: dashscope, freemodel, nim</LogLine>
            <LogLine tone="warn">cache miss · embeddings v3</LogLine>
            {messages.filter((m) => m.role === "user").slice(-5).map((m) => (
              <LogLine key={m.id} tone="info">→ {model.id} · {m.content.slice(0, 36)}{m.content.length > 36 ? "…" : ""}</LogLine>
            ))}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function EmptyChat({ provider, keyMissing, onOpenKeys }: { provider: Provider; keyMissing: boolean; onOpenKeys: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
      <div className="size-12 rounded-lg bg-cyan-500/10 text-cyan-300 flex items-center justify-center mb-4">
        <Sparkles className="size-5" />
      </div>
      <div className="text-base">Start a conversation</div>
      <p className="text-sm text-muted-foreground mt-1">
        Pick a model on the left, attach files if you need to, then send.
      </p>
      {keyMissing && (
        <div className="mt-4 inline-flex items-center gap-2 px-3 h-9 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs">
          <AlertTriangle className="size-3.5" />
          <span>{provider} key missing.</span>
          <button onClick={onOpenKeys} className="underline-offset-2 hover:underline">Open API Management</button>
        </div>
      )}
    </div>
  );
}

function Bubble({ msg, onOpenKeys }: { msg: Msg; onOpenKeys: () => void }) {
  if (msg.role === "error") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200 flex items-start gap-2">
        <AlertTriangle className="size-4 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div>{msg.content}</div>
          <button onClick={onOpenKeys} className="mt-1 text-xs underline-offset-2 hover:underline text-red-200/90">
            Go to API Management →
          </button>
        </div>
      </div>
    );
  }
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[78%] rounded-lg px-3.5 py-2.5 text-sm",
        isUser ? "bg-cyan-500/10 border border-cyan-500/20" : "bg-card border border-border")}
      >
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {msg.attachments.map((a, i) => (
              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-background/60 border border-border font-mono">
                {a.name}
              </span>
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">
          {msg.content}
          {msg.streaming && <span className="inline-block w-1.5 h-4 align-middle bg-cyan-400/80 animate-pulse ml-0.5" />}
        </div>
        {!isUser && !msg.streaming && msg.content && (
          <button
            onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied"); }}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-3" /> Copy
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm mt-0.5">{value}</div>
    </div>
  );
}

function LogLine({ tone, children }: { tone: "info" | "ok" | "warn"; children: React.ReactNode }) {
  const c = tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-cyan-300";
  return <div className={c}>{children}</div>;
}

function mockReply(model: string, prompt: string, files: string[]) {
  const fileLine = files.length ? `\n\nI parsed ${files.length} attachment${files.length > 1 ? "s" : ""}: ${files.join(", ")}.` : "";
  return `Using ${model}.${fileLine}\n\nHere's a draft based on "${prompt.slice(0, 80)}":\n\n• Point one with concrete detail\n• Point two with a small example\n• Point three with a follow-up question\n\nLet me know if you want this tightened, expanded, or turned into code.`;
}
