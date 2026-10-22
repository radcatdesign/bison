import type { Tx } from "@/lib/db";

export type AuditEntry = {
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
};

/** Records who changed what. The actor comes from the transaction's app.user_id. */
export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx
    .insertInto("audit_log")
    .values({
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      detail: JSON.stringify(entry.detail ?? {}),
    })
    .execute();
}
