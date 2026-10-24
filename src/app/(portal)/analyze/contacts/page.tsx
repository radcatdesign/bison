import { Mail, Phone, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setContactStatus } from "@/app/(portal)/actions";
import { EditionPageHeader } from "@/components/marketing/edition-header";
import { ContactSales } from "@/components/sales/contact-sales";
import { ActionForm } from "@/components/ui/action-form";
import { PageHeader, SampleBanner } from "@/components/ui";
import type { Say } from "@/config/editions";
import { may } from "@/config/roles";
import type { ContactStatus } from "@/lib/db/types";
import { sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import { formatAgo } from "@/lib/format";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { getRepos, type Repos } from "@/lib/repo";
import s from "./contacts.module.css";

export async function generateMetadata(): Promise<Metadata> {
  return { title: sayOf(await getPortalContext())("Contacts", "Leads") };
}

/** Statuses keep their stored values; a club reads them as steps toward joining. */
const statusFor = (say: Say): Record<ContactStatus, { label: string; tone: string }> => ({
  new: { label: "New", tone: "pill pill-accent" },
  contacted: { label: "Contacted", tone: "pill" },
  qualified: { label: say("Qualified", "Visit booked"), tone: "pill pill-warn" },
  won: { label: say("Won", "Joined"), tone: "pill pill-good" },
  lost: { label: say("Lost", "Didn't join"), tone: "pill" },
  spam: { label: "Spam", tone: "pill pill-bad" },
});

function initials(name: string, email: string) {
  const parts = (name || email.split("@")[0]).split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

async function Panel({ id, repos, ctx }: { id: string; repos: Repos; ctx: PortalContext }) {
  const say = sayOf(ctx);
  const STATUS = statusFor(say);
  const contact = await repos.contacts.get(id);
  if (!contact) {
    return (
      <>
        <Link href="/analyze/contacts" className={s.scrim} scroll={false} aria-label={say("Close contact", "Close lead")} tabIndex={-1} />
        <aside className={s.panel} aria-label={say("Contact", "Lead")}>
          <p>{say("That contact isn't here. It may have been deleted.", "That lead isn't here. It may have been deleted.")}</p>
          <Link href="/analyze/contacts" className="btn" scroll={false}>
            Close
          </Link>
        </aside>
      </>
    );
  }
  const canEdit = may(ctx.member.role, "contacts.edit");
  return (
    <>
      <Link href="/analyze/contacts" className={s.scrim} scroll={false} aria-label={say("Close contact", "Close lead")} tabIndex={-1} />
      <aside className={s.panel} aria-label={`${say("Contact", "Lead")}: ${contact.displayName}`} data-testid="contact-panel">
        <div className={s.panelHead}>
          <span className={s.bigAvatar} aria-hidden="true">
            {initials(contact.name, contact.email)}
          </span>
          <div className={s.panelWho}>
            <h2 className={s.panelName}>{contact.displayName}</h2>
            {contact.name && <div className="muted">{contact.email}</div>}
          </div>
          <Link href="/analyze/contacts" className={s.close} scroll={false} aria-label="Close">
            <X aria-hidden="true" />
          </Link>
        </div>

        <div className={s.quick}>
          <a href={`mailto:${contact.email}`} className="btn">
            <Mail aria-hidden="true" />
            Email
          </a>
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="btn">
              <Phone aria-hidden="true" />
              Call
            </a>
          )}
        </div>

        <ActionForm action={setContactStatus} autoSubmit testId="status-form">
          <input type="hidden" name="contactId" value={contact.id} />
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="select" defaultValue={contact.status} disabled={!canEdit}>
            {Object.entries(STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </ActionForm>

        <dl className={s.facts}>
          {contact.phone && (
            <div>
              <dt>Phone</dt>
              <dd className="num">{contact.phone}</dd>
            </div>
          )}
          <div>
            <dt>First seen</dt>
            <dd>{formatAgo(contact.firstSeenAt)}</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>{formatAgo(contact.lastSeenAt)}</dd>
          </div>
        </dl>

        <ContactSales ctx={ctx} contactId={contact.id} titleClass={s.timelineTitle} />

        <div className={s.timeline}>
          <h3 className={s.timelineTitle}>{say("What they sent", "What they asked")}</h3>
          {contact.submissions.map((sub) => (
            <article key={sub.id} className={s.submission}>
              <div className={s.submissionHead}>
                <span className="pill">{sub.formType}</span>
                <span className="label">{formatAgo(sub.createdAt)}</span>
              </div>
              {sub.fields.message && <p>{sub.fields.message}</p>}
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}

async function Contacts({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await getPortalContext();
  const { c: openId } = await searchParams;
  const repos = getRepos({ scope: scopeOf(ctx), tenant: ctx.tenant, sampleData: ctx.settings.sampleData, timezone: ctx.settings.timezone });
  const contacts = await repos.contacts.list();
  const fresh = contacts.filter((c) => c.isNew).length;
  const say = sayOf(ctx);
  const STATUS = statusFor(say);

  return (
    <>
      {repos.mode === "sample" && <SampleBanner demo={demoMode()} />}
      <PageHeader
        title={say("Contacts", "Leads")}
        note={say("Everyone who sent a form on your site, newest first.", "Everyone who asked about your club on your site, like a free pass, a tour or a class, newest first.")}
        actions={
          <span className="pill pill-accent">
            <span className="num">{fresh}</span> new
          </span>
        }
      />
      <div className={`card ${s.table}`} role="list" data-testid="contacts">
        <div className={`${s.row} ${s.head}`} aria-hidden="true">
          <span>Person</span>
          <span className={s.hideSmall}>{say("Form", "Asked for")}</span>
          <span>Status</span>
          <span className={`${s.hideSmall} ${s.right}`}>Last seen</span>
        </div>
        {contacts.length === 0 && <p className={s.empty}>{say("No contacts yet. When someone sends a form on your site, they show up here.", "No leads yet. When someone asks for a free pass, a tour or a class on your site, they show up here.")}</p>}
        {contacts.map((c) => (
          <Link
            key={c.id}
            href={`/analyze/contacts?c=${encodeURIComponent(c.id)}`}
            scroll={false}
            className={s.row}
            role="listitem"
            aria-current={openId === c.id ? "true" : undefined}
            data-testid="contact-row"
          >
            <span className={s.who}>
              <span className={s.avatar} aria-hidden="true">
                {initials(c.name, c.email)}
              </span>
              <span className={s.whoText}>
                <span className={s.name}>
                  {c.displayName}
                  {c.isNew && <span className={s.newDot} aria-label="New" />}
                </span>
                <span className={s.sub}>{c.name ? c.email : c.message}</span>
              </span>
            </span>
            <span className={`${s.sub} ${s.hideSmall}`}>{c.formType}</span>
            <span>
              <span className={STATUS[c.status].tone}>{STATUS[c.status].label}</span>
            </span>
            <span className={`${s.sub} ${s.hideSmall} ${s.right}`}>{formatAgo(c.lastSeenAt)}</span>
          </Link>
        ))}
      </div>
      {openId && <Panel id={openId} repos={repos} ctx={ctx} />}
    </>
  );
}

export default function ContactsPage({ searchParams }: PageProps<"/analyze/contacts">) {
  return (
    <Suspense fallback={<EditionPageHeader title={["Contacts", "Leads"]} note={["Loading contacts", "Loading leads"]} />}>
      <Contacts searchParams={searchParams as Promise<{ c?: string }>} />
    </Suspense>
  );
}
