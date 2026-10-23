// The demo keeps Marketing content in the visitor's browser, the same way it
// keeps landing pages: brand kit, signup choices, newsletters, series and
// settings. Nothing reaches a server and nothing is ever sent.
import type { BrandKit, EmailDoc } from "@/lib/email/schema";
import type { OfferSettings, SearchSettings, SignupSettings } from "@/lib/marketing/settings";
import type { SetupFacts } from "@/lib/marketing/setup-steps";

export type DemoNewsletter = {
  id: string;
  subject: string;
  preheader: string;
  doc: EmailDoc;
  status: "draft" | "scheduled" | "sent";
  scheduledFor: string | null;
  sentAt: string | null;
  audience: string;
  recipients: number;
  updatedAt: string;
};

export type DemoStep = { id: string; delayDays: number; subject: string; preheader: string; doc: EmailDoc };
export type DemoSeries = { id: string; name: string; trigger: string; triggerDetail: string; status: "on" | "off"; starter: boolean; steps: DemoStep[] };
export type DemoTemplate = { id: string; name: string; subject: string; preheader: string; doc: EmailDoc };

export type DemoMarketing = {
  brand?: BrandKit;
  signup?: SignupSettings;
  offer?: OfferSettings;
  search?: SearchSettings;
  sending?: { domain: string; checked: boolean; tested: boolean };
  newsletters?: DemoNewsletter[];
  series?: DemoSeries[];
  templates?: DemoTemplate[];
  tested?: boolean;
};

const memory = new Map<string, DemoMarketing>();
const keyFor = (tenantId: string) => `bo-demo-marketing:${tenantId}`;
const listeners = new Set<() => void>();

export function readDemo(tenantId: string): DemoMarketing {
  try {
    const raw = window.localStorage.getItem(keyFor(tenantId));
    if (raw) return JSON.parse(raw) as DemoMarketing;
  } catch {
    /* storage can be off; fall back to memory */
  }
  return memory.get(tenantId) ?? {};
}

export function writeDemo(tenantId: string, change: (current: DemoMarketing) => DemoMarketing): DemoMarketing {
  const next = change(readDemo(tenantId));
  memory.set(tenantId, next);
  try {
    window.localStorage.setItem(keyFor(tenantId), JSON.stringify(next));
  } catch {
    /* too big or blocked: the memory copy still works for this visit */
  }
  listeners.forEach((l) => l());
  return next;
}

export function subscribeDemo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function demoId(prefix: string): string {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

/** What the demo visitor has done so far, for the setup steps. */
export function demoSetupFacts(d: DemoMarketing, base: { subscribers: number; lists: number }): SetupFacts {
  const starter = d.series?.find((s) => s.starter);
  const PLACEHOLDER = /\[Add [^\]]{1,200}\]/;
  return {
    canManageSettings: true,
    sending: { domain: Boolean(d.sending?.domain), verified: Boolean(d.sending?.checked), tested: Boolean(d.sending?.tested || d.tested) },
    brand: { saved: Boolean(d.brand), logo: Boolean(d.brand?.logo), address: Boolean(d.brand?.address?.trim()) },
    signup: { saved: Boolean(d.signup), formOnPage: false },
    subscribers: { count: base.subscribers, lists: base.lists },
    series: { starterReady: starter ? !starter.steps.some((s) => PLACEHOLDER.test(JSON.stringify(s.doc)) || PLACEHOLDER.test(s.subject)) : false, anyOn: Boolean(d.series?.some((s) => s.status === "on")) },
    newsletters: { count: d.newsletters?.length ?? 0, tested: Boolean(d.tested), sentOrScheduled: Boolean(d.newsletters?.some((n) => n.status !== "draft")) },
    offer: { saved: Boolean(d.offer), on: Boolean(d.offer?.on), inEmail: Boolean(d.series?.some((s) => s.steps.some((st) => st.doc.sections.some((x) => x.type === "offer")))) },
    search: { described: Boolean(d.search?.description), contact: Boolean(d.search?.phone || d.search?.email), publishedPage: false, submitted: Boolean(d.search?.submitted) },
  };
}
