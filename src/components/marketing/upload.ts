// Uploading an image from the brand kit or the email builder. Real accounts
// send it to the server, which resizes and stores it. The demo shrinks it here
// and keeps it in the browser, since nothing reaches a server there.
import type { EmailImage } from "@/lib/email/schema";

export type UploadResult = { ok: true; image: EmailImage } | { ok: false; message: string };

export async function uploadImage(file: File, kind: "logo" | "email-image", storage: "server" | "browser"): Promise<UploadResult> {
  if (!file.type.startsWith("image/")) return { ok: false, message: "That file isn't an image. Use a PNG, JPEG or GIF." };
  if (storage === "browser") return inBrowser(file, kind);
  const data = new FormData();
  data.set("file", file);
  data.set("kind", kind);
  try {
    const res = await fetch("/api/marketing/files", { method: "POST", body: data });
    const body = (await res.json().catch(() => ({}))) as { src?: string; width?: number; height?: number; message?: string };
    if (!res.ok || !body.src || !body.width || !body.height) return { ok: false, message: body.message ?? "The upload didn't finish. Try again." };
    return { ok: true, image: { src: body.src, width: body.width, height: body.height } };
  } catch {
    return { ok: false, message: "The upload didn't finish. Check your connection and try again." };
  }
}

async function inBrowser(file: File, kind: "logo" | "email-image"): Promise<UploadResult> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = kind === "logo" ? 480 : 900;
    const scale = Math.min(1, max / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) return { ok: false, message: "This browser couldn't read that image." };
    if (kind !== "logo") {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
    }
    g.drawImage(bitmap, 0, 0, w, h);
    const src = kind === "logo" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.78);
    if (src.length > 650_000) return { ok: false, message: "That image is too big to keep in the demo. Try a smaller one." };
    return { ok: true, image: { src, width: w, height: h } };
  } catch {
    return { ok: false, message: "This browser couldn't read that image. Try a PNG or JPEG." };
  }
}
