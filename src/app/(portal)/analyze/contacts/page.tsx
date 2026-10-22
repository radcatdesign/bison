import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setContactStatus } from "@/app/(portal)/actions";
import { ActionForm } from "@/components/ui/action-form";
import { PageHeader, SampleBanner } from "@/components/ui";
import { may } from "@/config/roles";
import type { ContactStatus } from "@/lib/db/types";
import { formatAgo } from "@/lib/format";
import { demoMode } from "@/lib/env";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { getRepos, type Repos } from "@/lib/repo";
import s from "./contacts.module.css";

export const metadata: Metadata = { title: "Contacts" };

const STATUS_LABEL: Record<ContactStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
  spam: "Spam",
};

async function Panel({ id, repos, ctx }: { id: string; repos: Repos; ctx: PortalContext }) {
  const contact = await repos.contacts.get(id);
  if (!contact) {
    return (
      <aside className={s.panel} aria-label="Contact">
        <p>That contact isn&apos;t here. It may have been deleted.</p>
        <Link href="/analyze/contacts" className="btn" scroll={false}>
          Close
        </Link>
      </aside>
    );
  }
  const canEdit = may(ctx.member.role, "contacts.edit");
  return (
    <>
      <Link href="/analyze/contacts" className={s.scrim} scroll={false} aria-label="Close contact" tabIndex={-1} />
      <aside className={s.panel} aria-label={`Contact: ${contact.displayName}`} data-testid="contact-panel">
        <div className={s.panelHead}>
          <div>
            <h2 className={s.panelName}>{contact.displayName}</h2>
            {contact.name && <div className="label">{contact.email}</div>}
          </div>
          <Link href="/analyze/contacts" className="btn" scroll={false}>
            Close
          </Link>
        </div>

        <ActionForm action={setContactStatus} autoSubmit testId="status-form">
          <input type="hidden" name="contactId" value={contact.id} />
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="select" defaultValue={contact.status} disabled={!canEdit}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </ActionForm>

        <dl className={s.facts}>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${contact.email}`}>{contact.email}</a>
          </dd>
          {contact.phone && (
            <>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${contact.phone}`}>{contact.phone}</a>
              </dd>
            </>
          )}
          <dt>First seen</dt>
          <dd>{formatAgo(contact.firstSeenAt)}</dd>
          <dt>Last seen</dt>
          <dd>{formatAgo(contact.lastSeenAt)}</dd>
        </dl>

        {contact.submissions.map((sub) => (
          <div key={sub.id} className={s.submission}>
            <div className="label">
              {sub.formType}, {formatAgo(sub.createdAt)}
            </div>
            {sub.fields.message && <p>{sub.fields.message}</p>}
          </div>
        ))}
      </aside>
    </>
  );
}

async function Contacts({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await getPortalContext();
  const { c: openId } = await searchParams;
  const repos = getRepos({ scope: scopeOf(ctx), tenant: ctx.tenant, sampleData: ctx.settings.sampleData, timezone: ctx.settings.timezone });
  const contacts = await repos.contacts.list();

  return (
    <>
      {repos.mode === "sample" && <SampleBanner demo={demoMode()} />}
      <PageHeader title="Contacts" note="Everyone who sent a form on your site, newest first." />
      <div className={s.table} role="list" data-testid="contacts">
        <div className={`${s.row} ${s.head} label`} aria-hidden="true">
          <span>Person</span>
          <span className={s.hideSmall}>Form</span>
          <span>Status</span>
          <span className={s.hideSmall}>Last seen</span>
        </div>
        {contacts.length === 0 && <p style={{ padding: "16px 8px", color: "var(--bo-fg-2)" }}>No contacts yet. When someone sends a form on your site, they show up here.</p>}
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
              <span className={s.name}>
                {c.displayName}
                {c.isNew && <span className="pill pill-lit">New</span>}
              </span>
              <span className={s.sub}>{c.name ? c.email : c.message}</span>
            </span>
            <span className={`${s.sub} ${s.hideSmall}`}>{c.formType}</span>
            <span>
              <span className="pill">{STATUS_LABEL[c.status]}</span>
            </span>
            <span className={`${s.sub} ${s.hideSmall} mono`}>{formatAgo(c.lastSeenAt)}</span>
          </Link>
        ))}
      </div>
      {openId && <Panel id={openId} repos={repos} ctx={ctx} />}
    </>
  );
}

export default function ContactsPage({ searchParams }: PageProps<"/analyze/contacts">) {
  return (
    <Suspense fallback={<PageHeader title="Contacts" note="Loading contacts" />}>
      <Contacts searchParams={searchParams as Promise<{ c?: string }>} />
    </Suspense>
  );
}
