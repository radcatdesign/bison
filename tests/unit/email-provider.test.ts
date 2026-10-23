// The Resend provider against a fake API, and unsubscribe tokens. No network.
import { describe, expect, it } from "vitest";
import { type OutgoingEmail, resendProvider } from "@/lib/email/provider";
import { checkUnsubscribeToken, unsubscribeToken } from "@/lib/email/tokens";
import { maskEmail } from "@/lib/marketing/unsubscribe";

const email = (to: string): OutgoingEmail => ({ from: '"B" <hello@mail.b.test>', to, subject: "Hi", html: "<p>Hi</p>", text: "Hi", headers: { "List-Unsubscribe": "<https://x/u/t/one-click>" }, tags: [{ name: "send", value: "s1" }] });

function fake(answers: { status: number; body: unknown }[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null });
    const a = answers.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("Resend", () => {
  it("sends a batch with an idempotency key and the unsubscribe headers", async () => {
    const { fetcher, calls } = fake([{ status: 200, body: { data: [{ id: "a" }, { id: "b" }] } }]);
    const r = await resendProvider("re_test", fetcher).sendBatch([email("a@x.com"), email("b@x.com")], "bison/k1");
    expect(r).toEqual([
      { ok: true, providerId: "a" },
      { ok: true, providerId: "b" },
    ]);
    expect(calls[0].url).toBe("https://api.resend.com/emails/batch");
    expect(calls[0].headers["idempotency-key"]).toBe("bison/k1");
    expect((calls[0].body as { headers: Record<string, string> }[])[0].headers["List-Unsubscribe"]).toContain("one-click");
  });

  it("retries later when Resend is busy", async () => {
    const { fetcher } = fake([{ status: 429, body: { message: "Too many requests" } }]);
    const r = await resendProvider("re_test", fetcher).sendBatch([email("a@x.com"), email("b@x.com")], "k");
    expect(r.every((x) => !x.ok && x.retry)).toBe(true);
  });

  it("finds the one bad address in a batch by sending each on its own", async () => {
    const { fetcher, calls } = fake([
      { status: 422, body: { message: "Invalid `to` field" } },
      { status: 200, body: { id: "a" } },
      { status: 422, body: { message: "Invalid `to` field" } },
    ]);
    const r = await resendProvider("re_test", fetcher).sendBatch([email("a@x.com"), email("bad")], "k");
    expect(r[0]).toEqual({ ok: true, providerId: "a" });
    expect(r[1]).toMatchObject({ ok: false, retry: false });
    expect(calls.map((c) => c.url.endsWith("/emails"))).toEqual([false, true, true]);
  });

  it("explains a domain that's already taken", async () => {
    const { fetcher } = fake([{ status: 403, body: { message: "Domain already exists" } }]);
    await expect(resendProvider("re_test", fetcher).createDomain("mail.b.test")).rejects.toThrow(/already set up in Bison Ops/);
  });

  it("reads domain records", async () => {
    const { fetcher } = fake([{ status: 200, body: { id: "d1", name: "mail.b.test", status: "pending", records: [{ record: "DKIM", name: "resend._domainkey.mail", type: "TXT", value: "p=x", status: "pending" }] } }]);
    const d = await resendProvider("re_test", fetcher).getDomain("d1");
    expect(d).toMatchObject({ id: "d1", status: "pending", records: [{ type: "TXT", name: "resend._domainkey.mail" }] });
  });
});

describe("unsubscribe links", () => {
  const id = "33333333-3333-4333-8333-333333333333";

  it("carry a signed send id and nothing personal", () => {
    const t = unsubscribeToken(id);
    expect(t).not.toContain("@");
    expect(checkUnsubscribeToken(t)).toMatchObject({ id, expired: false });
  });

  it("refuse anything forged or changed", () => {
    const t = unsubscribeToken(id);
    expect(checkUnsubscribeToken(t.replace(id, "44444444-4444-4444-8444-444444444444"))).toBeNull();
    expect(checkUnsubscribeToken(`${t.slice(0, -2)}xx`)).toBeNull();
    expect(checkUnsubscribeToken("nonsense")).toBeNull();
  });

  it("say when they're old, so the page shows less", () => {
    const t = unsubscribeToken(id, Date.now() - 400 * 86_400_000);
    expect(checkUnsubscribeToken(t)).toMatchObject({ id, expired: true });
  });

  it("hide most of the address on the page", () => {
    expect(maskEmail("mara.quinn@gmail.com")).toBe("ma••••••@gmail.com");
  });
});
