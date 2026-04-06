import { Slurp, Participant } from "@slurp/types";
import { ForbiddenError } from "../middleware/errorHandler";

export function requireParticipant(slurp: Slurp, uid: string): Participant {
  const p = slurp.participants.find((p) => p.uid === uid);
  if (!p) throw new ForbiddenError("Not a participant of this slurp");
  return p;
}

export function requireHost(slurp: Slurp, uid: string): void {
  if (slurp.hostUid !== uid) throw new ForbiddenError("Only the host can do this");
}
