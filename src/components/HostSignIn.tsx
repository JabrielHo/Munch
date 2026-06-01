import { useState } from "react";
import { useConvex } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { CLIENT_ID, MAX_NAME, useDisplayName } from "../lib/identity";
import { humanError } from "../lib/ui";

/**
 * Email + password sign-in for the HOST (the only person who needs an account).
 * Convex Auth's Password provider drives this; on success the surrounding
 * <ConvexAuthProvider> flips to authenticated.
 */
export function HostSignIn() {
  const { signIn } = useAuthActions();
  const convex = useConvex();
  // Prefill the name from any device name they used as a guest, so creating an
  // account keeps their name. From here on it lives on the account.
  const [deviceName] = useDisplayName();
  const [flow, setFlow] = useState<"signUp" | "signIn">("signUp");
  const [name, setName] = useState(deviceName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanedName = name.trim();
    if (flow === "signUp" && !cleanedName) {
      setError("Add your name so the squad knows who's hosting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Don't let "Create account" quietly log an existing user in — send them
      // to sign in instead. (Rate-limited server-side against enumeration.)
      if (flow === "signUp") {
        let available: boolean;
        try {
          available = await convex.mutation(api.account.checkEmail, {
            email: cleanEmail,
            clientId: CLIENT_ID,
          });
        } catch (err) {
          setError(humanError(err)); // surfaces the rate-limit message
          return;
        }
        if (!available) {
          setFlow("signIn");
          setError("That email already has an account — sign in below.");
          return;
        }
      }
      // `name` is only consumed by the signUp profile; signIn ignores it.
      await signIn("password", { email: cleanEmail, password, flow, name: cleanedName });
    } catch (err) {
      const msg = humanError(err);
      setError(
        /too many/i.test(msg)
          ? msg
          : flow === "signUp"
            ? "Couldn't create that account. Use a valid email and a password of 8+ characters."
            : "Email or password didn't match. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card signin">
      <h2>{flow === "signUp" ? "Create a host account" : "Welcome back, host"}</h2>
      <p className="muted" style={{ marginTop: -4, fontSize: 14 }}>
        Only the host signs in. Your friends just open the link.
      </p>
      {error && <div className="signin-error">{error}</div>}
      <form className="stack" onSubmit={submit}>
        {flow === "signUp" && (
          <input
            className="input"
            type="text"
            id="name"
            name="name"
            autoComplete="name"
            placeholder="your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            required
          />
        )}
        <input
          className="input"
          type="email"
          id="email"
          name="email"
          autoComplete="username"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          id="password"
          name="password"
          autoComplete={flow === "signUp" ? "new-password" : "current-password"}
          placeholder="password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn btn--block" type="submit" disabled={busy}>
          {busy ? "One sec…" : flow === "signUp" ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        className="signin-toggle"
        onClick={() => {
          setError(null);
          setFlow((f) => (f === "signUp" ? "signIn" : "signUp"));
        }}>
        {flow === "signUp" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </div>
  );
}
