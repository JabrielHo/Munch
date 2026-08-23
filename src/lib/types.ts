import type { Doc } from "../../convex/_generated/dataModel";
import type { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

/** A room as the client receives it — getRoom strips the Telegram chat and user
 *  ids before returning, so components type against this rather than Doc. */
export type PublicRoom = Omit<
  Doc<"rooms">,
  "tgChatId" | "tgHostUserId" | "tgMessageId" | "tgRefreshPending" | "hostName" | "hangoutId"
>;

/** An option as the client receives it — getRoom replaces addedByClientId (the
 *  only gate on removeOption) with a `mine` flag resolved for the viewer. */
export type PublicOption = Omit<Doc<"options">, "addedByClientId"> & { mine: boolean };

/** Derived from the query rather than restated, so a change to what the server
 *  sends back is a type error here instead of a runtime surprise. */
export type HangoutPayload = NonNullable<FunctionReturnType<typeof api.hangouts.getHangout>>;
export type PublicHangout = HangoutPayload["hangout"];
export type RsvpLists = HangoutPayload["rsvps"];
export type RsvpAnswer = "in" | "maybe" | "out";

export type GroupFeed = NonNullable<FunctionReturnType<typeof api.hangouts.groupFeed>>;
export type FeedCard = GroupFeed["upcoming"][number];
