import type { Wallet } from "@jelly/shared";

interface CurrencyBadgesProps {
  wallet: Wallet;
}

/** The three currencies of CONCEPT §7 — the confusion is intentional flavor. */
export function CurrencyBadges({ wallet }: CurrencyBadgesProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <CurrencyBadge emoji="🪙" label="jelly coins" value={wallet.jellyCoins} />
      <CurrencyBadge emoji="💵" label="bean bucks" value={wallet.beanBucks} />
      <CurrencyBadge emoji="🫘" label="bonus beans" value={wallet.bonusBeans} />
    </div>
  );
}

function CurrencyBadge({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <span
      className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 tabular-nums"
      title={label}
      aria-label={`${Math.floor(value)} ${label}`}
    >
      <span aria-hidden>{emoji}</span>
      {Math.floor(value)}
    </span>
  );
}
