import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Without this, one thrown render anywhere in the tree unmounts everything and
 * leaves a blank white page — no message, nothing in the chat to report, and no
 * way to tell a crash apart from a slow network. Inside a Telegram webview
 * there is no dev console to fall back on either, so the error is put on screen
 * where the person looking at it can read it out.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Munch crashed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="space-y-2">
          <div className="font-display text-3xl font-semibold">Munch 🎉</div>
          <p className="text-muted-foreground">
            Something broke on this screen. Closing and reopening Munch usually sorts it.
          </p>
        </div>
        <pre className="max-h-40 w-full overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-12 w-full rounded-lg bg-primary px-5 text-base font-bold text-primary-foreground">
          Try again
        </button>
      </div>
    );
  }
}
