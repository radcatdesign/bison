import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/ui";
import { RELEASES } from "@/config/releases";

export const metadata: Metadata = { title: "Updates" };

export default function UpdatesPage() {
  return (
    <>
      <PageHeader title="Updates" note="What changed in Bison Ops, newest first." />
      {RELEASES.map((r) => (
        <Section key={r.version} title={r.title} aside={<span className="label">{`Version ${r.version}, ${new Date(`${r.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`}</span>}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, maxWidth: "64ch" }}>
            {r.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}
