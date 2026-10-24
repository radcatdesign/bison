// The agents in the database, as the real app role: they draft each thing
// once, close drafts that aren't needed, and approving does the work.
import { afterAll, describe, expect, it } from "vitest";
import { approveTask, dismissTask, listTasks, prepareEmail, recordEmail, runAgents } from "@/lib/agents/store";
import { DEV_TENANTS } from "@/lib/auth/dev-people";
import { type Tx, withTenant } from "@/lib/db";
import { A, app, B, pgCode, rawAsApp } from "./helpers";

const SUMMIT = DEV_TENANTS.summit.id;
const as = <T>(tenantId: string, fn: (tx: Tx) => Promise<T>) => withTenant({ tenantId, userId: "dev_maya" }, fn, app());

afterAll(async () => {
  await app().destroy();
});

describe("agents", () => {
  it("drafts a reply to a new lead once, in club words, and closes it when someone gets back to them", async () => {
    const email = `walkin-${Date.now()}@example.com`;
    const contact = await as(SUMMIT, async (tx) => {
      const c = await tx.insertInto("contacts").values({ email, name: "Rae Walker" }).returning("id").executeTakeFirstOrThrow();
      await tx.insertInto("submissions").values({ contact_id: c.id, form_key: "kiosk", form_type: "kiosk-pass", fields: JSON.stringify({ name: "Rae Walker", email }), alert: "{}" }).execute();
      return c.id;
    });
    await as(SUMMIT, (tx) => runAgents(tx, "fit"));
    await as(SUMMIT, (tx) => runAgents(tx, "fit"));
    const mine = (await as(SUMMIT, (tx) => listTasks(tx))).open.filter((t) => t.kind === "lead-reply" && (t.draft as { contactId?: string }).contactId === contact);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ agent: "frontdesk", title: "Write back to Rae Walker" });
    expect((mine[0].draft as { subject: string }).subject).toBe("Your free pass at Summit Strength Club");

    await as(SUMMIT, (tx) => tx.updateTable("contacts").set({ status: "contacted" }).where("id", "=", contact).execute());
    await as(SUMMIT, (tx) => runAgents(tx, "fit"));
    const after = (await as(SUMMIT, (tx) => listTasks(tx))).done.find((t) => t.id === mine[0].id);
    expect(after).toMatchObject({ status: "dismissed", result: "Someone already got back to them." });
  });

  it("sends from your own email when sending isn't set up, and marks the lead contacted", async () => {
    const email = `web-${Date.now()}@example.com`;
    const contact = await as(SUMMIT, (tx) => tx.insertInto("contacts").values({ email, name: "Web Lead" }).returning("id").executeTakeFirstOrThrow());
    await as(SUMMIT, (tx) => runAgents(tx, "fit"));
    const task = (await as(SUMMIT, (tx) => listTasks(tx))).open.find((t) => (t.draft as { contactId?: string }).contactId === contact.id)!;
    const prepared = await as(SUMMIT, (tx) => prepareEmail(tx, task.id, { subject: "Hello from Summit", body: "Hi there, thanks for asking about the club." }));
    expect(prepared.email.subject).toBe("Hello from Summit");
    // A second person approving at the same moment is turned away.
    await expect(as(SUMMIT, (tx) => prepareEmail(tx, task.id, {}))).rejects.toThrow(/sending this one right now/);
    const r = await as(SUMMIT, (tx) => recordEmail(tx, prepared.task, { to: [email], at: new Date().toISOString() }, "Maya Reyes", { sentElsewhere: true }));
    expect(r).toEqual({ ok: true, message: `Sent from your own email to ${email}.` });
    expect(await as(SUMMIT, (tx) => tx.selectFrom("contacts").select("status").where("id", "=", contact.id).executeTakeFirstOrThrow())).toEqual({ status: "contacted" });
    await expect(as(SUMMIT, (tx) => dismissTask(tx, task.id, "Maya"))).rejects.toThrow(/already handled/);
  });

  it("refuses a draft that still says [Add ...]", async () => {
    const email = `ph-${Date.now()}@example.com`;
    const contact = await as(SUMMIT, (tx) => tx.insertInto("contacts").values({ email, name: "Pat" }).returning("id").executeTakeFirstOrThrow());
    await as(SUMMIT, (tx) => runAgents(tx, "fit"));
    const task = (await as(SUMMIT, (tx) => listTasks(tx))).open.find((t) => (t.draft as { contactId?: string }).contactId === contact.id)!;
    await expect(as(SUMMIT, (tx) => prepareEmail(tx, task.id, { body: "Hi Pat, [Add your hours]" }))).rejects.toThrow(/\[Add/);
  });

  it("plans a campaign when nothing's running, and approving makes it", async () => {
    await as(SUMMIT, (tx) => tx.updateTable("campaigns").set({ archived_at: new Date() }).where("archived_at", "is", null).execute());
    await as(SUMMIT, (tx) => runAgents(tx, "fit", new Date("2026-10-24T12:00:00Z")));
    const plan = (await as(SUMMIT, (tx) => listTasks(tx))).open.find((t) => t.kind === "campaign-plan")!;
    expect(plan.title).toBe("Plan: Holiday membership drive 2026");
    const r = await as(SUMMIT, (tx) => approveTask(tx, plan.id, { name: "Holiday drive" }, "Maya Reyes", "fit"));
    expect(r.href).toMatch(/^\/marketing\/campaigns\/[0-9a-f-]{36}$/);
    const c = await as(SUMMIT, (tx) => tx.selectFrom("campaigns").select(["name", "starts_on", "color"]).where("name", "=", "Holiday drive").executeTakeFirstOrThrow());
    expect(c).toMatchObject({ name: "Holiday drive", color: "orange" });
  });

  it("writes one weekly read per week", async () => {
    await as(SUMMIT, (tx) => runAgents(tx, "fit"));
    await as(SUMMIT, (tx) => runAgents(tx, "fit"));
    const reads = (await as(SUMMIT, (tx) => listTasks(tx))).open.filter((t) => t.kind === "weekly-read");
    expect(reads).toHaveLength(1);
    expect((reads[0].draft as { lines: string[] }).lines[0]).toMatch(/website visitors/);
  });

  it("can't be deleted, and stays with its company", async () => {
    expect(pgCode(await rawAsApp("delete from agent_tasks", SUMMIT).catch((e) => e))).toBe("42501");
    await as(A, (tx) => runAgents(tx, "bison"));
    const theirs = await rawAsApp<{ tenant_id: string }>("select distinct tenant_id from agent_tasks", B);
    expect(theirs.every((r) => r.tenant_id === B)).toBe(true);
  });
});
