// XP and achievements in the database, as the real app role: awards come from
// real records, each once, are kept after the record goes, and stay with
// their own company.
import { afterAll, describe, expect, it } from "vitest";
import { createCampaign, deleteCampaign, fileItem, setArchived } from "@/lib/campaigns/store";
import { type Tx, withTenant } from "@/lib/db";
import { readProgress, syncProgress } from "@/lib/progress/store";
import { seedPageFor } from "@/lib/pages/seeds";
import { A, app, B, pgCode, rawAsApp } from "./helpers";

const as = <T>(tenantId: string, fn: (tx: Tx) => Promise<T>) => withTenant({ tenantId, userId: "dev_ada" }, fn, app());
const uniq = (s: string) => `${s} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

afterAll(async () => {
  await app().destroy();
});

describe("progress", () => {
  it("gives XP once per thing done, and an achievement for the first campaign", async () => {
    const start = await as(A, (tx) => syncProgress(tx, "bison"));
    void start;
    const before = (await as(A, (tx) => readProgress(tx))).xp;
    const id = await as(A, (tx) => createCampaign(tx, { name: uniq("Launch"), notes: "", color: "blue", startsOn: "", endsOn: "" }, "ada"));
    const page = await as(A, (tx) => tx.insertInto("pages").values({ slug: `xp-${Date.now().toString(36)}`, title: "XP page", doc: JSON.stringify(seedPageFor("pools").doc) }).returning("id").executeTakeFirstOrThrow());
    await as(A, (tx) => fileItem(tx, "page", page.id, id));
    const g = await as(A, (tx) => syncProgress(tx, "bison"));
    expect(g.xp).toBe(3);
    // Another test file may make Brightwater's first campaign first, so check it's earned, not that it's new.
    expect((await as(A, (tx) => readProgress(tx))).earned.has("first-campaign")).toBe(true);
    // Again: nothing new.
    expect(await as(A, (tx) => syncProgress(tx, "bison"))).toEqual({ xp: 0, achievements: [], levelUp: null });
    const p = await as(A, (tx) => readProgress(tx));
    expect(p.xp).toBe(before + 3);
    expect(p.earned.has("first-campaign")).toBe(true);
    expect(p.byKind.get("campaign")?.count).toBeGreaterThanOrEqual(1);

    // Earned is kept, even when the campaign is gone.
    await as(A, async (tx) => {
      await fileItem(tx, "page", page.id, null);
      await deleteCampaign(tx, id);
    });
    await as(A, (tx) => syncProgress(tx, "bison"));
    expect((await as(A, (tx) => readProgress(tx))).xp).toBe(before + 3);
  });

  it("counts a level every 10 XP and says when one is reached", async () => {
    const now = (await as(B, (tx) => readProgress(tx))).xp;
    let levelUp: number | null = null;
    // Five campaigns is 10 XP, so at least one new level.
    for (let i = 0; i < 5; i++) await as(B, (tx) => createCampaign(tx, { name: uniq(`B${i}`), notes: "", color: "blue", startsOn: "", endsOn: "" }, "theo"));
    const g = await as(B, (tx) => syncProgress(tx, "bison"));
    levelUp = g.levelUp;
    expect(g.xp).toBeGreaterThanOrEqual(10);
    expect(levelUp).toBe(Math.floor((now + g.xp) / 10) + 1);
    expect(g.achievements).toContain("busy-season");
  });

  it("gives XP for wrapping up a campaign with something in it", async () => {
    const id = await as(A, (tx) => createCampaign(tx, { name: uniq("Wrap"), notes: "", color: "blue", startsOn: "", endsOn: "" }, "ada"));
    const n = await as(A, (tx) => tx.insertInto("newsletters").values({ subject: "Wrap news", doc: "{}" }).returning("id").executeTakeFirstOrThrow());
    await as(A, async (tx) => {
      await fileItem(tx, "newsletter", n.id, id);
      await setArchived(tx, id, true);
    });
    const g = await as(A, (tx) => syncProgress(tx, "bison"));
    expect(g.xp).toBe(2 + 1 + 2);
    expect(g.achievements).toContain("wrap-party");
  });

  it("can't be changed or taken away, and stays with its company", async () => {
    for (const q of ["update xp_awards set points = 100", "delete from xp_awards", "delete from achievements", "update achievements set earned_at = now()"]) {
      expect(pgCode(await rawAsApp(q, A).catch((e) => e)), q).toBe("42501");
    }
    const mine = await rawAsApp<{ tenant_id: string }>("select distinct tenant_id from xp_awards", A);
    expect(mine.every((r) => r.tenant_id === A)).toBe(true);
  });
});
