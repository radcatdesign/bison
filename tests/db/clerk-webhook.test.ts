// Clerk membership webhook: joining the Clerk org must not open a company's data
// on its own. Signed with the real svix scheme, against the real database.
import { randomUUID } from "node:crypto";
import { Webhook } from "svix";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/clerk/route";
import { withTenant } from "@/lib/db";
import { createTenant } from "@/lib/tenants";
import { app, asOwner } from "./helpers";

const orgId = `org_${randomUUID().slice(0, 8)}`;
let tenantId: string;

function membershipEvent(type: "organizationMembership.created" | "organizationMembership.deleted", userId: string, email: string) {
  return {
    type,
    object: "event",
    data: { id: `orgmem_${randomUUID()}`, organization: { id: orgId }, public_user_data: { user_id: userId, identifier: email, first_name: "Sam", last_name: "Lee" } },
  };
}

async function send(event: object, deliveryId = `msg_${randomUUID()}`) {
  const payload = JSON.stringify(event);
  const timestamp = new Date();
  const signature = new Webhook(process.env.CLERK_WEBHOOK_SIGNING_SECRET!).sign(deliveryId, timestamp, payload);
  const req = new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: payload,
    headers: { "content-type": "application/json", "svix-id": deliveryId, "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "svix-signature": signature },
  });
  const res = await POST(req);
  return { status: res.status, body: await res.text() };
}

const member = (userId: string) =>
  withTenant({ tenantId }, (tx) => tx.selectFrom("members").select(["role", "status", "user_id"]).where("user_id", "=", userId).executeTakeFirst(), app());

beforeAll(async () => {
  ({ tenantId } = await createTenant(
    { name: "Clerk Test Co", domain: `clerk-${randomUUID().slice(0, 6)}.example.com`, clerkOrgId: orgId, owner: { userId: "user_owner", email: "owner@clerktest.com", name: "Owner" } },
    app(),
  ));
});

afterAll(async () => {
  await app().destroy();
});

describe("Clerk membership webhook", () => {
  it("rejects a bad signature", async () => {
    const req = new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body: JSON.stringify(membershipEvent("organizationMembership.created", "user_x", "x@x.com")),
      headers: { "svix-id": "msg_1", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,bm9wZQ==" },
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("puts someone who joined without an invite on hold", async () => {
    await send(membershipEvent("organizationMembership.created", "user_walkin", "walkin@clerktest.com"));
    expect(await member("user_walkin")).toEqual({ role: "viewer", status: "pending", user_id: "user_walkin" });
  });

  it("activates an open invite with the role it was given", async () => {
    await withTenant({ tenantId }, (tx) => tx.insertInto("members").values({ email: "invited@clerktest.com", role: "sales", status: "invited", user_id: null }).execute(), app());
    await send(membershipEvent("organizationMembership.created", "user_invited", "invited@clerktest.com"));
    expect(await member("user_invited")).toEqual({ role: "sales", status: "active", user_id: "user_invited" });
  });

  it("never lets a new account take over an existing member by email", async () => {
    await send(membershipEvent("organizationMembership.created", "user_imposter", "owner@clerktest.com"));
    expect(await member("user_owner")).toMatchObject({ role: "owner", status: "active" });
    expect(await member("user_imposter")).toBeUndefined();
  });

  it("brings a removed member back on hold, not with their old access", async () => {
    await send(membershipEvent("organizationMembership.deleted", "user_invited", "invited@clerktest.com"));
    expect(await member("user_invited")).toMatchObject({ status: "removed" });
    await send(membershipEvent("organizationMembership.created", "user_invited", "invited@clerktest.com"));
    expect(await member("user_invited")).toMatchObject({ role: "sales", status: "pending" });
  });

  it("handles each delivery once", async () => {
    const id = `msg_${randomUUID()}`;
    const event = membershipEvent("organizationMembership.created", "user_once", "once@clerktest.com");
    await send(event, id);
    await asOwner((c) => c.query("update members set status = 'active' where user_id = 'user_once'"));
    expect((await send(event, id)).body).toBe("Already processed.");
    expect(await member("user_once")).toMatchObject({ status: "active" });
  });
});
