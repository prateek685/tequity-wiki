import { DomainError } from "../common/domain-error.js";
import { type Learner, loadLearner } from "../learning/learner.js";
import { type Tx } from "../prisma/prisma.service.js";

export interface ManagedEngineer {
  id: string;
  name: string;
  teamName: string;
  learner: Learner;
}

/** An engineer on one of the manager's teams with an active enrollment, else NOT_FOUND. */
export async function requireManagedEngineer(
  tx: Tx,
  managerId: string,
  engineerId: string,
): Promise<ManagedEngineer> {
  // Row-level security hides users the caller doesn't manage; the team filter keeps it to their teams.
  const member = await tx.teamMember.findFirst({
    where: { userId: engineerId, team: { managers: { some: { userId: managerId } } } },
    select: { team: { select: { name: true } }, user: { select: { id: true, name: true } } },
  });
  if (!member || engineerId === managerId) throw new DomainError("NOT_FOUND");
  const learner = await loadLearner(tx, engineerId);
  if (!learner) throw new DomainError("NOT_FOUND");
  return { id: member.user.id, name: member.user.name, teamName: member.team.name, learner };
}

/** The engineers on the manager's teams, by name. */
export function managedMembers(tx: Tx, managerId: string) {
  return tx.teamMember.findMany({
    where: { team: { managers: { some: { userId: managerId } } } },
    orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
    select: { team: { select: { name: true } }, user: { select: { id: true, name: true } } },
  });
}
