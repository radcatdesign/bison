// The email renderer, document format, editing operations and the pieces of
// Marketing that don't need a database.
import { describe, expect, it } from "vitest";
import { applyEmailOp, emailProblems, starterEmailSection } from "@/lib/email/ops";
import { esc, mergeLine, renderEmail } from "@/lib/email/render";
import { defaultBrandKit, EMAIL_DOC_VERSION, type EmailDoc, emailDocSchema, fileIdsIn, findEmailPlaceholders, hasInlineImages, parseBrandKit, readBrandKit } from "@/lib/email/schema";
import { EMAIL_TEMPLATES } from "@/lib/email/templates";
import { detectColumns, parseCsv, rowsFromCsv, toCsv } from "@/lib/marketing/csv";
import { fullName, relativeName, zoneOf } from "@/lib/marketing/dns";
import { buildLlmsTxt, buildSitemap, jsonLd, pageStructuredData, robotsLines, type SearchContext } from "@/lib/marketing/search";
import { kindValueFor, offerSettingsSchema, offerTerms, readMarketingSettings } from "@/lib/marketing/settings";
import { buildSetup, progressOf, type SetupFacts } from "@/lib/marketing/setup-steps";
import { starterSeries } from "@/lib/marketing/starter";
import { emptyPageDoc } from "@/lib/pages/schema";
import { dateToZonedLocal, zonedLocalToDate } from "@/lib/time";

const brand = { ...defaultBrandKit("Brightwater Pools", "#3b5bff", "brightwaterpools.com"), address: "120 Shoreline Way\nBend, OR 97701" };
const doc = (sections: EmailDoc["sections"]): EmailDoc => ({ version: EMAIL_DOC_VERSION, sections, signOff: true, fallbackName: "there" });

describe("rendering an email", () => {
  const email = doc([
    { id: "hi", type: "text", heading: "Hello {first name}", body: "Line one with **bold** and [a link](https://brightwaterpools.com/gallery).\n\n- first\n- second", align: "left" },
    { id: "go", type: "button", label: "Shop now", href: "https://brightwaterpools.com/shop", align: "center", style: "solid" },
  ]);

  it("merges first names, with the fallback when there isn't one", () => {
    expect(renderEmail({ doc: email, brand, subject: "x", baseUrl: "https://app.test", person: { name: "Mara Quinn" } }).html).toContain("Hello Mara");
    expect(renderEmail({ doc: email, brand, subject: "x", baseUrl: "https://app.test", person: { name: "" } }).html).toContain("Hello there");
    expect(renderEmail({ doc: email, brand, subject: "x", baseUrl: "https://app.test", person: { name: "pk@x.com" } }).html).toContain("Hello there");
  });

  it("turns **bold**, links and lists into markup, and tags links to the company's own site", () => {
    const { html, text } = renderEmail({ doc: email, brand, subject: "x", baseUrl: "https://app.test", utm: { source: "newsletter", campaign: "oct", hosts: ["brightwaterpools.com"] } });
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://brightwaterpools.com/gallery?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=oct"');
    expect(html).toMatch(/<ul[^>]*><li[^>]*>first<\/li><li[^>]*>second<\/li><\/ul>/);
    expect(text).toContain("a link (https://brightwaterpools.com/gallery?utm_source=newsletter");
    expect(text).toContain("Shop now: https://brightwaterpools.com/shop");
  });

  it("escapes everything people type, and drops links that aren't web, email or phone", () => {
    const nasty = doc([{ id: "x", type: "text", body: '<script>alert(1)</script> [click](javascript:alert(1)) "quotes"', align: "left" }]);
    const { html } = renderEmail({ doc: nasty, brand: { ...brand, businessName: "<b>Evil</b>" }, subject: "<x>", baseUrl: "https://app.test" });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(esc(`<a href="x">'`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;");
  });

  it("always has the postal address and an unsubscribe link in the footer", () => {
    const { html, text } = renderEmail({ doc: email, brand, subject: "x", baseUrl: "https://app.test", unsubscribeUrl: "https://app.test/u/token" });
    expect(html).toContain("120 Shoreline Way<br>Bend, OR 97701");
    expect(html).toContain('href="https://app.test/u/token"');
    expect(text).toContain("Unsubscribe: https://app.test/u/token");
  });

  it("makes uploaded images absolute so email apps can load them", () => {
    const withPhoto = doc([{ id: "p", type: "photo", image: { src: "/f/11111111-1111-4111-8111-111111111111", width: 1200, height: 800 }, alt: "A pool", width: "inset" }]);
    const { html } = renderEmail({ doc: withPhoto, brand, subject: "x", baseUrl: "https://app.test" });
    expect(html).toContain('src="https://app.test/f/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('width="536"');
  });

  it("shows the welcome code only to people who have one", () => {
    const offer = doc([{ id: "o", type: "offer", heading: "A gift" }]);
    expect(renderEmail({ doc: offer, brand, subject: "x", baseUrl: "https://app.test" }).html).not.toContain("A gift");
    const r = renderEmail({ doc: offer, brand, subject: "x", baseUrl: "https://app.test", offer: { code: "WELCOME-ABC123", terms: "10% off" } });
    expect(r.html).toContain("WELCOME-ABC123");
    expect(r.text).toContain("Your code: WELCOME-ABC123");
  });

  it("marks sections and placeholders only in the builder", () => {
    const e = doc([{ id: "t", type: "text", body: "[Add your news]", align: "left" }]);
    const built = renderEmail({ doc: e, brand: { ...brand, address: "" }, subject: "x", baseUrl: "https://app.test", builder: { selectedId: "t" } }).html;
    expect(built).toContain('data-section="t" data-selected');
    expect(built).toContain("<mark");
    expect(built).toContain("[Add your postal address in the brand kit]");
    const sent = renderEmail({ doc: e, brand, subject: "x", baseUrl: "https://app.test" }).html;
    expect(sent).not.toContain("data-section");
  });

  it("merges subject lines", () => {
    expect(mergeLine("A note for {first name} from {business name}", { name: "June Okafor", business: "Brightwater" })).toBe("A note for June from Brightwater");
    expect(mergeLine("Hi {first name}", { name: null, business: "B", fallback: "friend" })).toBe("Hi friend");
  });
});

describe("the email document", () => {
  it("refuses unsafe links and images", () => {
    expect(emailDocSchema.safeParse(doc([{ id: "b", type: "button", label: "x", href: "javascript:alert(1)", align: "left", style: "solid" }])).success).toBe(false);
    expect(emailDocSchema.safeParse(doc([{ id: "p", type: "photo", image: { src: "http://plain.test/x.png", width: 10, height: 10 }, alt: "", width: "inset" }])).success).toBe(false);
  });

  it("finds demo-only pictures and the company's uploads", () => {
    const d = doc([
      { id: "p", type: "photo", image: { src: "data:image/png;base64,AAAA", width: 10, height: 10 }, alt: "", width: "inset" },
      { id: "q", type: "photo", image: { src: "/f/22222222-2222-4222-8222-222222222222", width: 10, height: 10 }, alt: "", width: "inset" },
    ]);
    expect(hasInlineImages(d)).toBe(true);
    expect(fileIdsIn(d)).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("adds, duplicates, moves and removes sections, and lists what stops a send", () => {
    let d = doc([]);
    const r1 = applyEmailOp(d, { op: "add", section: starterEmailSection("text") });
    d = r1.doc;
    const r2 = applyEmailOp(d, { op: "duplicate", id: r1.selected! });
    d = r2.doc;
    expect(d.sections).toHaveLength(2);
    expect(new Set(d.sections.map((s) => s.id)).size).toBe(2);
    d = applyEmailOp(d, { op: "move", id: r2.selected!, to: 0 }).doc;
    expect(d.sections[0].id).toBe(r2.selected);
    d = applyEmailOp(d, { op: "add", section: starterEmailSection("photo") }).doc;
    const problems = emailProblems(d, "", "[Add a teaser]");
    expect(problems.map((p) => p.text)).toEqual(expect.arrayContaining(["Add a subject line.", "A photo section has no photo yet.", "Fill in [Add a teaser] in the preview text."]));
    d = applyEmailOp(d, { op: "remove", id: d.sections[0].id }).doc;
    expect(d.sections).toHaveLength(2);
  });

  it("treats every [Add ...] spot as unfinished, long ones too", () => {
    const st = starterSeries("brightwaterpools.com");
    expect(findEmailPlaceholders(st.steps[0].doc).length).toBeGreaterThan(0);
    expect(st.steps.map((x) => emailProblems(x.doc, x.subject, x.preheader).length > 0)).toEqual([true, true, false]);
  });

  it("ships templates that parse and leave facts as spots to fill in", () => {
    for (const t of EMAIL_TEMPLATES) {
      expect(emailDocSchema.safeParse(t.doc("https://example.com")).success, t.key).toBe(true);
      expect(emailProblems(t.doc("https://example.com"), t.subject, t.preheader).length, t.key).toBeGreaterThan(0);
    }
  });
});

describe("brand kit and settings", () => {
  it("fills anything missing from the defaults", () => {
    const d = defaultBrandKit("Ridgeline Roasters", "#aa5500");
    const kit = readBrandKit({ colors: { accent: "#112233" }, address: "PO Box 9" }, d);
    expect(kit.colors.accent).toBe("#112233");
    expect(kit.colors.text).toBe(d.colors.text);
    expect(kit.address).toBe("PO Box 9");
    expect(() => parseBrandKit({ ...d, colors: { ...d.colors, accent: "red" } })).toThrow();
  });

  it("starts signup choices from the industry", () => {
    const s = readMarketingSettings(undefined, { name: "Brightwater", industry: "pools", accent: "#3b5bff" });
    expect(s.signup.types.map((t) => t.value)).toContain("homeowner");
    expect(kindValueFor("Pool builder", ["pool-builder"])).toBe("pool-builder-2");
  });

  it("keeps offers sensible and says what a code is worth", () => {
    expect(offerSettingsSchema.safeParse({ kind: "percent", value: 95 }).success).toBe(false);
    expect(offerSettingsSchema.safeParse({ kind: "amount", value: 95 }).success).toBe(true);
    expect(offerTerms({ kind: "percent", value: 15 }, new Date("2026-11-30T20:00:00Z"), "America/Los_Angeles")).toBe("15% off your first order. First-time buyers only, one per person. Use it by November 30, 2026.");
  });
});

describe("CSV", () => {
  it("reads quoted fields, semicolons and headers from other email tools", () => {
    const rows = parseCsv('﻿Email Address;First Name;Last Name;Type\n"mara@x.com";Mara;"Quinn, Jr.";Homeowner\nbad;;;\n');
    const found = detectColumns(rows)!;
    expect(found.hasHeader).toBe(true);
    expect(rowsFromCsv(rows, found)[0]).toEqual({ email: "mara@x.com", name: "Mara Quinn, Jr.", kind: "Homeowner" });
  });

  it("works without a header row", () => {
    const rows = parseCsv("june@x.com,June\ntheo@y.com,Theo\n");
    const found = detectColumns(rows)!;
    expect(found.hasHeader).toBe(false);
    expect(rowsFromCsv(rows, found)).toHaveLength(2);
  });

  it("writes cells a spreadsheet won't run as formulas", () => {
    expect(toCsv(["Name"], [["=HYPERLINK(\"x\")"], ["Hi, there"]])).toBe('Name\r\n"\'=HYPERLINK(""x"")"\r\n"Hi, there"\r\n');
  });
});

describe("DNS names for sending domains", () => {
  it("works out the zone and the names hosts ask for", () => {
    expect(zoneOf("mail.brightwaterpools.com")).toBe("brightwaterpools.com");
    expect(zoneOf("news.shop.co.uk")).toBe("shop.co.uk");
    expect(relativeName("send", "mail.brightwaterpools.com")).toBe("send.mail");
    expect(relativeName("send", "brightwaterpools.com")).toBe("send");
    expect(fullName("send.mail", "mail.brightwaterpools.com")).toBe("send.mail.brightwaterpools.com");
  });
});

describe("scheduling in the company's time zone", () => {
  it("turns a wall-clock time into the right instant, both sides of a clock change", () => {
    expect(zonedLocalToDate("2026-10-30T09:00", "America/Los_Angeles")?.toISOString()).toBe("2026-10-30T16:00:00.000Z");
    expect(zonedLocalToDate("2026-11-02T09:00", "America/Los_Angeles")?.toISOString()).toBe("2026-11-02T17:00:00.000Z");
    expect(dateToZonedLocal(new Date("2026-11-02T17:00:00Z"), "America/Los_Angeles")).toBe("2026-11-02T09:00");
    expect(zonedLocalToDate("not a date", "UTC")).toBeNull();
  });
});

describe("search pack", () => {
  const page = { slug: "spring-sale", title: "Spring sale", publishedAt: new Date("2026-10-01T00:00:00Z"), doc: { ...emptyPageDoc(), seo: { title: "Spring sale on glow aggregate", description: "15% off through May." }, sections: [{ id: "faq", type: "faq" as const, items: [{ q: "Does it glow all night?", a: "About eight hours." }] }] } };
  const c: SearchContext = {
    name: "Brightwater Pools",
    tenantSlug: "brightwater-pools",
    site: "brightwaterpools.com",
    base: "https://app.test",
    brand,
    search: { description: "We build glow pools.", offerings: ["Resurfacing"], areas: "Bend", phone: "555-0100", email: "", hours: "", businessType: "HomeAndConstructionBusiness", profiles: [], allowAi: false, submitted: false },
    pages: [page],
  };

  it("builds a sitemap and llms.txt from published pages", () => {
    expect(buildSitemap(c)).toContain("<loc>https://app.test/p/brightwater-pools/spring-sale</loc>");
    const llms = buildLlmsTxt(c);
    expect(llms).toMatch(/^# Brightwater Pools\n\n> We build glow pools\./);
    expect(llms).toContain("- [Spring sale on glow aggregate](https://app.test/p/brightwater-pools/spring-sale): 15% off through May.");
  });

  it("marks up the business and its questions, safely", () => {
    const data = pageStructuredData(c, page) as { "@graph": { "@type": string }[] };
    expect(data["@graph"].map((g) => g["@type"])).toEqual(["HomeAndConstructionBusiness", "WebPage", "FAQPage"]);
    expect(jsonLd({ x: "</script>" })).not.toContain("</script>");
  });

  it("names AI crawlers when they're turned off", () => {
    expect(robotsLines(c)).toContain("User-agent: GPTBot\nDisallow: /");
    expect(robotsLines({ ...c, search: { ...c.search, allowAi: true } })).not.toContain("GPTBot");
  });
});

describe("setup steps", () => {
  const none: SetupFacts = {
    canManageSettings: false,
    sending: { domain: false, verified: false, tested: false },
    brand: { saved: false, logo: false, address: false },
    signup: { saved: false, formOnPage: false },
    subscribers: { count: 0, lists: 0 },
    series: { starterReady: false, anyOn: false },
    newsletters: { count: 0, tested: false, sentOrScheduled: false },
    offer: { saved: false, on: false, inEmail: false },
    search: { described: false, contact: false, publishedPage: false, submitted: false },
  };

  it("starts with sending, and says who can do owner-only steps", () => {
    const tools = buildSetup(none);
    const p = progressOf(tools);
    expect(p.done).toBe(0);
    expect(p.next?.key).toBe("sending.domain");
    expect(tools[0].steps[0].blockedNote).toBe("An owner or admin on your team does this step.");
  });

  it("doesn't count optional steps or the optional offer toward done", () => {
    const all: SetupFacts = {
      ...none,
      sending: { domain: true, verified: true, tested: true },
      brand: { saved: true, logo: false, address: true },
      signup: { saved: true, formOnPage: true },
      subscribers: { count: 3, lists: 0 },
      series: { starterReady: true, anyOn: true },
      newsletters: { count: 1, tested: true, sentOrScheduled: true },
      search: { described: true, contact: true, publishedPage: true, submitted: true },
    };
    const p = progressOf(buildSetup(all));
    expect(p.next).toBeNull();
    expect(p.done).toBe(p.total);
  });
});
