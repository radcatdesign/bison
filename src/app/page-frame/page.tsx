import type { Metadata } from "next";
import { FrameClient } from "./frame-client";

// The editor's live preview. It runs in a sandboxed frame with no access to the
// dashboard, and shows whatever page the editor sends it.
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

export default function PageFrame() {
  return <FrameClient />;
}
