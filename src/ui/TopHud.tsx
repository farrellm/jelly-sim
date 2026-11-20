import { LOW_NEED_THRESHOLD, xpForLevel } from '../sim/constants';
import type { JellyBeanEntity, LifeStage } from '../sim/types';
import { resolveAssetUrl } from '../utils/assets';
import { AudioToggle } from './AudioToggle';

export interface TopHudProps {
  bean: JellyBeanEntity;
  jellyCoins: number;
  beanBucks?: number;
  onResetView: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

const STAGE_LABELS: Record<LifeStage, string> = {
  larva: 'Larva',
  sprout: 'Sprout',
  scholar: 'Scholar',
  career: 'Citizen',
  legend: 'Legend',
};

interface NeedGaugeItem {
  key: keyof JellyBeanEntity['needs'];
  label: string;
  shortLabel: string;
  icon: string;
  value: number;
}

function getNeedTone(value: number): 'healthy' | 'warn' | 'urgent' {
  if (value < LOW_NEED_THRESHOLD) return 'urgent';
  if (value < 55) return 'warn';
  return 'healthy';
}

export function TopHud({
  bean,
  jellyCoins,
  beanBucks = 0,
  onResetView,
  soundEnabled = true,
  onToggleSound,
}: TopHudProps) {
  const xpTarget = xpForLevel(bean.level);
  const xpPercent = Math.min(100, Math.max(0, Math.round((bean.xp / xpTarget) * 100)));

  const gauges: NeedGaugeItem[] = [
    { key: 'hunger', label: 'Hunger', shortLabel: 'Food', icon: '🍎', value: bean.needs.hunger },
    { key: 'warmth', label: 'Warmth', shortLabel: 'Warm', icon: '🧣', value: bean.needs.warmth },
    {
      key: 'sleep',
      label: 'Sleep',
      shortLabel: bean.isSleeping ? 'Zzz' : 'Sleep',
      icon: bean.isSleeping ? '💤' : '🌙',
      value: bean.needs.sleep,
    },
    { key: 'hygiene', label: 'Hygiene', shortLabel: 'Clean', icon: '🫧', value: bean.needs.hygiene },
    { key: 'mood', label: 'Mood', shortLabel: 'Mood', icon: '😊', value: bean.needs.mood },
  ];

  return (
    <header className="top-hud" aria-label="Jelly Bean status">
      <div className="top-hud-row">
        <div className="hud-pill bean-profile-pill">
          <img
            src={resolveAssetUrl('assets/icons/larva.png')}
            alt=""
            aria-hidden="true"
            className="hud-avatar"
            width={34}
            height={34}
          />
          <div className="bean-meta">
            <div className="bean-meta-top">
              <span className="bean-name">{bean.name}</span>
              <span className="level-badge">Lv.{bean.level}</span>
            </div>
            <div
              className="xp-track"
              role="progressbar"
              aria-label={`Experience: ${bean.xp} of ${xpTarget}`}
              aria-valuenow={bean.xp}
              aria-valuemin={0}
              aria-valuemax={xpTarget}
            >
              <div className="xp-fill" style={{ width: `${xpPercent}%` }} />
            </div>
            <div className="bean-meta-sub">
              <span>{STAGE_LABELS[bean.stage]}</span>
              <span>
                {bean.xp}/{xpTarget} XP
              </span>
            </div>
          </div>
        </div>

        <div className="top-hud-actions">
          <div className="hud-pill currency-group-pill">
            <span className="currency-item currency-item--jc" aria-label={`${jellyCoins} Jelly Coins`}>
              <img
                src={resolveAssetUrl('assets/icons/jelly_coin.png')}
                alt=""
                aria-hidden="true"
                className="currency-icon"
                width={18}
                height={18}
              />
              <span>{jellyCoins}</span>
            </span>
            <span className="currency-divider" aria-hidden="true" />
            <span className="currency-item currency-item--bb" aria-label={`${beanBucks} Bean Bucks`}>
              <img
                src={resolveAssetUrl('assets/icons/bean_buck.png')}
                alt=""
                aria-hidden="true"
                className="currency-icon"
                width={18}
                height={18}
              />
              <span>{beanBucks}</span>
            </span>
          </div>
          {onToggleSound && (
            <AudioToggle enabled={soundEnabled} onToggle={onToggleSound} />
          )}
          <button
            type="button"
            className="hud-pill hud-icon-button"
            onClick={onResetView}
            aria-label="Reset camera view"
            title="Reset camera view"
          >
            <span aria-hidden="true">↺</span>
          </button>
        </div>
      </div>

      <div className="needs-strip" role="group" aria-label="Jelly Bean needs">
        {gauges.map((gauge) => {
          const rounded = Math.round(gauge.value);
          const tone = getNeedTone(gauge.value);
          const isSleepActive = gauge.key === 'sleep' && bean.isSleeping;
          return (
            <div
              key={gauge.key}
              className={`need-gauge need-gauge--${tone}${isSleepActive ? ' need-gauge--sleeping' : ''}`}
              aria-label={`${gauge.label}: ${rounded}%`}
            >
              <div className="need-gauge-head">
                <span className="need-icon" aria-hidden="true">
                  {gauge.icon}
                </span>
                <span className="need-short-label">{gauge.shortLabel}</span>
              </div>
              <div
                className="need-bar-track"
                role="progressbar"
                aria-label={gauge.label}
                aria-valuenow={rounded}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="need-bar-fill" style={{ width: `${rounded}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </header>
  );
}
