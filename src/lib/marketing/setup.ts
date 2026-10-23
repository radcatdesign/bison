import "server-only";
// Fills the setup facts from the database, in one transaction.
import { sql } from "kysely";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { findEmailPlaceholders } from "@/lib/email/schema";
import type { PortalContext } from "@/lib/portal";
import { scopeOf } from "@/lib/portal";
import { readDoc } from "./send";
import { isVerified, readSending } from "./sending";
import { readMarketingSettings } from "./settings";
import { buildSetup, type SetupFacts, type ToolSetup } from "./setup-steps";
import { settingsTenantOf } from "./store";

const saved = (v: unknown) => Boolean(v && typeof v === "object" && Object.keys(v).length > 0);

export async function loadSetupFacts(ctx: PortalContext): Promise<SetupFacts> {
  return withTenant(scopeOf(ctx), async (tx) => {
    const row = await tx.selectFrom("marketing_settings").select(["brand", "signup", "offer", "search"]).executeTakeFirst();
    const settings = readMarketingSettings(row, settingsTenantOf(ctx));
    const sending = await readSending(tx);
    const { rows } = await sql<{
      tests: boolean;
      newsletter_tests: boolean;
      subscribers: number;
      lists: number;
      newsletters: number;
      out: boolean;
      any_on: boolean;
      offer_in_email: boolean;
      published: number;
      signup_form: boolean;
      page_tests: number;
      page_tests_started: boolean;
      page_tests_ended: boolean;
    }>`select
        exists (select 1 from email_sends where kind = 'test') as tests,
        exists (select 1 from email_sends where kind = 'test' and newsletter_id is not null) as newsletter_tests,
        (select count(*)::int from subscribers where status = 'subscribed') as subscribers,
        (select count(*)::int from lists) as lists,
        (select count(*)::int from newsletters) as newsletters,
        exists (select 1 from newsletters where status in ('scheduled', 'sending', 'sent')) as out,
        exists (select 1 from sequences where status = 'on') as any_on,
        exists (select 1 from sequence_steps where doc -> 'sections' @> '[{"type": "offer"}]') as offer_in_email,
        (select count(*)::int from pages where published_at is not null) as published,
        exists (select 1 from pages where coalesce(published_doc, doc) -> 'sections' @> '[{"type": "form", "subscribe": true}]') as signup_form,
        (select count(*)::int from page_tests) as page_tests,
        exists (select 1 from page_tests where status in ('running', 'ended')) as page_tests_started,
        exists (select 1 from page_tests where status = 'ended') as page_tests_ended`.execute(tx);
    const f = rows[0];
    const starter = await tx.selectFrom("sequences").select("id").where("starter", "=", true).executeTakeFirst();
    let starterReady = false;
    if (starter) {
      const steps = await tx.selectFrom("sequence_steps").select(["doc", "subject"]).where("sequence_id", "=", starter.id).execute();
      starterReady = steps.length > 0 && steps.every((s) => {
        const doc = readDoc(s.doc);
        return doc !== null && findEmailPlaceholders(doc, s.subject).length === 0;
      });
    }
    return {
      canManageSettings: may(ctx.member.role, "settings.manage"),
      sending: { domain: Boolean(sending.domain), verified: isVerified(sending), tested: f.tests },
      brand: { saved: saved(row?.brand), logo: Boolean(settings.brand.logo), address: Boolean(settings.brand.address.trim()) },
      signup: { saved: saved(row?.signup), formOnPage: f.signup_form },
      subscribers: { count: f.subscribers, lists: f.lists },
      series: { starterReady, anyOn: f.any_on },
      newsletters: { count: f.newsletters, tested: f.newsletter_tests, sentOrScheduled: f.out },
      offer: { saved: saved(row?.offer), on: settings.offer.on, inEmail: f.offer_in_email },
      search: { described: Boolean(settings.search.description), contact: Boolean(settings.search.phone || settings.search.email), publishedPage: f.published > 0, submitted: settings.search.submitted },
      tests: { publishedPage: f.published > 0, created: f.page_tests > 0, started: f.page_tests_started, ended: f.page_tests_ended, canStart: may(ctx.member.role, "pages.publish") },
    };
  });
}

export async function loadSetup(ctx: PortalContext): Promise<ToolSetup[]> {
  return buildSetup(await loadSetupFacts(ctx));
}
