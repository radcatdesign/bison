// Keeps members in step with Clerk organization membership.
// Roles stay in Bison Ops. Joining the Clerk org doesn't open the company's data:
// someone invited from Bison Ops becomes active with the role they were given,
// anyone else waits as "pending" until an owner or admin approves them.
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { audit } from "@/lib/audit";
import { resolveTenantByClerkOrg, withTenant } from "@/lib/db";

type MembershipData = {
  organization: { id: string };
  public_user_data: { user_id: string; identifier?: string; first_name?: string | null; last_name?: string | null };
};

export async function POST(req: Request) {
  const deliveryId = req.headers.get("svix-id");
  let event;
  try {
    event = await verifyWebhook(req as never, { signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET });
  } catch {
    return new Response("Signature check failed.", { status: 400 });
  }
  if (!deliveryId) return new Response("Missing svix-id header.", { status: 400 });

  if (event.type !== "organizationMembership.created" && event.type !== "organizationMembership.deleted") {
    return new Response("Ignored.", { status: 200 });
  }

  const data = event.data as unknown as MembershipData;
  const tenantId = await resolveTenantByClerkOrg(data.organization.id);
  if (!tenantId) return new Response("No tenant for this organization yet.", { status: 200 });

  const userId = data.public_user_data.user_id;
  const email = (data.public_user_data.identifier ?? "").toLowerCase();
  const name = [data.public_user_data.first_name, data.public_user_data.last_name].filter(Boolean).join(" ");

  const result = await withTenant({ tenantId, userId: "system:clerk" }, async (tx) => {
    const fresh = await tx.insertInto("webhook_events").values({ provider: "clerk", event_id: deliveryId }).onConflict((oc) => oc.doNothing()).executeTakeFirst();
    if (!fresh.numInsertedOrUpdatedRows) return "Already processed.";

    const existing = await tx.selectFrom("members").select(["id", "status"]).where("user_id", "=", userId).executeTakeFirst();

    if (event.type === "organizationMembership.deleted") {
      if (existing) await tx.updateTable("members").set({ status: "removed" }).where("id", "=", existing.id).execute();
      await audit(tx, { action: "member.removed", targetType: "member", targetId: userId });
      return "Removed.";
    }

    if (existing) {
      // Someone removed and added back starts over as pending, not with their old access.
      if (existing.status !== "removed") return "Already a member.";
      await tx.updateTable("members").set({ status: "pending" }).where("id", "=", existing.id).execute();
      await audit(tx, { action: "member.rejoined", targetType: "member", targetId: userId });
      return "Waiting for approval.";
    }

    if (!email.includes("@")) return "No email on this membership.";
    // Only an open invite made in Bison Ops can be claimed, and only once.
    const invite = await tx
      .selectFrom("members")
      .select(["id"])
      .where("email", "=", email)
      .where("status", "=", "invited")
      .where("user_id", "is", null)
      .executeTakeFirst();
    if (invite) {
      await tx.updateTable("members").set({ user_id: userId, status: "active", name: name || undefined }).where("id", "=", invite.id).execute();
      await audit(tx, { action: "member.joined", targetType: "member", targetId: userId, detail: { via: "invite" } });
      return "Joined.";
    }
    const taken = await tx.selectFrom("members").select("id").where("email", "=", email).executeTakeFirst();
    if (taken) return "That email already belongs to a member. Left as is.";
    await tx.insertInto("members").values({ user_id: userId, email, name, role: "viewer", status: "pending" }).execute();
    await audit(tx, { action: "member.pending", targetType: "member", targetId: userId });
    return "Waiting for approval.";
  });
  return new Response(result, { status: 200 });
}
