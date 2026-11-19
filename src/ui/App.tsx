import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ProjectedBubblePosition } from '../render/BeanView';
import type { SceneManager } from '../render/SceneManager';
import { getActiveBean } from '../sim/engine';
import { getBeanSpeechCue } from '../sim/needs';
import { GameStore } from '../sim/store';
import type { BeanMoodCueType, OfflineCatchUpSummary, SimEvent } from '../sim/types';
import { BottomDock, type DockTab } from './BottomDock';
import { CanvasViewport } from './CanvasViewport';
import { OnboardingModal } from './OnboardingModal';
import { TopHud } from './TopHud';

interface ReactionBubble {
  message: string;
  tone: 'happy' | 'sleep' | 'levelup';
  expiresAtMs: number;
}

interface RewardToast {
  id: number;
  message: string;
  accent: 'default' | 'levelup';
}

function formatPadLabel(padName: string): string {
  if (padName === 'plot_pad_0') {
    return 'Starter House Plot';
  }
  const match = /^plot_pad_(\d+)$/.exec(padName);
  return match ? `Plot Pad ${match[1]}` : padName;
}

function formatAwayDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) {
    return `${Math.max(1, mins)}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function getSpeechBubbleTone(
  cue: BeanMoodCueType | null,
  reaction: ReactionBubble | null,
  isSleeping: boolean,
): string {
  if (reaction) {
    return `speech-bubble--${reaction.tone}`;
  }
  if (cue) {
    return `speech-bubble--${cue}`;
  }
  if (isSleeping) {
    return 'speech-bubble--sleep';
  }
  return 'speech-bubble--happy';
}

export function App() {
  const [store] = useState(() => new GameStore());
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const offlineSummary: OfflineCatchUpSummary | null = useSyncExternalStore(
    store.subscribe,
    store.getLastOfflineSummary,
    store.getLastOfflineSummary,
  );

  const [activeTab, setActiveTab] = useState<DockTab>('care');
  const [selectedPad, setSelectedPad] = useState<string | null>(null);
  const [reaction, setReaction] = useState<ReactionBubble | null>(null);
  const [rewardToast, setRewardToast] = useState<RewardToast | null>(null);

  const sceneManagerRef = useRef<SceneManager | null>(null);
  const speechBubbleRef = useRef<HTMLDivElement | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeqRef = useRef(0);

  const activeBean = getActiveBean(state);

  const showReaction = useCallback(
    (message: string, tone: ReactionBubble['tone'], durationMs = 2200) => {
      if (reactionTimerRef.current !== null) {
        clearTimeout(reactionTimerRef.current);
      }
      setReaction({ message, tone, expiresAtMs: Date.now() + durationMs });
      reactionTimerRef.current = setTimeout(() => {
        setReaction(null);
        reactionTimerRef.current = null;
      }, durationMs);
    },
    [],
  );

  const showToast = useCallback(
    (message: string, accent: RewardToast['accent'] = 'default', durationMs = 2100) => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
      toastSeqRef.current += 1;
      setRewardToast({ id: toastSeqRef.current, message, accent });
      toastTimerRef.current = setTimeout(() => {
        setRewardToast(null);
        toastTimerRef.current = null;
      }, durationMs);
    },
    [],
  );

  useEffect(() => {
    const detachLifecycle = store.attachLifecycle({ intervalMs: 15000 });
    void store.hydrateFromBackup();

    const unsubscribeEvents = store.subscribeEvents((events: readonly SimEvent[]) => {
      for (const event of events) {
        switch (event.type) {
          case 'ONBOARDING_COMPLETED':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction(`Hi ${event.parentTitle}!`, 'happy', 2600);
            break;
          case 'FED_APPLE':
            sceneManagerRef.current?.triggerFeedApple();
            showReaction('Yum! Crunchy apple!', 'happy', 2000);
            showToast(`+${event.xpGained} XP • +${event.coinsGained} JC`);
            break;
          case 'BOUGHT_APPLES':
            showToast(`Bought ${event.quantity} Apple (-${event.coinsSpent} JC)`);
            break;
          case 'SLEEP_CHANGED':
            if (event.isSleeping) {
              showReaction('Zzz... sleep, sleep...', 'sleep', 2400);
            } else {
              sceneManagerRef.current?.triggerHappyBounce();
              showReaction('Good morning!', 'happy', 1800);
            }
            break;
          case 'WARMED_BY_HEARTH':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction('So toasty & warm!', 'happy', 2000);
            showToast(`+${event.xpGained} XP`);
            break;
          case 'BLANKET_EQUIPPED':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction('Cozy blanket!', 'happy', 2200);
            break;
          case 'SPONGE_BATH_DONE':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction('Squeaky clean!', 'happy', 1900);
            showToast(`+${event.xpGained} XP • +${event.coinsGained} JC`);
            break;
          case 'BEAN_PETTED':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction('Hehe! Happy bean!', 'happy', 1800);
            showToast(`+${event.xpGained} XP • +${event.coinsGained} JC`);
            break;
          case 'LEVEL_UP':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction(`Level ${event.newLevel}! Yay!`, 'levelup', 2800);
            showToast(`Level ${event.newLevel} Reached!`, 'levelup', 2800);
            break;
          default:
            break;
        }
      }
    });

    return () => {
      detachLifecycle();
      unsubscribeEvents();
      if (reactionTimerRef.current !== null) {
        clearTimeout(reactionTimerRef.current);
      }
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [store, showReaction, showToast]);

  // Keep 3D Larva BeanView synced with simulation state
  useEffect(() => {
    sceneManagerRef.current?.syncBeanState(activeBean, state.mode);
  }, [activeBean, state.mode]);

  const handleSceneReady = useCallback(
    (manager: SceneManager | null) => {
      sceneManagerRef.current = manager;
      if (manager) {
        const current = store.getState();
        manager.syncBeanState(getActiveBean(current), current.mode);
      }
    },
    [store],
  );

  const handleFrameUpdate = useCallback(
    (dtSeconds: number, bubblePosition: ProjectedBubblePosition | null) => {
      store.step(dtSeconds);

      const el = speechBubbleRef.current;
      if (!el) return;

      if (bubblePosition && bubblePosition.visible) {
        el.style.transform = `translate3d(${bubblePosition.x.toFixed(1)}px, ${bubblePosition.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        el.style.visibility = 'visible';
      } else {
        el.style.visibility = 'hidden';
      }
    },
    [store],
  );

  const handleResetView = useCallback(() => {
    sceneManagerRef.current?.resetCamera();
  }, []);

  const handleCompleteOnboarding = useCallback(
    (beanName: string, parentTitle: string) => {
      store.dispatch({ type: 'COMPLETE_ONBOARDING', beanName, parentTitle });
    },
    [store],
  );

  const handleFeedApple = useCallback(() => {
    store.dispatch({ type: 'FEED_APPLE' });
  }, [store]);

  const handleBuyApple = useCallback(() => {
    store.dispatch({ type: 'BUY_APPLE', quantity: 1 });
  }, [store]);

  const handleToggleSleep = useCallback(() => {
    store.dispatch({ type: 'TOGGLE_SLEEP' });
  }, [store]);

  const handleWarmUp = useCallback(() => {
    if (store.getState().inventory.blankets > 0) {
      store.dispatch({ type: 'USE_BLANKET' });
    } else {
      store.dispatch({ type: 'WARM_BY_HEARTH' });
    }
  }, [store]);

  const handleWash = useCallback(() => {
    store.dispatch({ type: 'SPONGE_BATH' });
  }, [store]);

  const handlePet = useCallback(() => {
    store.dispatch({ type: 'PET_BEAN' });
  }, [store]);

  const handleBeanTap = useCallback(
    (beanId: string) => {
      if (!store.getState().onboarded) return;
      store.dispatch({ type: 'PET_BEAN', beanId });
    },
    [store],
  );

  const needSpeechCue = state.onboarded
    ? getBeanSpeechCue(activeBean, state.parentTitle, state.mode)
    : null;

  const speechText = state.onboarded
    ? reaction?.message ??
      needSpeechCue?.message ??
      (activeBean.isSleeping ? 'Zzz... Jellybean, sleep, sleep.' : null)
    : null;

  const speechToneClass = getSpeechBubbleTone(
    needSpeechCue?.cue ?? null,
    reaction,
    activeBean.isSleeping,
  );

  return (
    <div className="app-shell">
      <CanvasViewport
        lowPowerMode={state.settings.lowPowerMode}
        onPadSelect={setSelectedPad}
        onBeanTap={handleBeanTap}
        onFrameUpdate={handleFrameUpdate}
        onSceneReady={handleSceneReady}
      />

      {/* 3D-to-2D projected speech bubble tracking the Larva at 60 FPS */}
      <div className="bubble-layer" aria-hidden={!speechText}>
        <div
          ref={speechBubbleRef}
          className={`speech-bubble ${speechToneClass}${speechText ? ' speech-bubble--shown' : ''}`}
          role="status"
          aria-live="polite"
        >
          {speechText && (
            <>
              <span className="speech-bubble-text">{speechText}</span>
              <span className="speech-bubble-tail" aria-hidden="true" />
            </>
          )}
        </div>
      </div>

      {state.onboarded && (
        <TopHud
          bean={activeBean}
          jellyCoins={state.currencies.jellyCoins}
          onResetView={handleResetView}
        />
      )}

      {state.onboarded && offlineSummary && (
        <div className="welcome-back-wrap">
          <div className="welcome-back-card" role="status" aria-live="polite">
            <div className="welcome-back-copy">
              <strong>Welcome back, {state.parentTitle}!</strong>
              <span>
                You were away {formatAwayDuration(offlineSummary.cappedSeconds)}
                {offlineSummary.sleptRestored ? ' — your Jelly Bean had a cozy rest!' : '.'}
              </span>
            </div>
            <button
              type="button"
              className="welcome-back-dismiss"
              onClick={store.dismissOfflineSummary}
              aria-label="Dismiss welcome back summary"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <div className="hud-spacer" aria-hidden="true" />

      {state.onboarded && rewardToast && (
        <div className="toast-banner" role="status" aria-live="polite">
          <span
            key={rewardToast.id}
            className={`hud-pill toast-pill${
              rewardToast.accent === 'levelup' ? ' toast-pill--levelup' : ''
            }`}
          >
            {rewardToast.message}
          </span>
        </div>
      )}

      {state.onboarded && selectedPad && !rewardToast && (
        <div className="selection-banner" role="status" aria-live="polite">
          <span className="hud-pill selection-pill">{formatPadLabel(selectedPad)}</span>
        </div>
      )}

      {state.onboarded && (
        <BottomDock
          activeTab={activeTab}
          bean={activeBean}
          apples={state.inventory.apples}
          blankets={state.inventory.blankets}
          jellyCoins={state.currencies.jellyCoins}
          onSelectTab={setActiveTab}
          onFeedApple={handleFeedApple}
          onBuyApple={handleBuyApple}
          onToggleSleep={handleToggleSleep}
          onWarmUp={handleWarmUp}
          onWash={handleWash}
          onPet={handlePet}
        />
      )}

      {!state.onboarded && (
        <OnboardingModal
          defaultBeanName={activeBean.name}
          defaultParentTitle={state.parentTitle}
          onComplete={handleCompleteOnboarding}
        />
      )}
    </div>
  );
}
