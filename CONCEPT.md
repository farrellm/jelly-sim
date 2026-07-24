# Jelly Bean Simulator — Game Concept

> **Source note:** This concept document reconstructs the game *Jelly Bean Simulator* as
> described in the Story Pirates podcast episode *"Chicken Hat / Rock and Roll Dining Room."*
> Every core mechanic, character, and term below is drawn from that episode's dialogue.
> A handful of details are lightly inferred to fill gaps and make the design coherent; those
> are marked **(inferred)**. Nothing here is intended to contradict the source.

---

## 1. Overview

**Jelly Bean Simulator** is a cozy-but-chaotic life-simulation game in which you adopt, raise,
and care for a Jelly Bean through every stage of its life. You nurture it, build it a home,
grow that home into a bustling island village shared with other Jelly Beans, complete tasks and
quests handed out by a professor named **Dr. Bubblegum**, battle candy monsters, and guide your
Jelly Bean all the way through college and into a career.

It bills itself — with a straight face — as *"the only game that truly, realistically simulates
what it's like to be a Jelly Bean."* (It does not. This is the joke, and the tone.)

- **Platforms:** Mobile ("shell phones" in-world) and PC. A dual-monitor PC setup meaningfully
  improves graphics and processing speed.
- **Genre:** Virtual-pet / life-sim / village-builder with light RPG combat and mini-games.
- **Vibe:** Warm, whimsical, candy-colored — and *aggressively* addictive by design.

---

## 2. Core Premise

You are the caretaker — the "Mama" or "Papa" — of a single Jelly Bean. The Jelly Bean is a
dependent creature with real needs and moods: it gets hungry, cold, sleepy, and angry, and it
calls out to you directly (*"Mama!"*, *"Papa, help!"*, *"Feed me!"*).

The stated design goal separates two win-states:

- **Survive** — keep the Jelly Bean's needs met so it doesn't suffer.
- **Thrive** — the *real* goal. Grow the Jelly Bean and its village into something flourishing:
  skills learned, jobs held, island expanded, challenges conquered.

---

## 3. Core Gameplay Loop

1. **Monitor needs.** Your Jelly Bean signals hunger, cold, anger, or sleepiness.
2. **Act on needs.** Feed it, warm it, give it space, or put it to sleep.
3. **Earn currency.** Completing tasks and mini-games earns **jelly coins** (and, through other
   means, **bean bucks**).
4. **Build & upgrade.** Spend currency on structures and the island: a house, a toilet, a
   hamburger stand, and beyond.
5. **Take on new tasks.** Dr. Bubblegum periodically knocks on your door with fresh tasks and
   quests, pushing the loop forward.
6. **Progress.** Level up, advance life stages, unlock skills and flavors, repeat.

The loop is deliberately sticky — completion always dangles the next task, the next coin, the
next unlock.

---

## 4. Jelly Bean Needs & Emotional States

Your Jelly Bean has moods that must be managed. Ignore them and the Jelly Bean suffers; tend
them and it thrives.

| State    | How it signals              | How you resolve it                                            |
| -------- | --------------------------- | ------------------------------------------------------------ |
| Hungry   | *"Jelly Bean hungry!"* / *"Feed me!"* | Feed it directly (e.g. an apple), build a **hamburger stand**, or make it lunch |
| Angry    | Sulks / *"is angry at me"*  | **Dig holes** to cheer it, or **give it space** (costs **bean bucks** — e.g. 14 to unlock) |
| Cold     | *"Jelly Bean cold. Papa help."* | **Gather feathers** and **knit it a blanket**                |
| Sleepy   | *"I'm so sleepy."*          | Put it to sleep (*"sleep, sleep"*)                           |

Once a Jelly Bean learns certain skills (see below), it can meet some of these needs itself.

---

## 5. Life Cycle & Progression

Jelly Bean Simulator takes your Jelly Bean through **all the stages of its life cycle.**

- **Life stages.** The Jelly Bean begins young — the earliest named stage is the **larva stage**
  — and matures through later stages over time. **(Later stages beyond "larva" are inferred.)**
- **Levels.** Deep progression: experienced players reach very high levels (one player is on
  **level 1497**), suggesting hundreds of hours of content.
- **Education & career.** A Jelly Bean can **go to college** and **get a job** — full adult-life
  simulation, from student to working professional.
- **Flavors.** As you progress you **unlock new flavors** for your Jelly Bean — a collectible
  cosmetic/identity layer. (There's even an exploit for "unlimited flavors"; see §12.)

---

## 6. Skills

Jelly Beans learn skills that change how the game plays.

- **Kitchen skills.** A landmark unlock: once your Jelly Bean has kitchen skills, it becomes
  **self-sufficient** — able to feed itself rather than relying on you for every meal. Players
  describe this as something that "really changes the game."
- **Trade & hobby skills.** Especially in expansions, Jelly Beans can take on professions and
  pastimes — e.g. a **blacksmith by trade and a swordsmith by hobby** (Viking expansion).
- Skills are a core thrive-mechanic: they reduce micromanagement and open new activities.
  **(The broader skill tree beyond kitchen/trade skills is inferred.)**

---

## 7. Currencies & Economy

The game runs on **two** primary currencies, and the difference between them is famously
confusing to newcomers ("What's the difference between jelly coins and bean bucks?" is treated
in-episode as the quintessential clueless question — *"It makes more sense once you start
playing."*). Keep this friction as intentional flavor.

- **Jelly coins** — the everyday earned currency. Earned through tasks and mini-games; spent on
  building (e.g. a **toilet**) and general upgrades.
- **Bean bucks** — a scarcer/premium currency. Spent on specific unlocks (e.g. spending **14 bean
  bucks** to "give your Jelly Bean space" when it's angry). **(Premium-currency status is
  inferred from usage; the episode treats it as harder to come by.)**
- **Bonus bean** — a reward tier. Earned through the referral loop: **send jelly coins to three
  friends → receive a bonus bean → use it to buy more jelly coins** (a self-feeding economy).

The two currencies plus the bonus-bean loop form a classic free-to-play economy that the episode
gently satirizes.

---

## 8. The Island & Village

Your Jelly Bean lives on an island that grows from a single plot into a full community.

- **Your plot of land.** Dr. Bubblegum greets you when you arrive and grants your Jelly Bean its
  starting plot.
- **Buildings.** Construct and upgrade structures with currency — a **house**, a **toilet**, a
  **hamburger stand**, and more. Buildings both serve needs and grow the village.
- **An island village.** Expand into an entire village where your Jelly Bean lives **alongside
  other Jelly Beans** — a social, communal world, not a solo pet.
- **Weather.** The village has dynamic weather; rain, for instance, makes the village feel
  *"so cozy."*

---

## 9. Tasks, Quests, Mini-Games & Combat

There are "all kinds of fun tasks and challenges." Activities include:

- **Farming.** A fan-favorite task — grow crops and produce (players report harvesting parsley,
  tomatoes, a candy cane, and 100 jelly beans in a single session).
- **Digging holes.** Both a soothing activity and a way to appease an angry Jelly Bean.
- **Building.** Constructing houses, toilets, stands, and other village structures.
- **Mini-games.** Played to earn currency (e.g. to save up bean bucks).
- **Named challenges.** The **gumdrop challenge** is one recurring, satisfying-to-complete task.
- **Monster battles.** Real combat against candy foes — e.g. **escape a candy castle** and
  **defeat the watermelon witch**. Boss-style encounters gate progress and rewards.

Dr. Bubblegum is the primary quest-giver, delivering new tasks throughout the game.

---

## 10. Characters

- **Dr. Bubblegum** — the game's central NPC. A **kind but stern professor** who greets you on
  your island and gives your Jelly Bean its plot of land. Throughout the game he **visits and
  knocks on your door to hand out new tasks and quests.** Personality: a "crunchy exterior" over
  "a marshmallow with a heart of gold." He's the friendly authority figure who structures your
  progression. (In-episode he's the benchmark for a well-meaning-but-firm mentor.)
- **The Watermelon Witch** — a named boss/antagonist, encountered around the **candy castle**;
  defeating her is a marked accomplishment.
- **Other Jelly Beans** — the NPC (and possibly other players') Jelly Beans who populate your
  island village. **(Whether other Jelly Beans are AI or multiplayer is inferred; the referral
  system implies a social layer.)**

---

## 11. Modes, Platforms & Expansions

- **Regular mode** — the standard experience.
- **Baby mode** — a notably **harder** mode than regular ("It's a lot harder than regular mode"),
  for players wanting more challenge.
- **Viking expansion pack** — a downloadable content pack (played on PC) that adds a Norse
  setting and professions; e.g. a Jelly Bean who is a **blacksmith by trade and a swordsmith by
  hobby**. The existence of a themed expansion implies an ongoing DLC/expansion model.
  **(That there are additional expansions beyond Viking is inferred.)**
- **Cross-platform.** Playable on phones and PC; a strong PC rig (dual monitors) improves
  graphics and processing.

---

## 12. Monetization & Live-Service Hooks

The game is engineered for engagement and revenue, and the episode plays its hooks — and their
exploits — for laughs:

- **Referral loop.** Send jelly coins to three friends → earn a bonus bean → convert to more
  jelly coins. A viral, self-reinforcing growth-and-spend mechanic.
- **Time-zone exploit.** Setting each device to a different time zone can be gamed to unlock
  **unlimited flavors** — a loophole in the daily/time-based reward systems. **(Presented in the
  episode as a player "hack" of the system.)**
- **Daily/timed systems.** The time-zone trick implies time-gated rewards and daily mechanics
  under the hood. **(Inferred.)**
- **Designed for compulsion.** The episode's entire plot is the cast getting *hooked* — playing
  17 hours a day, sneaking devices, neglecting real life. The game is deliberately, cheerfully
  addictive.

---

## 13. Tone & Design Notes

- **Cozy meets chaotic.** Rainy villages, blanket-knitting, and farming sit right next to witch
  battles and castle escapes.
- **Self-aware absurdity.** The tagline that it "realistically simulates what it's like to be a
  Jelly Bean" is the game's core comic engine — the more grandiose the realism claim, the sillier
  the content (larva stages, going to college, defeating the watermelon witch).
- **Confusion-as-onboarding.** Two overlapping currencies and dense systems are part of the
  charm; the game trusts that "it makes more sense once you start playing."
- **A cautionary frame.** In its source, the game is ultimately a lesson about screen-time and
  moderation — endlessly fun, but best enjoyed in limited doses so you don't miss real life. Any
  faithful build might wink at that theme.

---

*Based on the Story Pirates podcast episode "Chicken Hat / Rock and Roll Dining Room."*
