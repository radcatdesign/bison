"use client";

// Newsletters: start one from a template (or one you saved), and see every
// newsletter with where it stands and how it did.
import { FilePlus2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { createNewsletterAction, deleteTemplateAction } from "@/app/(portal)/marketing/newsletters/actions";
import { renderEmail } from "@/lib/email/render";
import { type BrandKit, type EmailDoc, emptyEmailDoc } from "@/lib/email/schema";
import { EMAIL_TEMPLATES } from "@/lib/email/templates";
import { sampleSendStats } from "@/lib/sample/marketing";
import { useDemoMarketing } from "./demo-setup";
import { type DemoNewsletter, demoId, writeDemo } from "./demo-store";
import { EmailFrame } from "./email-frame";
import s from "./marketing.module.css";
import h from "./newsletters.module.css";

export type NewsletterCard = {
  id: string;
  subject: string;
  status: string;
  when: string;
  audience: string;
  stats: { recipients: number; sent: number; delivered: number; bounced: number; unsubscribed: number } | null;
  error: string | null;
};

type Props = {
  storage: "server" | "browser";
  tenantId: string;
  brand: BrandKit;
  baseUrl: string;
  site: string;
  newsletters: NewsletterCard[];
  saved: { id: string; name: string; subject: string; doc: EmailDoc }[];
  canEdit: boolean;
  subscribed: number;
  timeZone: string;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "pill" },
  scheduled: { label: "Scheduled", tone: "pill pill-accent" },
  sending: { label: "Sending", tone: "pill pill-accent" },
  sent: { label: "Sent", tone: "pill pill-good" },
  failed: { label: "Not sent", tone: "pill pill-bad" },
  canceled: { label: "Canceled", tone: "pill" },
};

/** The demo starts with one newsletter that went out, so the results have something to show. */
export function demoSeedNewsletter(site: string, subscribed: number, now = Date.now()): DemoNewsletter {
  const t = EMAIL_TEMPLATES[0];
  const doc = JSON.parse(JSON.stringify(t.doc(site)).replace(/\[Add a headline for this month\]/g, "Night swims are back").replace(/\[Add [^\]]+\]/g, "More on our site")) as EmailDoc;
  return { id: "example", subject: "October news: night swims are back", preheader: "Three projects we loved this month.", doc, status: "sent", scheduledFor: null, sentAt: new Date(now - 9 * 86_400_000).toISOString(), audience: "Everyone subscribed", recipients: subscribed, updatedAt: new Date(now - 9 * 86_400_000).toISOString() };
}

export function NewslettersHome(props: Props) {
  const router = useRouter();
  const demo = useDemoMarketing(props.tenantId);
  const [pending, start] = useTransition();
  const browser = props.storage === "browser";

  const cards: NewsletterCard[] = useMemo(() => {
    if (!browser) return props.newsletters;
    const list = demo.newsletters ?? [demoSeedNewsletter(props.site, props.subscribed)];
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: props.timeZone });
    return list.map((n) => {
      const stats = n.status === "sent" ? sampleSendStats(n.id, n.recipients) : null;
      return {
        id: n.id,
        subject: n.subject || "(no subject yet)",
        status: n.status,
        when: n.status === "sent" && n.sentAt ? `Sent ${fmt.format(new Date(n.sentAt))}` : n.status === "scheduled" && n.scheduledFor ? `Goes out ${fmt.format(new Date(n.scheduledFor))}` : `Edited ${fmt.format(new Date(n.updatedAt))}`,
        audience: n.audience,
        stats: stats ? { recipients: stats.recipients, sent: stats.recipients, delivered: stats.delivered, bounced: stats.bounced, unsubscribed: stats.unsubscribed } : null,
        error: null,
      };
    });
  }, [browser, demo.newsletters, props.newsletters, props.site, props.subscribed, props.timeZone]);

  const startDemo = (subject: string, preheader: string, doc: EmailDoc) => {
    const id = demoId("nl");
    writeDemo(props.tenantId, (d) => ({
      ...d,
      newsletters: [{ id, subject, preheader, doc, status: "draft", scheduledFor: null, sentAt: null, audience: "Everyone subscribed", recipients: 0, updatedAt: new Date().toISOString() }, ...(d.newsletters ?? [demoSeedNewsletter(props.site, props.subscribed)])],
    }));
    router.push(`/marketing/newsletters/${id}`);
  };

  const savedTemplates = browser ? (demo.templates ?? []) : props.saved;
  const choices = [
    ...EMAIL_TEMPLATES.map((t) => ({ key: `t:${t.key}`, name: t.name, description: t.description, subject: t.subject, preheader: t.preheader, doc: t.doc(props.site), form: { template: t.key }, saved: null as string | null })),
    ...savedTemplates.map((t) => ({ key: `s:${t.id}`, name: t.name, description: "One of your saved templates", subject: t.subject, preheader: "", doc: t.doc, form: { saved: t.id }, saved: t.id })),
  ];

  return (
    <div className={h.home}>
      {props.canEdit && (
        <section aria-labelledby="start-heading" className={h.block}>
          <div className={h.blockHead}>
            <h2 id="start-heading">Start a newsletter</h2>
            <p>Pick a starting point. Yellow spots mark what only you know; nothing goes out until they&apos;re filled in.</p>
          </div>
          <ul className={h.templates} data-testid="newsletter-templates">
            <li>
              <form
                action={browser ? undefined : createNewsletterAction}
                onSubmit={
                  browser
                    ? (e) => {
                        e.preventDefault();
                        startDemo("", "", emptyEmailDoc());
                      }
                    : undefined
                }
              >
                <button type="submit" className={h.blank} disabled={pending} data-testid="newsletter-blank">
                  <FilePlus2 aria-hidden="true" />
                  <strong>Blank</strong>
                  <span>Start from nothing and add sections.</span>
                </button>
              </form>
            </li>
            {choices.map((c) => (
              <li key={c.key} className={h.templateItem}>
                <form
                  action={browser ? undefined : createNewsletterAction}
                  onSubmit={
                    browser
                      ? (e) => {
                          e.preventDefault();
                          startDemo(c.subject, c.preheader, c.doc);
                        }
                      : undefined
                  }
                >
                  {"template" in c.form ? <input type="hidden" name="template" value={c.form.template} /> : <input type="hidden" name="saved" value={c.form.saved} />}
                  <button type="submit" className={h.template} disabled={pending} data-testid={`newsletter-template-${c.key.replace(":", "-")}`}>
                    <TemplateThumb doc={c.doc} brand={props.brand} baseUrl={props.baseUrl} />
                    <span className={h.templateText}>
                      <strong>{c.name}</strong>
                      <span>{c.description}</span>
                    </span>
                  </button>
                </form>
                {c.saved && (
                  <button
                    type="button"
                    className={`${s.iconButton} ${s.danger} ${h.templateDelete}`}
                    aria-label={`Delete the template ${c.name}`}
                    onClick={() =>
                      start(async () => {
                        if (!window.confirm(`Delete the template ${c.name}?`)) return;
                        if (browser) writeDemo(props.tenantId, (d) => ({ ...d, templates: (d.templates ?? []).filter((t) => t.id !== c.saved) }));
                        else await deleteTemplateAction(c.saved!);
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="list-heading" className={h.block}>
        <div className={h.blockHead}>
          <h2 id="list-heading">Your newsletters</h2>
        </div>
        {cards.length === 0 ? (
          <p className={s.hint}>None yet. Start one above.</p>
        ) : (
          <ul className={h.list} data-testid="newsletter-list">
            {cards.map((n) => (
              <li key={n.id}>
                <Link href={`/marketing/newsletters/${n.id}`} className={`card ${h.row}`} data-testid="newsletter-row">
                  <span className={h.rowMain}>
                    <strong>{n.subject}</strong>
                    <span>
                      {n.when}
                      {n.status !== "draft" && n.audience ? ` · ${n.audience}` : ""}
                    </span>
                    {n.error && <span className={h.rowError}>{n.error}</span>}
                  </span>
                  {n.stats && (
                    <span className={h.rowStats}>
                      <span>
                        <strong className="num">{n.stats.sent.toLocaleString("en-US")}</strong> sent
                      </span>
                      <span className={h.hideSm}>
                        <strong className="num">{n.stats.delivered.toLocaleString("en-US")}</strong> delivered
                      </span>
                      <span className={h.hideSm}>
                        <strong className="num">{n.stats.unsubscribed.toLocaleString("en-US")}</strong> unsubscribed
                      </span>
                    </span>
                  )}
                  <span className={STATUS[n.status]?.tone ?? "pill"}>{STATUS[n.status]?.label ?? n.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TemplateThumb({ doc, brand, baseUrl }: { doc: EmailDoc; brand: BrandKit; baseUrl: string }) {
  const html = useMemo(() => renderEmail({ doc, brand, subject: "", baseUrl, builder: { selectedId: null, outlines: false } }).html, [doc, brand, baseUrl]);
  return (
    <span className={h.thumb}>
      <EmailFrame html={html} thumb={{ height: 220 }} title="Template preview" />
    </span>
  );
}
