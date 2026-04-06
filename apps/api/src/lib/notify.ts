import { Slurp } from "@slurp/types";
import { logger } from "../logger";

// TODO: send emails to all participants when slurp is finalized
export async function notifyAll(slurp: Slurp): Promise<void> {
  logger.info(
    { slurpId: slurp.id, participants: slurp.participants.map((p) => p.email) },
    "notifyAll stub — TODO: send finalization emails"
  );
}
