// Where the editor keeps pages. Real accounts save through server actions; the
// demo keeps everything in this browser's storage, so nothing reaches a server.
import { deletePageAction, publishPageAction, renamePageAction, savePageAction, unpublishPageAction } from "@/app/(portal)/marketing/pages/actions";
import type { PageDoc } from "@/lib/pages/schema";

export type ThreadItem = { id: string; role: "user" | "agent"; text: string; steps?: string[]; state?: "working" | "done" | "error" };
export type Result = { ok: boolean; message: string; url?: string };

export type PageStore = {
  kind: "server" | "browser";
  save(id: string, doc: PageDoc): Promise<Result>;
  rename(id: string, title: string, slug: string): Promise<Result>;
  publish(id: string, doc: PageDoc): Promise<Result>;
  unpublish(id: string): Promise<Result>;
  remove(id: string): Promise<Result>;
};

export const serverStore: PageStore = {
  kind: "server",
  save: (id, doc) => savePageAction(id, doc),
  rename: (id, title, slug) => renamePageAction(id, title, slug),
  publish: (id, doc) => publishPageAction(id, doc),
  unpublish: (id) => unpublishPageAction(id),
  remove: (id) => deletePageAction(id),
};

// ---- The demo: this browser only -----------------------------------------------

export type DemoPage = { id: string; title: string; slug: string; doc: PageDoc; updatedAt: string; thread: ThreadItem[] };
type Stored = { seeded: boolean; pages: DemoPage[] };

const memory = new Map<string, Stored>();
const keyFor = (tenantId: string) => `bo-demo-pages:${tenantId}`;

function read(tenantId: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(keyFor(tenantId));
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    /* storage can be off; fall back to memory */
  }
  return memory.get(tenantId) ?? null;
}

function write(tenantId: string, stored: Stored) {
  memory.set(tenantId, stored);
  try {
    window.localStorage.setItem(keyFor(tenantId), JSON.stringify(stored));
  } catch {
    /* memory copy still works for this visit */
  }
}

export function demoPages(tenantId: string, seed: Omit<DemoPage, "id" | "updatedAt" | "thread">): DemoPage[] {
  const stored = read(tenantId);
  if (stored?.seeded) return stored.pages;
  const first: DemoPage = { ...seed, id: "example", updatedAt: new Date().toISOString(), thread: [] };
  write(tenantId, { seeded: true, pages: [first] });
  return [first];
}

export function demoPage(tenantId: string, id: string): DemoPage | null {
  return read(tenantId)?.pages.find((p) => p.id === id) ?? null;
}

export function saveDemoPage(tenantId: string, page: DemoPage) {
  const stored = read(tenantId) ?? { seeded: true, pages: [] };
  const pages = stored.pages.some((p) => p.id === page.id) ? stored.pages.map((p) => (p.id === page.id ? page : p)) : [page, ...stored.pages];
  write(tenantId, { seeded: true, pages });
}

export function createDemoPage(tenantId: string, title: string, doc: PageDoc): DemoPage {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p${Date.now()}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
  const page: DemoPage = { id, title, slug, doc, updatedAt: new Date().toISOString(), thread: [] };
  saveDemoPage(tenantId, page);
  return page;
}

export function removeDemoPage(tenantId: string, id: string) {
  const stored = read(tenantId);
  if (stored) write(tenantId, { seeded: true, pages: stored.pages.filter((p) => p.id !== id) });
}

export function browserStore(tenantId: string, publicBase: string): PageStore {
  const update = (id: string, change: Partial<DemoPage>): Result => {
    const page = demoPage(tenantId, id);
    if (!page) return { ok: false, message: "This page isn't in this browser anymore." };
    saveDemoPage(tenantId, { ...page, ...change, updatedAt: new Date().toISOString() });
    return { ok: true, message: "Saved in this browser" };
  };
  return {
    kind: "browser",
    save: async (id, doc) => update(id, { doc }),
    rename: async (id, title, slug) => {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, message: "The address can use lowercase letters, numbers and dashes, like spring-sale." };
      return update(id, { title, slug });
    },
    publish: async (id) => ({
      ok: false,
      message: `This is a demo, so pages can't go live. In your own account, Publish puts it at ${publicBase}${demoPage(tenantId, id)?.slug ?? "your-page"} and its form sends land in Contacts.`,
    }),
    unpublish: async () => ({ ok: false, message: "This is a demo, so nothing is live." }),
    remove: async (id) => {
      removeDemoPage(tenantId, id);
      return { ok: true, message: "Deleted" };
    },
  };
}
