import { stageForLevel, xpForLevel } from './constants';
import { nextInt } from './rng';
import type {
  DispatchResult,
  GameState,
  JellyBeanEntity,
  LifeStage,
  QuestProgressCounters,
  QuestsState,
  RadiantTaskState,
  RadiantTaskTemplateId,
  SimEvent,
} from './types';
import { hasBuilding } from './village';

export interface QuestProgress {
  current: number;
  target: number;
  completed: boolean;
}

export interface QuestReward {
  jellyCoins: number;
  beanBucks: number;
  xp: number;
}

export interface MainQuestDefinition {
  id: string;
  number: number;
  title: string;
  objective: string;
  /** Dr. Bubblegum's crunchy-stern opening remark when assigning the task. */
  sternBriefing: string;
  /** His warm marshmallow-heart encouragement on the assignment screen. */
  warmHint: string;
  /** Dr. Bubblegum's crunchy-stern opening remark when the task is complete. */
  sternCompletion: string;
  /** His heart-of-gold praise when handing over the reward. */
  warmCompletion: string;
  reward: QuestReward;
  evaluate: (state: GameState) => QuestProgress;
}

export interface ActiveQuestView {
  id: string;
  kind: 'main' | 'radiant';
  number: number;
  totalMainQuests: number;
  title: string;
  objective: string;
  sternDialogue: string;
  warmDialogue: string;
  reward: QuestReward;
  progress: QuestProgress;
  isWelcomeGift: boolean;
}

interface RadiantTemplate {
  templateId: RadiantTaskTemplateId;
  title: string;
  objectiveFor: (delta: number) => string;
  sternBriefing: string;
  warmHint: string;
  sternCompletion: string;
  warmCompletion: string;
  counterKey: keyof QuestProgressCounters;
  targetDelta: number;
  reward: QuestReward;
  isEligible: (state: GameState) => boolean;
}

export function createDefaultQuestCounters(): QuestProgressCounters {
  return {
    applesFed: 0,
    timesSlept: 0,
    toiletUses: 0,
    standCoinsCollected: 0,
    petsGiven: 0,
    holesDug: 0,
    feathersGathered: 0,
    blanketsKnitted: 0,
    parsleyHarvested: 0,
    tomatoesHarvested: 0,
    candyCanesHarvested: 0,
    hundredBeansHarvested: 0,
    gardenCheckIns: 0,
    gumdropRunsCompleted: 0,
    bonusBeansRedeemed: 0,
    witchDefeatedCount: 0,
  };
}

export function createInitialQuestsState(): QuestsState {
  return {
    completedIds: [],
    activeQuestId: 'q1_welcome',
    drBubblegumAtDoor: true,
    radiantCompletedCount: 0,
    activeRadiantTask: null,
    counters: createDefaultQuestCounters(),
  };
}

/**
 * Interpolates `{beanName}` and `{parentTitle}` placeholders cleanly in Dr. Bubblegum's lines.
 */
export function formatDrBubblegumLine(template: string, state: GameState): string {
  const activeBean =
    state.beans.find((b) => b.id === state.activeBeanId) ?? state.beans[0];
  const beanName = activeBean?.name ?? 'Jelly Bean';
  const parentTitle = state.parentTitle || 'Mama';
  return template
    .replace(/\{beanName\}/g, beanName)
    .replace(/\{parentTitle\}/g, parentTitle);
}

function getMaxBeanLevel(state: GameState): number {
  let maxLevel = 1;
  for (const bean of state.beans) {
    if (bean.level > maxLevel) {
      maxLevel = bean.level;
    }
  }
  return maxLevel;
}

function awardQuestXp(
  bean: JellyBeanEntity,
  xpGain: number,
): { bean: JellyBeanEntity; leveledUp: boolean; newLevel: number; newStage: LifeStage } {
  const safeGain = Math.max(0, Math.floor(xpGain));
  if (safeGain === 0) {
    return { bean, leveledUp: false, newLevel: bean.level, newStage: bean.stage };
  }

  let level = bean.level;
  let xp = bean.xp + safeGain;
  let leveledUp = false;

  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    leveledUp = true;
  }

  const stage = stageForLevel(level);
  return {
    bean: { ...bean, level, xp, stage },
    leveledUp,
    newLevel: level,
    newStage: stage,
  };
}

/**
 * Canonical 15-Quest Dr. Bubblegum Main Progression Arc (DESIGN.md §3.7).
 */
export const MAIN_QUESTS: readonly MainQuestDefinition[] = [
  {
    id: 'q1_welcome',
    number: 1,
    title: 'Welcome to Your Plot',
    objective: 'Name your Jelly Bean & choose your parent title.',
    sternBriefing:
      'Ahem! Attention! I am Dr. Bubblegum, Professor of Realistic Jelly Bean Studies. An unnamed Jelly Bean on an unregistered plot of land? Unacceptable!',
    warmHint:
      'Give your little Larva a proper name and title—then I shall personally present the deed to your very own Starter Plot!',
    sternCompletion:
      'Ahem! "{beanName}" and "{parentTitle}"—duly recorded in my official ledger! Do not think for a moment this island will run itself!',
    warmCompletion:
      'Oh, look at those wobbly little eyes... Welcome home, {parentTitle}! This Starter Plot is officially yours, along with a starter stipend. Remember: the goal isn\'t just to survive—you want {beanName} to thrive!',
    reward: { jellyCoins: 35, beanBucks: 2, xp: 15 },
    evaluate: (state) => ({
      current: state.onboarded ? 1 : 0,
      target: 1,
      completed: state.onboarded,
    }),
  },
  {
    id: 'q2_survive',
    number: 2,
    title: 'Survive First!',
    objective: 'Feed {beanName} an Apple and tuck them into bed to sleep.',
    sternBriefing:
      'Still in the Larva stage, I see! A Jelly Bean cannot thrive on sunny breezes alone. Feed {beanName} a crisp Apple and tuck them in for a proper nap—posthaste!',
    warmHint:
      'Use the Feed and Sleep buttons in your Care dock. Every great village starts with a full tummy and cozy rest.',
    sternCompletion:
      'Hmph! Adequate apple-tossing form, and a surprisingly punctual bedtime. I suppose I can mark "Basic Larva Care" as passing...',
    warmCompletion:
      'Truth be told, {beanName} looks positively beaming! You are a natural, {parentTitle}. Here are some Jelly Coins and Bean Bucks for your trouble!',
    reward: { jellyCoins: 45, beanBucks: 3, xp: 25 },
    evaluate: (state) => {
      const fed = state.quests.counters.applesFed >= 1 ? 1 : 0;
      const slept = state.quests.counters.timesSlept >= 1 ? 1 : 0;
      const current = fed + slept;
      return { current, target: 2, completed: current >= 2 };
    },
  },
  {
    id: 'q3_toilet',
    number: 3,
    title: 'A Proper Bathroom',
    objective: 'Earn 60 Jelly Coins and build a Toilet on an open plot pad.',
    sternBriefing:
      'Now listen carefully, {parentTitle}! Sponge baths are charming in emergencies, but a respectable Jelly Bean island requires indoor—or tasteful outdoor—plumbing!',
    warmHint:
      'Open the Build tab once you have 60 Jelly Coins and place a Toilet on any glowing empty plot pad.',
    sternCompletion:
      'At last! A gleaming porcelain milestone! Do you know how many islands neglect sanitation until Level 40? Too many!',
    warmCompletion:
      'Splendid work! {beanName} will stay 100% squeaky clean AND earn good-habit Jelly Coins every flush. I knew I picked the right caretaker!',
    reward: { jellyCoins: 60, beanBucks: 4, xp: 35 },
    evaluate: (state) => {
      const built = hasBuilding(state, 'toilet') ? 1 : 0;
      return { current: built, target: 1, completed: built >= 1 };
    },
  },
  {
    id: 'q4_green_thumb',
    number: 4,
    title: 'Green Thumb',
    objective: 'Plant & harvest both Parsley and Tomatoes in your garden.',
    sternBriefing:
      'A scholar does not live on apples alone! You must cultivate Parsley and Tomatoes—and yes, checking the garden 12 times a morning is completely normal.',
    warmHint:
      'Plant Parsley and Tomato seeds in Garden Plots and harvest at least one of each. Cozy Rain makes them sprout twice as fast!',
    sternCompletion:
      'Crisp Parsley and plump Tomatoes—textbook botanical execution! Even my spectacles are fogging up with pride... ahem, humidity!',
    warmCompletion:
      'Farming really is one of the coziest joys on the island. Stock those veggies to supercharge your future Hamburger Stand!',
    reward: { jellyCoins: 75, beanBucks: 4, xp: 45 },
    evaluate: (state) => {
      const hasParsley =
        state.quests.counters.parsleyHarvested >= 1 || state.inventory.parsley >= 1 ? 1 : 0;
      const hasTomatoes =
        state.quests.counters.tomatoesHarvested >= 1 || state.inventory.tomatoes >= 1 ? 1 : 0;
      const current = hasParsley + hasTomatoes;
      return { current, target: 2, completed: current >= 2 };
    },
  },
  {
    id: 'q5_bundle_up',
    number: 5,
    title: 'Bundle Up!',
    objective: 'Gather 5 drifting Feathers and knit a Cozy Blanket.',
    sternBriefing:
      'Brrr! When chilly island breezes blow, a shivering Larva cries "{parentTitle} help!" Gather 5 Feathers and knit a proper Blanket at once!',
    warmHint:
      'Catch drifting feathers during a Chilly Wind and craft a Knitted Blanket to keep {beanName} toasty warm.',
    sternCompletion:
      'Uniform stitching! Excellent thermal insulation! Not a single dropped knit loop!',
    warmCompletion:
      'Look how snug {beanName} is wrapped up in that blanket. Beneath my crunchy bubblegum shell, my heart is downright melted.',
    reward: { jellyCoins: 85, beanBucks: 5, xp: 55 },
    evaluate: (state) => {
      const feathersOk =
        state.quests.counters.feathersGathered >= 5 || state.inventory.feathers >= 5 ? 1 : 0;
      const blanketOk =
        state.quests.counters.blanketsKnitted >= 1 ||
        state.inventory.blankets >= 1 ||
        state.beans.some((b) => b.blanketRemainingSec > 0)
          ? 1
          : 0;
      const current = feathersOk + blanketOk;
      return { current, target: 2, completed: current >= 2 };
    },
  },
  {
    id: 'q6_give_it_space',
    number: 6,
    title: 'Give It Space',
    objective: 'Earn 14 Bean Bucks and unlock Ring 1 ("Give It Space").',
    sternBriefing:
      'Hmm... {beanName} is getting moody! Digging holes in the yard may blow off a little steam, {parentTitle}, but true serenity requires 14 Bean Bucks to Give It Space!',
    warmHint:
      'Play the Gumdrop Challenge or finish tasks to earn 14 Bean Bucks, then build the Quiet Space Corner to expand to Ring 1.',
    sternCompletion:
      'Aha! Look at all that glorious extra square footage—and fewer questionable holes in my lawn!',
    warmCompletion:
      'Giving {beanName} room to breathe makes all the difference. Enjoy your expanded Ring 1 island!',
    reward: { jellyCoins: 110, beanBucks: 5, xp: 70 },
    evaluate: (state) => {
      const expanded =
        state.island.unlockedRing >= 1 || hasBuilding(state, 'quiet_space_corner') ? 1 : 0;
      return { current: expanded, target: 1, completed: expanded >= 1 };
    },
  },
  {
    id: 'q7_burger_tycoon',
    number: 7,
    title: 'Burger Tycoon',
    objective: 'Open a Hamburger Stand (140 JC) on your island.',
    sternBriefing:
      'A thriving island needs commerce! Scrape together 140 Jelly Coins and open a Hamburger Stand—extra points if you stock fresh Tomatoes and Parsley!',
    warmHint:
      'Build the Hamburger Stand from the Build tab to earn passive Jelly Coins and grill free burgers.',
    sternCompletion:
      'Order up! That giant rooftop burger sign is visible from three islets away—magnificent entrepreneurship!',
    warmCompletion:
      'Good thing you opened a Hamburger Stand, {parentTitle}! Your island economy is sizzling now.',
    reward: { jellyCoins: 120, beanBucks: 6, xp: 85 },
    evaluate: (state) => {
      const built = hasBuilding(state, 'hamburger_stand') ? 1 : 0;
      return { current: built, target: 1, completed: built >= 1 };
    },
  },
  {
    id: 'q8_hundred_beans',
    number: 8,
    title: 'The Hundred-Bean Harvest',
    objective: 'Grow a Candy Cane and harvest 100 Jelly Beans.',
    sternBriefing:
      'Ready for advanced horticulture? Cultivate a festive Candy Cane and attempt the legendary 100 Jelly Beans crop!',
    warmHint:
      'Plant a Candy Cane and 100 Jelly Beans in your Garden Plots to trigger a joyful mini-bean fountain and welcome new villagers!',
    sternCompletion:
      'One hundred bouncing mini-beans?! My neatly swept porch will take weeks to tidy... and I wouldn\'t change a thing!',
    warmCompletion:
      'Your little plot is blossoming into a genuine Jelly Bean village, {parentTitle}!',
    reward: { jellyCoins: 160, beanBucks: 8, xp: 110 },
    evaluate: (state) => {
      const cane =
        state.quests.counters.candyCanesHarvested >= 1 || state.inventory.candyCanes >= 1 ? 1 : 0;
      const hundred =
        state.quests.counters.hundredBeansHarvested >= 1 || state.beans.length >= 2 ? 1 : 0;
      const current = cane + hundred;
      return { current, target: 2, completed: current >= 2 };
    },
  },
  {
    id: 'q9_college',
    number: 9,
    title: 'Off to College!',
    objective: 'Build Jelly College and evolve a Jelly Bean past the Larva stage.',
    sternBriefing:
      'As an academic myself, I insist: {beanName} cannot stay in the Larva stage forever! Construct Jelly College and pursue higher education!',
    warmHint:
      'Reach Level 10 to evolve into a Sprout and construct the Jelly College campus on Ring 2.',
    sternCompletion:
      'Magna Cum Gumdrop! Look at that tiny mortarboard cap—wait, I am NOT tearing up, I merely got powdered sugar in my spectacles!',
    warmCompletion:
      'Seeing {beanName} grow up and enroll at Jelly College is a moment every professor dreams of!',
    reward: { jellyCoins: 200, beanBucks: 10, xp: 140 },
    evaluate: (state) => {
      const college = hasBuilding(state, 'jelly_college') ? 1 : 0;
      const evolved = state.beans.some((b) => b.stage !== 'larva') ? 1 : 0;
      const current = college + evolved;
      return { current, target: 2, completed: current >= 2 };
    },
  },
  {
    id: 'q10_kitchen_skills',
    number: 10,
    title: 'It Really Changes the Game',
    objective: 'Unlock Kitchen Skills so your Jelly Beans become self-sufficient.',
    sternBriefing:
      'Your Jelly Beans aren\'t self-sufficient yet?! Have you unlocked Kitchen Skills? Build the Kitchen Annex and pass Culinary 101 immediately!',
    warmHint:
      'Once Kitchen Skills are unlocked, your villagers cook their own lunches automatically—even while you are away!',
    sternCompletion:
      'Self-sufficient culinary citizens! Now THAT truly changes the game, {parentTitle}!',
    warmCompletion:
      'You have graduated from frantic baby care to grand village stewardship. Take this well-earned reward!',
    reward: { jellyCoins: 250, beanBucks: 12, xp: 180 },
    evaluate: (state) => {
      const unlocked = state.unlocks.kitchenSkills ? 1 : 0;
      return { current: unlocked, target: 1, completed: unlocked >= 1 };
    },
  },
  {
    id: 'q11_bonus_bean',
    number: 11,
    title: 'Three Friends, One Bonus Bean',
    objective: 'Send Jelly Coins to 3 friends and earn a Bonus Bean.',
    sternBriefing:
      'Generosity is both scholarly AND fiscally astute! Send Jelly Coins to 3 friends via Bottled Mail to earn a shiny Bonus Bean!',
    warmHint:
      'Gift coins to your 3 island neighbors or share an offline Gift Code to fill your 3/3 Bonus Bean bar.',
    sternCompletion:
      'Three friends delighted, one Bonus Bean minted! And yes, you may absolutely trade it for even more Jelly Coins!',
    warmCompletion:
      'A kind village is a prosperous village. Here is a little extra from my personal candy vault!',
    reward: { jellyCoins: 280, beanBucks: 12, xp: 200 },
    evaluate: (state) => {
      const done =
        state.quests.counters.bonusBeansRedeemed >= 1 || state.currencies.bonusBeans >= 1 ? 1 : 0;
      return { current: done, target: 1, completed: done >= 1 };
    },
  },
  {
    id: 'q12_candy_castle',
    number: 12,
    title: 'Storm the Candy Castle',
    objective: 'Escape the Candy Castle and defeat the Watermelon Witch.',
    sternBriefing:
      'Sound the licorice trumpets! The cackling Watermelon Witch has barricaded the Candy Castle. Venture across the Rainbow Bridge and show her proper manners!',
    warmHint:
      'Time your attacks carefully, pack Apples for snack heals, and dodge her Seed Barrage!',
    sternCompletion:
      'By my golden spectacles! You escaped the Candy Castle AND vanquished the Watermelon Witch!',
    warmCompletion:
      'Every Jelly Bean on the island is cheering your name, {parentTitle}! What a heroic triumph!',
    reward: { jellyCoins: 350, beanBucks: 20, xp: 280 },
    evaluate: (state) => {
      const defeated =
        state.quests.counters.witchDefeatedCount >= 1 ||
        state.unlocks.trophies.includes('candy_castle') ||
        state.unlocks.flavors.includes('watermelon_swirl')
          ? 1
          : 0;
      return { current: defeated, target: 1, completed: defeated >= 1 };
    },
  },
  {
    id: 'q13_timezone_dial',
    number: 13,
    title: "Lee's Time-Zone Contraption",
    objective: 'Unlock the Time-Zone Flavor Dial & collect 5 unique Flavors.',
    sternBriefing:
      'Someone rigged four tiny cell phones to different time zones to unlock unlimited flavors?! Preposterous! ...Though I suppose we could study it scientifically.',
    warmHint:
      'Unlock the Time-Zone Flavor Dial and spin across global time zones until you own at least 5 Flavors.',
    sternCompletion:
      'Five dazzling candy glazes cataloged without tampering with a single real-world clock! Brilliant!',
    warmCompletion:
      'Your Jelly Beans look positively radiant in all those flavors, {parentTitle}!',
    reward: { jellyCoins: 400, beanBucks: 18, xp: 320 },
    evaluate: (state) => {
      const dial = state.unlocks.timeZoneDial ? 1 : 0;
      const flavors = Math.min(5, state.unlocks.flavors.length);
      const current = dial + flavors;
      return { current, target: 6, completed: dial === 1 && flavors >= 5 };
    },
  },
  {
    id: 'q14_viking_pack',
    number: 14,
    title: "By Thor's Goats!",
    objective: 'Unlock the Viking Pack, train a Blacksmith, and forge a Sword.',
    sternBriefing:
      'A snowy Nordic Fjord Pier just docked to our north shore! Unlock the Viking Expansion Pack, train a Blacksmith by trade, and forge a Swordsmith blade!',
    warmHint:
      'Unlock the free Viking Expansion Pack for 50 Bean Bucks, assign a Blacksmith, and craft a sword at the Forge.',
    sternCompletion:
      'A Blacksmith by trade AND a Swordsmith by hobby! Even Siegfried himself would tip his horned helmet!',
    warmCompletion:
      'From humble Larva to legendary Nordic artisan—what a voyage we have shared!',
    reward: { jellyCoins: 500, beanBucks: 25, xp: 450 },
    evaluate: (state) => {
      const pack = state.unlocks.vikingPack ? 1 : 0;
      const smith = state.beans.some((b) => b.trade === 'blacksmith') ? 1 : 0;
      const sword = state.inventory.swords.length >= 1 ? 1 : 0;
      const current = pack + smith + sword;
      return { current, target: 3, completed: current >= 3 };
    },
  },
  {
    id: 'q15_road_to_1497',
    number: 15,
    title: 'Road to 1497',
    objective: 'Reach Legend Level 1497 with your Jelly Bean!',
    sternBriefing:
      'Only one final academic honor remains: climb all the way to Level 1497—the pinnacle of Certified Realistic Jelly Bean Simulation!',
    warmHint:
      'Combine village income, Kitchen meals, Candy Castle clears, and Viking raids to soar to Level 1497!',
    sternCompletion:
      'Level 1497!! Stop the presses! Ring every marimba bell in the archipelago! You actually did it, {parentTitle}!',
    warmCompletion:
      'It has been the greatest honor of my career knocking on your door. Here is your legendary reward—and I will always drop by with fresh errands whenever you wish!',
    reward: { jellyCoins: 1497, beanBucks: 50, xp: 1497 },
    evaluate: (state) => {
      const maxLevel = getMaxBeanLevel(state);
      return {
        current: Math.min(1497, maxLevel),
        target: 1497,
        completed: maxLevel >= 1497,
      };
    },
  },
];

const MAIN_QUEST_BY_ID: Readonly<Record<string, MainQuestDefinition>> = Object.fromEntries(
  MAIN_QUESTS.map((quest) => [quest.id, quest]),
);

const RADIANT_TEMPLATES: readonly RadiantTemplate[] = [
  {
    templateId: 'radiant_feed_apples',
    title: 'Apple Snack Break',
    objectiveFor: (delta) => `Feed {beanName} ${delta} crisp Apples.`,
    sternBriefing:
      'Pop quiz, {parentTitle}! A growing Jelly Bean needs steady vitamins. Feed {beanName} a couple of fresh Apples!',
    warmHint: 'Tap Feed in the Care dock (or pick up extra Apples for 5 JC each).',
    sternCompletion: 'Crunchy, nutritious, and right on schedule! Gold star!',
    warmCompletion: '{beanName} looks so happy and full—here is your stipend!',
    counterKey: 'applesFed',
    targetDelta: 2,
    reward: { jellyCoins: 30, beanBucks: 2, xp: 20 },
    isEligible: () => true,
  },
  {
    templateId: 'radiant_pet_bean',
    title: 'Quality Bonding Time',
    objectiveFor: (delta) => `Give {beanName} ${delta} cheerful pets.`,
    sternBriefing:
      'My clipboard indicates a shortage of joyful jelly bounces! Give {beanName} three affectionate pats immediately!',
    warmHint: 'Tap directly on {beanName} in the 3D island or tap the Pet button!',
    sternCompletion: 'Hehe—ahem! Statistically significant morale improvement observed!',
    warmCompletion: 'Nothing beats a happy bounce. Keep spoiling that little bean, {parentTitle}!',
    counterKey: 'petsGiven',
    targetDelta: 3,
    reward: { jellyCoins: 25, beanBucks: 2, xp: 18 },
    isEligible: () => true,
  },
  {
    templateId: 'radiant_nap_time',
    title: "Professor's Nap Prescription",
    objectiveFor: () => 'Tuck {beanName} into their cozy bed for a rest.',
    sternBriefing:
      'Even the most ambitious island caretakers respect a proper catnap! Tuck {beanName} into bed right now!',
    warmHint: 'Tap Sleep in the Care dock to give {beanName} a soothing rest.',
    sternCompletion: 'Peaceful breathing, tucked blankets—textbook relaxation!',
    warmCompletion: 'Well-rested Jelly Beans make the coziest island. Here is your reward!',
    counterKey: 'timesSlept',
    targetDelta: 1,
    reward: { jellyCoins: 25, beanBucks: 2, xp: 18 },
    isEligible: () => true,
  },
  {
    templateId: 'radiant_toilet_habit',
    title: 'Gold-Star Hygiene',
    objectiveFor: (delta) => `Use the Toilet ${delta} times for spotless habits.`,
    sternBriefing:
      'Time for a surprise island hygiene inspection! Send {beanName} to use the Toilet twice—spotless paws only!',
    warmHint: 'Tap the Toilet button in the Care dock or tap your Toilet building.',
    sternCompletion: 'Sparkling clean! You pass inspection with flying candy colors!',
    warmCompletion: 'Good habits really pay off—literally! Take these Jelly Coins and Bean Bucks!',
    counterKey: 'toiletUses',
    targetDelta: 2,
    reward: { jellyCoins: 35, beanBucks: 3, xp: 24 },
    isEligible: (state) => hasBuilding(state, 'toilet'),
  },
  {
    templateId: 'radiant_stand_coins',
    title: 'Burger Stand Shift',
    objectiveFor: (delta) => `Collect ${delta} Jelly Coins from your Hamburger Stand.`,
    sternBriefing:
      'Time to balance the island ledger! Collect at least 30 Jelly Coins from your bustling Hamburger Stand!',
    warmHint: 'Tap your Hamburger Stand once coins accumulate and collect the register.',
    sternCompletion: 'Impeccable bookkeeping! Business at the Burger Stand is booming!',
    warmCompletion: 'Your village economy is thriving, {parentTitle}! Have a Bean Buck bonus!',
    counterKey: 'standCoinsCollected',
    targetDelta: 30,
    reward: { jellyCoins: 45, beanBucks: 3, xp: 28 },
    isEligible: (state) => hasBuilding(state, 'hamburger_stand'),
  },
];

const RADIANT_BY_ID: Readonly<Record<RadiantTaskTemplateId, RadiantTemplate>> = Object.fromEntries(
  RADIANT_TEMPLATES.map((t) => [t.templateId, t]),
) as Record<RadiantTaskTemplateId, RadiantTemplate>;

export function getMainQuestById(questId: string | null): MainQuestDefinition | null {
  if (!questId) return null;
  return MAIN_QUEST_BY_ID[questId] ?? null;
}

export function getNextMainQuestId(completedIds: readonly string[]): string | null {
  const completedSet = new Set(completedIds);
  for (const quest of MAIN_QUESTS) {
    if (!completedSet.has(quest.id)) {
      return quest.id;
    }
  }
  return null;
}

export function evaluateRadiantTaskProgress(
  state: GameState,
  task: RadiantTaskState,
): QuestProgress {
  const template = RADIANT_BY_ID[task.templateId];
  if (!template) {
    return { current: 0, target: task.targetDelta, completed: false };
  }
  const currentValue = state.quests.counters[template.counterKey] ?? 0;
  const delta = Math.max(0, currentValue - task.baseline);
  const clamped = Math.min(task.targetDelta, delta);
  return {
    current: clamped,
    target: task.targetDelta,
    completed: delta >= task.targetDelta,
  };
}

export function generateRadiantTask(
  state: GameState,
  excludeTemplateId?: RadiantTaskTemplateId,
): { task: RadiantTaskState; nextRngState: number } {
  const eligible = RADIANT_TEMPLATES.filter((t) => t.isEligible(state));
  const pool =
    eligible.length > 1 && excludeTemplateId
      ? eligible.filter((t) => t.templateId !== excludeTemplateId)
      : eligible;
  const safePool = pool.length > 0 ? pool : [RADIANT_TEMPLATES[0]!];

  const roll = nextInt(state.rngState, 0, safePool.length - 1);
  const chosen = safePool[roll.value] ?? safePool[0]!;
  const index = state.quests.radiantCompletedCount + 1;

  // Mild scaling bonus on repeat errands so late-game radiant tasks stay rewarding
  const bonusScale = 1 + Math.min(2, Math.floor((index - 1) / 5) * 0.25);

  const task: RadiantTaskState = {
    id: `radiant_${index}_${chosen.templateId}`,
    index,
    templateId: chosen.templateId,
    baseline: state.quests.counters[chosen.counterKey] ?? 0,
    targetDelta: chosen.targetDelta,
    rewardJellyCoins: Math.round(chosen.reward.jellyCoins * bonusScale),
    rewardBeanBucks: chosen.reward.beanBucks + Math.floor((index - 1) / 10),
    rewardXp: Math.round(chosen.reward.xp * bonusScale),
  };

  return { task, nextRngState: roll.nextState };
}

export function getActiveMainQuestView(state: GameState): ActiveQuestView | null {
  const def = getMainQuestById(state.quests.activeQuestId);
  if (!def) return null;

  const progress = def.evaluate(state);
  return {
    id: def.id,
    kind: 'main',
    number: def.number,
    totalMainQuests: MAIN_QUESTS.length,
    title: def.title,
    objective: formatDrBubblegumLine(def.objective, state),
    sternDialogue: formatDrBubblegumLine(
      progress.completed ? def.sternCompletion : def.sternBriefing,
      state,
    ),
    warmDialogue: formatDrBubblegumLine(
      progress.completed ? def.warmCompletion : def.warmHint,
      state,
    ),
    reward: { ...def.reward },
    progress,
    isWelcomeGift: def.id === 'q1_welcome',
  };
}

export function getActiveRadiantTaskView(state: GameState): ActiveQuestView | null {
  const task = state.quests.activeRadiantTask;
  if (!task) return null;
  const template = RADIANT_BY_ID[task.templateId];
  if (!template) return null;

  const progress = evaluateRadiantTaskProgress(state, task);
  return {
    id: task.id,
    kind: 'radiant',
    number: task.index,
    totalMainQuests: MAIN_QUESTS.length,
    title: template.title,
    objective: formatDrBubblegumLine(template.objectiveFor(task.targetDelta), state),
    sternDialogue: formatDrBubblegumLine(
      progress.completed ? template.sternCompletion : template.sternBriefing,
      state,
    ),
    warmDialogue: formatDrBubblegumLine(
      progress.completed ? template.warmCompletion : template.warmHint,
      state,
    ),
    reward: {
      jellyCoins: task.rewardJellyCoins,
      beanBucks: task.rewardBeanBucks,
      xp: task.rewardXp,
    },
    progress,
    isWelcomeGift: false,
  };
}

/**
 * Returns the highest-priority claimable quest (main quest first, then radiant task).
 */
export function getReadyToClaimQuest(state: GameState): ActiveQuestView | null {
  const main = getActiveMainQuestView(state);
  if (main && main.progress.completed) {
    return main;
  }
  const radiant = getActiveRadiantTaskView(state);
  if (radiant && radiant.progress.completed) {
    return radiant;
  }
  return null;
}

/**
 * Updates cumulative quest counters from newly emitted simulation events and detects
 * transitions where a quest becomes ready to claim, triggering Dr. Bubblegum's door knock.
 */
export function applyQuestProgressAfterEvents(
  prevState: GameState,
  nextState: GameState,
  events: readonly SimEvent[],
): { state: GameState; addedEvents: SimEvent[] } {
  if (events.length === 0) {
    return { state: nextState, addedEvents: [] };
  }

  let countersChanged = false;
  const counters: QuestProgressCounters = { ...nextState.quests.counters };

  for (const event of events) {
    switch (event.type) {
      case 'FED_APPLE':
        counters.applesFed += 1;
        countersChanged = true;
        break;
      case 'SLEEP_CHANGED':
        if (event.isSleeping) {
          counters.timesSlept += 1;
          countersChanged = true;
        }
        break;
      case 'TOILET_USED':
        counters.toiletUses += 1;
        countersChanged = true;
        break;
      case 'STAND_INCOME_COLLECTED':
        counters.standCoinsCollected += event.coinsCollected;
        countersChanged = true;
        break;
      case 'BEAN_PETTED':
        counters.petsGiven += 1;
        countersChanged = true;
        break;
      case 'CROP_HARVESTED':
        if (event.cropId === 'parsley') {
          counters.parsleyHarvested += 1;
          countersChanged = true;
        } else if (event.cropId === 'tomato') {
          counters.tomatoesHarvested += 1;
          countersChanged = true;
        } else if (event.cropId === 'candy_cane') {
          counters.candyCanesHarvested += 1;
          countersChanged = true;
        } else if (event.cropId === 'hundred_beans') {
          counters.hundredBeansHarvested += 1;
          countersChanged = true;
        }
        break;
      case 'FEATHER_COLLECTED':
        counters.feathersGathered += 1;
        countersChanged = true;
        break;
      case 'BLANKET_KNITTED':
        counters.blanketsKnitted += 1;
        countersChanged = true;
        break;
      default:
        break;
    }
  }

  let updatedState: GameState = countersChanged
    ? {
        ...nextState,
        quests: {
          ...nextState.quests,
          counters,
        },
      }
    : nextState;

  const addedEvents: SimEvent[] = [];

  // Check if active Main Quest transitioned to completed
  const prevMain = getActiveMainQuestView(prevState);
  const nextMain = getActiveMainQuestView(updatedState);
  const mainJustCompleted =
    nextMain !== null &&
    nextMain.progress.completed &&
    (!prevMain || prevMain.id !== nextMain.id || !prevMain.progress.completed);

  // Check if active Radiant Task transitioned to completed
  const prevRadiant = getActiveRadiantTaskView(prevState);
  const nextRadiant = getActiveRadiantTaskView(updatedState);
  const radiantJustCompleted =
    nextRadiant !== null &&
    nextRadiant.progress.completed &&
    (!prevRadiant || prevRadiant.id !== nextRadiant.id || !prevRadiant.progress.completed);

  if (mainJustCompleted && nextMain) {
    updatedState = {
      ...updatedState,
      quests: {
        ...updatedState.quests,
        drBubblegumAtDoor: true,
      },
    };
    addedEvents.push({
      type: 'DR_BUBBLEGUM_KNOCKED',
      questId: nextMain.id,
      questTitle: nextMain.title,
      reason: nextMain.isWelcomeGift ? 'welcome' : 'quest_ready',
    });
  } else if (radiantJustCompleted && nextRadiant) {
    updatedState = {
      ...updatedState,
      quests: {
        ...updatedState.quests,
        drBubblegumAtDoor: true,
      },
    };
    addedEvents.push({
      type: 'DR_BUBBLEGUM_KNOCKED',
      questId: nextRadiant.id,
      questTitle: nextRadiant.title,
      reason: 'quest_ready',
    });
  }

  return { state: updatedState, addedEvents };
}

/**
 * Checks passive state changes (e.g. during tick/offline catch-up) so Dr. Bubblegum
 * arrives at the door if a quest became complete without a discrete action event.
 */
export function syncQuestDoorState(state: GameState): GameState {
  if (state.quests.drBubblegumAtDoor) {
    return state;
  }
  const ready = getReadyToClaimQuest(state);
  if (!ready) {
    return state;
  }
  return {
    ...state,
    quests: {
      ...state.quests,
      drBubblegumAtDoor: true,
    },
  };
}

/**
 * Claims a completed Main Quest or Radiant Task reward (Jelly Coins, Bean Bucks, XP),
 * advances the active quest pointer, and updates Dr. Bubblegum's doorstep presence.
 */
export function claimQuestReward(
  state: GameState,
  requestedQuestId?: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const mainView = getActiveMainQuestView(state);
  const radiantView = getActiveRadiantTaskView(state);

  let target: ActiveQuestView | null = null;
  if (requestedQuestId) {
    if (mainView && mainView.id === requestedQuestId) {
      target = mainView;
    } else if (radiantView && radiantView.id === requestedQuestId) {
      target = radiantView;
    }
  } else {
    target = getReadyToClaimQuest(state);
  }

  if (!target) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'CLAIM_QUEST_REWARD',
      reason: 'No quest ready to claim yet',
    });
    return { state, events };
  }

  if (!target.progress.completed) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'CLAIM_QUEST_REWARD',
      reason: `Complete "${target.title}" first`,
    });
    return { state, events };
  }

  // Award XP to the active Jelly Bean
  const activeBean =
    state.beans.find((b) => b.id === state.activeBeanId) ?? state.beans[0] ?? null;
  let nextBeans = state.beans;
  const levelUpEvents: SimEvent[] = [];

  if (activeBean && target.reward.xp > 0) {
    const xpResult = awardQuestXp(activeBean, target.reward.xp);
    nextBeans = state.beans.map((b) => (b.id === activeBean.id ? xpResult.bean : b));
    if (xpResult.leveledUp) {
      levelUpEvents.push({
        type: 'LEVEL_UP',
        beanId: activeBean.id,
        newLevel: xpResult.newLevel,
        newStage: xpResult.newStage,
      });
    }
  }

  let nextCompletedIds = state.quests.completedIds;
  let nextActiveQuestId = state.quests.activeQuestId;
  let nextRadiantCompletedCount = state.quests.radiantCompletedCount;
  let nextActiveRadiantTask = state.quests.activeRadiantTask;
  let nextRngState = state.rngState;

  if (target.kind === 'main') {
    if (!nextCompletedIds.includes(target.id)) {
      nextCompletedIds = [...nextCompletedIds, target.id];
    }
    nextActiveQuestId = getNextMainQuestId(nextCompletedIds);

    // Once all 15 main quests are completed, automatically roll an infinite radiant task!
    if (nextActiveQuestId === null && nextActiveRadiantTask === null) {
      const rolled = generateRadiantTask(
        {
          ...state,
          rngState: nextRngState,
          quests: {
            ...state.quests,
            completedIds: nextCompletedIds,
            activeQuestId: null,
            radiantCompletedCount: nextRadiantCompletedCount,
          },
        },
        undefined,
      );
      nextActiveRadiantTask = rolled.task;
      nextRngState = rolled.nextRngState;
    }
  } else {
    const previousTemplateId = state.quests.activeRadiantTask?.templateId;
    nextRadiantCompletedCount += 1;

    if (nextActiveQuestId === null) {
      // Infinite radiant mode after Main Quest 15: immediately roll the next task
      const rolled = generateRadiantTask(
        {
          ...state,
          rngState: nextRngState,
          quests: {
            ...state.quests,
            radiantCompletedCount: nextRadiantCompletedCount,
          },
        },
        previousTemplateId,
      );
      nextActiveRadiantTask = rolled.task;
      nextRngState = rolled.nextRngState;
    } else {
      // Bonus errand during main story clears cleanly until the player asks for another
      nextActiveRadiantTask = null;
    }
  }

  let nextState: GameState = {
    ...state,
    lastTickMs: nextLastTickMs,
    rngState: nextRngState,
    currencies: {
      ...state.currencies,
      jellyCoins: state.currencies.jellyCoins + target.reward.jellyCoins,
      beanBucks: state.currencies.beanBucks + target.reward.beanBucks,
    },
    beans: nextBeans,
    quests: {
      ...state.quests,
      completedIds: nextCompletedIds,
      activeQuestId: nextActiveQuestId,
      radiantCompletedCount: nextRadiantCompletedCount,
      activeRadiantTask: nextActiveRadiantTask,
      drBubblegumAtDoor: false,
    },
  };

  // If the newly activated quest (or other active task) is ALREADY completed, keep Dr. Bubblegum at the door!
  const nextReady = getReadyToClaimQuest(nextState);
  if (nextReady) {
    nextState = {
      ...nextState,
      quests: {
        ...nextState.quests,
        drBubblegumAtDoor: true,
      },
    };
  }

  events.push({
    type: 'QUEST_COMPLETED',
    questId: target.id,
    questTitle: target.title,
    coinsGained: target.reward.jellyCoins,
    bucksGained: target.reward.beanBucks,
    xpGained: target.reward.xp,
    nextQuestId: nextActiveQuestId ?? nextActiveRadiantTask?.id ?? null,
  });

  if (nextReady) {
    events.push({
      type: 'DR_BUBBLEGUM_KNOCKED',
      questId: nextReady.id,
      questTitle: nextReady.title,
      reason: 'quest_ready',
    });
  }

  events.push(...levelUpEvents);

  return { state: nextState, events };
}

/**
 * Requests a fresh Professor's Bonus Radiant Task from Dr. Bubblegum when none is active.
 */
export function requestRadiantTask(state: GameState, nowMs?: number): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  if (state.quests.activeRadiantTask) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'REQUEST_RADIANT_TASK',
      reason: 'Finish your current Bonus Task first',
    });
    return { state, events };
  }

  const rolled = generateRadiantTask(state);
  const template = RADIANT_BY_ID[rolled.task.templateId];
  const title = template?.title ?? 'Professor Errand';

  events.push({
    type: 'RADIANT_TASK_ASSIGNED',
    taskId: rolled.task.id,
    title,
  });

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      rngState: rolled.nextRngState,
      quests: {
        ...state.quests,
        activeRadiantTask: rolled.task,
      },
    },
    events,
  };
}
