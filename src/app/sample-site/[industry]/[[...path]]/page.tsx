// A made-up website for sample mode. The Landing pages screen previews these
// until a tenant's own pages are coming in. No data, nothing real.
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { sampleSiteFor } from "@/lib/sample/sites";
import s from "./site.module.css";

export const metadata: Metadata = { title: "Sample site", robots: { index: false, follow: false } };

type Props = { params: Promise<{ industry: string; path?: string[] }>; searchParams: Promise<{ name?: string }> };

async function Site({ params, searchParams }: Props) {
  const { industry, path } = await params;
  const { name } = await searchParams;
  const site = sampleSiteFor(industry);
  const current = `/${(path ?? []).join("/")}`;
  const page = site.pages[current] ?? site.pages["/"];
  const brand = (typeof name === "string" && name.trim().slice(0, 60)) || site.fallbackName;
  const base = `/sample-site/${industry}`;
  const link = (to: string) => `${base}${to === "/" ? "" : to}${name ? `?name=${encodeURIComponent(brand)}` : ""}`;
  const t = site.theme;
  const vars = {
    "--s-bg": t.bg,
    "--s-surface": t.surface,
    "--s-ink": t.ink,
    "--s-muted": t.muted,
    "--s-accent": t.accent,
    "--s-accent-ink": t.accentInk,
    "--s-hero": t.hero,
    "--s-font": t.font,
    "--s-display": t.display,
  } as CSSProperties;

  return (
    <div className={s.site} style={vars}>
      <header className={s.nav}>
        <a href={link("/")} className={s.logo}>
          <span className={s.logoMark} aria-hidden="true" />
          {brand}
        </a>
        <nav className={s.links} aria-label="Site">
          {site.nav.map((n) => (
            <a key={n.path} href={link(n.path)} aria-current={n.path === current ? "page" : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <a href={link(Object.keys(site.pages).find((p) => /quote|contact|wholesale/.test(p)) ?? "/")} className={s.navCta}>
          {site.pages["/"].cta}
        </a>
      </header>

      <section className={s.hero}>
        <div className={s.heroInner}>
          <p className={s.kicker}>{page.title}</p>
          <h1 className={s.headline}>{page.headline}</h1>
          <p className={s.sub}>{page.sub}</p>
          <div className={s.ctas}>
            <a href="#start" className={s.primary}>
              {page.cta}
            </a>
            <a href={link(site.nav[0].path)} className={s.secondary}>
              {site.nav[0].label}
            </a>
          </div>
        </div>
        <div className={s.heroArt} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      <section className={s.features}>
        {site.features.map((f) => (
          <article key={f.title} className={s.feature}>
            <h2>{f.title}</h2>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <section className={s.proof}>
        <blockquote>&ldquo;{site.proof.quote}&rdquo;</blockquote>
        <p>{site.proof.who}</p>
      </section>

      <section className={s.band} id="start">
        <h2>{page.cta}</h2>
        <form className={s.form} action="#start">
          <input aria-label="Email" placeholder="you@example.com" />
          <button type="button">{page.cta}</button>
        </form>
      </section>

      <footer className={s.footer}>
        <span>
          © {brand}
        </span>
        <span>Sample page made by Bison Ops. Not a real business.</span>
      </footer>
    </div>
  );
}

export default function SampleSitePage(props: Props) {
  return (
    <Suspense>
      <Site {...props} />
    </Suspense>
  );
}
