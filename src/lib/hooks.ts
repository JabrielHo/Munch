import { useCallback, useEffect, useState } from "react";

/**
 * Tracks the OS "reduce motion" preference. This is a textbook *correct* use of
 * useEffect: subscribing to an external system (a media query) with cleanup.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Copy text to the clipboard and flip a transient "copied" flag back off after
 * a delay. The timer is the external system here; it's cleaned up on unmount or
 * re-copy. No state is mirrored into an effect.
 */
export function useClipboard(resetMs = 1600) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older mobile browsers without the async clipboard API.
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), resetMs);
    return () => clearTimeout(id);
  }, [copied, resetMs]);

  return { copied, copy };
}
