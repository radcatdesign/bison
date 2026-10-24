import { formatAgo } from "@/lib/format";
import { personAtDesk } from "@/lib/kiosk/repo";
import { SIGNATURE_BOX } from "@/lib/kiosk/settings";
import type { PortalContext } from "@/lib/portal";
import s from "./kiosk-settings.module.css";

/** A lead's visits and signed waiver, in their panel in Leads. Nothing shows until they've used the kiosk. */
export async function AtTheDesk({ ctx, contactId, titleClass }: { ctx: PortalContext; contactId: string; titleClass: string }) {
  const p = await personAtDesk(ctx, contactId);
  if (!p) return null;
  return (
    <section className={s.desk} data-testid="contact-desk">
      <h3 className={titleClass}>At the front desk</h3>
      <p>
        <span className="num">{p.visits30}</span> {p.visits30 === 1 ? "check-in" : "check-ins"} in the last 30 days
        {p.lastVisit ? `, last ${formatAgo(p.lastVisit)}` : ""}.
      </p>
      {p.waiver ? (
        <figure className={s.signed}>
          <svg viewBox={`0 0 ${SIGNATURE_BOX.width} ${SIGNATURE_BOX.height}`} role="img" aria-label="Their signature">
            <path d={p.waiver.signature} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <figcaption>
            Signed {p.waiver.title} (version {p.waiver.version}) {formatAgo(p.waiver.signedAt)}.
            {!p.waiver.current && " Your waiver has changed since; they're asked to sign the new one at their next check-in."}
          </figcaption>
        </figure>
      ) : (
        <p className="muted">No waiver signed yet.</p>
      )}
    </section>
  );
}
