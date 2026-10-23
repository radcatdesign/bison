import "server-only";
// Test sends: one email, right away, to someone on the team. Only team members'
// addresses are allowed, so a test can't be used to email anyone else.
// Before a sending domain is verified, tests can come from Bison Ops' own
// address (EMAIL_FALLBACK_FROM) when one is set.
import { emailProvider, NOT_SET_UP } from "@/lib/email/provider";
import type { EmailDoc } from "@/lib/email/schema";
import { type TenantScope, withTenant } from "@/lib/db";
import { emailsThisMonth } from "./people";
import { compose, deliver, loadSendSetup } from "./send";
import { testFromAddress } from "./sending";
import { monthlyEmailLimit } from "./worker";

export type TestInput = { doc: EmailDoc; subject: string; preheader: string; to: string; newsletterId?: string | null; stepId?: string | null };
export type TestResult = { ok: boolean; message: string };

export async function sendTestEmail(scope: TenantScope, input: TestInput): Promise<TestResult> {
  const provider = emailProvider();
  if (!provider) return { ok: false, message: NOT_SET_UP };
  const to = input.to.trim().toLowerCase();

  const prepared = await withTenant(scope, async (tx) => {
    const member = await tx.selectFrom("members").select(["email", "name"]).where("email", "=", to).where("status", "=", "active").executeTakeFirst();
    if (!member) return { error: "Tests only go to people on your team. Pick someone from the list." };
    const setup = await loadSendSetup(tx);
    const from = testFromAddress(setup.sending, setup.settings.brand);
    if (!from) return { error: "Verify your sending domain first (Settings, Email sending). Tests come from your own address." };
    if ((await emailsThisMonth(tx)) >= monthlyEmailLimit()) return { error: "You've used this month's emails on your plan. Tests count too. It resets on the 1st." };
    const row = await tx
      .insertInto("email_sends")
      .values({ kind: "test", newsletter_id: input.newsletterId ?? null, step_id: input.stepId ?? null, email: to, name: member.name, subject: input.subject.slice(0, 200), status: "sending", attempts: 1 })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { setup, from, sendId: row.id, name: member.name };
  });
  if ("error" in prepared) return { ok: false, message: prepared.error ?? "Couldn't send the test." };

  const { setup, from, sendId, name } = prepared;
  // A test shows a sample welcome code, so you can see how the offer box looks.
  const offer = setup.settings.offer;
  const sampleOffer = { code: `${offer.prefix}-SAMPLE`, discount_kind: offer.kind, discount: offer.value, expires_at: offer.days ? new Date(Date.now() + offer.days * 86_400_000) : null };
  const email = compose(setup, from, { doc: input.doc, subject: input.subject || "(no subject)", preheader: input.preheader, campaign: "test" }, { sendId, email: to, name, kind: "test" }, sampleOffer);
  const [result] = await deliver(provider, [email], `test/${sendId}`);

  await withTenant(scope, (tx) =>
    tx
      .updateTable("email_sends")
      .set(result?.ok ? { status: "sent", provider_id: result.providerId, sent_at: new Date() } : { status: "failed", error: (result && !result.ok ? result.error : "No answer").slice(0, 500) })
      .where("id", "=", sendId)
      .execute(),
  );
  if (!result?.ok) return { ok: false, message: `The test didn't send: ${result && !result.ok ? result.error : "no answer from the email provider"}` };
  return { ok: true, message: `Test sent to ${to}. It can take a minute to arrive; check spam if it doesn't.` };
}
