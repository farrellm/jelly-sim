/**
 * Content data (DESIGN.md §5). M1 ships mood presentation and the Jelly Bean's callouts;
 * buildings, quests, monsters and flavors arrive with M2–M4.
 */

import type { Mood } from "./gameState.js";

export interface MoodInfo {
  /** Label shown next to the bar. */
  label: string;
  /** What the Jelly Bean shouts when this need goes critical (CONCEPT §4). */
  callout: string;
  /** How you resolve it, for the action button. */
  actionLabel: string;
  emoji: string;
}

export const MOOD_INFO: Record<Mood, MoodInfo> = {
  hunger: {
    label: "Fed",
    callout: "Jelly Bean hungry! Feed me!",
    actionLabel: "Feed an apple",
    emoji: "🍎",
  },
  warmth: {
    label: "Warm",
    callout: "Jelly Bean cold. Papa help.",
    actionLabel: "Knit a blanket",
    emoji: "🧣",
  },
  energy: {
    label: "Rested",
    callout: "I'm so sleepy.",
    actionLabel: "Sleep, sleep",
    emoji: "😴",
  },
  happiness: {
    label: "Happy",
    callout: "Mama! Papa!",
    actionLabel: "Cheer it up",
    emoji: "✨",
  },
};

/** What the bean says when it is simply angry (CONCEPT §4). */
export const ANGRY_CALLOUT = "Your Jelly Bean is angry at you.";

/** Flavors unlocked at the start; the collectible layer grows in M4. */
export const STARTER_FLAVORS = ["cherry"] as const;
