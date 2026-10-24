import "server-only";
// Campaigns: folders for landing pages, emails and graphics. Filing something
// only sets its campaign; it never changes or deletes what's filed. Every
// function takes a transaction already inside withTenant.
import { sql } from "kysely";
import { audit } from "@/lib/audit";
import { isUuid, type Tx } from "@/lib/db";
import type { CampaignColor } from "@/lib/db/types";

export class CampaignError extends Error {}

export const CAMPAIGN_COLORS: CampaignColor[] = ["blue", "green", "orange", "pink", "purple", "gray"];
export const MAX_CAMPAIGNS = 200;
export const MAX_GRAPHICS = 200;

export type ItemKind = "page" | "newsletter" | "series" | "graphic";

export type CampaignCounts = { pages: number; emails: number; graphics: number };
export type CampaignSummary = { id: string; name: string; notes: string; color: CampaignColor; startsOn: string | null; endsOn: string | null; archived: boolean; counts: CampaignCounts; createdAt: Date };

export type CampaignPage = { id: string; title: string; slug: string; status: "draft" | "published" | "changed" };
export type CampaignEmail = { id: string; kind: "newsletter" | "series"; name: string; status: string; when: Date | null };
export type CampaignGraphic = { fileId: string; name: string; width: number; height: number; contentType: string; bytes: number; addedAt: Date };
export type CampaignDetail = CampaignSummary & {
  pages: CampaignPage[];
  emails: CampaignEmail[];
  graphics: CampaignGraphic[];
  /** Form sends on its pages, ever. */
  formSends: number;
  /** Emails from its newsletters and series that went out. */
  emailsSent: number;
};

/** Things that could be filed here, with the campaign they're in now, if any. */
export type FilingChoice = { id: string; name: string; campaign: string | null };
export type FilingChoices = { pages: FilingChoice[]; newsletters: FilingChoice[]; series: FilingChoice[] };

type Row = { id: string; name: string; notes: string; color: CampaignColor; starts_on: string | null; ends_on: string | null; archived_at: Date | null; created_at: Date };

const toSummary = (r: Row, counts: CampaignCounts): CampaignSummary => ({ id: r.id, name: r.name, notes: r.notes, color: r.color, startsOn: r.starts_on, endsOn: r.ends_on, archived: Boolean(r.archived_at), counts, createdAt: r.created_at });

const COLUMNS = ["id", "name", "notes", "color", sql<string | null>`starts_on::text`.as("starts_on"), sql<string | null>`ends_on::text`.as("ends_on"), "archived_at", "created_at"] as const;

async function countsFor(tx: Tx, ids: string[]): Promise<Map<string, CampaignCounts>> {
  const out = new Map<string, CampaignCounts>(ids.map((id) => [id, { pages: 0, emails: 0, graphics: 0 }]));
  if (!ids.length) return out;
  const { rows } = await sql<{ id: string; kind: keyof CampaignCounts; n: string }>`
    select campaign_id as id, 'pages' as kind, count(*) as n from pages where campaign_id = any(${ids}::uuid[]) group by campaign_id
    union all
    select campaign_id, 'emails', count(*) from newsletters where campaign_id = any(${ids}::uuid[]) group by campaign_id
    union all
    select campaign_id, 'emails', count(*) from sequences where campaign_id = any(${ids}::uuid[]) group by campaign_id
    union all
    select campaign_id, 'graphics', count(*) from campaign_graphics where campaign_id = any(${ids}::uuid[]) group by campaign_id`.execute(tx);
  for (const r of rows) out.get(r.id)![r.kind] += Number(r.n);
  return out;
}

export async function listCampaigns(tx: Tx): Promise<CampaignSummary[]> {
  const rows = (await tx.selectFrom("campaigns").select(COLUMNS).orderBy(sql`archived_at is not null`).orderBy("created_at", "desc").limit(MAX_CAMPAIGNS).execute()) as Row[];
  const counts = await countsFor(tx, rows.map((r) => r.id));
  return rows.map((r) => toSummary(r, counts.get(r.id)!));
}

export async function getCampaign(tx: Tx, id: string): Promise<CampaignDetail | null> {
  if (!isUuid(id)) return null;
  const r = (await tx.selectFrom("campaigns").select(COLUMNS).where("id", "=", id).executeTakeFirst()) as Row | undefined;
  if (!r) return null;
  const pages = await tx.selectFrom("pages").select(["id", "title", "slug", "published_at", "doc", "published_doc"]).where("campaign_id", "=", id).orderBy("updated_at", "desc").execute();
  const newsletters = await tx.selectFrom("newsletters").select(["id", "subject", "status", "sent_at", "scheduled_for", "updated_at"]).where("campaign_id", "=", id).orderBy("updated_at", "desc").execute();
  const series = await tx.selectFrom("sequences").select(["id", "name", "status", "updated_at"]).where("campaign_id", "=", id).orderBy("updated_at", "desc").execute();
  const graphics = await tx
    .selectFrom("campaign_graphics as g")
    .innerJoin("files as f", (j) => j.onRef("f.id", "=", "g.file_id").onRef("f.tenant_id", "=", "g.tenant_id"))
    .select(["g.file_id", "g.name", "g.added_at", "f.width", "f.height", "f.content_type", sql<number>`octet_length(f.bytes)`.as("size")])
    .where("g.campaign_id", "=", id)
    .orderBy("g.added_at", "desc")
    .execute();
  const slugs = pages.map((p) => `page:${p.slug}`);
  const forms = slugs.length ? await tx.selectFrom("submissions").select(sql<string>`count(*)`.as("n")).where("form_key", "in", slugs).where("status", "=", "received").executeTakeFirstOrThrow() : { n: "0" };
  const sent = await sql<{ n: string }>`
    select count(*) as n from email_sends
    where status in ('sent', 'delivered') and kind <> 'test'
      and (newsletter_id in (select id from newsletters where campaign_id = ${id}) or sequence_id in (select id from sequences where campaign_id = ${id}))`.execute(tx);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return {
    ...toSummary(r, { pages: pages.length, emails: newsletters.length + series.length, graphics: graphics.length }),
    pages: pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug, status: !p.published_at ? "draft" : same(p.doc, p.published_doc) ? "published" : "changed" })),
    emails: [
      ...newsletters.map((n) => ({ id: n.id, kind: "newsletter" as const, name: n.subject || "(no subject yet)", status: n.status, when: n.sent_at ?? n.scheduled_for ?? n.updated_at })),
      ...series.map((x) => ({ id: x.id, kind: "series" as const, name: x.name, status: x.status, when: x.updated_at })),
    ],
    graphics: graphics.map((g) => ({ fileId: g.file_id, name: g.name, width: g.width, height: g.height, contentType: g.content_type, bytes: Number(g.size), addedAt: g.added_at })),
    formSends: Number(forms.n),
    emailsSent: Number(sent.rows[0]?.n ?? 0),
  };
}

// ---- Making and changing campaigns -----------------------------------------------

export type CampaignInput = { name: string; notes: string; color: string; startsOn: string; endsOn: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(input: CampaignInput) {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) throw new CampaignError("Give the campaign a name, like Spring launch.");
  const color = (CAMPAIGN_COLORS as string[]).includes(input.color) ? (input.color as CampaignColor) : "blue";
  const startsOn = DATE.test(input.startsOn) ? input.startsOn : null;
  const endsOn = DATE.test(input.endsOn) ? input.endsOn : null;
  if (startsOn && endsOn && endsOn < startsOn) throw new CampaignError("The end date is before the start date.");
  return { name, notes: input.notes.trim().slice(0, 1000), color, starts_on: startsOn, ends_on: endsOn };
}

async function nameTaken(tx: Tx, name: string, except?: string): Promise<boolean> {
  let q = tx.selectFrom("campaigns").select("id").where(sql`lower(name)`, "=", name.toLowerCase());
  if (except) q = q.where("id", "<>", except);
  return Boolean(await q.executeTakeFirst());
}

export async function createCampaign(tx: Tx, input: CampaignInput, actor: string): Promise<string> {
  const v = clean(input);
  if (await nameTaken(tx, v.name)) throw new CampaignError(`You already have a campaign called ${v.name}.`);
  const { n } = await tx.selectFrom("campaigns").select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();
  if (n >= MAX_CAMPAIGNS) throw new CampaignError(`You have ${MAX_CAMPAIGNS} campaigns. Delete some you no longer need first.`);
  const row = await tx.insertInto("campaigns").values({ ...v, created_by: actor.slice(0, 120) }).returning("id").executeTakeFirstOrThrow();
  await audit(tx, { action: "campaign.created", targetType: "campaign", targetId: row.id, detail: { name: v.name } });
  return row.id;
}

export async function updateCampaign(tx: Tx, id: string, input: CampaignInput): Promise<void> {
  if (!isUuid(id)) throw new CampaignError("That campaign isn't here anymore.");
  const v = clean(input);
  if (await nameTaken(tx, v.name, id)) throw new CampaignError(`You already have a campaign called ${v.name}.`);
  const r = await tx.updateTable("campaigns").set(v).where("id", "=", id).executeTakeFirst();
  if (!Number(r.numUpdatedRows)) throw new CampaignError("That campaign isn't here anymore.");
  await audit(tx, { action: "campaign.updated", targetType: "campaign", targetId: id });
}

export async function setArchived(tx: Tx, id: string, archived: boolean): Promise<void> {
  if (!isUuid(id)) throw new CampaignError("That campaign isn't here anymore.");
  await tx.updateTable("campaigns").set({ archived_at: archived ? new Date() : null }).where("id", "=", id).execute();
  await audit(tx, { action: archived ? "campaign.archived" : "campaign.restored", targetType: "campaign", targetId: id });
}

/** Only an empty campaign can be deleted, so nothing filed in it is ever lost track of. Archive the rest. */
export async function deleteCampaign(tx: Tx, id: string): Promise<void> {
  if (!isUuid(id)) throw new CampaignError("That campaign isn't here anymore.");
  const counts = (await countsFor(tx, [id])).get(id)!;
  if (counts.pages + counts.emails + counts.graphics > 0) throw new CampaignError("Move or remove what's in this campaign first, or archive it instead.");
  await tx.deleteFrom("campaigns").where("id", "=", id).execute();
  await audit(tx, { action: "campaign.deleted", targetType: "campaign", targetId: id });
}

// ---- Filing ------------------------------------------------------------------------

const TABLE = { page: "pages", newsletter: "newsletters", series: "sequences" } as const;

/** Puts a page, newsletter or series in a campaign, or takes it out with `campaignId` null. Moving from another campaign is fine. */
export async function fileItem(tx: Tx, kind: Exclude<ItemKind, "graphic">, itemId: string, campaignId: string | null): Promise<void> {
  if (!isUuid(itemId) || (campaignId !== null && !isUuid(campaignId))) throw new CampaignError("That isn't here anymore. Reload the page.");
  if (campaignId) {
    const c = await tx.selectFrom("campaigns").select("archived_at").where("id", "=", campaignId).executeTakeFirst();
    if (!c) throw new CampaignError("That campaign isn't here anymore.");
    if (c.archived_at) throw new CampaignError("That campaign is archived. Restore it to add to it.");
  }
  const r = await tx.updateTable(TABLE[kind]).set({ campaign_id: campaignId }).where("id", "=", itemId).executeTakeFirst();
  if (!Number(r.numUpdatedRows)) throw new CampaignError("That isn't here anymore. Reload the page.");
  await audit(tx, { action: campaignId ? "campaign.filed" : "campaign.unfiled", targetType: kind, targetId: itemId, detail: { campaignId } });
}

export async function addGraphic(tx: Tx, campaignId: string, fileId: string, name: string, actor: string): Promise<void> {
  const c = await tx.selectFrom("campaigns").select("archived_at").where("id", "=", campaignId).executeTakeFirst();
  if (!c) throw new CampaignError("That campaign isn't here anymore.");
  if (c.archived_at) throw new CampaignError("That campaign is archived. Restore it to add to it.");
  const { n } = await tx.selectFrom("campaign_graphics").select(sql<number>`count(*)::int`.as("n")).where("campaign_id", "=", campaignId).executeTakeFirstOrThrow();
  if (n >= MAX_GRAPHICS) throw new CampaignError(`A campaign holds up to ${MAX_GRAPHICS} graphics.`);
  await tx.insertInto("campaign_graphics").values({ campaign_id: campaignId, file_id: fileId, name: name.trim().slice(0, 120), added_by: actor.slice(0, 120) }).execute();
}

export async function moveGraphic(tx: Tx, fileId: string, campaignId: string): Promise<void> {
  if (!isUuid(fileId) || !isUuid(campaignId)) throw new CampaignError("That isn't here anymore. Reload the page.");
  const c = await tx.selectFrom("campaigns").select("archived_at").where("id", "=", campaignId).executeTakeFirst();
  if (!c || c.archived_at) throw new CampaignError("Pick a campaign that isn't archived.");
  await tx.updateTable("campaign_graphics").set({ campaign_id: campaignId }).where("file_id", "=", fileId).execute();
}

export async function renameGraphic(tx: Tx, fileId: string, name: string): Promise<void> {
  if (!isUuid(fileId)) throw new CampaignError("That isn't here anymore. Reload the page.");
  await tx.updateTable("campaign_graphics").set({ name: name.trim().slice(0, 120) }).where("file_id", "=", fileId).execute();
}

/** Where an upload is used: emails, pages, templates, the brand kit or products. */
export async function fileInUse(tx: Tx, fileId: string): Promise<string | null> {
  const ref = `%/f/${fileId}%`;
  const { rows } = await sql<{ place: string }>`
    select 'a landing page' as place from pages where doc::text like ${ref} or coalesce(published_doc::text, '') like ${ref}
    union all select 'a newsletter' from newsletters where doc::text like ${ref}
    union all select 'a series email' from sequence_steps where doc::text like ${ref}
    union all select 'a saved email template' from newsletter_templates where doc::text like ${ref}
    union all select 'an A/B test version' from page_test_versions where coalesce(doc::text, '') like ${ref}
    union all select 'your brand kit' from marketing_settings where brand::text like ${ref}
    union all select 'a product' from products where photos::text like ${ref}
    limit 1`.execute(tx);
  return rows[0]?.place ?? null;
}

/** Deletes a graphic for good, unless something still shows it. */
export async function deleteGraphic(tx: Tx, fileId: string): Promise<void> {
  if (!isUuid(fileId)) throw new CampaignError("That isn't here anymore. Reload the page.");
  const g = await tx.selectFrom("campaign_graphics").select("file_id").where("file_id", "=", fileId).executeTakeFirst();
  if (!g) throw new CampaignError("That graphic isn't here anymore.");
  const used = await fileInUse(tx, fileId);
  if (used) throw new CampaignError(`That graphic is used in ${used}, so it stays. Take it out there first.`);
  await tx.deleteFrom("files").where("id", "=", fileId).where("kind", "=", "graphic").execute();
  await audit(tx, { action: "campaign.graphic_deleted", targetType: "file", targetId: fileId });
}

/** What can be filed into a campaign, for the Add pickers. */
export async function filingChoices(tx: Tx): Promise<FilingChoices> {
  const names = new Map((await tx.selectFrom("campaigns").select(["id", "name"]).execute()).map((c) => [c.id, c.name]));
  const pages = await tx.selectFrom("pages").select(["id", "title as name", "campaign_id"]).orderBy("updated_at", "desc").limit(500).execute();
  const newsletters = await tx.selectFrom("newsletters").select(["id", "subject as name", "campaign_id"]).orderBy("updated_at", "desc").limit(500).execute();
  const series = await tx.selectFrom("sequences").select(["id", "name", "campaign_id"]).orderBy("updated_at", "desc").limit(500).execute();
  const map = (r: { id: string; name: string; campaign_id: string | null }) => ({ id: r.id, name: r.name || "(no subject yet)", campaign: r.campaign_id ? (names.get(r.campaign_id) ?? null) : null });
  return { pages: pages.map(map), newsletters: newsletters.map(map), series: series.map(map) };
}

/** Each item's campaign, for the chips on the Pages, Newsletters and Series lists. */
export async function campaignNames(tx: Tx, kind: Exclude<ItemKind, "graphic">): Promise<Map<string, { id: string; name: string; color: CampaignColor }>> {
  const rows = await tx
    .selectFrom(`${TABLE[kind]} as t` as "pages as t")
    .innerJoin("campaigns as c", (j) => j.onRef("c.id", "=", "t.campaign_id").onRef("c.tenant_id", "=", "t.tenant_id"))
    .select(["t.id", "c.id as cid", "c.name", "c.color"])
    .execute();
  return new Map(rows.map((r) => [r.id, { id: r.cid, name: r.name, color: r.color }]));
}
