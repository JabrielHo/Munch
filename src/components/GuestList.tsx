import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { avatarColor, initials } from "@/lib/ui";
import type { RsvpLists } from "@/lib/types";

const GROUPS = [
  { key: "in", label: "Coming", emoji: "✅", tone: "text-going" },
  { key: "maybe", label: "Maybe", emoji: "🤔", tone: "text-maybe" },
  { key: "out", label: "Can't make it", emoji: "❌", tone: "text-cant" },
] as const;

/** The guest list, in the order a person would read it: who's in first. */
export function GuestList({ rsvps }: { rsvps: RsvpLists }) {
  const total = rsvps.in.length + rsvps.maybe.length + rsvps.out.length;
  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Nobody's answered yet. Be the first 👀
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((group) => {
        const names = rsvps[group.key];
        if (names.length === 0) return null;
        return (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className={`text-xs font-bold uppercase tracking-wide ${group.tone}`}>
              {group.emoji} {group.label} · {names.length}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {names.map((name, index) => (
                <li
                  key={`${name}-${index}`}
                  className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm font-semibold">
                  <Avatar className="size-6">
                    <AvatarFallback style={{ background: avatarColor(name) }}>
                      {initials(name)}
                    </AvatarFallback>
                  </Avatar>
                  {name}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
