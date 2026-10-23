import type { Metadata } from "next";
import { FrameClient } from "./frame-client";

// The editor's live preview. It runs in a sandboxed frame with no access to the
// dashboard, and shows whatever page the editor sends it.
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

// Tells the editor if something breaks in here, since a sandboxed frame's errors
// are otherwise invisible to it. Runs before the app loads.
const REPORT = `(function(){function s(m){try{parent.postMessage({type:"bo-frame-error",message:String(m).slice(0,300)},"*")}catch(e){}}addEventListener("error",function(e){s(e.message||"error")});addEventListener("unhandledrejection",function(e){s(e.reason&&e.reason.message||"rejection")});try{parent.postMessage({type:"bo-frame-boot"},"*")}catch(e){}})()`;

export default function PageFrame() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: REPORT }} />
      <FrameClient />
    </>
  );
}
