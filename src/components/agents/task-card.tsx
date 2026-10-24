"use client";

// One piece of an agent's work: what it's about, the draft (editable for
// emails, campaign names and newsletter subjects), and Approve or Dismiss.
import { Check, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { type AgentResult, approveAgentTask, dismissAgentTask } from "@/app/(portal)/agents/actions";
import s from "./agents.module.css";

export type TaskView = {
  id: string;
  kind: string;
  agentName: string;
  title: string;
  summary: string;
  draft: Record<string, unknown>;
  when: string;
  approveLabel: string;
  email: boolean;
  canDecide: boolean;
  /** Why it can't be approved here, when it can't. */
  blocked: string | null;
  /** Email can go from here (a verified domain or a fallback sender). */
  canSend: boolean;
};

const text = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function TaskCard({ task, sample }: { task: TaskView; sample: boolean }) {
  const [approved, approve, approving] = useActionState<AgentResult, FormData>(approveAgentTask, null);
  const [dismissed, dismiss, dismissing] = useActionState<AgentResult, FormData>(dismissAgentTask, null);
  const d = task.draft;
  const [subject, setSubject] = useState(text(d.subject));
  const [body, setBody] = useState(text(d.body));
  const result = approved ?? dismissed;
  const finished = Boolean(result?.ok);
  const mailto = `mailto:${encodeURIComponent(text(d.to))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + (d.button && typeof d.button === "object" ? `\n\n${text((d.button as { href?: string }).href)}` : ""))}`;

  return (
    <article className={s.task} data-done={finished || undefined} data-testid="agent-task" data-kind={task.kind}>
      <header className={s.taskHead}>
        <div className={s.taskWho}>
          <span className={s.taskAgent}>{task.agentName}</span>
          <span className={s.taskWhen}>{task.when}</span>
        </div>
        <h3 className={s.taskTitle}>{task.title}</h3>
        {task.summary && <p className={s.taskSummary}>{task.summary}</p>}
      </header>

      <form action={approve} className={s.taskBody}>
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="kind" value={task.kind} />

        {task.email && (
          <div className={s.email}>
            <div className={s.emailTo}>
              <span className="label">To</span>
              <span className="mono">{text(d.to)}</span>
            </div>
            <label className={s.field}>
              <span className="label">Subject</span>
              <input className="input" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} disabled={!task.canDecide || finished} />
            </label>
            <label className={s.field}>
              <span className="label">Email</span>
              <textarea className={`input ${s.textarea}`} name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={5000} disabled={!task.canDecide || finished} data-testid="agent-email-body" />
            </label>
            {d.button && typeof d.button === "object" ? (
              <p className={s.note}>
                With a button: {text((d.button as { label?: string }).label)}, linking to <span className="mono">{text((d.button as { href?: string }).href)}</span>
              </p>
            ) : null}
          </div>
        )}

        {task.kind === "campaign-plan" && (
          <div className={s.email}>
            <label className={s.field}>
              <span className="label">Campaign name</span>
              <input className="input" name="name" defaultValue={text(d.name)} maxLength={80} disabled={!task.canDecide || finished} />
            </label>
            <p className={s.note}>
              {text(d.startsOn)} to {text(d.endsOn)}. {text(d.notes)}
            </p>
            <ul className={s.steps}>
              {list(d.steps).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}

        {task.kind === "newsletter-draft" && (
          <label className={s.field}>
            <span className="label">Subject</span>
            <input className="input" name="subject" defaultValue={text(d.subject)} maxLength={150} disabled={!task.canDecide || finished} />
          </label>
        )}

        {task.kind === "weekly-read" && (
          <div className={s.read}>
            <ul>
              {list(d.lines).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="label">Do next</p>
            <ol>
              {list(d.next).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>
        )}

        {(task.kind === "fill-placeholders" || task.kind === "kiosk-quiet") && typeof d.href === "string" && (
          <Link href={d.href} className="link">
            {text(d.label) || "Open it"}
          </Link>
        )}

        <div aria-live="polite">
          {result && (
            <p className={`notice ${result.ok ? "notice-ok" : "notice-error"}`} data-testid="agent-result">
              {result.message}{" "}
              {result.ok && result.href && (
                <Link href={result.href} className="link">
                  Open it
                </Link>
              )}
            </p>
          )}
        </div>

        {!finished && (
          <div className={s.actions}>
            {task.email && !task.canSend ? (
              <>
                <a className="btn btn-primary" href={mailto} data-testid="agent-mailto">
                  <ExternalLink aria-hidden="true" />
                  Open in your email
                </a>
                <button type="submit" name="mode" value="elsewhere" className="btn" disabled={!task.canDecide || approving || sample} data-testid="agent-sent-elsewhere">
                  <Check aria-hidden="true" />
                  I sent it
                </button>
              </>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={!task.canDecide || approving} data-testid="agent-approve">
                <Check aria-hidden="true" />
                {approving ? "Working" : task.approveLabel}
              </button>
            )}
            <button type="submit" formAction={dismiss} className="btn btn-ghost" disabled={!task.canDecide || dismissing} data-testid="agent-dismiss">
              <X aria-hidden="true" />
              Dismiss
            </button>
          </div>
        )}
        {task.email && !task.canSend && !finished && <p className={s.note}>Email isn&apos;t set up to send from here yet, so open it in your own email, then mark it sent. Set up sending in Settings, Email sending.</p>}
        {!task.canDecide && task.blocked && <p className={s.note}>{task.blocked}</p>}
      </form>
    </article>
  );
}
