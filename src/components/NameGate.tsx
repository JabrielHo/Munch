import { useEffect, useRef, useState } from "react";
import type { PublicRoom } from "../lib/types";
import { MAX_NAME } from "../lib/identity";

/**
 * Shown to anyone who opens an open room without a name yet (i.e. guests). They
 * pick a name BEFORE they can add or vote — no more typing an option only to be
 * interrupted by a name prompt on submit. Asked once, then remembered.
 */
export function NameGate({ room, onSubmit }: { room: PublicRoom; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (name) onSubmit(name);
  }

  return (
    <div className="screen home">
      <div className="home-top">
        <div className="wordmark">Munch&nbsp;🍜</div>
        <div className="tagline">Joining “{room.title}”</div>
      </div>
      <div className="card signin">
        <h2>What's your name? 👋</h2>
        <p className="muted" style={{ marginTop: -4, fontSize: 14 }}>
          So the squad knows who picked what.
        </p>
        <form className="stack" onSubmit={submit}>
          <input
            ref={inputRef}
            className="input"
            aria-label="Your name"
            placeholder="your name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={MAX_NAME}
          />
          <button className="btn btn--block btn--lg" type="submit" disabled={!value.trim()}>
            Join the room
          </button>
        </form>
      </div>
    </div>
  );
}
