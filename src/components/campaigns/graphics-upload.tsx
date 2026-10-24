"use client";

// Adding graphics to a campaign: pick or drop images, and each one is
// uploaded, re-encoded and filed here. Large photos are resized to fit.
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import s from "./campaigns.module.css";

export function GraphicsUpload({ campaignId, disabled }: { campaignId: string; disabled: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  async function send(files: File[]) {
    if (disabled || !files.length) return;
    const wrong: string[] = [];
    for (const [i, file] of files.slice(0, 20).entries()) {
      setBusy(files.length > 1 ? `Adding ${i + 1} of ${Math.min(files.length, 20)}` : "Adding");
      const body = new FormData();
      body.append("file", file);
      try {
        const r = await fetch(`/api/marketing/files?kind=graphic&campaign=${encodeURIComponent(campaignId)}`, { method: "POST", body });
        if (!r.ok) wrong.push(`${file.name}: ${((await r.json().catch(() => null)) as { message?: string } | null)?.message ?? "Couldn't add it. Try again."}`);
      } catch {
        wrong.push(`${file.name}: the upload stopped. Check your connection and try again.`);
      }
    }
    if (files.length > 20) wrong.push("Only the first 20 were added. Add the rest in another go.");
    setBusy(null);
    setProblems(wrong);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div
      className={s.drop}
      data-over={over || undefined}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void send([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
      }}
    >
      <div className={s.upload}>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void send([...(e.target.files ?? [])])} data-testid="graphic-input" />
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={disabled || Boolean(busy)} data-testid="graphic-add">
          <Upload aria-hidden="true" />
          {busy ?? "Add graphics"}
        </button>
        <span className="muted" style={{ fontSize: "var(--bo-text-sm)" }}>
          PNG, JPEG, GIF, WebP or HEIC, up to 12 MB each. Or drop them here.
        </span>
      </div>
      <div aria-live="polite">
        {problems.length > 0 && (
          <ul className="notice notice-error" style={{ margin: "12px 0 0", paddingLeft: 28 }} data-testid="graphic-problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Copies a graphic's link, for pasting into an email, a post or a doc. */
export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={() =>
        navigator.clipboard?.writeText(url).then(
          () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1600);
          },
          () => {},
        )
      }
    >
      {done ? "Copied" : "Copy link"}
    </button>
  );
}
