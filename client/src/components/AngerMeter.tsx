import { SULKING_ANGER } from "@jelly/shared";

interface AngerMeterProps {
  anger: number;
}

/**
 * Anger is tracked separately from happiness so M2's `giveSpace` (14 bean bucks) and the
 * digging-holes gag have something explicit to move (DESIGN.md §6).
 */
export function AngerMeter({ anger }: AngerMeterProps) {
  const sulking = anger >= SULKING_ANGER;

  return (
    <div data-testid="anger">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className={sulking ? "font-semibold text-cherry-candy" : "text-white/80"}>
          😠 Anger
        </span>
        <span className="tabular-nums text-white/50">{Math.round(anger)}</span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-valuenow={Math.round(anger)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Anger"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-lemon-candy to-cherry-candy transition-[width] duration-500"
          style={{ width: `${Math.max(0, Math.min(100, anger))}%` }}
        />
      </div>
    </div>
  );
}
