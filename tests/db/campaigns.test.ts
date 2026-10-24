// Campaigns in the database, as the real app role: filing pages, emails and
// graphics, moving them, what can be deleted, and that a campaign stays with
// its own company.
import { afterAll, describe, expect, it } from "vitest";
import { addGraphic, CampaignError, createCampaign, deleteCampaign, deleteGraphic, fileItem, filingChoices, getCampaign, listCampaigns, moveGraphic, setArchived, updateCampaign } from "@/lib/campaigns/store";
import { type Tx, withTenant } from "@/lib/db";
import { seedPageFor } from "@/lib/pages/seeds";
import { A, app, B, pgCode, rawAsApp } from "./helpers";

const as = <T>(tenantId: string, fn: (tx: Tx) => Promise<T>) => withTenant({ tenantId, userId: "dev_ada" }, fn, app());
const input = (name: string, extra: Partial<{ notes: string; color: string; startsOn: string; endsOn: string }> = {}) => ({ name, notes: "", color: "green", startsOn: "", endsOn: "", ...extra });
const uniq = (s: string) => `${s} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function things(tenantId: string) {
  return as(tenantId, async (tx) => {
    const slug = `camp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const page = await tx.insertInto("pages").values({ slug, title: "Spring page", doc: JSON.stringify(seedPageFor("pools").doc) }).returning(["id", "slug"]).executeTakeFirstOrThrow();
    const newsletter = await tx.insertInto("newsletters").values({ subject: "Spring news", doc: "{}" }).returning("id").executeTakeFirstOrThrow();
    const series = await tx.insertInto("sequences").values({ name: uniq("Spring follow-up"), trigger: "manual" }).returning("id").executeTakeFirstOrThrow();
    const file = await tx.insertInto("files").values({ kind: "graphic", content_type: "image/png", bytes: Buffer.from([137, 80, 78, 71]), width: 1080, height: 1080, name: "square.png" }).returning("id").executeTakeFirstOrThrow();
    return { page, newsletter: newsletter.id, series: series.id, file: file.id };
  });
}

afterAll(async () => {
  await app().destroy();
});

describe("campaigns", () => {
  it("makes campaigns with unique names and sane dates", async () => {
    const name = uniq("Spring launch");
    const id = await as(A, (tx) => createCampaign(tx, input(name, { startsOn: "2026-03-01", endsOn: "2026-04-30" }), "ada"));
    await expect(as(A, (tx) => createCampaign(tx, input(name.toUpperCase()), "ada"))).rejects.toThrow(CampaignError);
    await expect(as(A, (tx) => createCampaign(tx, input(uniq("Backwards"), { startsOn: "2026-05-01", endsOn: "2026-04-01" }), "ada"))).rejects.toThrow(/before the start/);
    await expect(as(A, (tx) => createCampaign(tx, input("   "), "ada"))).rejects.toThrow(/Give the campaign a name/);
    // Another company can use the same name.
    await as(B, (tx) => createCampaign(tx, input(name), "theo"));
    const c = await as(A, (tx) => getCampaign(tx, id));
    expect(c).toMatchObject({ name, color: "green", startsOn: "2026-03-01", endsOn: "2026-04-30", archived: false, counts: { pages: 0, emails: 0, graphics: 0 } });
    await as(A, (tx) => updateCampaign(tx, id, input(name, { notes: "For builders", color: "pink" })));
    expect(await as(A, (tx) => getCampaign(tx, id))).toMatchObject({ notes: "For builders", color: "pink", startsOn: null });
  });

  it("files pages, newsletters, series and graphics, moves them, and never changes them", async () => {
    const t = await things(A);
    const one = await as(A, (tx) => createCampaign(tx, input(uniq("One")), "ada"));
    const two = await as(A, (tx) => createCampaign(tx, input(uniq("Two")), "ada"));
    await as(A, async (tx) => {
      await fileItem(tx, "page", t.page.id, one);
      await fileItem(tx, "newsletter", t.newsletter, one);
      await fileItem(tx, "series", t.series, one);
      await addGraphic(tx, one, t.file, "Square", "ada");
    });
    const filled = (await as(A, (tx) => getCampaign(tx, one)))!;
    expect(filled.counts).toEqual({ pages: 1, emails: 2, graphics: 1 });
    expect(filled.pages[0]).toMatchObject({ title: "Spring page", status: "draft" });
    expect(filled.emails.map((e) => e.kind).sort()).toEqual(["newsletter", "series"]);
    expect(filled.graphics[0]).toMatchObject({ name: "Square", width: 1080 });
    expect((await as(A, (tx) => listCampaigns(tx))).find((c) => c.id === one)?.counts).toEqual({ pages: 1, emails: 2, graphics: 1 });

    // Each thing sits in one campaign: filing it elsewhere moves it.
    await as(A, async (tx) => {
      await fileItem(tx, "page", t.page.id, two);
      await moveGraphic(tx, t.file, two);
    });
    expect((await as(A, (tx) => getCampaign(tx, one)))!.counts).toEqual({ pages: 0, emails: 2, graphics: 0 });
    expect((await as(A, (tx) => getCampaign(tx, two)))!.counts).toEqual({ pages: 1, emails: 0, graphics: 1 });
    const choices = await as(A, (tx) => filingChoices(tx));
    expect(choices.pages.find((p) => p.id === t.page.id)?.campaign).toMatch(/^Two/);

    // Taking it out leaves the page as it was.
    await as(A, (tx) => fileItem(tx, "page", t.page.id, null));
    const page = await as(A, (tx) => tx.selectFrom("pages").select(["title", "campaign_id"]).where("id", "=", t.page.id).executeTakeFirstOrThrow());
    expect(page).toEqual({ title: "Spring page", campaign_id: null });
  });

  it("only deletes an empty campaign, and archived ones take nothing new", async () => {
    const t = await things(A);
    const id = await as(A, (tx) => createCampaign(tx, input(uniq("Keep")), "ada"));
    await as(A, (tx) => fileItem(tx, "newsletter", t.newsletter, id));
    await expect(as(A, (tx) => deleteCampaign(tx, id))).rejects.toThrow(/archive it instead/);
    await as(A, (tx) => setArchived(tx, id, true));
    await expect(as(A, (tx) => fileItem(tx, "page", t.page.id, id))).rejects.toThrow(/archived/);
    await as(A, async (tx) => {
      await setArchived(tx, id, false);
      await fileItem(tx, "newsletter", t.newsletter, null);
      await deleteCampaign(tx, id);
    });
    expect(await as(A, (tx) => getCampaign(tx, id))).toBeNull();
    // The newsletter is still there.
    expect(await as(A, (tx) => tx.selectFrom("newsletters").select("id").where("id", "=", t.newsletter).executeTakeFirst())).toBeTruthy();
  });

  it("won't delete a graphic something still shows", async () => {
    const t = await things(A);
    const id = await as(A, (tx) => createCampaign(tx, input(uniq("Art")), "ada"));
    await as(A, (tx) => addGraphic(tx, id, t.file, "Hero", "ada"));
    await as(A, (tx) => tx.updateTable("newsletters").set({ doc: JSON.stringify({ sections: [{ type: "image", src: `/f/${t.file}` }] }) }).where("id", "=", t.newsletter).execute());
    await expect(as(A, (tx) => deleteGraphic(tx, t.file))).rejects.toThrow(/used in a newsletter/);
    await as(A, (tx) => tx.updateTable("newsletters").set({ doc: "{}" }).where("id", "=", t.newsletter).execute());
    await as(A, (tx) => deleteGraphic(tx, t.file));
    expect(await as(A, (tx) => tx.selectFrom("files").select("id").where("id", "=", t.file).executeTakeFirst())).toBeUndefined();
  });

  it("stays with its own company", async () => {
    const theirs = await things(B);
    const mine = await as(A, (tx) => createCampaign(tx, input(uniq("Mine")), "ada"));
    // Another company's page can't be filed here, and their graphic can't be added.
    await expect(as(A, (tx) => fileItem(tx, "page", theirs.page.id, mine))).rejects.toThrow(CampaignError);
    await expect(as(A, (tx) => addGraphic(tx, mine, theirs.file, "x", "ada"))).rejects.toBeTruthy();
    // Their page can't point at my campaign, even writing the column directly.
    const err = await rawAsApp(`update pages set campaign_id = '${mine}' where id = '${theirs.page.id}'`, B).catch((e) => e);
    expect(pgCode(err)).toBe("23503");
    expect(await as(B, (tx) => getCampaign(tx, mine))).toBeNull();
  });
});
