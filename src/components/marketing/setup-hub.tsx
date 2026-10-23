"use client";

// Every Marketing tool's setup on one page, in the order that works best:
// sending first (it takes a while for DNS), then how emails look, who they go
// to, and what goes out on its own.
import { markSetupStepAction } from "@/app/(portal)/marketing/actions";
import { progressOf, type ToolSetup } from "@/lib/marketing/setup-steps";
import { useDemoSetup } from "./demo-setup";
import { writeDemo } from "./demo-store";
import s from "./marketing.module.css";
import { SetupGuide } from "./setup-guide";

type Props = { tools: ToolSetup[] | null; demo: { tenantId: string; base: { subscribers: number; lists: number } } | null };

export function SetupHub({ tools, demo }: Props) {
  return demo ? <DemoHub tenantId={demo.tenantId} base={demo.base} /> : <Hub tools={tools ?? []} />;
}

function DemoHub({ tenantId, base }: { tenantId: string; base: { subscribers: number; lists: number } }) {
  const tools = useDemoSetup(tenantId, base);
  return (
    <Hub
      tools={tools}
      onMark={async (key, done) => {
        if (key === "search.submit") writeDemo(tenantId, (d) => ({ ...d, search: { ...(d.search ?? ({} as never)), submitted: done } }));
        return { ok: true, message: "" };
      }}
    />
  );
}

function Hub({ tools, onMark = markSetupStepAction }: { tools: ToolSetup[]; onMark?: (key: string, done: boolean) => Promise<{ ok: boolean; message: string }> }) {
  const p = progressOf(tools);
  const share = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <div className={s.hub} data-testid="setup-hub">
      <div className={s.hubIntro}>
        <div>
          <strong data-testid="setup-progress">
            {p.done === p.total ? "Marketing is set up." : `${p.done} of ${p.total} steps done`}
          </strong>
          <p>
            {p.next
              ? `Next: ${p.next.title.charAt(0).toLowerCase()}${p.next.title.slice(1)} (${p.next.tool.name}). Each step ticks off on its own once it's done.`
              : "Everything required is done. Optional steps stay here for whenever you want them."}
          </p>
          <div className={s.bar} aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </div>
        </div>
      </div>
      {tools.map((tool, i) => (
        <SetupGuide key={tool.key} tool={tool} variant="hub" number={i + 1} onMark={onMark} />
      ))}
    </div>
  );
}
