import { CRITICAL_MOOD, MOOD_INFO, type Mood } from "@jelly/shared";

interface MoodBarProps {
  mood: Mood;
  value: number;
}

const BAR_COLOR: Record<Mood, string> = {
  hunger: "bg-lemon-candy",
  warmth: "bg-cherry-candy",
  energy: "bg-blueberry-candy",
  happiness: "bg-lime-candy",
};

export function MoodBar({ mood, value }: MoodBarProps) {
  const info = MOOD_INFO[mood];
  const critical = value < CRITICAL_MOOD;

  return (
    <div data-testid={`mood-${mood}`}>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className={critical ? "font-semibold text-cherry-candy" : "text-white/80"}>
          {info.emoji} {info.label}
        </span>
        <span className="tabular-nums text-white/50">{Math.round(value)}</span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={info.label}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${BAR_COLOR[mood]}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
