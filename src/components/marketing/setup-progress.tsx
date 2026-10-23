"use client";

// The setup summary on the Marketing overview: how far along, and the next step.
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { progressOf, type ToolSetup } from "@/lib/marketing/setup-steps";
import { useDemoSetup } from "./demo-setup";
import s from "./marketing.module.css";

export function SetupProgress({ tools, demo }: { tools: ToolSetup[] | null; demo: { tenantId: string; base: { subscribers: number; lists: number } } | null }) {
  return demo ? <DemoProgress {...demo} /> : <Progress tools={tools ?? []} />;
}

function DemoProgress({ tenantId, base }: { tenantId: string; base: { subscribers: number; lists: number } }) {
  return <Progress tools={useDemoSetup(tenantId, base)} />;
}

function Progress({ tools }: { tools: ToolSetup[] }) {
  const p = progressOf(tools);
  const share = p.total ? Math.round((p.done / p.total) * 100) : 0;
  if (!p.next) {
    return (
      <div className={s.setupFolded} data-complete data-testid="overview-setup">
        <span className={s.setupFoldedIcon} aria-hidden="true">
          <Check />
        </span>
        <span>Marketing is set up.</span>
        <Link href="/marketing/setup" className={s.linkButton}>
          See the steps
        </Link>
      </div>
    );
  }
  return (
    <div className={s.hubIntro} data-testid="overview-setup">
      <div>
        <strong>
          Set up Marketing: {p.done} of {p.total} done
        </strong>
        <p>
          Next: {p.next.title.charAt(0).toLowerCase()}
          {p.next.title.slice(1)}. {p.next.body}
        </p>
        <div className={s.bar} aria-hidden="true">
          <span style={{ width: `${share}%` }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          <Link href={p.next.href} className="btn btn-primary">
            {p.next.cta}
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/marketing/setup" className="btn">
            All setup steps
          </Link>
        </div>
      </div>
    </div>
  );
}
