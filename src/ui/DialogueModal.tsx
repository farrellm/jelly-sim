import type { ActiveQuestView } from '../sim/quests';
import type { GameState } from '../sim/types';
import { resolveAssetUrl } from '../utils/assets';

export interface ClaimedRewardSummary {
  title: string;
  coinsGained: number;
  bucksGained: number;
  xpGained: number;
}

export interface DialogueModalProps {
  state: GameState;
  mainQuest: ActiveQuestView | null;
  radiantTask: ActiveQuestView | null;
  justClaimed?: ClaimedRewardSummary | null;
  onClaimQuest: (questId: string) => void;
  onRequestRadiantTask?: () => void;
  onClose: () => void;
}

function getProgressPercent(current: number, target: number): number {
  if (target <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}

export function DialogueModal({
  state,
  mainQuest,
  radiantTask,
  justClaimed = null,
  onClaimQuest,
  onRequestRadiantTask,
  onClose,
}: DialogueModalProps) {
  // Prioritize whichever quest is ready to claim; otherwise lead with main quest (or radiant after Q15)
  const featuredQuest: ActiveQuestView | null =
    mainQuest && mainQuest.progress.completed
      ? mainQuest
      : radiantTask && radiantTask.progress.completed
        ? radiantTask
        : mainQuest ?? radiantTask;

  const secondaryRadiant =
    featuredQuest && radiantTask && featuredQuest.id !== radiantTask.id ? radiantTask : null;

  const isClaimable = Boolean(featuredQuest?.progress.completed);
  const progressPct = featuredQuest
    ? getProgressPercent(featuredQuest.progress.current, featuredQuest.progress.target)
    : 100;

  const eyebrow = isClaimable
    ? featuredQuest?.isWelcomeGift
      ? '*KNOCK KNOCK* • STARTER PLOT GIFT'
      : '*KNOCK KNOCK* • QUEST COMPLETE!'
    : state.quests.drBubblegumAtDoor
      ? '*KNOCK KNOCK* • DR. BUBBLEGUM'
      : "DR. BUBBLEGUM'S TASK BOARD";

  const questSubtitle = featuredQuest
    ? featuredQuest.kind === 'main'
      ? `Main Quest ${featuredQuest.number} of ${featuredQuest.totalMainQuests}`
      : `Bonus Task #${featuredQuest.number}`
    : 'All Main Quests Complete';

  const primaryCtaLabel = featuredQuest
    ? featuredQuest.progress.completed
      ? featuredQuest.isWelcomeGift
        ? 'Accept Starter Plot & Claim Gift'
        : 'Claim Reward'
      : 'On it, Professor!'
    : 'Back to Island';

  return (
    <div
      className="modal-backdrop dialogue-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dr-bubblegum-title"
    >
      <div className="dialogue-card">
        <div className="dialogue-header">
          <div className="dialogue-portrait-wrap">
            <img
              src={resolveAssetUrl('assets/icons/dr_bubblegum.png')}
              alt="Dr. Bubblegum"
              className="dialogue-portrait"
              width={68}
              height={68}
            />
            <span className="dialogue-npc-badge">Prof.</span>
          </div>

          <div className="dialogue-title-block">
            <p className="dialogue-eyebrow">{eyebrow}</p>
            <h2 id="dr-bubblegum-title" className="dialogue-speaker">
              Dr. Bubblegum
            </h2>
            <span className="dialogue-quest-kicker">{questSubtitle}</span>
          </div>

          <button
            type="button"
            className="tile-action-close"
            onClick={onClose}
            aria-label="Close Dr. Bubblegum dialogue"
          >
            ✕
          </button>
        </div>

        {justClaimed && (
          <div className="dialogue-claimed-banner" role="status" aria-live="polite">
            <span className="dialogue-claimed-check" aria-hidden="true">
              ✓
            </span>
            <span>
              Completed <strong>{justClaimed.title}</strong>! +{justClaimed.coinsGained} JC
              {justClaimed.bucksGained > 0 ? ` • +${justClaimed.bucksGained} BB` : ''}
              {justClaimed.xpGained > 0 ? ` • +${justClaimed.xpGained} XP` : ''}
            </span>
          </div>
        )}

        {featuredQuest && (
          <>
            <div className="dialogue-speech-stack">
              <div className="dialogue-bubble dialogue-bubble--stern">
                <span className="dialogue-tone-tag">Crunchy Exterior</span>
                <p className="dialogue-quote">&ldquo;{featuredQuest.sternDialogue}&rdquo;</p>
              </div>
              <div className="dialogue-bubble dialogue-bubble--warm">
                <span className="dialogue-tone-tag dialogue-tone-tag--warm">
                  Heart of Gold
                </span>
                <p className="dialogue-quote">{featuredQuest.warmDialogue}</p>
              </div>
            </div>

            <div className="dialogue-objective-box">
              <div className="dialogue-objective-head">
                <strong className="dialogue-objective-title">{featuredQuest.title}</strong>
                <span
                  className={`dialogue-progress-chip${
                    featuredQuest.progress.completed ? ' dialogue-progress-chip--done' : ''
                  }`}
                >
                  {featuredQuest.progress.completed
                    ? 'Ready!'
                    : `${featuredQuest.progress.current}/${featuredQuest.progress.target}`}
                </span>
              </div>
              <p className="dialogue-objective-copy">{featuredQuest.objective}</p>
              <div
                className="dialogue-progress-track"
                role="progressbar"
                aria-label={`${featuredQuest.title} progress`}
                aria-valuenow={featuredQuest.progress.current}
                aria-valuemin={0}
                aria-valuemax={featuredQuest.progress.target}
              >
                <div
                  className={`dialogue-progress-fill${
                    featuredQuest.progress.completed ? ' dialogue-progress-fill--done' : ''
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="dialogue-rewards-row" aria-label="Quest rewards">
                <span className="dialogue-rewards-label">Rewards:</span>
                <span className="build-cost-tag build-cost-tag--jc">
                  <img
                    src={resolveAssetUrl('assets/icons/jelly_coin.png')}
                    alt=""
                    aria-hidden="true"
                    className="cost-mini-icon"
                    width={14}
                    height={14}
                  />
                  +{featuredQuest.reward.jellyCoins} JC
                </span>
                {featuredQuest.reward.beanBucks > 0 && (
                  <span className="build-cost-tag build-cost-tag--bb">
                    <img
                      src={resolveAssetUrl('assets/icons/bean_buck.png')}
                      alt=""
                      aria-hidden="true"
                      className="cost-mini-icon"
                      width={14}
                      height={14}
                    />
                    +{featuredQuest.reward.beanBucks} BB
                  </span>
                )}
                {featuredQuest.reward.xp > 0 && (
                  <span className="dialogue-xp-tag">+{featuredQuest.reward.xp} XP</span>
                )}
              </div>
            </div>
          </>
        )}

        {secondaryRadiant && (
          <div className="dialogue-bonus-card">
            <div className="dialogue-objective-head">
              <strong className="dialogue-objective-title">
                Bonus Task: {secondaryRadiant.title}
              </strong>
              <span
                className={`dialogue-progress-chip${
                  secondaryRadiant.progress.completed ? ' dialogue-progress-chip--done' : ''
                }`}
              >
                {secondaryRadiant.progress.completed
                  ? 'Ready!'
                  : `${secondaryRadiant.progress.current}/${secondaryRadiant.progress.target}`}
              </span>
            </div>
            <p className="dialogue-objective-copy">{secondaryRadiant.objective}</p>
            {secondaryRadiant.progress.completed && (
              <button
                type="button"
                className="tile-cta-btn tile-cta-btn--gold"
                onClick={() => onClaimQuest(secondaryRadiant.id)}
              >
                Claim Bonus (+{secondaryRadiant.reward.jellyCoins} JC, +
                {secondaryRadiant.reward.beanBucks} BB)
              </button>
            )}
          </div>
        )}

        <div className="dialogue-actions">
          {featuredQuest && isClaimable ? (
            <button
              type="button"
              className="primary-cta-button dialogue-claim-btn"
              onClick={() => onClaimQuest(featuredQuest.id)}
            >
              {primaryCtaLabel}
            </button>
          ) : (
            <button type="button" className="primary-cta-button" onClick={onClose}>
              {primaryCtaLabel}
            </button>
          )}

          {!isClaimable && !radiantTask && onRequestRadiantTask && state.onboarded && (
            <button
              type="button"
              className="dialogue-secondary-btn"
              onClick={onRequestRadiantTask}
            >
              Ask for Extra Credit Task (+JC &amp; +BB)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
