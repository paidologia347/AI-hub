import { cn } from "./ui/utils";
import { PROVIDER_TONE, type Provider } from "./models";

export function ProviderBadge({ provider, className }: { provider: Provider; className?: string }) {
  const tone = PROVIDER_TONE[provider];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-5 px-2 rounded text-[11px] font-mono ring-1",
        tone.bg,
        tone.text,
        tone.ring,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {provider}
    </span>
  );
}
