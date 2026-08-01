import type { GameState } from "@jelly/shared";
import { SULKING_ANGER } from "@jelly/shared";

interface BeanViewProps {
  state: GameState;
}

/** The Jelly Bean itself: idles happily, sulks when angry (CONCEPT §4). */
export function BeanView({ state }: BeanViewProps) {
  const { bean } = state;
  const sulking = bean.anger >= SULKING_ANGER;
  const sleepy = bean.moods.energy < 25;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={sulking ? "animate-bean-sulk" : "animate-bean-idle"}
        data-testid="bean"
        aria-label={`${bean.name}, a ${bean.flavor} jelly bean`}
      >
        <svg viewBox="0 0 220 260" className="h-44 w-40 drop-shadow-[0_12px_24px_rgba(0,0,0,.45)]">
          <defs>
            <radialGradient id="beanBody" cx="36%" cy="28%" r="80%">
              <stop offset="0%" stopColor="var(--color-bubblegum-400)" />
              <stop offset="60%" stopColor="var(--color-bubblegum-500)" />
              <stop offset="100%" stopColor="var(--color-bubblegum-600)" />
            </radialGradient>
          </defs>
          <path
            d="M60 30c40-18 96-4 122 44 26 48 12 116-30 148s-104 20-134-24S22 76 48 46c6-7 6-11 12-16z"
            fill="url(#beanBody)"
          />
          <ellipse cx="72" cy="80" rx="24" ry="16" fill="#fff" opacity=".45" transform="rotate(-28 72 80)" />

          {sleepy ? (
            <>
              <path d="M64 132q14-12 28 0" stroke="#2b1b3d" strokeWidth="7" fill="none" strokeLinecap="round" />
              <path d="M124 126q14-12 28 0" stroke="#2b1b3d" strokeWidth="7" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="78" cy="132" r="9" fill="#2b1b3d" />
              <circle cx="138" cy="126" r="9" fill="#2b1b3d" />
            </>
          )}

          {sulking ? (
            <path
              d="M76 186q30-22 60-6"
              stroke="#2b1b3d"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M76 172q28 26 60 4"
              stroke="#2b1b3d"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
            />
          )}
        </svg>
      </div>

      <p className="text-xl font-semibold">{bean.name}</p>
      <p className="text-sm text-white/60">
        {bean.flavor} · {bean.stage} stage · level {bean.level}
      </p>
    </div>
  );
}
