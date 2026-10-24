import type { ActionState } from "@/app/(portal)/actions";
import { ActionForm } from "@/components/ui/action-form";
import { CAMPAIGN_COLORS } from "@/lib/campaigns/store";
import type { CampaignColor } from "@/lib/db/types";
import { folderStyle } from "./chip";
import s from "./campaigns.module.css";

const COLOR_NAMES: Record<CampaignColor, string> = { blue: "Blue", green: "Green", orange: "Orange", pink: "Pink", purple: "Purple", gray: "Gray" };

/** The name, dates, color and notes of a campaign, for making one or changing it. */
export function CampaignForm({ action, value, submitLabel, disabled, testId }: { action: (prev: ActionState, f: FormData) => Promise<ActionState>; value?: { id: string; name: string; notes: string; color: CampaignColor; startsOn: string | null; endsOn: string | null }; submitLabel: string; disabled: boolean; testId: string }) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} primary testId={testId}>
      <div className={s.form}>
        {value && <input type="hidden" name="id" value={value.id} />}
        <label className={s.field}>
          <span className="label">Name</span>
          <input className="input" name="name" required maxLength={80} defaultValue={value?.name ?? ""} placeholder="Spring launch" disabled={disabled} data-testid="campaign-name" />
        </label>
        <div className={s.formRow}>
          <label className={s.field}>
            <span className="label">Starts (optional)</span>
            <input className="input" type="date" name="startsOn" defaultValue={value?.startsOn ?? ""} disabled={disabled} />
          </label>
          <label className={s.field}>
            <span className="label">Ends (optional)</span>
            <input className="input" type="date" name="endsOn" defaultValue={value?.endsOn ?? ""} disabled={disabled} />
          </label>
        </div>
        <fieldset className={s.colors}>
          <legend className="label" style={{ marginBottom: 6 }}>
            Color
          </legend>
          {CAMPAIGN_COLORS.map((c) => (
            <label key={c} title={COLOR_NAMES[c]} style={folderStyle(c)}>
              <input type="radio" name="color" value={c} defaultChecked={(value?.color ?? "blue") === c} disabled={disabled} aria-label={COLOR_NAMES[c]} />
              <span className={s.swatch} />
            </label>
          ))}
        </fieldset>
        <label className={s.field}>
          <span className="label">Notes (optional)</span>
          <textarea className={`input ${s.textarea}`} name="notes" maxLength={1000} defaultValue={value?.notes ?? ""} placeholder="What it's for, who it's aimed at, what's still to do." disabled={disabled} />
        </label>
      </div>
    </ActionForm>
  );
}
