import { useState } from "react";
import { Wand2, Download, Copy, ImageIcon, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { ProviderBadge } from "./provider-badge";
import { MODELS, type Provider } from "./models";

type Gen = { id: string; prompt: string; url: string; model: string; size: string };

const SIZES = ["512×512", "768×768", "1024×1024", "1024×1536"];

const SEEDED: Gen[] = [
  { id: "g1", prompt: "Misty mountain village at sunrise", model: "Wanx Image v1", size: "1024×1024", url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=800" },
  { id: "g2", prompt: "Neon cyberpunk alley", model: "SDXL Turbo (NIM)", size: "1024×1024", url: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800" },
];

export function ImageStudio({ keys, onOpenKeys }: { keys: Record<Provider, boolean>; onOpenKeys: () => void }) {
  const imageModels = MODELS.filter((m) => m.type === "image");
  const [modelId, setModelId] = useState(imageModels[0].id);
  const [size, setSize] = useState(SIZES[2]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [gens, setGens] = useState<Gen[]>(SEEDED);
  const model = imageModels.find((m) => m.id === modelId)!;
  const keyMissing = !keys[model.provider];

  function generate() {
    if (!prompt.trim()) return;
    if (keyMissing) {
      toast.error(`${model.provider} key missing`, { action: { label: "Open keys", onClick: onOpenKeys } });
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const url = `https://picsum.photos/seed/${encodeURIComponent(prompt + Date.now())}/800/800`;
      setGens((g) => [{ id: crypto.randomUUID(), prompt, url, model: model.name, size }, ...g]);
      setBusy(false);
      toast.success("Image generated");
    }, 1200);
  }

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-px bg-border">
      <div className="bg-background p-4 space-y-4 overflow-y-auto">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Prompt</label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder="A cozy reading nook, soft window light, watercolor style…"
            className="resize-none text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Model</label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {imageModels.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between">
            <ProviderBadge provider={model.provider} />
            {keyMissing ? (
              <button onClick={onOpenKeys} className="text-[11px] text-amber-300 hover:text-amber-200">Key missing</button>
            ) : (
              <span className="text-[11px] text-emerald-400 font-mono">key ok</span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Size</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={generate}
          disabled={busy || !prompt.trim()}
          className="w-full gap-2 bg-cyan-500 hover:bg-cyan-400 text-cyan-950"
        >
          <Wand2 className="size-4" />
          {busy ? "Generating…" : "Generate"}
        </Button>
        {keyMissing && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs p-2.5 flex items-start gap-2">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <div>
              {model.provider} key missing.{" "}
              <button onClick={onOpenKeys} className="underline-offset-2 hover:underline">Open API Management</button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-background p-5 overflow-y-auto">
        {gens.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
            <ImageIcon className="size-10 mb-3 opacity-50" />
            <div className="text-sm">No generations yet</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {gens.map((g) => (
              <div key={g.id} className="rounded-lg border border-border bg-card/30 overflow-hidden flex flex-col">
                <div className="aspect-square bg-muted">
                  <img src={g.url} alt={g.prompt} className="size-full object-cover" />
                </div>
                <div className="p-3 space-y-2">
                  <div className="text-xs line-clamp-2">{g.prompt}</div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                    <span>{g.model}</span>
                    <span>{g.size}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5"
                      onClick={() => { navigator.clipboard.writeText(g.url); toast.success("URL copied"); }}>
                      <Copy className="size-3" /> Copy URL
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5" asChild>
                      <a href={g.url} download target="_blank" rel="noreferrer"><Download className="size-3" /> Download</a>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
