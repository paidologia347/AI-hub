import { FileText, FileImage, FileArchive, FileCode, FileSpreadsheet, File as FileIcon, Loader2, X, AlertCircle, Check } from "lucide-react";
import { cn } from "./ui/utils";

export type AttachmentStatus = "uploading" | "ready" | "error";

export type Attachment = {
  id: string;
  name: string;
  size: number;
  status: AttachmentStatus;
  kind?: "text" | "image";
  content?: string;
  error?: string;
};

function pickIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return FileImage;
  if (["zip", "tar", "gz", "rar"].includes(ext)) return FileArchive;
  if (["js", "ts", "tsx", "jsx", "py", "go", "rs", "cpp", "c", "java"].includes(ext)) return FileCode;
  if (["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) return FileText;
  return FileIcon;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentChip({ att, onRemove }: { att: Attachment; onRemove: (id: string) => void }) {
  const Icon = pickIcon(att.name);
  const isError = att.status === "error";
  const isUploading = att.status === "uploading";

  return (
    <div
      className={cn(
        "group inline-flex items-center gap-2 h-8 max-w-[260px] pl-2 pr-1 rounded-md border text-xs",
        isError
          ? "border-red-500/30 bg-red-500/10 text-red-300"
          : isUploading
            ? "border-border bg-muted/40 text-muted-foreground"
            : "border-cyan-500/20 bg-cyan-500/5 text-foreground",
      )}
      title={att.error ?? att.name}
    >
      {isUploading ? (
        <Loader2 className="size-3.5 animate-spin shrink-0" />
      ) : isError ? (
        <AlertCircle className="size-3.5 shrink-0" />
      ) : (
        <Icon className="size-3.5 shrink-0 text-cyan-300" />
      )}
      <span className="truncate min-w-0">{att.name}</span>
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
        {isError ? att.error : formatSize(att.size)}
      </span>
      {!isError && !isUploading && <Check className="size-3 text-emerald-400 shrink-0" />}
      <button
        type="button"
        onClick={() => onRemove(att.id)}
        className="size-5 rounded hover:bg-background/60 flex items-center justify-center shrink-0"
        aria-label="Remove attachment"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
