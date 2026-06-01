import type { Doc } from "../../convex/_generated/dataModel";

/**
 * The room shape the client actually receives. `getRoom` strips the host's
 * internal `hostUserId` before returning, so components type against this.
 */
export type PublicRoom = Omit<Doc<"rooms">, "hostUserId">;
