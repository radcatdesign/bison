/* eslint-disable @next/next/no-img-element -- graphics are the company's own uploads, served from /f with their own sizes. */
import { ArrowLeft, Download, FileText, Mail, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { folderStyle } from "@/components/campaigns/chip";
import s from "@/components/campaigns/campaigns.module.css";
import { CopyLink, GraphicsUpload } from "@/components/campaigns/graphics-upload";
import { marketingGate } from "@/components/marketing/gate";
import { Card, Metric, MetricStrip, PageHeader, SampleBanner } from "@/components/ui";
import { ActionForm } from "@/components/ui/action-form";
import { may } from "@/config/roles";
import { campaignsRepo } from "@/lib/campaigns/repo";
import { dateRange } from "@/lib/campaigns/dates";
import type { CampaignDetail, FilingChoice } from "@/lib/campaigns/store";
import { sayOf } from "@/lib/edition";
import { appUrl } from "@/lib/env";
import { formatAgo, formatInt } from "@/lib/format";
import { getPortalContext } from "@/lib/portal";
import { addToCampaign, archiveCampaign, editGraphic, removeCampaign, removeFromCampaign, removeGraphic, saveCampaign } from "../actions";

export const metadata: Metadata = { title: "Campaign" };

const PAGE_STATUS = { draft: "Draft", published: "Live", changed: "Live, with changes" } as const;
const EMAIL_STATUS: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", failed: "Didn't send", canceled: "Canceled", on: "On", off: "Off" };

const size = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

function Options({ label, list, prefix, here }: { label: string; list: FilingChoice[]; prefix: string; here: string }) {
  const open = list.filter((c) => c.campaign !== here);
  if (!open.length) return null;
  return (
    <optgroup label={label}>
      {open.map((c) => (
        <option key={c.id} value={`${prefix}:${c.id}`}>
          {c.name}
          {c.campaign ? ` (now in ${c.campaign})` : ""}
        </option>
      ))}
    </optgroup>
  );
}

async function Body({ id }: { id: string }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.campaigns");
  if (blocked) return blocked;
  const say = sayOf(ctx);
  const repo = campaignsRepo(ctx);
  const c: CampaignDetail | null = await repo.get(id);
  if (!c) notFound();
  const canEdit = may(ctx.member.role, "marketing.edit") && !repo.demo;
  const [choices, others] = await Promise.all([repo.choices(), repo.list()]);
  const moveTo = others.filter((o) => !o.archived && o.id !== c.id);
  const pagesWord = say("Landing pages", "Funnel pages");
  const empty = c.counts.pages + c.counts.emails + c.counts.graphics === 0;
  const live = !c.archived && canEdit;

  return (
    <div style={folderStyle(c.color)} className={s.folder}>
      {repo.demo && <SampleBanner demo />}
      <Link href="/marketing/campaigns" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: "var(--bo-text-sm)" }}>
        <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
        Campaigns
      </Link>
      <PageHeader
        title={c.name}
        note={
          <span className={s.head}>
            <span className={s.headDot} aria-hidden="true" />
            <span>
              {dateRange(c.startsOn, c.endsOn)}
              {c.archived ? ". Archived." : ""}
            </span>
          </span>
        }
      />

      <div className={s.stack}>
        {c.notes && (
          <Card>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.notes}</p>
          </Card>
        )}

        <Card title="So far" flush testId="campaign-stats">
          <MetricStrip>
            <Metric label="Form sends" value={formatInt(c.formSends)} help={say("Forms sent on this campaign's landing pages, ever, not counting spam. A page counts for as long as it's in the campaign, including sends from before it was added.", "Forms sent on this campaign's funnel pages, ever, not counting spam. A page counts for as long as it's in the campaign, including sends from before it was added.")} testId="campaign-form-sends" />
            <Metric label="Emails sent" value={formatInt(c.emailsSent)} help="Emails from this campaign's newsletters and series that went out or were delivered, ever. Test emails don't count." testId="campaign-emails-sent" />
          </MetricStrip>
        </Card>

        <Card title={pagesWord} note={say("Pages stay in Pages too. Taking one out of the campaign doesn't change it.", "Pages stay in Funnel pages too. Taking one out of the campaign doesn't change it.")} flush testId="campaign-pages">
          {c.pages.length === 0 ? (
            <p className={s.none}>None yet.</p>
          ) : (
            <ul className={s.list}>
              {c.pages.map((p) => (
                <li key={p.id} className={s.item} data-testid="campaign-page">
                  <span className={s.itemIcon} aria-hidden="true">
                    <FileText />
                  </span>
                  <span className={s.itemMain}>
                    {repo.demo ? <span className={s.itemName}>{p.title}</span> : <Link href={`/marketing/pages/${p.id}`} className={s.itemName}>{p.title}</Link>}
                    <span className={s.itemSub}>/{p.slug}</span>
                  </span>
                  <span className={s.itemSide}>
                    <span className={p.status === "draft" ? "pill" : "pill pill-good"}>{PAGE_STATUS[p.status]}</span>
                    {canEdit && (
                      <ActionForm action={removeFromCampaign} submitLabel="Take out" pendingLabel="Taking out">
                        <input type="hidden" name="kind" value="page" />
                        <input type="hidden" name="itemId" value={p.id} />
                      </ActionForm>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Emails" note="Newsletters and series. They stay in their own lists too." flush testId="campaign-emails">
          {c.emails.length === 0 ? (
            <p className={s.none}>None yet.</p>
          ) : (
            <ul className={s.list}>
              {c.emails.map((e) => (
                <li key={`${e.kind}:${e.id}`} className={s.item} data-testid="campaign-email">
                  <span className={s.itemIcon} aria-hidden="true">
                    {e.kind === "series" ? <Repeat /> : <Mail />}
                  </span>
                  <span className={s.itemMain}>
                    {repo.demo ? <span className={s.itemName}>{e.name}</span> : <Link href={e.kind === "series" ? `/marketing/series/${e.id}` : `/marketing/newsletters/${e.id}`} className={s.itemName}>{e.name}</Link>}
                    <span className={s.itemSub}>
                      {e.kind === "series" ? "Email series" : "Newsletter"}
                      {e.when ? `, ${e.status === "sent" ? "sent" : e.status === "scheduled" ? "goes out" : "edited"} ${formatAgo(e.when)}` : ""}
                    </span>
                  </span>
                  <span className={s.itemSide}>
                    <span className={e.status === "sent" || e.status === "on" ? "pill pill-good" : e.status === "failed" ? "pill pill-bad" : "pill"}>{EMAIL_STATUS[e.status] ?? e.status}</span>
                    {canEdit && (
                      <ActionForm action={removeFromCampaign} submitLabel="Take out" pendingLabel="Taking out">
                        <input type="hidden" name="kind" value={e.kind} />
                        <input type="hidden" name="itemId" value={e.id} />
                      </ActionForm>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {live && choices.pages.length + choices.newsletters.length + choices.series.length === 0 && (
          <Card title="Add to this campaign">
            <p className="muted" style={{ margin: 0 }}>
              {say("Make a landing page, newsletter or email series first, then add it here.", "Make a funnel page, newsletter or email series first, then add it here.")}
            </p>
          </Card>
        )}
        {live && choices.pages.length + choices.newsletters.length + choices.series.length > 0 && (
          <Card title="Add to this campaign" flush testId="campaign-add">
            <div className={s.add} style={{ borderTop: 0 }}>
              <ActionForm action={addToCampaign} submitLabel="Add" pendingLabel="Adding" className={s.form}>
                <input type="hidden" name="campaignId" value={c.id} />
                <label className="visually-hidden" htmlFor="campaign-item">
                  What to add
                </label>
                <select id="campaign-item" name="item" className="select" required defaultValue="" data-testid="campaign-add-item" style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <option value="" disabled>
                    Pick a page, newsletter or series
                  </option>
                  <Options label={pagesWord} list={choices.pages} prefix="page" here={c.name} />
                  <Options label="Newsletters" list={choices.newsletters} prefix="newsletter" here={c.name} />
                  <Options label="Email series" list={choices.series} prefix="series" here={c.name} />
                </select>
              </ActionForm>
            </div>
          </Card>
        )}

        <Card title="Graphics" note="Images for this campaign: social posts, ads, lobby screens, flyers. Use the link in an email, a page or anywhere else." flush testId="campaign-graphics">
          {c.graphics.length === 0 ? (
            <p className={s.none}>None yet.</p>
          ) : (
            <ul className={`${s.graphics} ${s.list}`}>
              {c.graphics.map((g) => {
                const src = `/f/${g.fileId}`;
                return (
                  <li key={g.fileId} className={s.graphic} data-testid="campaign-graphic">
                    <span className={s.thumb}>{repo.demo ? <span className={s.stand} style={{ aspectRatio: `${g.width} / ${g.height}` }} /> : <img src={src} alt={g.name || "A campaign graphic"} loading="lazy" />}</span>
                    <span className={s.graphicName}>{g.name || "Untitled"}</span>
                    <span className={s.graphicMeta}>
                      <span className="num">
                        {g.width} × {g.height}
                      </span>
                      {g.bytes ? `, ${size(g.bytes)}` : ""}
                    </span>
                    {!repo.demo && (
                      <span className={s.graphicActions}>
                        <CopyLink url={`${appUrl()}${src}`} />
                        <a href={src} download={g.name || "graphic"} className="btn" aria-label={`Download ${g.name || "graphic"}`}>
                          <Download aria-hidden="true" />
                        </a>
                      </span>
                    )}
                    {canEdit && (
                      <details>
                        <summary className="link" style={{ fontSize: "var(--bo-text-xs)", cursor: "pointer" }}>
                          Rename, move or delete
                        </summary>
                        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                          <ActionForm action={editGraphic} submitLabel="Save" className={s.form}>
                            <input type="hidden" name="fileId" value={g.fileId} />
                            <input type="hidden" name="campaignId" value={c.id} />
                            <input className="input" name="name" defaultValue={g.name} maxLength={120} aria-label="Name" />
                            {moveTo.length > 0 && (
                              <select className="select" name="moveTo" defaultValue="" aria-label="Move to">
                                <option value="">Keep in this campaign</option>
                                {moveTo.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    Move to {o.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </ActionForm>
                          <ActionForm action={removeGraphic} submitLabel="Delete for good" pendingLabel="Deleting">
                            <input type="hidden" name="fileId" value={g.fileId} />
                          </ActionForm>
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {live && <GraphicsUpload campaignId={c.id} disabled={!canEdit} />}
          {repo.demo && <p className={s.none}>This is a demo, so graphics can&apos;t be added.</p>}
        </Card>

        <Card title="Details" testId="campaign-details">
          <CampaignForm action={saveCampaign} value={c} submitLabel="Save" disabled={!canEdit} testId="campaign-edit-form" />
        </Card>

        {canEdit && (
          <Card title={c.archived ? "Archived" : "Done with it?"} note={c.archived ? "Restore it to add things again." : "Archiving hides it from your active campaigns. Everything stays filed in it."}>
            <div className={s.danger}>
              <ActionForm action={archiveCampaign} submitLabel={c.archived ? "Restore" : "Archive"} testId="campaign-archive">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
              </ActionForm>
              {empty ? (
                <ActionForm action={removeCampaign} submitLabel="Delete campaign" pendingLabel="Deleting" testId="campaign-delete">
                  <input type="hidden" name="id" value={c.id} />
                </ActionForm>
              ) : (
                <span className="muted" style={{ fontSize: "var(--bo-text-sm)" }}>
                  An empty campaign can be deleted.
                </span>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function CampaignPage({ params }: PageProps<"/marketing/campaigns/[id]">) {
  return (
    <Suspense fallback={<PageHeader title="Campaign" />}>
      <Params params={params as Promise<{ id: string }>} />
    </Suspense>
  );
}

async function Params({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Body id={id} />;
}
