import { Bot, ChartLine, Megaphone, ShoppingBag, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AgentsGym } from "@/components/agents/agents-gym";
import s from "@/components/agents/agents.module.css";
import { TaskCard, type TaskView } from "@/components/agents/task-card";
import { Card, Help, PageHeader, SampleBanner, Segmented } from "@/components/ui";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { agentsView } from "@/lib/agents/repo";
import { AGENT_KEYS, agentsFor, KINDS } from "@/lib/agents/roster";
import { withTenant } from "@/lib/db";
import type { AgentKey } from "@/lib/db/types";
import { sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import { formatAgo, formatInt } from "@/lib/format";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { salesSender } from "@/lib/sales/emails";

export const metadata: Metadata = { title: "Agents" };

const ICONS: Record<AgentKey, typeof Bot> = { frontdesk: UserRound, memberships: ShoppingBag, marketing: Megaphone, coach: ChartLine };
const MOOD: Record<string, string> = { quiet: "Quiet", steady: "Steady", busy: "Busy", packed: "Packed" };

const change = (now: number, before: number) => (before === 0 ? (now ? "New this week" : "Same as the week before") : `${now >= before ? "Up" : "Down"} ${Math.round((Math.abs(now - before) / before) * 100)}% on the week before`);

async function Body({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const ctx = await getPortalContext();
  const say = sayOf(ctx);
  const fit = ctx.tenant.edition === "fit";
  const roster = agentsFor(ctx.tenant.edition);
  const asked = (await searchParams).agent;
  const selected = AGENT_KEYS.includes(asked as AgentKey) ? (asked as AgentKey) : null;
  const view = await agentsView(ctx);
  const canSend = view.sample || demoMode() ? true : Boolean(await withTenant(scopeOf(ctx), (tx) => salesSender(tx)));
  const waiting = (k: AgentKey) => view.open.filter((t) => t.agent === k).length;
  const nameOf = (k: AgentKey) => roster.find((a) => a.key === k)?.name ?? k;
  const shown = view.open.filter((t) => !selected || t.agent === selected);
  const fmt = (d: Date) => formatAgo(d);
  const tasks: TaskView[] = shown.map((t) => {
    const spec = KINDS[t.kind];
    return {
      id: t.id,
      kind: t.kind,
      agentName: nameOf(t.agent),
      title: t.title,
      summary: t.summary,
      draft: t.draft,
      when: fmt(t.createdAt),
      approveLabel: spec.approve,
      email: spec.email,
      canDecide: can(ctx.tenant, spec.feature) && (!spec.action || may(ctx.member.role, spec.action)),
      canSend,
    };
  });
  const w = view.week;
  const b = view.before;
  const weekItems = [
    { label: "Website visitors", value: w.visitors, before: b.visitors, help: "Visitors to your website in the last 7 days. Each browser counts once a day." },
    { label: say("New leads", "New leads"), value: w.leads, before: b.leads, help: say("People who sent a form or reached you for the first time in the last 7 days, not counting spam.", "People who asked about your club for the first time in the last 7 days, on your site or at the front desk, not counting spam.") },
    ...(fit ? [{ label: "Check-ins", value: w.checkIns, before: b.checkIns, help: "Check-ins at your kiosk tablets in the last 7 days." }] : []),
    { label: say("Orders", "Joins and purchases"), value: w.joins, before: b.joins, help: say("Paid orders in the last 7 days.", "Memberships, packs and other purchases in the last 7 days.") },
  ];

  return (
    <>
      {view.sample && <SampleBanner demo={demoMode()} />}
      <PageHeader title="Agents" note={say("Your team of agents finds the work that's waiting and drafts it for you. Nothing goes to a customer until you approve it.", "Your club's team of agents finds the work that's waiting and drafts it for you. Nothing goes to a member or lead until you approve it.")} />
      <div className={s.stack}>
        <div className={s.top}>
          {fit ? (
            <AgentsGym
              club={ctx.tenant.name}
              guests={view.crowd.guests}
              mood={view.crowd.mood}
              agents={roster.map((a) => ({ key: a.key, name: a.name, role: a.role, waiting: waiting(a.key) }))}
              selected={selected}
            />
          ) : (
            <Card title="Your team" testId="agent-team">
              <ul className={s.team}>
                {roster.map((a) => {
                  const Icon = ICONS[a.key];
                  return (
                    <li key={a.key}>
                      <Link href={selected === a.key ? "/agents" : `/agents?agent=${a.key}`} scroll={false} className={s.member} aria-current={selected === a.key ? "true" : undefined} data-testid={`agent-${a.key}`}>
                        <span className={s.memberHead}>
                          <span className={s.avatar} aria-hidden="true">
                            <Icon />
                          </span>
                          {waiting(a.key) > 0 && <span className="pill pill-accent">{waiting(a.key)} waiting</span>}
                        </span>
                        <span className={s.memberName}>{a.name}</span>
                        <span className={s.memberRole}>{a.role}</span>
                        <p className={s.memberAbout}>{a.about}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card title="The last 7 days" testId="agent-week">
            <div className={s.crowd}>
              {fit && (
                <span className={s.mood} data-testid="gym-mood">
                  {MOOD[view.crowd.mood]}: {view.crowd.guests} {view.crowd.guests === 1 ? "guest" : "guests"}
                  <Help title="Guests">
                    How busy your gym looks. Every 50 website visitors, 2 new leads, 100 check-ins or 1 join in the last 7 days puts one more guest on the floor, up to 30.
                  </Help>
                </span>
              )}
              <ul className={s.weekList}>
                {weekItems.map((i) => (
                  <li key={i.label}>
                    <span className={s.weekLabel}>
                      {i.label}
                      <Help title={i.label} idSuffix="-agents">
                        {i.help}
                      </Help>
                    </span>
                    <span className={`num ${s.weekValue}`}>{formatInt(i.value)}</span>
                    <span className={s.weekBefore}>{change(i.value, i.before)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        <section aria-label="Waiting for you" data-testid="agent-tasks">
          <div className={s.filters}>
            <Segmented label="Show" items={[{ href: "/agents", label: `Everything (${view.open.length})`, current: !selected }, ...roster.map((a) => ({ href: `/agents?agent=${a.key}`, label: `${a.name} (${waiting(a.key)})`, current: selected === a.key }))]} />
          </div>
          {tasks.length === 0 ? (
            <Card>
              <p className={s.empty}>{selected ? `Nothing waiting from ${nameOf(selected)} right now.` : "Nothing waiting right now. The agents check again every few minutes."}</p>
            </Card>
          ) : (
            <div className={s.tasks}>
              {tasks.map((t) => (
                <TaskCard key={t.id} task={t} sample={view.sample} />
              ))}
            </div>
          )}
        </section>

        {view.done.length > 0 && (
          <Card title="Done lately" flush testId="agent-done">
            <ul className={s.history}>
              {view.done.map((t) => (
                <li key={t.id}>
                  <span className={s.historyMain}>
                    <strong>{t.title}</strong>
                    <span>
                      {t.result} {t.decidedBy ? `${t.decidedBy}.` : ""}
                    </span>
                  </span>
                  <span className="muted">{t.decidedAt ? formatAgo(t.decidedAt) : ""}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

export default function AgentsPage({ searchParams }: PageProps<"/agents">) {
  return (
    <Suspense fallback={<PageHeader title="Agents" />}>
      <Body searchParams={searchParams as Promise<{ agent?: string }>} />
    </Suspense>
  );
}
