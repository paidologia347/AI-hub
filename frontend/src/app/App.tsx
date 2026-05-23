import { useState } from "react";
import { Toaster } from "./components/ui/sonner";
import { SidebarNav, type ViewKey } from "./components/sidebar-nav";
import { Topbar } from "./components/topbar";
import { TextGeneration } from "./components/text-generation";
import { ImageStudio } from "./components/image-studio";
import { ContentTTS } from "./components/content-tts";
import { APIManagement } from "./components/api-management";
import { readProviderKey, type Provider } from "./components/models";

export default function App() {
  const [view, setView] = useState<ViewKey>("text");
  const [keys, setKeys] = useState<Record<Provider, boolean>>({
    "DashScope": Boolean(readProviderKey("DashScope")),
    "FreeModel": Boolean(readProviderKey("FreeModel")),
    "NVIDIA NIM": Boolean(readProviderKey("NVIDIA NIM")),
  });

  const setKey = (p: Provider, saved: boolean) =>
    setKeys((k) => ({ ...k, [p]: saved }));

  const openKeys = () => setView("keys");

  return (
    <div className="dark size-full min-h-screen bg-background text-foreground flex">
      <SidebarNav active={view} onChange={setView} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar view={view} latency={42} />
        {view === "text" && <TextGeneration keys={keys} onOpenKeys={openKeys} />}
        {view === "image" && <ImageStudio keys={keys} onOpenKeys={openKeys} />}
        {view === "content" && <ContentTTS />}
        {view === "keys" && <APIManagement keys={keys} setKey={setKey} />}
      </div>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}
