import type { Doc } from "../../convex/_generated/dataModel";

/**
 * The room shape the client actually receives. `getRoom` strips the host's
 * internal `hostUserId` before returning, so components type against this.
 */
export type PublicRoom = Omit<Doc<"rooms">, "hostUserId">;

/**
 * The option shape the client receives. `getRoom` strips the internal ids
 * (`addedByClientId` — the only gate on removeOption — and `addedByUserId`),
 * resolves a `mine` flag for the current viewer, and rewrites `addedByName` to
 * the adder's live account name when they have one.
 */
export type PublicOption = Omit<Doc<"options">, "addedByClientId" | "addedByUserId"> & { mine: boolean };
