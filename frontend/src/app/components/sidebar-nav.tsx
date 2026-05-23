import { MessageSquare, Image as ImageIcon, Mic, KeyRound, Cpu } from "lucide-react";
import { cn } from "./ui/utils";

export type ViewKey = "text" | "image" | "content" | "keys";

const items: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "text", label: "Text Generation", icon: MessageSquare },
  { key: "image", label: "Image Studio", icon: ImageIcon },
  { key: "content", label: "Content & TTS", icon: Mic },
  { key: "keys", label: "API Management", icon: KeyRound },
];

export function SidebarNav({ active, onChange }: { active: ViewKey; onChange: (k: ViewKey) => void }) {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
        <div className="size-7 rounded bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
          <Cpu className="size-4" />
        </div>
        <div>
          <div className="text-sm">AI Hub</div>
          <div className="text-[11px] text-muted-foreground font-mono">127.0.0.1:8000</div>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 h-10 rounded-md text-sm text-left transition-colors",
                isActive
                  ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent",
              )}
            >
              <Icon className="size-4" />
              <span>{it.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border text-[11px] text-muted-foreground space-y-1">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>Local server online</span>
        </div>
        <div className="font-mono">v0.4.2 · build 1184</div>
      </div>
    </aside>
  );
}
