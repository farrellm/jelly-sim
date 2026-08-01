interface StatusBannerProps {
  offline: boolean;
  notice: string | null;
  onDismiss: () => void;
}

/** Offline state and transient notices, kept out of the way of the bean (DESIGN.md §10). */
export function StatusBanner({ offline, notice, onDismiss }: StatusBannerProps) {
  if (!offline && !notice) return null;

  return (
    <div className="space-y-2">
      {offline ? (
        <p
          role="status"
          className="rounded-xl bg-lemon-candy/15 px-3 py-2 text-sm text-lemon-candy ring-1 ring-lemon-candy/30"
        >
          Offline — playing from your device. Progress syncs when you reconnect.
        </p>
      ) : null}

      {notice ? (
        <button
          type="button"
          onClick={onDismiss}
          className="tap w-full rounded-xl bg-white/10 px-3 py-2 text-left text-sm text-white/80"
        >
          {notice}
          <span className="ml-2 text-white/40">(tap to dismiss)</span>
        </button>
      ) : null}
    </div>
  );
}
