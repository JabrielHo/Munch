import type { Doc } from "../../convex/_generated/dataModel";

/**
 * The room shape the client actually receives. `getRoom` strips the Telegram
 * chat/user ids before returning, so components type against this.
 */
export type PublicRoom = Omit<
  Doc<"rooms">,
  "tgChatId" | "tgHostUserId" | "tgMessageId" | "tgRefreshPending" | "hostName"
>;

/**
 * The option shape the client receives. `getRoom` strips `addedByClientId`
 * (the only gate on removeOption) and resolves a `mine` flag for the viewer.
 */
export type PublicOption = Omit<Doc<"options">, "addedByClientId"> & { mine: boolean };
