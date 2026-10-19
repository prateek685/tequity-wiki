import { type Tx } from "../prisma/prisma.service.js";

export type AuditAction =
  | "user.role_changed"
  | "user.status_changed"
  | "team.created"
  | "team.member_set"
  | "team.manager_added"
  | "team.manager_removed"
  | "enrollment.created"
  | "enrollment.start_changed"
  | "prompt.copied"
  | "assessment.completed"
  | "unlock.granted"
  | "checkin.saved"
  | "gate.recorded"
  | "final_review.recorded"
  | "red_flag.acknowledged"
  | "setting.changed";

/** Append an audit entry inside the caller's `withUser` transaction (actor = current user). */
export async function audit(
  tx: Tx,
  action: AuditAction,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.$executeRaw`
    SELECT app.audit(${action}, ${entity}, ${entityId}, ${JSON.stringify(before ?? null)}::jsonb, ${JSON.stringify(after ?? null)}::jsonb)`;
}
