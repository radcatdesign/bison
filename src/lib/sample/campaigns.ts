// Made-up campaigns for the public demo, in each edition's words, so the
// Campaigns screens show what a filed campaign looks like. Stable per company.
import type { EditionKey } from "@/config/editions";
import type { CampaignDetail } from "@/lib/campaigns/store";
import { sampleUuid } from "./sales";

type Seed = Omit<CampaignDetail, "id" | "createdAt" | "counts" | "pages" | "emails" | "graphics"> & {
  pages: [string, string, CampaignDetail["pages"][number]["status"]][];
  emails: [CampaignDetail["emails"][number]["kind"], string, string][];
  graphics: [string, number, number][];
};

const SEEDS: Record<EditionKey, Seed[]> = {
  bison: [
    {
      name: "Spring launch",
      notes: "New glow colors for pool season. Pages for builders and homeowners, the launch newsletter and social graphics.",
      color: "green",
      startsOn: "2026-03-01",
      endsOn: "2026-04-30",
      archived: false,
      pages: [
        ["Glow that lasts all night", "glow-launch", "published"],
        ["Builder pricing", "builder-pricing", "changed"],
      ],
      emails: [
        ["newsletter", "Three new glow colors are here", "sent"],
        ["series", "Spring builder follow-up", "on"],
      ],
      graphics: [
        ["Launch hero", 2400, 1260],
        ["Instagram square", 1080, 1080],
        ["Story", 1080, 1920],
      ],
      formSends: 64,
      emailsSent: 1840,
    },
    {
      name: "Holiday sale",
      notes: "Ideas for December. Nothing live yet.",
      color: "orange",
      startsOn: "2026-12-01",
      endsOn: "2026-12-31",
      archived: false,
      pages: [["Holiday sale", "holiday-sale", "draft"]],
      emails: [["newsletter", "Our biggest sale of the year", "draft"]],
      graphics: [],
      formSends: 0,
      emailsSent: 0,
    },
  ],
  fit: [
    {
      name: "New Year challenge",
      notes: "Six-week challenge starting January 6. Funnel page, the announcement, the follow-up for people who sign up, and graphics for the lobby screen and social.",
      color: "orange",
      startsOn: "2026-12-15",
      endsOn: "2027-02-15",
      archived: false,
      pages: [
        ["Six-week challenge", "six-week-challenge", "published"],
        ["Free trial pass", "free-pass", "published"],
      ],
      emails: [
        ["newsletter", "The New Year challenge is open", "sent"],
        ["series", "Challenge sign-up follow-up", "on"],
      ],
      graphics: [
        ["Lobby screen", 1920, 1080],
        ["Instagram square", 1080, 1080],
        ["Story", 1080, 1920],
      ],
      formSends: 112,
      emailsSent: 2630,
    },
    {
      name: "Summer corporate push",
      notes: "Wellness offers for local employers.",
      color: "blue",
      startsOn: "2026-06-01",
      endsOn: "2026-08-31",
      archived: true,
      pages: [["Corporate wellness", "corporate-wellness", "published"]],
      emails: [["newsletter", "A healthier team this summer", "sent"]],
      graphics: [["Flyer", 1700, 2200]],
      formSends: 23,
      emailsSent: 410,
    },
  ],
};

export function sampleCampaigns(tenant: { id: string; edition: EditionKey }, now = new Date()): CampaignDetail[] {
  return SEEDS[tenant.edition].map((c, i) => {
    const id = sampleUuid(`${tenant.id}:campaign:${c.name}`);
    const at = new Date(now.getTime() - (i + 1) * 9 * 86_400_000);
    return {
      ...c,
      id,
      createdAt: at,
      counts: { pages: c.pages.length, emails: c.emails.length, graphics: c.graphics.length },
      pages: c.pages.map(([title, slug, status]) => ({ id: sampleUuid(`${id}:page:${slug}`), title, slug, status })),
      emails: c.emails.map(([kind, name, status], j) => ({ id: sampleUuid(`${id}:email:${j}`), kind, name, status, when: new Date(at.getTime() + j * 86_400_000) })),
      graphics: c.graphics.map(([name, width, height], j) => ({ fileId: sampleUuid(`${id}:graphic:${j}`), name, width, height, contentType: "image/png", bytes: 0, addedAt: at })),
    };
  });
}
