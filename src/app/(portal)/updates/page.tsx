import { Check } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { RELEASES } from "@/config/releases";
import s from "./updates.module.css";

export const metadata: Metadata = { title: "Updates" };

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function UpdatesPage() {
  return (
    <>
      <PageHeader title="Updates" note="What changed in Bison Ops, newest first." />
      <ol className={s.releases}>
        {RELEASES.map((r) => (
          <li key={r.version} className={s.release}>
            <div className={s.meta}>
              <span className="pill pill-accent num">v{r.version}</span>
              <time dateTime={r.date} className="label">
                {longDate(r.date)}
              </time>
            </div>
            <article className={`card ${s.body}`}>
              <h2 className={s.title}>{r.title}</h2>
              <ul className={s.changes}>
                {r.changes.map((c) => (
                  <li key={c}>
                    <Check aria-hidden="true" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ol>
    </>
  );
}
