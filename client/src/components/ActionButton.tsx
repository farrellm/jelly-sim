import type { ReactNode } from "react";

interface ActionButtonProps {
  emoji: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}

/** A thumb-sized care action (≥44px tap target per DESIGN.md §2). */
export function ActionButton({ emoji, label, hint, disabled, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap flex flex-1 flex-col items-center gap-1 rounded-2xl bg-grape-800 px-3 py-3 text-center ring-1 ring-white/10 transition active:scale-95 active:bg-grape-700 disabled:opacity-40"
    >
      <span aria-hidden className="text-2xl">
        {emoji}
      </span>
      <span className="text-sm font-medium leading-tight">{label}</span>
      {hint ? <span className="text-xs text-white/50">{hint}</span> : null}
    </button>
  );
}
