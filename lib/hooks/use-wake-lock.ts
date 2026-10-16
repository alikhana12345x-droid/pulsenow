import { useEffect, useRef } from "react";

// Keeps the screen awake while `active` is true (e.g. during autoplay).
// Silently no-ops on browsers that don't support the Screen Wake Lock API.
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    const acquire = async () => {
      try {
        lockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Low battery, page not focused, or API unavailable — silent fail
      }
    };

    if (!active) {
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      return;
    }

    acquire();

    // The OS releases the lock automatically when the page becomes hidden.
    // Re-acquire it when the user comes back to the tab.
    const onVisibility = () => { if (!document.hidden) acquire(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
