import { Award, Lock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Help, PageHeader, SampleBanner } from "@/components/ui";
import { formatAgo, formatInt } from "@/lib/format";
import { getPortalContext } from "@/lib/portal";
import { progressFor } from "@/lib/progress/repo";
import { achievementsFor, levelFor, XP_PER_LEVEL, xpRules } from "@/lib/progress/rules";
import s from "./progress.module.css";

export const metadata: Metadata = { title: "Progress" };

const XP_HELP = `XP your whole team has earned, for things done in your account. Each one counts once, and XP is never taken away, even if you delete what earned it. Every ${XP_PER_LEVEL} XP is a new level.`;

async function Body() {
  const ctx = await getPortalContext();
  const { progress, demo } = await progressFor(ctx);
  const lv = levelFor(progress.xp);
  const rules = xpRules(ctx.tenant.edition);
  const list = achievementsFor(ctx.tenant.edition);
  const earnedCount = list.filter((a) => progress.earned.has(a.key)).length;
  const titleOf = new Map(rules.map((r) => [r.kind, r.title]));

  return (
    <>
      {demo && <SampleBanner demo />}
      <PageHeader title="Progress" note="Earn XP for running campaigns and working on your business. Every 10 XP is a new level." />
      <div className={s.stack}>
        <section className={`card ${s.hero}`} aria-label="Your level" data-testid="progress-level">
          <div className={s.badge} aria-hidden="true">
            <span className="num">{lv.level}</span>
          </div>
          <div className={s.heroText}>
            <div className={s.heroLine}>
              <h2 className={s.levelName}>Level {lv.level}</h2>
              <span className={s.total}>
                <span className="num">{formatInt(lv.xp)}</span> XP in all
                <Help title="XP">{XP_HELP}</Help>
              </span>
            </div>
            <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={XP_PER_LEVEL} aria-valuenow={lv.into} aria-label={`${lv.into} of ${XP_PER_LEVEL} XP toward level ${lv.level + 1}`}>
              <span style={{ width: `${(lv.into / XP_PER_LEVEL) * 100}%` }} />
            </div>
            <p className={s.next}>
              <span className="num">{lv.toNext}</span> XP to level {lv.level + 1}.
            </p>
          </div>
        </section>

        <Card
          title="Achievements"
          note={
            <>
              <span className="num">{earnedCount}</span> of <span className="num">{list.length}</span> earned.{" "}
              <Help title="Achievements">Badges for milestones in your account. Each is earned once, by anyone on your team, and kept for good.</Help>
            </>
          }
          testId="progress-achievements"
        >
          <ul className={s.achievements}>
            {list.map((a) => {
              const at = progress.earned.get(a.key);
              return (
                <li key={a.key} className={s.achievement} data-earned={at ? true : undefined} data-testid={`achievement-${a.key}`}>
                  <span className={s.medal} aria-hidden="true">
                    {at ? <Award /> : <Lock />}
                  </span>
                  <span className={s.achText}>
                    <strong>{a.name}</strong>
                    <span>{a.note}</span>
                    <span className={s.when}>{at ? `Earned ${formatAgo(at)}` : "Not yet"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className={s.cols}>
          <Card title="How to earn XP" note={<>On the right, what each way has earned you so far. <Help title="XP earned so far">The XP your team has earned from each of these, added up since your account started.</Help></>} flush testId="progress-rules">
            <ul className={s.rules}>
              {rules.map((r) => {
                const done = progress.byKind.get(r.kind);
                return (
                  <li key={r.kind} className={s.rule}>
                    <span className={`num ${s.points}`}>+{r.points}</span>
                    <span className={s.ruleText}>
                      <strong>{r.title}</strong>
                      <span>{r.how}</span>
                    </span>
                    <span className={`num ${s.earned}`} title="XP earned this way so far">
                      {done ? `${formatInt(done.points)} XP` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Latest XP" flush testId="progress-recent">
            {progress.recent.length === 0 ? (
              <p className={s.empty}>Nothing yet. Start a campaign in Marketing to earn your first XP.</p>
            ) : (
              <ol className={s.rules}>
                {progress.recent.map((e, i) => (
                  <li key={`${e.kind}-${i}`} className={s.rule}>
                    <span className={`num ${s.points}`}>+{e.points}</span>
                    <span className={s.ruleText}>
                      <strong>{titleOf.get(e.kind) ?? e.kind}</strong>
                      <span>{e.label}</span>
                    </span>
                    <span className={s.when}>{formatAgo(e.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<PageHeader title="Progress" />}>
      <Body />
    </Suspense>
  );
}
