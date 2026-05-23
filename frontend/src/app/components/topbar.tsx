import { Bell, Settings } from "lucide-react";
import { Button } from "./ui/button";
import type { ViewKey } from "./sidebar-nav";

const titles: Record<ViewKey, string> = {
  text: "Text Generation",
  image: "Image Studio",
  content: "Content & TTS",
  keys: "API Management",
};

export function Topbar({ view, latency }: { view: ViewKey; latency: number }) {
  return (
    <header className="h-14 border-b border-border bg-card/40 backdrop-blur flex items-center px-5 gap-4">
      <div className="text-sm">{titles[view]}</div>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 px-3 h-8 rounded-md border border-border bg-background/60 font-mono text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>ready · {latency}ms</span>
        </div>
        <Button variant="ghost" size="icon" title="Notifications">
          <Bell className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Settings">
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  );
}
