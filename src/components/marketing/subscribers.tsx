"use client";

// The interactive parts of Subscribers: adding people, importing a file, the
// person panel, lists, and the "I am a..." choices for signup forms.
import { FileUp, Plus, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  addSubscriberAction,
  createListAction,
  deleteListAction,
  deleteSubscriberAction,
  importSubscribersAction,
  renameListAction,
  saveSignupAction,
  undoTeamUnsubscribeAction,
  unsubscribeSubscriberAction,
  updateSubscriberAction,
} from "@/app/(portal)/marketing/actions";
import { kindValueFor, type SignupSettings } from "@/lib/marketing/settings";
import type { ListRow, SubscriberDetail } from "@/lib/marketing/subscribers";
import { useDemoMarketing } from "./demo-setup";
import { writeDemo } from "./demo-store";
import s from "./marketing.module.css";

type Result = { ok: boolean; message: string };

function Message({ result, testId = "action-message" }: { result: Result | null; testId?: string }) {
  if (!result) return null;
  return (
    <p className={`notice ${result.ok ? "notice-ok" : "notice-error"}`} role={result.ok ? "status" : "alert"} data-testid={testId}>
      {result.message}
    </p>
  );
}

// ---- Add and import ---------------------------------------------------------------------

export function AddButtons({ lists, types, canEdit }: { lists: ListRow[]; types: SignupSettings["types"]; canEdit: boolean }) {
  const add = useRef<HTMLDialogElement>(null);
  const imp = useRef<HTMLDialogElement>(null);
  if (!canEdit) return null;
  return (
    <>
      <button type="button" className="btn" onClick={() => imp.current?.showModal()} data-testid="open-import">
        <FileUp aria-hidden="true" />
        Import
      </button>
      <button type="button" className="btn btn-primary" onClick={() => add.current?.showModal()} data-testid="open-add">
        <UserPlus aria-hidden="true" />
        Add
      </button>
      <dialog ref={add} className={s.dialog} aria-label="Add a subscriber" onClick={(e) => e.target === add.current && add.current?.close()}>
        <AddForm lists={lists} types={types} onDone={() => add.current?.close()} />
      </dialog>
      <dialog ref={imp} className={s.dialog} aria-label="Import subscribers" onClick={(e) => e.target === imp.current && imp.current?.close()}>
        <ImportForm lists={lists} onDone={() => imp.current?.close()} />
      </dialog>
    </>
  );
}

function AddForm({ lists, types, onDone }: { lists: ListRow[]; types: SignupSettings["types"]; onDone: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={s.dialogBody}
      data-testid="add-subscriber"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        start(async () => {
          const r = await addSubscriberAction({ email: data.get("email"), name: data.get("name"), kind: data.get("kind"), listIds: data.getAll("listIds") });
          setResult(r);
          if (r.ok) form.reset();
        });
      }}
    >
      <div className={s.dialogHead}>
        <h2>Add a subscriber</h2>
        <button type="button" className={s.iconButton} aria-label="Close" onClick={onDone}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div className={s.field}>
        <label htmlFor="add-email" className={s.fieldLabel}>
          Email
        </label>
        <input id="add-email" name="email" type="email" className="input" required autoComplete="off" />
      </div>
      <div className={s.field}>
        <label htmlFor="add-name" className={s.fieldLabel}>
          Name <em>Optional</em>
        </label>
        <input id="add-name" name="name" className="input" maxLength={120} autoComplete="off" />
      </div>
      {types.length > 0 && (
        <div className={s.field}>
          <label htmlFor="add-kind" className={s.fieldLabel}>
            Type <em>Optional</em>
          </label>
          <select id="add-kind" name="kind" className="select" defaultValue="">
            <option value="">Not set</option>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {lists.length > 0 && (
        <fieldset className={s.field} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={s.fieldLabel}>Lists</legend>
          {lists.map((l) => (
            <label key={l.id} className={s.checkRow}>
              <input type="checkbox" name="listIds" value={l.id} />
              {l.name}
            </label>
          ))}
        </fieldset>
      )}
      <p className={s.hint}>Only add people who asked to hear from you. If your welcome series is on, they get its first email right away.</p>
      <Message result={result} />
      <div className={s.dialogActions}>
        <button type="button" className="btn" onClick={onDone}>
          Done
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending} data-testid="add-submit">
          {pending ? "Adding" : "Add subscriber"}
        </button>
      </div>
    </form>
  );
}

function ImportForm({ lists, onDone }: { lists: ListRow[]; onDone: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [listChoice, setListChoice] = useState("");
  return (
    <form
      className={s.dialogBody}
      data-testid="import-subscribers"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => setResult(await importSubscribersAction(data)));
      }}
    >
      <div className={s.dialogHead}>
        <h2>Import subscribers</h2>
        <button type="button" className={s.iconButton} aria-label="Close" onClick={onDone}>
          <X aria-hidden="true" />
        </button>
      </div>
      <ol className={s.miniList} style={{ listStyle: "decimal", paddingLeft: 18, display: "block" }}>
        <li style={{ display: "list-item", marginBottom: 6 }}>Export your list as a CSV from your old tool (Mailchimp: Audience, then Export; Constant Contact: Contacts, then Export) or save a spreadsheet as CSV.</li>
        <li style={{ display: "list-item", marginBottom: 6 }}>Make sure it has an Email column. Name, First name, Last name and Type columns are picked up too.</li>
        <li style={{ display: "list-item" }}>Pick the file below. Up to 5,000 people at a time.</li>
      </ol>
      <div className={s.field}>
        <label htmlFor="import-file" className={s.fieldLabel}>
          CSV file
        </label>
        <input id="import-file" name="file" type="file" accept=".csv,text/csv,text/plain" required data-testid="import-file" />
      </div>
      <div className={s.field}>
        <label htmlFor="import-list" className={s.fieldLabel}>
          Add them to a list <em>Optional</em>
        </label>
        <select id="import-list" name="listId" className="select" value={listChoice} onChange={(e) => setListChoice(e.target.value)}>
          <option value="">No list</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value="new">A new list</option>
        </select>
        {listChoice === "new" && <input name="newList" className="input" placeholder="Name the new list" maxLength={60} aria-label="New list name" />}
      </div>
      <label className={s.checkRow}>
        <input type="checkbox" name="startSeries" />
        <span>Start the &quot;joined the list&quot; series for people new to your list</span>
      </label>
      <label className={s.checkRow}>
        <input type="checkbox" name="consent" required data-testid="import-consent" />
        <span>Everyone in this file agreed to get email from us. (Bought or scraped lists hurt your sending reputation and break the rules of most email laws.)</span>
      </label>
      <p className={s.hint}>People already on your list only get missing details filled in. People who unsubscribed before are skipped and stay unsubscribed.</p>
      <Message result={result} testId="import-message" />
      <div className={s.dialogActions}>
        <button type="button" className="btn" onClick={onDone}>
          Done
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending} data-testid="import-submit">
          {pending ? "Importing" : "Import"}
        </button>
      </div>
    </form>
  );
}

// ---- One person -------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = { subscribed: "Subscribed", unsubscribed: "Unsubscribed", bounced: "Bounced", complained: "Marked as spam" };
const REASON_LABEL: Record<string, string> = { link: "with the link in an email", "one-click": "with their mail app's unsubscribe button", team: "by your team", complaint: "by marking an email as spam", bounce: "because their address bounced", suppressed: "because the email provider blocked it" };

export function SubscriberPanel({ person, lists, types, canEdit, canDelete, closeHref }: { person: SubscriberDetail; lists: ListRow[]; types: SignupSettings["types"]; canEdit: boolean; canDelete: boolean; closeHref: string }) {
  const router = useRouter();
  const [name, setName] = useState(person.name);
  const [kind, setKind] = useState(person.kind);
  const [listIds, setListIds] = useState<string[]>(person.listIds);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const run = (fn: () => Promise<Result>) => start(async () => setResult(await fn()));

  return (
    <aside className={s.panel} aria-label={`Subscriber ${person.email}`} data-testid="subscriber-panel">
      <header className={s.panelHead}>
        <div>
          <strong>{person.name || person.email}</strong>
          <span>{person.email}</span>
        </div>
        <Link href={closeHref} className={s.iconButton} aria-label="Close" scroll={false}>
          <X aria-hidden="true" />
        </Link>
      </header>
      <div className={s.panelBody}>
        <dl className={s.facts}>
          <dt>Status</dt>
          <dd>
            <span className={person.status === "subscribed" ? "pill pill-good" : "pill"} data-testid="subscriber-status">
              {STATUS_LABEL[person.status]}
            </span>
            {person.unsubscribeReason && person.unsubscribedAt && (
              <span className={s.hint} style={{ display: "block", marginTop: 4 }}>
                On {fmt(person.unsubscribedAt)}, {REASON_LABEL[person.unsubscribeReason]}.
              </span>
            )}
          </dd>
          <dt>Joined</dt>
          <dd>
            {fmt(person.subscribedAt)}
            {person.sourceDetail ? `, ${person.sourceDetail}` : ""}
          </dd>
          {person.offer && (
            <>
              <dt>Welcome code</dt>
              <dd>
                <span className="mono">{person.offer.code}</span> {person.offer.redeemedAt ? `(used ${fmt(person.offer.redeemedAt)})` : "(not used yet)"}
              </dd>
            </>
          )}
        </dl>

        {canEdit && (
          <form
            className={s.panelSection}
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateSubscriberAction(person.id, { name, kind, listIds }));
            }}
          >
            <h3>Details</h3>
            <div className={s.field}>
              <label htmlFor="p-name" className={s.fieldLabel}>
                Name
              </label>
              <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            {types.length > 0 && (
              <div className={s.field}>
                <label htmlFor="p-kind" className={s.fieldLabel}>
                  Type
                </label>
                <select id="p-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">Not set</option>
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                  {kind && !types.some((t) => t.value === kind) && <option value={kind}>{kind}</option>}
                </select>
              </div>
            )}
            {lists.length > 0 && (
              <div className={s.field}>
                <span className={s.fieldLabel}>Lists</span>
                {lists.map((l) => (
                  <label key={l.id} className={s.checkRow}>
                    <input type="checkbox" checked={listIds.includes(l.id)} onChange={(e) => setListIds((ids) => (e.target.checked ? [...ids, l.id] : ids.filter((x) => x !== l.id)))} />
                    {l.name}
                  </label>
                ))}
              </div>
            )}
            <div>
              <button type="submit" className="btn" disabled={pending}>
                Save
              </button>
            </div>
          </form>
        )}

        {(person.runs.length > 0 || person.sends.length > 0) && (
          <section className={s.panelSection}>
            <h3>Email</h3>
            <ul className={s.miniList}>
              {person.runs.map((r, i) => (
                <li key={`r${i}`}>
                  <span>{r.sequence}</span>
                  <span>{r.status === "active" ? "In progress" : r.status === "done" ? "Finished" : "Stopped"}</span>
                </li>
              ))}
              {person.sends.map((x, i) => (
                <li key={`s${i}`}>
                  <span>{x.subject || "(no subject)"}</span>
                  <span>{fmt(x.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Message result={result} />

        {canEdit && (
          <section className={s.panelSection}>
            <h3>Subscription</h3>
            {person.status === "subscribed" ? (
              <div>
                <button type="button" className="btn" disabled={pending} onClick={() => run(() => unsubscribeSubscriberAction(person.id))} data-testid="team-unsubscribe">
                  Unsubscribe them
                </button>
                <p className={s.hint} style={{ marginTop: 6 }}>
                  Stops their series and cancels anything queued for them.
                </p>
              </div>
            ) : person.unsubscribeReason === "team" ? (
              <button type="button" className="btn" disabled={pending} onClick={() => run(() => undoTeamUnsubscribeAction(person.id))}>
                Undo your team&apos;s unsubscribe
              </button>
            ) : (
              <p className={s.hint}>Only they can sign up again, through one of your signup forms.</p>
            )}
            {canDelete && (
              <button
                type="button"
                className={`${s.linkButton} ${s.danger}`}
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Delete ${person.email}? Their history goes too.`)) return;
                  start(async () => {
                    const r = await deleteSubscriberAction(person.id);
                    setResult(r);
                    if (r.ok) router.push(closeHref, { scroll: false });
                  });
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete this subscriber
              </button>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}

// ---- Lists ----------------------------------------------------------------------------------

export function ListsEditor({ lists, canEdit, sample }: { lists: ListRow[]; canEdit: boolean; sample: boolean }) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  return (
    <div className={s.panelSection} data-testid="lists">
      {lists.length === 0 ? (
        <p className={s.hint}>No lists yet. Everyone subscribed gets every newsletter until you make some.</p>
      ) : (
        <ul className={s.miniList}>
          {lists.map((l) =>
            editing === l.id ? (
              <li key={l.id}>
                <form
                  className={s.inline}
                  style={{ width: "100%" }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      const r = await renameListAction(l.id, draft);
                      setResult(r);
                      if (r.ok) setEditing(null);
                    });
                  }}
                >
                  <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} aria-label="List name" style={{ flex: 1 }} />
                  <button type="submit" className="btn" disabled={pending}>
                    Save
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              </li>
            ) : (
              <li key={l.id} data-testid="list-row">
                <Link href={`/marketing/subscribers?list=${l.id}`} className="link">
                  {l.name}
                </Link>
                <span>
                  <span className="num">{l.count.toLocaleString("en-US")}</span> subscribed
                  {canEdit && !sample && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className={s.linkButton}
                        onClick={() => {
                          setEditing(l.id);
                          setDraft(l.name);
                        }}
                      >
                        Rename
                      </button>
                      {" · "}
                      <button
                        type="button"
                        className={`${s.linkButton} ${s.danger}`}
                        onClick={() => {
                          if (window.confirm(`Delete the list ${l.name}? The people on it stay subscribed.`)) start(async () => setResult(await deleteListAction(l.id)));
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      {canEdit && !sample && (
        <form
          className={s.inline}
          id="lists"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createListAction(name);
              setResult(r);
              if (r.ok) setName("");
            });
          }}
        >
          <div className={s.field}>
            <label htmlFor="new-list" className={s.fieldLabel}>
              New list
            </label>
            <input id="new-list" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Homeowners, Wholesale, Event guests" />
          </div>
          <button type="submit" className="btn" disabled={pending || !name.trim()} data-testid="create-list">
            <Plus aria-hidden="true" />
            Make list
          </button>
        </form>
      )}
      <Message result={result} />
    </div>
  );
}

// ---- Signup choices -------------------------------------------------------------------------

export function SignupEditor({ initial, canEdit, storage, tenantId }: { initial: SignupSettings; canEdit: boolean; storage: "server" | "browser"; tenantId: string }) {
  const demo = useDemoMarketing(tenantId);
  const start0 = storage === "browser" ? (demo.signup ?? initial) : initial;
  return <SignupForm key={storage === "browser" ? (demo.signup ? "saved" : "default") : "server"} initial={start0} canEdit={canEdit} storage={storage} tenantId={tenantId} />;
}

function SignupForm({ initial, canEdit, storage, tenantId }: { initial: SignupSettings; canEdit: boolean; storage: "server" | "browser"; tenantId: string }) {
  const [question, setQuestion] = useState(initial.question);
  const [types, setTypes] = useState(initial.types);
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const save = (next: SignupSettings) =>
    start(async () => {
      if (storage === "browser") {
        writeDemo(tenantId, (d) => ({ ...d, signup: next }));
        setResult({ ok: true, message: "Saved in this browser." });
        return;
      }
      setResult(await saveSignupAction(next));
    });
  return (
    <form
      className={s.panelSection}
      id="signup"
      data-testid="signup-settings"
      onSubmit={(e) => {
        e.preventDefault();
        save({ question, types });
      }}
    >
      <div className={s.field}>
        <label htmlFor="signup-question" className={s.fieldLabel}>
          The question
        </label>
        <input id="signup-question" className="input" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={40} disabled={!canEdit} />
      </div>
      <div className={s.field}>
        <span className={s.fieldLabel}>Choices</span>
        <ul className={s.miniList}>
          {types.map((t, i) => (
            <li key={t.value}>
              <input
                className="input"
                value={t.label}
                aria-label={`Choice ${i + 1}`}
                maxLength={40}
                disabled={!canEdit}
                onChange={(e) => setTypes((all) => all.map((x) => (x.value === t.value ? { ...x, label: e.target.value } : x)))}
                style={{ flex: 1 }}
              />
              {canEdit && (
                <button type="button" className={`${s.iconButton} ${s.danger}`} aria-label={`Remove ${t.label}`} onClick={() => setTypes((all) => all.filter((x) => x.value !== t.value))}>
                  <Trash2 aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <span className={s.hint}>Renaming a choice keeps everyone who picked it. Forms send a fixed value, so reports don&apos;t break when wording changes.</span>
      </div>
      {canEdit && types.length < 8 && (
        <div className={s.inline}>
          <div className={s.field}>
            <label htmlFor="signup-new" className={s.fieldLabel}>
              Add a choice
            </label>
            <input id="signup-new" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Contractor" />
          </div>
          <button
            type="button"
            className="btn"
            disabled={!label.trim()}
            onClick={() => {
              setTypes((all) => [...all, { value: kindValueFor(label, all.map((x) => x.value)), label: label.trim() }]);
              setLabel("");
            }}
          >
            <Plus aria-hidden="true" />
            Add
          </button>
        </div>
      )}
      {canEdit && (
        <div>
          <button type="submit" className="btn btn-primary" disabled={pending} data-testid="save-signup">
            {pending ? "Saving" : "Save choices"}
          </button>
        </div>
      )}
      <Message result={result} testId="signup-message" />
    </form>
  );
}
