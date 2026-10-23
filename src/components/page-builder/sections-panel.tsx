"use client";

// Every section on the page, in order. Open one to edit it, reorder with the
// arrows, or add a new one after the open section.
import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findPlaceholders, type PageDoc, SECTION_LABELS, SECTION_TYPES, type Section, type SectionType } from "@/lib/pages/schema";
import s from "./builder.module.css";
import { SectionForm } from "./section-form";

const TYPE_NOTES: Record<SectionType, string> = {
  hero: "The headline and main button",
  features: "Up to six reasons or benefits",
  steps: "How it works, numbered",
  stats: "A row of real numbers",
  quote: "One real customer quote",
  offer: "A deal or price, with what's included",
  faq: "Questions and answers",
  form: "Collects contacts into your inbox",
  cta: "A closing band with a button",
  text: "Paragraphs of plain text",
};

function summary(section: Section): string {
  switch (section.type) {
    case "hero":
    case "cta":
      return section.headline;
    case "quote":
      return section.quote;
    case "text":
      return section.heading ?? section.body;
    case "offer":
    case "form":
      return section.heading;
    default:
      return section.heading ?? section.items.map((i) => ("title" in i ? i.title : "q" in i ? i.q : i.label)).join(", ");
  }
}

type Props = {
  doc: PageDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (section: Section, key: string) => void;
  onAdd: (type: SectionType) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, to: number) => void;
};

export function SectionsPanel({ doc, selectedId, onSelect, onCommit, onAdd, onRemove, onMove }: Props) {
  const [adding, setAdding] = useState(false);
  const openRef = useRef<HTMLLIElement>(null);
  const lastKey = useRef<string>("");
  const flagged = new Set(findPlaceholders(doc).map((p) => p.sectionId));

  useEffect(() => {
    openRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <div className={s.sections} data-testid="sections-panel">
      {doc.sections.length === 0 && <p className={s.emptyNote}>No sections yet. Add one below, or ask the agent to build the page.</p>}
      <ol className={s.sectionList}>
        {doc.sections.map((section, i) => {
          const open = section.id === selectedId;
          return (
            <li key={section.id} className={s.sectionItem} data-open={open || undefined} ref={open ? openRef : undefined} data-testid="section-item">
              <button type="button" className={s.sectionHead} onClick={() => onSelect(open ? null : section.id)} aria-expanded={open}>
                <ChevronRight aria-hidden="true" className={s.chev} />
                <span className={s.sectionText}>
                  <span className={s.sectionType}>
                    {SECTION_LABELS[section.type]}
                    {flagged.has(section.id) && <span className={s.flag}>To fill in</span>}
                  </span>
                  <span className={s.sectionSummary}>{summary(section)}</span>
                </span>
              </button>
              {open && (
                <div className={s.sectionBody}>
                  <div className={s.sectionTools}>
                    <button type="button" className={s.iconButton} aria-label="Move up" disabled={i === 0} onClick={() => onMove(section.id, i - 1)}>
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button type="button" className={s.iconButton} aria-label="Move down" disabled={i === doc.sections.length - 1} onClick={() => onMove(section.id, i + 1)}>
                      <ArrowDown aria-hidden="true" />
                    </button>
                    <button type="button" className={`${s.iconButton} ${s.danger}`} aria-label="Remove section" onClick={() => onRemove(section.id)}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                  <SectionForm
                    section={section}
                    onCommit={(next) => onCommit(next, lastKey.current)}
                    onEditStart={(key) => {
                      lastKey.current = key;
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {adding ? (
        <div className={s.addMenu} data-testid="add-menu">
          <div className={s.addHead}>
            <strong>Add a section</strong>
            <button type="button" className={s.linkButton} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
          <div className={s.addGrid}>
            {SECTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={s.addType}
                onClick={() => {
                  onAdd(type);
                  setAdding(false);
                }}
              >
                <strong>{SECTION_LABELS[type]}</strong>
                <span>{TYPE_NOTES[type]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button type="button" className={s.addSection} onClick={() => setAdding(true)} data-testid="add-section">
          <Plus aria-hidden="true" />
          {selectedId ? "Add a section after this one" : "Add a section"}
        </button>
      )}
    </div>
  );
}
