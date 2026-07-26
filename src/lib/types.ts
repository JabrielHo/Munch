import type { Doc } from "../../convex/_generated/dataModel";

/** A room as the client receives it — getRoom strips the Telegram chat and user
 *  ids before returning, so components type against this rather than Doc. */
export type PublicRoom = Omit<
  Doc<"rooms">,
  "tgChatId" | "tgHostUserId" | "tgMessageId" | "tgRefreshPending" | "hostName"
>;

/** An option as the client receives it — getRoom replaces addedByClientId (the
 *  only gate on removeOption) with a `mine` flag resolved for the viewer. */
export type PublicOption = Omit<Doc<"options">, "addedByClientId"> & { mine: boolean };
