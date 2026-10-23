import "server-only";
// Sending email and setting up sending domains. Resend in production; an
// offline stand-in that keeps everything in memory for tests and local work.
// Each company sends from its own domain, verified through Resend's Domains API.
import { emailProviderName } from "@/lib/env";
import { relativeName } from "@/lib/marketing/dns";

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
};

export type SendResult = { ok: true; providerId: string } | { ok: false; error: string; retry: boolean };

export type DomainRecord = { record: string; name: string; type: string; value: string; priority?: number; ttl?: string; status: string };
export type DomainStatus = "not_started" | "pending" | "verified" | "failed" | "partially_verified" | "partially_failed";
export type DomainInfo = { id: string; name: string; status: DomainStatus; records: DomainRecord[] };

export class EmailProviderError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export interface EmailProvider {
  name: "resend" | "stand-in";
  /** Up to 100 at a time. One result per email, in order. */
  sendBatch(emails: OutgoingEmail[], idempotencyKey: string): Promise<SendResult[]>;
  createDomain(name: string): Promise<DomainInfo>;
  getDomain(id: string): Promise<DomainInfo>;
  verifyDomain(id: string): Promise<void>;
}

export const NOT_SET_UP = "Email sending isn't set up on this server. Set RESEND_API_KEY.";

// ---- Resend -----------------------------------------------------------------------

type Fetch = typeof fetch;

function resendStatus(s: unknown): DomainStatus {
  return s === "verified" || s === "pending" || s === "failed" || s === "partially_verified" || s === "partially_failed" ? s : "not_started";
}

function readDomain(body: Record<string, unknown>): DomainInfo {
  const records = Array.isArray(body.records) ? body.records : [];
  return {
    id: String(body.id ?? ""),
    name: String(body.name ?? ""),
    status: resendStatus(body.status),
    records: records.slice(0, 20).map((r: Record<string, unknown>) => ({
      record: String(r.record ?? ""),
      name: String(r.name ?? ""),
      type: String(r.type ?? ""),
      value: String(r.value ?? ""),
      priority: typeof r.priority === "number" ? r.priority : undefined,
      ttl: r.ttl ? String(r.ttl) : undefined,
      status: String(r.status ?? "not_started"),
    })),
  };
}

export function resendProvider(apiKey: string, fetcher: Fetch = fetch, base = "https://api.resend.com"): EmailProvider {
  const call = async (method: string, path: string, body?: unknown, idempotencyKey?: string) => {
    const res = await fetcher(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "user-agent": "bison-ops",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey.slice(0, 256) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, json };
  };

  const payload = (e: OutgoingEmail) => ({
    from: e.from,
    to: [e.to],
    subject: e.subject,
    html: e.html,
    text: e.text,
    ...(e.replyTo ? { reply_to: e.replyTo } : {}),
    headers: e.headers,
    tags: e.tags,
  });

  const message = (json: Record<string, unknown>, status: number) =>
    typeof json.message === "string" ? json.message.slice(0, 300) : `Resend answered ${status}.`;

  const sendOne = async (e: OutgoingEmail, key: string): Promise<SendResult> => {
    try {
      const { res, json } = await call("POST", "/emails", payload(e), key);
      if (res.ok && typeof json.id === "string") return { ok: true, providerId: json.id };
      return { ok: false, error: message(json, res.status), retry: res.status === 429 || res.status >= 500 || res.status === 409 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "Couldn't reach Resend.", retry: true };
    }
  };

  return {
    name: "resend",
    async sendBatch(emails, idempotencyKey) {
      if (!emails.length) return [];
      if (emails.length === 1) return [await sendOne(emails[0], `${idempotencyKey}/0`)];
      try {
        const { res, json } = await call("POST", "/emails/batch", emails.map(payload), idempotencyKey);
        const data = Array.isArray(json.data) ? (json.data as { id?: string }[]) : null;
        if (res.ok && data && data.length === emails.length) {
          return data.map((d) => (typeof d.id === "string" ? { ok: true as const, providerId: d.id } : { ok: false as const, error: "Resend didn't return an id.", retry: true }));
        }
        if (res.status === 429 || res.status >= 500 || res.status === 409) {
          return emails.map(() => ({ ok: false as const, error: message(json, res.status), retry: true }));
        }
        // One bad address fails a whole batch, so send each on its own to find it.
        const out: SendResult[] = [];
        for (const [i, e] of emails.entries()) out.push(await sendOne(e, `${idempotencyKey}/${i}`));
        return out;
      } catch (err) {
        return emails.map(() => ({ ok: false as const, error: err instanceof Error ? err.message.slice(0, 300) : "Couldn't reach Resend.", retry: true }));
      }
    },
    async createDomain(name) {
      const { res, json } = await call("POST", "/domains", { name });
      if (!res.ok) {
        const text = message(json, res.status);
        throw new EmailProviderError(/already|exists|registered/i.test(text) ? "That domain is already set up in Bison Ops. If it's yours, contact support and we'll move it to your account." : text, res.status);
      }
      return readDomain(json);
    },
    async getDomain(id) {
      const { res, json } = await call("GET", `/domains/${encodeURIComponent(id)}`);
      if (!res.ok) throw new EmailProviderError(message(json, res.status), res.status);
      return readDomain(json);
    },
    async verifyDomain(id) {
      const { res, json } = await call("POST", `/domains/${encodeURIComponent(id)}/verify`);
      if (!res.ok) throw new EmailProviderError(message(json, res.status), res.status);
    },
  };
}

// ---- The stand-in -------------------------------------------------------------------
// Keeps the last emails in memory so tests can read them back (/api/dev/outbox).
// Domains verify once someone presses Check, as if their DNS had caught up.

export type OutboxEntry = OutgoingEmail & { id: string; at: string };

const g = globalThis as unknown as { __boOutbox?: OutboxEntry[]; __boDomains?: Map<string, DomainInfo & { checked: boolean }> };
const outbox = () => (g.__boOutbox ??= []);
const domains = () => (g.__boDomains ??= new Map());

export function readOutbox(): OutboxEntry[] {
  return [...outbox()];
}

export function clearOutbox() {
  outbox().length = 0;
}

function fakeRecords(name: string, status: string): DomainRecord[] {
  return [
    { record: "SPF", name: relativeName("send", name), type: "MX", value: "feedback-smtp.us-east-1.amazonses.com", priority: 10, ttl: "Auto", status },
    { record: "SPF", name: relativeName("send", name), type: "TXT", value: '"v=spf1 include:amazonses.com ~all"', ttl: "Auto", status },
    { record: "DKIM", name: relativeName("resend._domainkey", name), type: "TXT", value: `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC${Buffer.from(name).toString("base64").replace(/=/g, "")}IDAQAB`, ttl: "Auto", status },
  ];
}

export function standInProvider(): EmailProvider {
  return {
    name: "stand-in",
    async sendBatch(emails) {
      return emails.map((e) => {
        if (/^fail\+/.test(e.to)) return { ok: false, error: "The stand-in was told to fail this address.", retry: false };
        const id = `standin_${crypto.randomUUID()}`;
        const box = outbox();
        box.push({ ...e, id, at: new Date().toISOString() });
        if (box.length > 300) box.splice(0, box.length - 300);
        return { ok: true, providerId: id };
      });
    },
    async createDomain(name) {
      const id = `standin-domain-${crypto.randomUUID()}`;
      const info = { id, name, status: "not_started" as DomainStatus, records: fakeRecords(name, "not_started"), checked: false };
      domains().set(id, info);
      return { id, name, status: info.status, records: info.records };
    },
    async getDomain(id) {
      const d = domains().get(id);
      // After a server restart the stand-in forgets; treat a known-looking id as verified.
      if (!d) return { id, name: "", status: "verified", records: [] };
      const status: DomainStatus = d.checked ? "verified" : "pending";
      return { id, name: d.name, status, records: fakeRecords(d.name, status) };
    },
    async verifyDomain(id) {
      const d = domains().get(id);
      if (d) d.checked = true;
    },
  };
}

let cached: { key: string; provider: EmailProvider | null } | null = null;

/** The provider for this server, or null when sending isn't set up. */
export function emailProvider(): EmailProvider | null {
  const name = emailProviderName();
  const key = `${name}:${process.env.RESEND_API_KEY ?? ""}`;
  if (cached?.key === key) return cached.provider;
  const provider = name === "resend" ? resendProvider(process.env.RESEND_API_KEY!) : name === "stand-in" ? standInProvider() : null;
  cached = { key, provider };
  return provider;
}
