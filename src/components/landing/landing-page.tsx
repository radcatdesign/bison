// Renders a landing page from its document. The editor preview and the public
// page both use this, so what you build is exactly what visitors get.
// Every value is text rendered by React, links are checked by the schema, and
// nothing here reads the session, so it's safe on public pages.
import "@fontsource-variable/fraunces";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { accentInk } from "@/lib/color";
import { type Cta, type FormField, type PageDoc, PLACEHOLDER, type Section, type SectionOf } from "@/lib/pages/schema";
import s from "./landing-page.module.css";

export type FormRenderer = (section: SectionOf<"form">) => ReactNode;

type Props = {
  doc: PageDoc;
  brand: string;
  /** In the editor: marks the selected section and turns placeholders into highlights. */
  selectedId?: string | null;
  builder?: boolean;
  /** The public page passes a working form; the editor shows a static one. */
  renderForm?: FormRenderer;
};

/** Text with any [Add ...] placeholders marked so they're easy to spot. */
function T({ children }: { children: string | undefined }) {
  if (!children) return null;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of children.matchAll(PLACEHOLDER)) {
    if (m.index > last) parts.push(children.slice(last, m.index));
    parts.push(
      <mark key={m.index} className={s.placeholder}>
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last === 0) return <>{children}</>;
  if (last < children.length) parts.push(children.slice(last));
  return <>{parts}</>;
}

function Button({ cta, kind = "primary" }: { cta: Cta; kind?: "primary" | "secondary" }) {
  const external = /^https?:/i.test(cta.href);
  return (
    <a href={cta.href} className={kind === "primary" ? s.primary : s.secondary} {...(external ? { rel: "noopener noreferrer" } : {})}>
      <T>{cta.label}</T>
      {kind === "primary" && <ArrowRight aria-hidden="true" />}
    </a>
  );
}

const FIELD_LABELS: Record<FormField, string> = { name: "Name", email: "Email", phone: "Phone", company: "Company", message: "Message" };

/** The fields of a page form. Shared by the static editor form and the live one. */
export function FormFields({ section, disabled }: { section: SectionOf<"form">; disabled?: boolean }) {
  return (
    <>
      {section.fields.map((f) => (
        <label key={f} className={f === "message" ? `${s.field} ${s.fieldWide}` : s.field}>
          <span>{FIELD_LABELS[f]}</span>
          {f === "message" ? (
            <textarea name={f} rows={4} maxLength={2000} disabled={disabled} />
          ) : (
            <input
              name={f}
              type={f === "email" ? "email" : f === "phone" ? "tel" : "text"}
              autoComplete={f === "email" ? "email" : f === "phone" ? "tel" : f === "name" ? "name" : "organization"}
              required={f === "email"}
              maxLength={f === "email" ? 254 : 120}
              disabled={disabled}
            />
          )}
        </label>
      ))}
    </>
  );
}

export const formClasses = { form: s.form, submit: s.primary, done: s.formDone, error: s.formError, trap: s.trap };

function StaticForm({ section }: { section: SectionOf<"form"> }) {
  return (
    <form className={s.form} data-static="true">
      <FormFields section={section} />
      <button type="submit" className={s.primary}>
        <T>{section.submit}</T>
      </button>
    </form>
  );
}

function Hero({ section }: { section: SectionOf<"hero"> }) {
  return (
    <div className={s.hero} data-align={section.align} data-art={section.art}>
      {section.art !== "none" && (
        <div className={s.heroArt} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      <div className={s.heroCopy}>
        {section.eyebrow && (
          <p className={s.eyebrow}>
            <T>{section.eyebrow}</T>
          </p>
        )}
        <h1 className={s.headline}>
          <T>{section.headline}</T>
        </h1>
        {section.body && (
          <p className={s.lede}>
            <T>{section.body}</T>
          </p>
        )}
        {(section.primary || section.secondary) && (
          <div className={s.ctas}>
            {section.primary && <Button cta={section.primary} />}
            {section.secondary && <Button cta={section.secondary} kind="secondary" />}
          </div>
        )}
      </div>
      {section.align === "left" && section.art !== "none" && (
        <div className={s.heroCards} aria-hidden="true">
          <span />
          <span />
          <i />
        </div>
      )}
    </div>
  );
}

function Heading({ title, intro }: { title?: string; intro?: string }) {
  if (!title && !intro) return null;
  return (
    <div className={s.heading}>
      {title && (
        <h2>
          <T>{title}</T>
        </h2>
      )}
      {intro && (
        <p>
          <T>{intro}</T>
        </p>
      )}
    </div>
  );
}

function SectionBody({ section, renderForm }: { section: Section; renderForm?: FormRenderer }) {
  switch (section.type) {
    case "hero":
      return <Hero section={section} />;
    case "features":
      return (
        <div className={s.wrap}>
          <Heading title={section.heading} intro={section.intro} />
          <div className={s.cards} data-count={section.items.length}>
            {section.items.map((item, i) => (
              <article key={i} className={s.card}>
                <span className={s.cardMark} aria-hidden="true" />
                <h3>
                  <T>{item.title}</T>
                </h3>
                <p>
                  <T>{item.body}</T>
                </p>
              </article>
            ))}
          </div>
        </div>
      );
    case "steps":
      return (
        <div className={s.wrap}>
          <Heading title={section.heading} />
          <ol className={s.steps}>
            {section.items.map((item, i) => (
              <li key={i}>
                <span className={s.stepNum} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>
                  <T>{item.title}</T>
                </h3>
                <p>
                  <T>{item.body}</T>
                </p>
              </li>
            ))}
          </ol>
        </div>
      );
    case "stats":
      return (
        <div className={s.wrap}>
          <Heading title={section.heading} />
          <dl className={s.stats}>
            {section.items.map((item, i) => (
              <div key={i}>
                <dt>
                  <T>{item.label}</T>
                </dt>
                <dd>
                  <T>{item.value}</T>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case "quote":
      return (
        <figure className={s.quote}>
          <blockquote>
            <T>{section.quote}</T>
          </blockquote>
          <figcaption>
            <strong>
              <T>{section.name}</T>
            </strong>
            {section.role && (
              <span>
                <T>{section.role}</T>
              </span>
            )}
          </figcaption>
        </figure>
      );
    case "offer":
      return (
        <div className={s.wrap}>
          <div className={s.offer}>
            <div>
              <h2>
                <T>{section.heading}</T>
              </h2>
              {section.price && (
                <p className={s.price}>
                  <T>{section.price}</T>
                </p>
              )}
              {section.note && (
                <p className={s.note}>
                  <T>{section.note}</T>
                </p>
              )}
            </div>
            <div className={s.offerSide}>
              {section.bullets.length > 0 && (
                <ul className={s.bullets}>
                  {section.bullets.map((b, i) => (
                    <li key={i}>
                      <Check aria-hidden="true" />
                      <T>{b}</T>
                    </li>
                  ))}
                </ul>
              )}
              {section.cta && <Button cta={section.cta} />}
            </div>
          </div>
        </div>
      );
    case "faq":
      return (
        <div className={`${s.wrap} ${s.narrow}`}>
          <Heading title={section.heading} />
          <div className={s.faq}>
            {section.items.map((item, i) => (
              <details key={i}>
                <summary>
                  <T>{item.q}</T>
                  <ChevronDown aria-hidden="true" />
                </summary>
                <p>
                  <T>{item.a}</T>
                </p>
              </details>
            ))}
          </div>
        </div>
      );
    case "form":
      return (
        <div className={s.wrap}>
          <div className={s.formSection}>
            <div className={s.heading}>
              <h2>
                <T>{section.heading}</T>
              </h2>
              {section.body && (
                <p>
                  <T>{section.body}</T>
                </p>
              )}
            </div>
            <div className={s.formCard}>{renderForm ? renderForm(section) : <StaticForm section={section} />}</div>
          </div>
        </div>
      );
    case "cta":
      return (
        <div className={s.wrap}>
          <div className={s.band}>
            <h2>
              <T>{section.headline}</T>
            </h2>
            {section.body && (
              <p>
                <T>{section.body}</T>
              </p>
            )}
            <Button cta={section.cta} />
          </div>
        </div>
      );
    case "text":
      return (
        <div className={`${s.wrap} ${s.narrow} ${s.prose}`}>
          {section.heading && (
            <h2>
              <T>{section.heading}</T>
            </h2>
          )}
          {section.body
            .split(/\n\s*\n/)
            .filter(Boolean)
            .map((p, i) => (
              <p key={i}>
                <T>{p}</T>
              </p>
            ))}
        </div>
      );
  }
}

export function LandingPage({ doc, brand, selectedId, builder, renderForm }: Props) {
  const { theme } = doc;
  const vars = { "--lp-accent": theme.accent, "--lp-accent-ink": accentInk(theme.accent) } as CSSProperties;
  const heroCta = doc.sections.find((x): x is SectionOf<"hero"> => x.type === "hero")?.primary;

  return (
    <div className={s.page} data-mode={theme.mode} data-font={theme.font} data-corners={theme.corners} data-builder={builder || undefined} style={vars}>
      <header className={s.bar}>
        <span className={s.brand}>
          <span className={s.brandMark} aria-hidden="true" />
          {brand}
        </span>
        {heroCta && (
          <a href={heroCta.href} className={s.barCta}>
            <T>{heroCta.label}</T>
          </a>
        )}
      </header>

      <main>
        {doc.sections.length === 0 && builder && (
          <div className={s.blank}>
            <p>This page is empty.</p>
            <p>Tell the agent what to build, or add a section.</p>
          </div>
        )}
        {doc.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className={s.section}
            data-type={section.type}
            data-section={builder ? section.id : undefined}
            data-selected={builder && selectedId === section.id ? "true" : undefined}
          >
            <SectionBody section={section} renderForm={renderForm} />
          </section>
        ))}
      </main>

      <footer className={s.footer}>
        <span>© {brand}</span>
      </footer>
    </div>
  );
}
