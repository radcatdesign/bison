"use client";

// One newsletter: the builder, plus sending. Sending checks everything first
// and says plainly what's missing, with a link to fix each thing.
import { CircleCheck, CircleX, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { cancelScheduleAction, saveNewsletterAction, saveTemplateAction, scheduleNewsletterAction, testNewsletterAction } from "@/app/(portal)/marketing/newsletters/actions";
import { EmailBuilder, type EmailContent } from "@/components/email-builder/builder";
import type { BrandKit } from "@/lib/email/schema";
import { useIsClient } from "@/lib/use-is-client";
import { useDemoMarketing } from "./demo-setup";
import { demoId, writeDemo } from "./demo-store";
import s from "./marketing.module.css";
import { demoSeedNewsletter } from "./newsletters-home";
import h from "./newsletters.module.css";

export type SendCheck = { ok: boolean; text: string; href?: string; fix?: string };

type Props = {
  id: string;
  storage: "server" | "browser";
  tenantId: string;
  initial: EmailContent | null;
  status: "draft" | "scheduled" | "failed" | "canceled";
  scheduledLabel: string | null;
  error: string | null;
  brand: BrandKit;
  baseUrl: string;
  site: string;
  team: { email: string; name: string }[];
  me: string;
  lists: { id: string; name: string; count: number }[];
  everyone: number;
  left: number;
  limit: number;
  checks: SendCheck[];
  timeZone: string;
  defaultWhen: string;
  maxWhen: string;
  canSend: boolean;
  canEdit: boolean;
  /** The company's kind of business, for the demo's example newsletter. */
  industry: string;
};

export function NewsletterEditor(props: Props) {
  const client = useIsClient();
  const demo = useDemoMarketing(props.tenantId);
  if (props.storage === "server") return <Editor {...props} initial={props.initial!} />;
  if (!client) return <div aria-busy="true" style={{ minHeight: 400 }} />;
  const list = demo.newsletters ?? [demoSeedNewsletter(props.site, props.everyone, props.industry)];
  const found = list.find((n) => n.id === props.id);
  if (!found) {
    return (
      <div className={s.empty}>
        <strong>This newsletter isn&apos;t here</strong>
        <span>Demo newsletters live in the browser they were made in.</span>
        <Link href="/marketing/newsletters" className="btn">
          Back to Newsletters
        </Link>
      </div>
    );
  }
  if (found.status === "sent") {
    return (
      <div className={s.empty} data-testid="demo-sent">
        <strong>{found.subject}</strong>
        <span>This one went out. In your own account, its results show here: who it went to, deliveries, bounces and unsubscribes.</span>
        <Link href="/marketing/newsletters" className="btn">
          Back to Newsletters
        </Link>
      </div>
    );
  }
  return <Editor {...props} initial={{ subject: found.subject, preheader: found.preheader, doc: found.doc }} status={found.status === "scheduled" ? "scheduled" : "draft"} scheduledLabel={found.scheduledFor ? new Date(found.scheduledFor).toLocaleString() : null} />;
}

function Editor(props: Props & { initial: EmailContent }) {
  const router = useRouter();
  const browser = props.storage === "browser";
  const [status, setStatus] = useState(props.status);
  const [pending, start] = useTransition();

  const save = async (content: EmailContent) => {
    if (browser) {
      writeDemo(props.tenantId, (d) => ({
        ...d,
        newsletters: (d.newsletters ?? [demoSeedNewsletter(props.site, props.everyone, props.industry)]).map((n) => (n.id === props.id ? { ...n, ...content, updatedAt: new Date().toISOString() } : n)),
      }));
      return { ok: true, message: "Saved in this browser" };
    }
    return saveNewsletterAction(props.id, content);
  };

  const statusPill =
    status === "scheduled" ? (
      <span className="pill pill-accent" data-testid="newsletter-status">
        Scheduled{props.scheduledLabel ? ` for ${props.scheduledLabel}` : ""}
      </span>
    ) : status === "failed" ? (
      <span className="pill pill-bad" data-testid="newsletter-status">
        Not sent
      </span>
    ) : (
      <span className="pill" data-testid="newsletter-status">
        Draft
      </span>
    );

  return (
    <>
      <EmailBuilder
        banner={props.error && status === "failed" ? { tone: "error", text: props.error } : null}
        heading={props.initial.subject || "New newsletter"}
        backHref="/marketing/newsletters"
        backLabel="Newsletters"
        initial={props.initial}
        brand={props.brand}
        baseUrl={props.baseUrl}
        site={props.site}
        storage={props.storage}
        save={save}
        status={statusPill}
        readOnly={!props.canEdit}
        readOnlyNote="Your role can see newsletters but not change them."
        test={
          props.canEdit
            ? {
                team: props.team,
                me: props.me,
                send: async (content, to) => {
                  if (browser) {
                    writeDemo(props.tenantId, (d) => ({ ...d, tested: true }));
                    return { ok: true, message: "This is a demo, so nothing was sent. In your own account the test arrives in a minute or so." };
                  }
                  return testNewsletterAction(props.id, content, to);
                },
              }
            : undefined
        }
        saveTemplate={
          props.canEdit
            ? async (name, content) => {
                if (browser) {
                  writeDemo(props.tenantId, (d) => ({ ...d, templates: [{ id: demoId("tpl"), name: name.trim().slice(0, 80), ...content }, ...(d.templates ?? [])] }));
                  return { ok: true, message: "Saved as a template in this browser." };
                }
                return saveTemplateAction(name, content);
              }
            : undefined
        }
        actions={({ content, problems, flush, showProblems }) =>
          props.canSend && (
            <>
              {status === "scheduled" && (
                <button
                  type="button"
                  className="btn"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if (browser) writeDemo(props.tenantId, (d) => ({ ...d, newsletters: (d.newsletters ?? []).map((n) => (n.id === props.id ? { ...n, status: "draft", scheduledFor: null } : n)) }));
                      else await cancelScheduleAction(props.id);
                      setStatus("draft");
                      router.refresh();
                    })
                  }
                  data-testid="unschedule"
                >
                  Unschedule
                </button>
              )}
              <SendButton {...props} content={content} problems={problems} flush={flush} showProblems={showProblems} onDone={(next) => setStatus(next)} />
            </>
          )
        }
      />
    </>
  );
}

function SendButton(
  props: Props & {
    content: EmailContent;
    problems: { sectionId: string | null; text: string }[];
    flush: () => Promise<boolean>;
    showProblems: () => void;
    onDone: (status: "scheduled" | "draft") => void;
  },
) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const browser = props.storage === "browser";
  const [audience, setAudience] = useState<string>("all");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState(props.defaultWhen);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  const count = audience === "all" ? props.everyone : (props.lists.find((l) => l.id === audience)?.count ?? 0);
  const checks = useMemo<SendCheck[]>(
    () => [
      ...props.checks,
      props.problems.length ? { ok: false, text: `The email has ${props.problems.length === 1 ? "one thing" : `${props.problems.length} things`} to fix: ${props.problems[0].text}` } : { ok: true, text: "The email has a subject and nothing left to fill in." },
      count > props.left ? { ok: false, text: `This is ${count.toLocaleString("en-US")} emails and your plan has ${props.left.toLocaleString("en-US")} left this month.` } : { ok: true, text: `${props.left.toLocaleString("en-US")} of ${props.limit.toLocaleString("en-US")} emails left this month.` },
      count === 0 ? { ok: false, text: "Nobody here is subscribed yet." } : { ok: true, text: `${count.toLocaleString("en-US")} ${count === 1 ? "person" : "people"} will get it.` },
    ],
    [props.checks, props.problems, props.left, props.limit, count],
  );
  const blocked = checks.some((c) => !c.ok);

  const submit = () =>
    start(async () => {
      setResult(null);
      if (!(await props.flush())) return;
      if (browser) {
        const scheduled = when === "later";
        writeDemo(props.tenantId, (d) => ({
          ...d,
          newsletters: (d.newsletters ?? []).map((n) =>
            n.id === props.id ? { ...n, status: scheduled ? "scheduled" : "sent", scheduledFor: scheduled ? new Date(at).toISOString() : null, sentAt: scheduled ? null : new Date().toISOString(), recipients: count, audience: audience === "all" ? "Everyone subscribed" : (props.lists.find((l) => l.id === audience)?.name ?? "A list") } : n,
          ),
        }));
        setResult({ ok: true, message: scheduled ? "Scheduled in this browser. This is a demo, so nothing will be sent." : "Marked as sent in this browser. This is a demo, so nothing was sent." });
        props.onDone(scheduled ? "scheduled" : "draft");
        if (!scheduled) router.push("/marketing/newsletters");
        return;
      }
      const r = await scheduleNewsletterAction(props.id, { when: when === "later" ? at : null, audience: audience === "all" ? "all" : "list", listId: audience === "all" ? null : audience });
      setResult(r);
      if (r.ok) {
        props.onDone("scheduled");
        router.refresh();
      }
    });

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setResult(null);
          dialog.current?.showModal();
        }}
        data-testid="open-send"
      >
        <Send aria-hidden="true" />
        Send
      </button>
      <dialog ref={dialog} className={s.dialog} aria-label="Send this newsletter" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className={s.dialogBody} data-testid="send-dialog">
          <div className={s.dialogHead}>
            <h2>Send this newsletter</h2>
          </div>

          <fieldset className={h.audience} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={s.fieldLabel} style={{ marginBottom: 8 }}>
              Who gets it
            </legend>
            <label className={h.option}>
              <input type="radio" name="audience" checked={audience === "all"} onChange={() => setAudience("all")} />
              <span>Everyone subscribed</span>
              <span className="num">{props.everyone.toLocaleString("en-US")}</span>
            </label>
            {props.lists.map((l) => (
              <label key={l.id} className={h.option}>
                <input type="radio" name="audience" checked={audience === l.id} onChange={() => setAudience(l.id)} />
                <span>{l.name}</span>
                <span className="num">{l.count.toLocaleString("en-US")}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className={h.audience} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={s.fieldLabel} style={{ marginBottom: 8 }}>
              When
            </legend>
            <label className={h.option}>
              <input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} data-testid="when-now" />
              <span>Now</span>
              <span />
            </label>
            <label className={h.option}>
              <input type="radio" name="when" checked={when === "later"} onChange={() => setWhen("later")} data-testid="when-later" />
              <span>Later, up to 30 days ahead</span>
              <span />
            </label>
            {when === "later" && (
              <div className={s.field}>
                <label htmlFor="send-at" className={s.fieldLabel}>
                  Date and time <em>{props.timeZone.replace(/_/g, " ")}</em>
                </label>
                <input id="send-at" type="datetime-local" className="input" value={at} min={props.defaultWhen.slice(0, 10) + "T00:00"} max={props.maxWhen} onChange={(e) => setAt(e.target.value)} data-testid="send-at" />
              </div>
            )}
          </fieldset>

          <ul className={h.checks} data-testid="send-checks">
            {checks.map((c, i) => (
              <li key={i} data-ok={c.ok || undefined} data-bad={!c.ok || undefined}>
                {c.ok ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}
                <span>
                  {c.text}{" "}
                  {!c.ok && c.href && (
                    <Link href={c.href} className="link">
                      {c.fix ?? "Fix it"}
                    </Link>
                  )}
                  {!c.ok && !c.href && i === props.checks.length && (
                    <button
                      type="button"
                      className={s.linkButton}
                      onClick={() => {
                        dialog.current?.close();
                        props.showProblems();
                      }}
                    >
                      Show me
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {result && (
            <p className={`notice ${result.ok ? "notice-ok" : "notice-error"}`} role={result.ok ? "status" : "alert"} data-testid="send-result">
              {result.message}
            </p>
          )}

          <div className={s.dialogActions}>
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>
              {result?.ok ? "Close" : "Cancel"}
            </button>
            {!result?.ok && (
              <button type="button" className="btn btn-primary" disabled={pending || blocked} onClick={submit} data-testid="confirm-send">
                {pending ? "Working" : when === "now" ? `Send to ${count.toLocaleString("en-US")}` : "Schedule"}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
