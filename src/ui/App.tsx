import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import type { MusicMood } from '../audio/MusicSequencer';
import { mapSpeechCueToBark } from '../audio/VoiceSynth';
import type { ProjectedBubblePosition } from '../render/BeanView';
import type { ProjectedFloatingPopup } from '../render/IslandView';
import type { ProjectedNpcIndicator } from '../render/NpcView';
import type { SceneManager } from '../render/SceneManager';
import { getActiveBean } from '../sim/engine';
import { getBeanSpeechCue } from '../sim/needs';
import {
  getActiveMainQuestView,
  getActiveRadiantTaskView,
  getReadyToClaimQuest,
} from '../sim/quests';
import { GameStore } from '../sim/store';
import type {
  BeanMoodCueType,
  BuildingType,
  OfflineCatchUpSummary,
  SimEvent,
} from '../sim/types';
import {
  canAfford,
  getBuildingDefinition,
  getEmptyBuildTileIds,
  getHamburgerStandRatePerMin,
  getHouseUpgradeTier,
  hasBuilding,
} from '../sim/village';
import { resolveAssetUrl } from '../utils/assets';
import { AudioToggle } from './AudioToggle';
import { BottomDock, type DockTab } from './BottomDock';
import { BuildSheet } from './BuildSheet';
import { CanvasViewport } from './CanvasViewport';
import { DialogueModal, type ClaimedRewardSummary } from './DialogueModal';
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

function formatPadLabel(padName: string, building: BuildingType | null): string {
  if (building === 'starter_house') return 'Starter House';
  if (building === 'toilet') return 'Toilet';
  if (building === 'hamburger_stand') return 'Hamburger Stand';
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
  const [placementBuilding, setPlacementBuilding] = useState<BuildingType | null>(null);
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [justClaimed, setJustClaimed] = useState<ClaimedRewardSummary | null>(null);
  const [reaction, setReaction] = useState<ReactionBubble | null>(null);
  const [rewardToast, setRewardToast] = useState<RewardToast | null>(null);

  const sceneManagerRef = useRef<SceneManager | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const speechBubbleRef = useRef<HTMLDivElement | null>(null);
  const knockIndicatorRef = useRef<HTMLButtonElement | null>(null);
  const floatingPopupLayerRef = useRef<HTMLDivElement | null>(null);
  const popupNodesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const placementBuildingRef = useRef<BuildingType | null>(null);
  const selectedPadRef = useRef<string | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeqRef = useRef(0);
  const lastSpokenCueRef = useRef<string | null>(null);

  placementBuildingRef.current = placementBuilding;
  selectedPadRef.current = selectedPad;

  const activeBean = getActiveBean(state);
  const hasToiletBuilt = hasBuilding(state, 'toilet');

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
    const audio = new AudioEngine({
      enabled: store.getState().settings.soundEnabled,
    });
    audio.attachLifecycle();
    audioEngineRef.current = audio;

    const detachLifecycle = store.attachLifecycle({ intervalMs: 15000 });
    void store.hydrateFromBackup();

    const unsubscribeEvents = store.subscribeEvents((events: readonly SimEvent[]) => {
      for (const event of events) {
        switch (event.type) {
          case 'ONBOARDING_COMPLETED':
            sceneManagerRef.current?.triggerHappyBounce();
            sceneManagerRef.current?.triggerDrBubblegumKnock();
            showReaction(`Hi ${event.parentTitle}!`, 'happy', 2600);
            void audio.unlock().then((ok) => {
              if (ok) {
                audio.playSfx('knock');
                audio.playVoiceBark('jelly_bean');
              }
            });
            break;
          case 'FED_APPLE':
            sceneManagerRef.current?.triggerFeedApple();
            showReaction('Yum! Crunchy apple!', 'happy', 2000);
            showToast(`+${event.xpGained} XP • +${event.coinsGained} JC`);
            audio.playSfx('feed');
            audio.playVoiceBark('happy');
            break;
          case 'BOUGHT_APPLES':
            showToast(`Bought ${event.quantity} Apple (-${event.coinsSpent} JC)`);
            audio.playSfx('coin');
            break;
          case 'SLEEP_CHANGED':
            if (event.isSleeping) {
              showReaction('Zzz... sleep, sleep...', 'sleep', 2400);
              audio.playSfx('sleep');
              audio.playVoiceBark('sleepy');
            } else {
              sceneManagerRef.current?.triggerHappyBounce();
              showReaction('Good morning!', 'happy', 1800);
              audio.playSfx('wake');
              audio.playVoiceBark('jelly_bean');
            }
            break;
          case 'WARMED_BY_HEARTH':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction('So toasty & warm!', 'happy', 2000);
            showToast(`+${event.xpGained} XP`);
            audio.playSfx('warm');
            audio.playVoiceBark('happy');
            break;
          case 'BLANKET_EQUIPPED':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction('Cozy blanket!', 'happy', 2200);
            audio.playSfx('warm');
            audio.playVoiceBark('happy');
            break;
          case 'SPONGE_BATH_DONE':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction('Squeaky clean!', 'happy', 1900);
            showToast(`+${event.xpGained} XP • +${event.coinsGained} JC`);
            audio.playSfx('wash');
            audio.playVoiceBark('happy');
            break;
          case 'TOILET_USED':
            sceneManagerRef.current?.triggerHappyBounce();
            sceneManagerRef.current?.triggerToiletFlush(event.tileId);
            sceneManagerRef.current?.spawnTilePopup(
              event.tileId,
              `+${event.coinsGained} JC`,
              'coin',
            );
            showReaction('All clean! Flush!', 'happy', 2100);
            showToast(`100% Clean! +${event.xpGained} XP • +${event.coinsGained} JC`);
            audio.playSfx('flush');
            audio.playVoiceBark('happy');
            break;
          case 'BUILDING_PLACED': {
            const def = getBuildingDefinition(event.buildingType);
            const name = def?.name ?? event.buildingType;
            sceneManagerRef.current?.triggerHappyBounce();
            sceneManagerRef.current?.spawnTilePopup(
              event.tileId,
              `+${event.xpGained} XP`,
              'xp',
            );
            showReaction(`Yay! New ${name}!`, 'happy', 2400);
            showToast(`Built ${name}! (+${event.xpGained} XP)`);
            audio.playSfx('wake');
            audio.playVoiceBark('happy');
            break;
          }
          case 'HOUSE_UPGRADED':
            sceneManagerRef.current?.triggerHappyBounce();
            sceneManagerRef.current?.spawnTilePopup(
              event.tileId,
              `Tier ${event.newTier}!`,
              'xp',
            );
            showReaction(`Cozy Tier ${event.newTier} House!`, 'levelup', 2400);
            showToast(`House upgraded to Tier ${event.newTier}!`, 'levelup', 2400);
            audio.playSfx('level_up');
            audio.playVoiceBark('happy');
            break;
          case 'STAND_INCOME_COLLECTED':
            sceneManagerRef.current?.spawnTilePopup(
              event.tileId,
              `+${event.coinsCollected} JC`,
              'coin',
            );
            showToast(`Collected +${event.coinsCollected} JC from Burger Stand!`);
            audio.playSfx('coin');
            break;
          case 'BURGER_EATEN':
            sceneManagerRef.current?.triggerHappyBounce();
            sceneManagerRef.current?.spawnTilePopup(event.tileId, 'Yum! +80 Food', 'burger');
            showReaction('Mmm! Best burger ever!', 'happy', 2200);
            showToast(`Free Burger! +${event.xpGained} XP`);
            audio.playSfx('feed');
            audio.playVoiceBark('happy');
            break;
          case 'BEAN_PETTED':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction('Hehe! Happy bean!', 'happy', 1800);
            showToast(`+${event.xpGained} XP • +${event.coinsGained} JC`);
            audio.playSfx('pet');
            audio.playVoiceBark('happy');
            break;
          case 'DR_BUBBLEGUM_KNOCKED':
            sceneManagerRef.current?.triggerDrBubblegumKnock();
            if (event.reason === 'welcome') {
              setJustClaimed(null);
              setDialogueOpen(true);
            } else {
              audio.playSfx('knock');
              showToast(`*KNOCK KNOCK* Dr. Bubblegum: ${event.questTitle}!`, 'levelup', 2800);
            }
            break;
          case 'QUEST_COMPLETED':
            sceneManagerRef.current?.triggerHappyBounce();
            sceneManagerRef.current?.spawnTilePopup('plot_pad_0', `+${event.coinsGained} JC`, 'coin');
            if (event.bucksGained > 0) {
              sceneManagerRef.current?.spawnTilePopup(
                'plot_pad_0',
                `+${event.bucksGained} BB`,
                'buck',
              );
            }
            setJustClaimed({
              title: event.questTitle,
              coinsGained: event.coinsGained,
              bucksGained: event.bucksGained,
              xpGained: event.xpGained,
            });
            showToast(
              `Quest Complete! +${event.coinsGained} JC${
                event.bucksGained > 0 ? ` • +${event.bucksGained} BB` : ''
              }`,
              'levelup',
              2600,
            );
            audio.playSfx('coin');
            audio.playVoiceBark('happy');
            break;
          case 'RADIANT_TASK_ASSIGNED':
            setJustClaimed(null);
            showToast(`New Bonus Task: ${event.title}`);
            audio.playSfx('tap');
            break;
          case 'LEVEL_UP':
            sceneManagerRef.current?.triggerHappyBounce();
            showReaction(`Level ${event.newLevel}! Yay!`, 'levelup', 2800);
            showToast(`Level ${event.newLevel} Reached!`, 'levelup', 2800);
            audio.playSfx('level_up');
            audio.playVoiceBark('level_up');
            break;
          case 'ACTION_REJECTED':
            showToast(event.reason);
            audio.playSfx('error');
            break;
          default:
            break;
        }
      }
    });

    return () => {
      detachLifecycle();
      unsubscribeEvents();
      audio.dispose();
      audioEngineRef.current = null;
      if (reactionTimerRef.current !== null) {
        clearTimeout(reactionTimerRef.current);
      }
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [store, showReaction, showToast]);

  // Keep AudioEngine mute state and music mood synchronized with simulation state
  useEffect(() => {
    audioEngineRef.current?.setEnabled(state.settings.soundEnabled);
  }, [state.settings.soundEnabled]);

  useEffect(() => {
    const mood: MusicMood = activeBean.isSleeping
      ? 'sleepy'
      : state.weather.current === 'cozy_rain'
        ? 'cozy_rain'
        : 'cozy';
    audioEngineRef.current?.setMusicMood(mood);
  }, [activeBean.isSleeping, state.weather.current]);

  // Keep 3D Larva BeanView and IslandView synced with simulation state
  useEffect(() => {
    sceneManagerRef.current?.syncBeanState(activeBean, state.mode);
  }, [activeBean, state.mode]);

  useEffect(() => {
    sceneManagerRef.current?.syncIslandState(state);
  }, [state.island]);

  useEffect(() => {
    sceneManagerRef.current?.setPlacementMode(placementBuilding);
  }, [placementBuilding]);

  useEffect(() => {
    sceneManagerRef.current?.syncNpcState(state.quests.drBubblegumAtDoor);
  }, [state.quests.drBubblegumAtDoor]);

  const handleSceneReady = useCallback(
    (manager: SceneManager | null) => {
      sceneManagerRef.current = manager;
      if (manager) {
        const current = store.getState();
        manager.syncBeanState(getActiveBean(current), current.mode);
        manager.syncIslandState(current);
        manager.syncNpcState(current.quests.drBubblegumAtDoor);
        manager.setPlacementMode(placementBuildingRef.current);
      }
    },
    [store],
  );

  const handleFrameUpdate = useCallback(
    (
      dtSeconds: number,
      bubblePosition: ProjectedBubblePosition | null,
      floatingPopups: readonly ProjectedFloatingPopup[] = [],
      npcIndicator: ProjectedNpcIndicator | null = null,
    ) => {
      store.step(dtSeconds);

      const el = speechBubbleRef.current;
      if (el) {
        if (bubblePosition && bubblePosition.visible) {
          el.style.transform = `translate3d(${bubblePosition.x.toFixed(1)}px, ${bubblePosition.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
          el.style.visibility = 'visible';
        } else {
          el.style.visibility = 'hidden';
        }
      }

      const knockEl = knockIndicatorRef.current;
      if (knockEl) {
        if (npcIndicator && npcIndicator.visible) {
          const pulseScale = 0.96 + npcIndicator.pulse * 0.08;
          knockEl.style.transform = `translate3d(${npcIndicator.x.toFixed(1)}px, ${npcIndicator.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${pulseScale.toFixed(3)})`;
          knockEl.style.visibility = 'visible';
        } else {
          knockEl.style.visibility = 'hidden';
        }
      }

      // Sync projected floating +JC popups imperatively at 60 FPS (zero React re-renders per frame)
      const layer = floatingPopupLayerRef.current;
      if (layer) {
        const activeIds = new Set<number>();
        const nodes = popupNodesRef.current;

        for (const popup of floatingPopups) {
          if (!popup.visible) continue;
          activeIds.add(popup.id);
          let node = nodes.get(popup.id);
          if (!node) {
            node = document.createElement('div');
            node.className = `floating-popup floating-popup--${popup.accent}`;
            node.textContent = popup.text;
            layer.appendChild(node);
            nodes.set(popup.id, node);
          }
          node.style.transform = `translate3d(${popup.x.toFixed(1)}px, ${popup.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${popup.scale.toFixed(3)})`;
          node.style.opacity = popup.opacity.toFixed(3);
        }

        for (const [id, node] of nodes.entries()) {
          if (!activeIds.has(id)) {
            node.remove();
            nodes.delete(id);
          }
        }
      }
    },
    [store],
  );

  const handleResetView = useCallback(() => {
    audioEngineRef.current?.playSfx('tap');
    sceneManagerRef.current?.resetCamera();
  }, []);

  const handleToggleSound = useCallback(() => {
    const nextEnabled = !store.getState().settings.soundEnabled;
    store.dispatch({
      type: 'UPDATE_SETTINGS',
      settings: { soundEnabled: nextEnabled },
    });
    const audio = audioEngineRef.current;
    if (!audio) return;
    audio.setEnabled(nextEnabled);
    if (nextEnabled) {
      void audio.unlock().then((ok) => {
        if (ok) {
          audio.playSfx('tap');
        }
      });
    }
  }, [store]);

  const handleSelectTab = useCallback((tab: DockTab) => {
    audioEngineRef.current?.playSfx('tap');
    setActiveTab(tab);
    if (tab !== 'build') {
      setPlacementBuilding(null);
    }
  }, []);

  const handlePadSelect = useCallback(
    (pad: string | null) => {
      const pendingBuild = placementBuildingRef.current;

      if (pendingBuild) {
        if (!pad) return;
        const currentState = store.getState();
        const emptyIds = getEmptyBuildTileIds(currentState);
        if (emptyIds.includes(pad)) {
          store.dispatch({
            type: 'PLACE_BUILDING',
            buildingType: pendingBuild,
            tileId: pad,
          });
          setPlacementBuilding(null);
          setSelectedPad(pad);
          setActiveTab('care');
        } else {
          audioEngineRef.current?.playSfx('error');
          showToast('Tap a glowing green empty plot pad!');
        }
        return;
      }

      if (pad) {
        const prevSelected = selectedPadRef.current;
        const tile = store.getState().island.tiles[pad];
        // Quick second tap on a Hamburger Stand with ready coins collects immediately!
        if (
          prevSelected === pad &&
          tile?.building === 'hamburger_stand' &&
          Math.floor(tile.pendingCoins ?? 0) >= 1
        ) {
          store.dispatch({ type: 'COLLECT_STAND_INCOME', tileId: pad });
          return;
        }
        audioEngineRef.current?.playSfx('tap');
      }
      setSelectedPad(pad);
    },
    [store, showToast],
  );

  const handleStartPlacement = useCallback((buildingType: BuildingType) => {
    audioEngineRef.current?.playSfx('tap');
    setPlacementBuilding(buildingType);
  }, []);

  const handleBuildOnSelectedPad = useCallback(
    (buildingType: BuildingType, tileId: string) => {
      const res = store.dispatch({
        type: 'PLACE_BUILDING',
        buildingType,
        tileId,
      });
      if (res.events.some((e) => e.type === 'BUILDING_PLACED')) {
        setPlacementBuilding(null);
        setSelectedPad(tileId);
        setActiveTab('care');
      }
    },
    [store],
  );

  const handleCancelPlacement = useCallback(() => {
    audioEngineRef.current?.playSfx('tap');
    setPlacementBuilding(null);
  }, []);

  const handleUpgradeHouse = useCallback(() => {
    store.dispatch({ type: 'UPGRADE_HOUSE' });
  }, [store]);

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

  const handleUseToilet = useCallback(() => {
    store.dispatch({ type: 'USE_TOILET' });
  }, [store]);

  const handleCollectStand = useCallback(
    (tileId: string) => {
      store.dispatch({ type: 'COLLECT_STAND_INCOME', tileId });
    },
    [store],
  );

  const handleGrabFreeBurger = useCallback(
    (tileId: string) => {
      store.dispatch({ type: 'GRAB_FREE_BURGER', tileId });
    },
    [store],
  );

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

  const handleDismissSelectedPad = useCallback(() => {
    audioEngineRef.current?.playSfx('tap');
    setSelectedPad(null);
    sceneManagerRef.current?.setSelectedPad(null);
  }, []);

  const handleOpenDialogue = useCallback(() => {
    if (!store.getState().onboarded) return;
    audioEngineRef.current?.playSfx('tap');
    setJustClaimed(null);
    setDialogueOpen(true);
  }, [store]);

  const handleCloseDialogue = useCallback(() => {
    audioEngineRef.current?.playSfx('tap');
    setDialogueOpen(false);
    setJustClaimed(null);
  }, []);

  const handleClaimQuest = useCallback(
    (questId: string) => {
      store.dispatch({ type: 'CLAIM_QUEST_REWARD', questId });
    },
    [store],
  );

  const handleRequestRadiantTask = useCallback(() => {
    store.dispatch({ type: 'REQUEST_RADIANT_TASK' });
  }, [store]);

  const handleNpcTap = useCallback(
    (npcId: string) => {
      if (npcId !== 'dr_bubblegum') return;
      handleOpenDialogue();
    },
    [handleOpenDialogue],
  );

  const needSpeechCue = state.onboarded
    ? getBeanSpeechCue(activeBean, state.parentTitle, state.mode)
    : null;

  // Sync passive Jelly Bean vocal barks to urgent speech bubbles ("Hungry!", "Cold!", "Sleep, sleep!")
  useEffect(() => {
    if (!state.onboarded || !needSpeechCue) {
      lastSpokenCueRef.current = null;
      return;
    }

    const cueSignature = `${needSpeechCue.cue}:${needSpeechCue.message}`;
    if (cueSignature === lastSpokenCueRef.current) {
      return;
    }
    lastSpokenCueRef.current = cueSignature;

    const bark = mapSpeechCueToBark(needSpeechCue.cue, activeBean.isSleeping);
    if (bark) {
      audioEngineRef.current?.playVoiceBark(bark, {
        passive: true,
        cueKey: needSpeechCue.cue,
      });
    }
  }, [state.onboarded, needSpeechCue, activeBean.isSleeping]);

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

  const mainQuestView = getActiveMainQuestView(state);
  const radiantTaskView = getActiveRadiantTaskView(state);
  const readyQuest = getReadyToClaimQuest(state);
  const trackerQuest = readyQuest ?? mainQuestView ?? radiantTaskView;

  const selectedTile = selectedPad ? state.island.tiles[selectedPad] ?? null : null;
  const standRatePerMin = getHamburgerStandRatePerMin(state);
  const showTileCard =
    state.onboarded && selectedTile !== null && activeTab !== 'build' && !placementBuilding;

  const buildSheetNode = (
    <BuildSheet
      state={state}
      selectedPad={selectedPad}
      placementBuilding={placementBuilding}
      onStartPlacement={handleStartPlacement}
      onBuildOnSelectedPad={handleBuildOnSelectedPad}
      onCancelPlacement={handleCancelPlacement}
      onUpgradeHouse={handleUpgradeHouse}
      onClose={() => handleSelectTab('care')}
    />
  );

  return (
    <div className="app-shell">
      <CanvasViewport
        lowPowerMode={state.settings.lowPowerMode}
        onPadSelect={handlePadSelect}
        onBeanTap={handleBeanTap}
        onNpcTap={handleNpcTap}
        onFrameUpdate={handleFrameUpdate}
        onSceneReady={handleSceneReady}
      />

      {/* 3D-to-2D projected speech bubble, Dr. Bubblegum *KNOCK KNOCK* indicator & floating +JC popups */}
      <div className="bubble-layer" aria-hidden={!speechText && !state.quests.drBubblegumAtDoor}>
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
        {state.onboarded && state.quests.drBubblegumAtDoor && (
          <button
            ref={knockIndicatorRef}
            type="button"
            className="knock-indicator-pill"
            onClick={handleOpenDialogue}
            aria-label="Answer Dr. Bubblegum at your door"
          >
            <span className="knock-indicator-text">*KNOCK KNOCK*</span>
            <span className="knock-indicator-tail" aria-hidden="true" />
          </button>
        )}
        <div ref={floatingPopupLayerRef} className="floating-popup-layer" aria-hidden="true" />
      </div>

      {state.onboarded && (
        <TopHud
          bean={activeBean}
          jellyCoins={state.currencies.jellyCoins}
          beanBucks={state.currencies.beanBucks}
          soundEnabled={state.settings.soundEnabled}
          onToggleSound={handleToggleSound}
          onResetView={handleResetView}
        />
      )}

      {!state.onboarded && (
        <div className="onboarding-audio-bar">
          <AudioToggle
            enabled={state.settings.soundEnabled}
            onToggle={handleToggleSound}
          />
        </div>
      )}

      {state.onboarded && state.quests.drBubblegumAtDoor && (
        <div className="knock-banner-wrap">
          <button
            type="button"
            className="knock-banner-card"
            onClick={handleOpenDialogue}
            aria-label="Dr. Bubblegum is knocking at your door. Tap to answer."
          >
            <img
              src={resolveAssetUrl('assets/icons/dr_bubblegum.png')}
              alt=""
              aria-hidden="true"
              className="knock-banner-avatar"
              width={36}
              height={36}
            />
            <div className="knock-banner-copy">
              <strong>*KNOCK KNOCK* — Dr. Bubblegum is at your door!</strong>
              <span>
                {readyQuest
                  ? `Tap to claim: ${readyQuest.title}`
                  : 'Tap to greet the Professor'}
              </span>
            </div>
            <span className="knock-banner-cta">Answer</span>
          </button>
        </div>
      )}

      {state.onboarded && !state.quests.drBubblegumAtDoor && !offlineSummary && trackerQuest && (
        <div className="quest-pill-wrap">
          <button
            type="button"
            className="hud-pill quest-tracker-pill"
            onClick={handleOpenDialogue}
            aria-label={`Active quest: ${trackerQuest.title}`}
          >
            <img
              src={resolveAssetUrl('assets/icons/dr_bubblegum.png')}
              alt=""
              aria-hidden="true"
              className="quest-tracker-icon"
              width={20}
              height={20}
            />
            <span className="quest-tracker-title">{trackerQuest.title}</span>
            <span className="quest-tracker-count">
              {trackerQuest.progress.current}/{trackerQuest.progress.target}
            </span>
          </button>
        </div>
      )}

      {state.onboarded && offlineSummary && (
        <div className="welcome-back-wrap">
          <div className="welcome-back-card" role="status" aria-live="polite">
            <div className="welcome-back-copy">
              <strong>Welcome back, {state.parentTitle}!</strong>
              <span>
                You were away {formatAwayDuration(offlineSummary.cappedSeconds)}
                {offlineSummary.sleptRestored ? ' — your Jelly Bean had a cozy rest!' : '.'}
                {offlineSummary.coinsEarned > 0
                  ? ` Hamburger Stand earned +${offlineSummary.coinsEarned} JC ready to collect!`
                  : ''}
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

      {showTileCard && selectedTile && (
        <div className="tile-card-wrap" role="region" aria-label="Selected plot actions">
          <div className="tile-action-card">
            <div className="tile-action-header">
              <div className="tile-action-title-group">
                {selectedTile.building === 'toilet' && (
                  <img
                    src={resolveAssetUrl('assets/icons/toilet.png')}
                    alt=""
                    aria-hidden="true"
                    className="tile-action-icon"
                    width={34}
                    height={34}
                  />
                )}
                {selectedTile.building === 'hamburger_stand' && (
                  <img
                    src={resolveAssetUrl('assets/icons/hamburger_stand.png')}
                    alt=""
                    aria-hidden="true"
                    className="tile-action-icon"
                    width={34}
                    height={34}
                  />
                )}
                <div>
                  <strong className="tile-action-title">
                    {formatPadLabel(selectedTile.id, selectedTile.building)}
                  </strong>
                  <div className="tile-action-sub">
                    {selectedTile.building === 'hamburger_stand' &&
                      `${Math.round(standRatePerMin)} JC/min • ${Math.floor(selectedTile.pendingCoins ?? 0)} JC ready`}
                    {selectedTile.building === 'toilet' && 'Restores 100% Hygiene + 5 JC bonus'}
                    {selectedTile.building === 'starter_house' &&
                      `Tier ${selectedTile.buildingTier} / 4 Cozy Home`}
                    {selectedTile.building === null && 'Open Ring 0 build plot'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="tile-action-close"
                onClick={handleDismissSelectedPad}
                aria-label="Close plot card"
              >
                ✕
              </button>
            </div>

            <div className="tile-action-buttons">
              {selectedTile.building === 'hamburger_stand' && (
                <>
                  <button
                    type="button"
                    className="tile-cta-btn tile-cta-btn--gold"
                    disabled={Math.floor(selectedTile.pendingCoins ?? 0) < 1}
                    onClick={() => handleCollectStand(selectedTile.id)}
                  >
                    <img
                      src={resolveAssetUrl('assets/icons/jelly_coin.png')}
                      alt=""
                      aria-hidden="true"
                      className="cost-mini-icon"
                      width={16}
                      height={16}
                    />
                    <span>
                      {Math.floor(selectedTile.pendingCoins ?? 0) >= 1
                        ? `Collect +${Math.floor(selectedTile.pendingCoins ?? 0)} JC`
                        : 'Earning JC...'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="tile-cta-btn tile-cta-btn--pink"
                    disabled={(selectedTile.burgerCooldownSec ?? 0) > 0}
                    onClick={() => handleGrabFreeBurger(selectedTile.id)}
                  >
                    <span>
                      {(selectedTile.burgerCooldownSec ?? 0) > 0
                        ? `Burger (${Math.ceil(selectedTile.burgerCooldownSec ?? 0)}s)`
                        : '🍔 Free Burger'}
                    </span>
                  </button>
                </>
              )}

              {selectedTile.building === 'toilet' && (
                <button
                  type="button"
                  className="tile-cta-btn tile-cta-btn--pink"
                  onClick={handleUseToilet}
                >
                  <span>Use Toilet (+100% Clean, +5 JC)</span>
                </button>
              )}

              {selectedTile.building === 'starter_house' && (() => {
                const nextTier = getHouseUpgradeTier(selectedTile.buildingTier);
                const affordable = nextTier
                  ? canAfford(state, nextTier.costJellyCoins, nextTier.costBeanBucks)
                  : false;
                return (
                  <>
                    {state.quests.drBubblegumAtDoor && (
                      <button
                        type="button"
                        className="tile-cta-btn tile-cta-btn--pink"
                        onClick={handleOpenDialogue}
                      >
                        <span>🚪 Answer Door</span>
                      </button>
                    )}
                    {nextTier ? (
                      <button
                        type="button"
                        className="tile-cta-btn tile-cta-btn--gold"
                        disabled={!affordable}
                        onClick={handleUpgradeHouse}
                      >
                        <span>
                          Upgrade ({nextTier.costJellyCoins} JC)
                        </span>
                      </button>
                    ) : (
                      <span className="tile-max-note">Fully upgraded Gingerbread Manor!</span>
                    )}
                  </>
                );
              })()}

              {selectedTile.building === null && (
                <button
                  type="button"
                  className="tile-cta-btn tile-cta-btn--mint"
                  onClick={() => handleSelectTab('build')}
                >
                  <span>Build on {formatPadLabel(selectedTile.id, null)}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {state.onboarded && (
        <BottomDock
          activeTab={activeTab}
          bean={activeBean}
          apples={state.inventory.apples}
          blankets={state.inventory.blankets}
          jellyCoins={state.currencies.jellyCoins}
          hasToilet={hasToiletBuilt}
          buildSheet={buildSheetNode}
          onSelectTab={handleSelectTab}
          onFeedApple={handleFeedApple}
          onBuyApple={handleBuyApple}
          onToggleSleep={handleToggleSleep}
          onWarmUp={handleWarmUp}
          onWash={handleWash}
          onUseToilet={handleUseToilet}
          onPet={handlePet}
        />
      )}

      {state.onboarded && dialogueOpen && (
        <DialogueModal
          state={state}
          mainQuest={mainQuestView}
          radiantTask={radiantTaskView}
          justClaimed={justClaimed}
          onClaimQuest={handleClaimQuest}
          onRequestRadiantTask={handleRequestRadiantTask}
          onClose={handleCloseDialogue}
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
