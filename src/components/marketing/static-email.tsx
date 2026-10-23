"use client";

import { useState } from "react";
import { DeviceSwitch } from "./brand-kit-editor";
import { EmailFrame, type EmailDevice } from "./email-frame";
import s from "./marketing.module.css";

/** A finished email, read only, at desktop or phone width. */
export function StaticEmail({ html, title }: { html: string; title: string }) {
  const [device, setDevice] = useState<EmailDevice>("desktop");
  return (
    <div className={s.previewCol} style={{ position: "static", maxHeight: "none" }}>
      <div className={s.previewHead}>
        <strong>{title}</strong>
        <DeviceSwitch device={device} onChange={setDevice} />
      </div>
      <EmailFrame html={html} device={device} title={title} testId="report-frame" />
    </div>
  );
}
