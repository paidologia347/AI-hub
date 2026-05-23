import { useState } from "react";
import { Eye, EyeOff, Clipboard, Trash2, Save, ShieldCheck, ShieldAlert, Info, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { cn } from "./ui/utils";
import { MODELS, PROVIDER_STORAGE, PROVIDER_TONE, type Provider } from "./models";
import { ProviderBadge } from "./provider-badge";

type ProviderMeta = {
  id: Provider;
  blurb: string;
  docs: string;
};

const PROVIDERS: ProviderMeta[] = [
  { id: "DashScope", blurb: "Alibaba Cloud Qwen + Wanx", docs: "modelstudio.console.alibabacloud.com" },
  { id: "FreeModel", blurb: "Community models, no cost", docs: "freemodel.dev" },
  { id: "NVIDIA NIM", blurb: "NVIDIA Inference Microservices", docs: "build.nvidia.com" },
];

export function APIManagement({
  keys,
  setKey,
}: {
  keys: Record<Provider, boolean>;
  setKey: (p: Provider, saved: boolean) => void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 flex items-start gap-3 text-sm">
          <Info className="size-4 text-cyan-300 mt-0.5 shrink-0" />
          <div className="text-cyan-100/90">
            Keys are stored locally only. If <span className="font-mono">Paste</span> is blocked by the browser, click the field, press <span className="font-mono">Ctrl+V</span>, then <span className="font-mono">Save</span>.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              meta={p}
              saved={keys[p.id]}
              onSave={() => setKey(p.id, true)}
              onClear={() => setKey(p.id, false)}
            />
          ))}
        </div>

        <ModelsTable keys={keys} />
      </div>
    </div>
  );
}

function ProviderCard({
  meta,
  saved,
  onSave,
  onClear,
}: {
  meta: ProviderMeta;
  saved: boolean;
  onSave: () => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const tone = PROVIDER_TONE[meta.id];

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) {
        toast.warning("Clipboard is empty");
        return;
      }
      setValue(t.trim());
    } catch {
      toast.error("Paste blocked", { description: "Click the field, then press Ctrl+V" });
    }
  }

  function save() {
    if (!value.trim()) {
      toast.error("Enter a key first");
      return;
    }
    localStorage.setItem(PROVIDER_STORAGE[meta.id], value.trim());
    onSave();
    setValue("");
    toast.success(`${meta.id} key saved`);
  }

  function clear() {
    setValue("");
    localStorage.removeItem(PROVIDER_STORAGE[meta.id]);
    onClear();
    toast(`${meta.id} key cleared`);
  }

  return (
    <div className={cn("rounded-lg border bg-card/40 p-4 space-y-3", tone.ring, "ring-1")}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm">{meta.id}</div>
          <div className="text-xs text-muted-foreground">{meta.blurb}</div>
        </div>
        <ProviderBadge provider={meta.id} />
      </div>

      <div className={cn("inline-flex items-center gap-1.5 h-6 px-2 rounded text-[11px]",
        saved ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20"
              : "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20")}>
        {saved ? <ShieldCheck className="size-3" /> : <ShieldAlert className="size-3" />}
        {saved ? "Saved" : "Missing"}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">API key</label>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Input
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              placeholder={saved ? "key saved (paste new key to replace)" : "Paste key here"}
              className="pr-9 font-mono"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title={show ? "Hide" : "Show"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button variant="outline" size="icon" onClick={paste} title="Paste"><Clipboard className="size-4" /></Button>
        </div>
        <div className="flex gap-1.5">
          <Button onClick={save} className="flex-1 gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-cyan-950">
            <Save className="size-3.5" /> Save key
          </Button>
          <Button onClick={clear} variant="outline" className="gap-1.5">
            <Trash2 className="size-3.5" /> Clear
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground font-mono">{meta.docs}</div>
      </div>
    </div>
  );
}

function ModelsTable({ keys }: { keys: Record<Provider, boolean> }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card/30">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="text-sm">Models</div>
        <div className="text-xs text-muted-foreground font-mono">{MODELS.length} total</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Model</th>
              <th className="text-left px-4 py-2.5">Type</th>
              <th className="text-left px-4 py-2.5">Provider</th>
              <th className="text-left px-4 py-2.5">Key</th>
              <th className="text-left px-4 py-2.5">Availability</th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((m) => {
              const has = keys[m.provider];
              return (
                <tr key={m.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <div>{m.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{m.id}</div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">{m.type}</td>
                  <td className="px-4 py-2.5"><ProviderBadge provider={m.provider} /></td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex items-center gap-1 text-xs",
                      has ? "text-emerald-300" : "text-amber-300")}>
                      {has ? <ShieldCheck className="size-3" /> : <ShieldAlert className="size-3" />}
                      {has ? "saved" : "missing"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {has ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-300 text-xs">
                        <span className="size-1.5 rounded-full bg-emerald-400" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-amber-300 text-xs">
                        <AlertTriangle className="size-3" /> Needs key
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
