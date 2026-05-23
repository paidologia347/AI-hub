import { useState } from "react";
import { Mic, FileText, Megaphone, Copy, Download, Play, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Slider } from "./ui/slider";
import { toast } from "sonner";

export function ContentTTS() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <Tabs defaultValue="content">
          <TabsList className="mb-5">
            <TabsTrigger value="content" className="gap-1.5"><FileText className="size-3.5" /> Content</TabsTrigger>
            <TabsTrigger value="tts" className="gap-1.5"><Mic className="size-3.5" /> Text-to-Speech</TabsTrigger>
            <TabsTrigger value="marketing" className="gap-1.5"><Megaphone className="size-3.5" /> Marketing Copy</TabsTrigger>
          </TabsList>

          <TabsContent value="content"><ContentPanel /></TabsContent>
          <TabsContent value="tts"><TTSPanel /></TabsContent>
          <TabsContent value="marketing"><MarketingPanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ContentPanel() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Professional");
  const [output, setOutput] = useState("");
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
        <div className="text-sm">Article draft</div>
        <Textarea
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          placeholder="Generated content will appear here…"
          className="min-h-[360px] resize-none font-mono text-sm"
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!output}
            onClick={() => { navigator.clipboard.writeText(output); toast.success("Copied"); }}>
            <Copy className="size-3.5" /> Copy
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!output}>
            <Download className="size-3.5" /> Download .md
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 ml-auto" disabled={!output}
            onClick={() => setOutput("")}>
            <RotateCcw className="size-3.5" /> Retry
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Topic</label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. local-first AI tools" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Tone</label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Professional", "Casual", "Technical", "Friendly"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!topic.trim()}
            onClick={() => {
              setOutput(`# ${topic}\n\nA short, ${tone.toLowerCase()} take on ${topic}.\n\n- Why it matters now\n- One concrete example\n- A small action you can take today\n`);
              toast.success("Draft generated");
            }}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-cyan-950"
          >Generate</Button>
        </div>
      </div>
    </div>
  );
}

function TTSPanel() {
  const [text, setText] = useState("Halo, ini adalah uji coba text-to-speech dari AI Hub.");
  const [voice, setVoice] = useState("Indah (id-ID)");
  const [speed, setSpeed] = useState(1);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[260px] resize-none text-sm" />
        <div className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center gap-3">
            <Button size="icon" className="size-9 rounded-full bg-cyan-500 hover:bg-cyan-400 text-cyan-950">
              <Play className="size-4" />
            </Button>
            <div className="flex-1">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full w-1/3 bg-cyan-400/70" />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground font-mono">
                <span>0:08</span><span>0:24</span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="size-3.5" /> .mp3</Button>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Voice</label>
          <Select value={voice} onValueChange={setVoice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Indah (id-ID)", "Budi (id-ID)", "Ava (en-US)", "Liang (zh-CN)"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Speed</span><span className="font-mono">{speed.toFixed(2)}x</span></div>
          <Slider min={0.5} max={2} step={0.05} value={[speed]} onValueChange={(v) => setSpeed(v[0])} />
        </div>
        <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-cyan-950" onClick={() => toast.success("Audio rendered (mock)")}>Synthesize</Button>
      </div>
    </div>
  );
}

function MarketingPanel() {
  const [product, setProduct] = useState("AI Hub");
  const [outputs, setOutputs] = useState<string[]>([]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Product</label>
          <Input value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <Button
          onClick={() => setOutputs([
            `${product}: every model, one window.`,
            `Stop juggling API keys. Start shipping with ${product}.`,
            `${product} — local-first AI for people who actually have work to do.`,
          ])}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-cyan-950"
        >Generate taglines</Button>
      </div>
      <div className="space-y-2">
        {outputs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Generate taglines to see results.
          </div>
        ) : outputs.map((t, i) => (
          <div key={i} className="rounded-lg border border-border bg-card/30 p-3 flex items-start gap-2">
            <div className="flex-1 text-sm">{t}</div>
            <Button variant="ghost" size="sm" className="gap-1.5"
              onClick={() => { navigator.clipboard.writeText(t); toast.success("Copied"); }}>
              <Copy className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
