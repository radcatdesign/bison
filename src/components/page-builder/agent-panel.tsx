"use client";

// Talk to the agent. Each request shows the changes as they land on the page,
// then the agent's short reply.
import { ArrowUp, Check, Eye, Sparkles, Square } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useEditionKey } from "@/components/edition";
import s from "./builder.module.css";
import type { ThreadItem } from "./store";

const STARTERS = [
  "A spring sale page: 15% off, a quote form and a few common questions",
  "A page to book a free consultation, clean and light",
  "A launch waitlist page, dark and minimal",
];
const NEXT = ["Make it dark", "Add an FAQ", "Shorten the copy", "Add a customer quote", "Center the hero"];
// The same ideas for a gym or studio.
const CLUB_STARTERS = [
  "A free week pass page: what's included, a short form and a few common questions",
  "A page to book a personal training consult, clean and light",
  "A presale page for our new location, dark and bold",
];
const CLUB_NEXT = ["Make it dark", "Add an FAQ", "Shorten the copy", "Add a member quote", "Center the hero"];

type Props = {
  thread: ThreadItem[];
  running: boolean;
  onAsk: (text: string) => void;
  onStop: () => void;
  agentName: "claude" | "stand-in";
  empty: boolean;
  onShowPreview: () => void;
};

export function AgentPanel({ thread, running, onAsk, onStop, agentName, empty, onShowPreview }: Props) {
  const club = useEditionKey() === "fit";
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  const send = (value = text) => {
    if (!value.trim() || running) return;
    onAsk(value);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const suggestions = club ? (empty ? CLUB_STARTERS : CLUB_NEXT) : empty ? STARTERS : NEXT;

  return (
    <div className={s.agent} data-testid="agent-panel">
      <div className={s.thread} ref={listRef} aria-live="polite">
        {thread.length === 0 && (
          <div className={s.intro}>
            <span className={s.agentMark} aria-hidden="true">
              <Sparkles />
            </span>
            <h2>{empty ? "Describe the page you want" : "What should change?"}</h2>
            <p>
              {empty
                ? "Say who it's for, what you're offering and what people should do. The agent builds it section by section while you watch."
                : "Ask for changes in plain words. You can also edit any section by hand in Sections."}
            </p>
          </div>
        )}

        {thread.map((item) =>
          item.role === "user" ? (
            <p key={item.id} className={s.userMsg}>
              {item.text}
            </p>
          ) : (
            <div key={item.id} className={s.agentMsg} data-state={item.state} data-testid="agent-reply">
              <span className={s.agentMark} aria-hidden="true">
                <Sparkles />
              </span>
              <div className={s.agentBody}>
                {item.steps && item.steps.length > 0 && (
                  <ul className={s.steps}>
                    {item.steps.map((step, i) => (
                      <li key={i}>
                        <Check aria-hidden="true" />
                        {step}
                      </li>
                    ))}
                  </ul>
                )}
                {item.state === "working" && <p className={s.working}>{item.steps?.length ? "Working" : "Reading the page"}</p>}
                {item.text && <p className={s.replyText}>{item.text}</p>}
                {item.state === "done" && (item.steps?.length ?? 0) > 0 && (
                  <button type="button" className={s.showPreview} onClick={onShowPreview}>
                    <Eye aria-hidden="true" />
                    See it
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      <div className={s.composer}>
        {!running && (
          <div className={s.chips}>
            {suggestions.map((sug) => (
              <button key={sug} type="button" className={s.chip} onClick={() => (empty ? setText(sug) : send(sug))}>
                {sug}
              </button>
            ))}
          </div>
        )}
        <div className={s.inputRow}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={empty ? 4 : 2}
            maxLength={2000}
            placeholder={empty ? (club ? "A page for our free week pass, with what's included and a short form" : "A page for our spring sale on glow aggregate, 15% off through May, with a quote form") : "Tell the agent what to change"}
            aria-label="Tell the agent what to build or change"
            data-testid="agent-input"
          />
          {running ? (
            <button type="button" className={s.sendButton} onClick={onStop} aria-label="Stop the agent" data-testid="agent-stop">
              <Square aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className={s.sendButton} onClick={() => send()} disabled={!text.trim()} aria-label="Send to the agent" data-testid="agent-send">
              <ArrowUp aria-hidden="true" />
            </button>
          )}
        </div>
        {agentName === "stand-in" && (
          <p className={s.standIn} data-testid="stand-in-note">
            Claude isn&apos;t connected here, so a simpler offline helper answers. It builds a page from a brief and follows short, direct changes.
          </p>
        )}
      </div>
    </div>
  );
}
