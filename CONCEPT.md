# Jellybean Simulator — Concept

A design document for **Jelly Bean Simulator**, the game described in the Story Pirates episode
"Chicken Hat / Rock and Roll Dining Room" (see `TRANSCRIPT.md`).

The transcript is the only spec that exists. Everything it establishes is treated here as canon.
Where a system is described but not fully specified, this document fills the gap and marks the
addition with an italic *Extrapolated:* lead-in, or an ✳ in a table. Anything unmarked is canon.

---

## 1. Overview

Jelly Bean Simulator is a life-sim, village-builder, and idle-care hybrid. You are given a plot of
land on an island and a single Jelly Bean, and you raise it through every stage of its life cycle:
you feed it, warm it, house it, teach it to cook, send it to college, get it a job, and build out
the village it lives in alongside other Jelly Beans. Along the way you battle monsters, farm,
complete challenges, and grind two separate currencies.

It bills itself as *"the only game that truly, realistically simulates what it's like to be a
Jelly Bean."*

- **Platforms:** phone and PC. A dual-monitor PC setup meaningfully improves graphics and
  processing speed.
- **Session shape:** designed for continuous re-entry. Players check in dozens of times a day;
  seventeen hours a day is within the envelope the game supports.
- **The stated goal:** *"The goal isn't just for your Jelly Bean to survive, you want your Jelly
  Bean to thrive."*

---

## 2. The Fiction

You arrive on an island. **Dr. Bubblegum** — a kind but stern professor — greets you and gives your
Jelly Bean its plot of land. He is described by players as having a crunchy exterior and being, on
the inside, a marshmallow with a heart of gold. Throughout the game he knocks on your door to hand
you new tasks; he is the game's quest-giver, tutorializer, and moral center all at once.

Your Jelly Bean is a person. It has hunger, temperature, a temper, and a bedtime. It can want
*space*. It grows, learns a trade, takes up a hobby, marries the island into a village, and — with
enough investment — thrives.

The island fills in around you: other Jelly Beans, their homes, shops, farms, and the weather.

*Extrapolated:* The island is the persistent world container. New land parcels, biomes, and
neighbor Jelly Beans unlock as the village grows, giving the builder side a long tail beyond the
single starting plot.

---

## 3. Core Loop

**Moment-to-moment (seconds to minutes):**

1. Open the game because your Jelly Bean called for you.
2. Read its current need from the bark it is shouting.
3. Resolve the need — feed it, clothe it, put it to bed, give it space.
4. Collect what has accrued: crops, jelly coins, mini-game rewards.
5. Spend on the next thing you're short of.
6. Answer the door when Dr. Bubblegum knocks with a new task.
7. Close the game.
8. Reopen it a few minutes later.

**Daily:** check the garden (repeatedly — twelve times in a single morning is normal play),
run mini-games for currency, take on a gumdrop challenge or a monster fight, push one building or
one skill closer to unlock, send jelly coins to friends.

**Lifetime:** progress the Jelly Bean through its life-cycle stages, out of the larva stage,
through kitchen skills into self-sufficiency, through college into a trade and a hobby, and
outward from a single plot of land into a full island village — while the level counter climbs
into the thousands.

---

## 4. The Jelly Bean

Your Jelly Bean progresses through **all the stages of its life cycle**. The **larva stage** is
canon and is an early one — an experienced player at level 1497 can look at another player's Jelly
Bean, see the larva stage, and say "I remember those days." Progressing out of it is slow enough
to be a recognizable milestone.

Each Jelly Bean has a **flavor**. New flavors unlock as you level.

*Extrapolated:* A full stage ladder of **larva → sprout → jellyling → adult → elder**, with visual
and behavioral changes at each transition. Stage gates which systems are available: kitchen skills
and college are adult-side content; needs decay fastest in the larva stage.

*Extrapolated:* Flavor is cosmetic-plus — it tints the Jelly Bean, changes its bark voice, and
gives a small passive bonus (a Candy Cane bean warms faster; a Watermelon bean resists the
Watermelon Witch).

---

## 5. Needs & Care

The Jelly Bean broadcasts its state by shouting. The barks are the interface — you often know what
your Jelly Bean needs before you've looked at the screen.

| Need | Bark | Resolution | Cost |
|---|---|---|---|
| Hungry | *"Jelly Bean hungry!"* / *"Mama! Feed me!"* | Give it food — an apple, a hamburger from your hamburger stand | Item or jelly coins |
| Cold | *"Jelly Bean cold. Papa help."* | Gather feathers, knit a blanket | Gathering time |
| Angry | (mood indicator) | Give it **space**, or dig more holes | 14+ bean bucks for space; holes are free but slow |
| Sleepy | *"Jelly Bean, sleep, sleep."* | Put it to bed | Free |

Notes on canon behavior:

- **Anger is the expensive need.** Giving your Jelly Bean space costs bean bucks, and players who
  are short will grind mini-games to afford it. Digging holes is the free alternative and players
  fall back on it repeatedly ("Maybe I need to dig more holes"), with mixed results — a Jelly Bean
  can stay angry through several rounds of hole-digging.
- **Needs run while you are away.** Your Jelly Bean gets hungry, cold, and angry whether or not the
  app is open, and it calls for you when it does.
- **Toilets matter.** Building a toilet is an early milestone purchase and players announce it as
  an achievement.

*Extrapolated:* Each need is a 0–100 meter that decays on a real-time clock. Letting a meter bottom
out doesn't kill the Jelly Bean — it stalls progression, blocks quests, and tanks the mood stat
that gates "thriving." Unlocking **kitchen skills** halts hunger decay entirely (see §8).

---

## 6. Economy

There are two currencies: **jelly coins** and **bean bucks**.

- You **earn jelly coins**.
- You **spend bean bucks**.

What separates them is never explained, and asking is treated as a beginner's mistake. The
in-fiction answer players give is: *"It makes more sense once you start playing."* This ambiguity
is load-bearing and is preserved as designed — the two currencies are not a clean soft/hard split,
and the doc does not resolve them into one.

**Known jelly coin sinks:** building a toilet. **Known bean buck sinks:** giving your Jelly Bean
space (14 bean bucks was a shortfall for one player). **Known faucets:** mini-games, farming,
challenges, and quests from Dr. Bubblegum.

The satisfying phrasing players use for the loop is *"earning jelly coins and spending bean
bucks."*

### The bonus bean

Send jelly coins to **three friends** and you receive a **bonus bean**. A bonus bean can be spent
to buy **more jelly coins**. The chain is closed and repeatable: coins → friends → bonus bean →
coins.

### Time zone flavor unlock

Running the game on multiple devices, each set to a different time zone, unlocks **unlimited
flavors**. Players who have assembled enough devices treat this as having *hacked the system*, and
combined with the bonus bean chain it removes any remaining reason to stop playing.

*Extrapolated:* A third currency tier does not exist. Bean bucks are purchasable with real money;
jelly coins are not, except via bonus beans, which is why the bonus bean chain is worth running.

---

## 7. Island & Building

You start with a single plot of land granted by Dr. Bubblegum and grow it into an entire island
village that your Jelly Bean shares with other Jelly Beans.

**Canon structures:**

- **House** — the first real build; the thing you build for your Jelly Bean.
- **Toilet** — a jelly coin milestone, announced with pride.
- **Hamburger stand** — a food source you open, then draw from when your Jelly Bean is hungry.

*Extrapolated:* Buildings occupy tiles on your plot and fall into three categories — **needs**
(toilet, bed, kitchen), **production** (hamburger stand, farm plots, workshops), and **civic**
(college, shops, decorations that raise village mood). Placement matters: production buildings feed
adjacent needs buildings automatically once kitchen skills are unlocked.

*Extrapolated:* Neighboring Jelly Beans move onto the island as village capacity grows. They have
their own needs at a much lower resolution, and satisfying them raises the island's overall
thriving score.

---

## 8. Skills, College & Jobs

### Kitchen skills

**Kitchen skills** are the game's watershed unlock. Once unlocked, your Jelly Beans become
**self-sufficient** — they feed themselves. Players describe it plainly: *"It really changes the
game."* Before kitchen skills, hunger is a constant manual interrupt; after, it manages itself and
you are free to work on the rest of the island.

Asking a player whether their Jelly Beans are self-sufficient yet is the standard way of asking how
far along they are.

### College

Your Jelly Bean **can go to college and get a job**. College is an adult-stage track.

### Trade and hobby

A graduated Jelly Bean has both a **trade** and a **hobby** — for example, a **blacksmith by trade
and a swordsmith by hobby**. The two are separate slots and can be closely related.

*Extrapolated:* Trade determines what your Jelly Bean produces passively while you're away and
what buildings it can staff. Hobby is a secondary slot that grants a mood bonus and unlocks
cosmetic or crafted items. Both are chosen at graduation and can be retrained at cost.

*Extrapolated:* Skills form a small tree — kitchen skills, gathering, crafting, combat — each with
its own unlock cost in jelly coins and a prerequisite life stage.

---

## 9. Farming & Gathering

Farming is a favorite task and one of the most-repeated interactions in the game. The garden is
checkable at any time and players check it compulsively — twelve times in a single morning is
described as ordinary.

**Canon crops:** parsley, tomatoes, a candy cane, and **100 jelly beans**. (Yes, you farm jelly
beans. The relationship between farmed jelly beans, your Jelly Bean, and jelly coins is not
explained.)

**Canon gathering:** **feathers**, gathered to knit a blanket when your Jelly Bean is cold.

**Digging holes** is a free, repeatable activity used to manage your Jelly Bean's anger.

*Extrapolated:* Crops grow on real-time timers of varying length — parsley in minutes, candy canes
in hours — so there is always something ready and never everything ready. Gathering nodes (feathers,
wood, sugar) respawn on the island on their own timers.

---

## 10. Quests & Combat

**Dr. Bubblegum's tasks.** He visits throughout the game and knocks on your door to give you new
tasks. This is the primary quest delivery mechanism and the main source of directed progression.

**Challenges.** The **gumdrop challenge** is a named recurring challenge type; completing one is
described as exciting.

**Combat.** Your Jelly Bean can **battle monsters**. Two canon encounters:

- **The candy castle** — a location you escape from.
- **The watermelon witch** — a boss you defeat, apparently on the way out of the candy castle.

Clearing this content is the kind of thing players announce to the room mid-session.

*Extrapolated:* Combat is turn-based and light — your Jelly Bean's stats come from its life stage,
flavor, trade, and equipped crafted gear. Dungeons like the candy castle are multi-room runs ending
in a boss, gated by an energy cost, and are the main source of rare crafting materials and flavor
unlocks.

---

## 11. Mini-Games

Mini-games are the on-demand currency faucet. When a player is short of what they need — *"I need
14 more bean bucks in order to give it space. I have to play some more mini-games"* — mini-games
are how they close the gap. They are always available and always the answer to "I can't afford
this yet."

*Extrapolated:* A rotating set of short, self-contained games (sorting, matching, timing) with a
daily bonus on first play and diminishing returns after, so the grind stays present without a hard
cap.

---

## 12. Progression

The game uses numbered **levels**, and they go very high — **level 1497** is a real place a
dedicated player reaches, and is high enough that the player is unlocking new flavors at it. Level
is the headline number players compare ("Ooh, what level are you on?"), and it reads as a rough
proxy for total time invested rather than for any single system's depth.

**Level unlocks flavors.** Other systems gate on life stage, skills, or currency instead.

*Extrapolated:* Level is earned from every activity — quests, farming, combat, mini-games,
building — on a curve flat enough that levels keep arriving into the four digits. Flavor unlocks
are spaced along it as the persistent long-term carrot.

---

## 13. Difficulty Modes

Two modes are canon:

- **Regular mode** — the default.
- **Baby mode** — *harder* than regular mode.

The naming is not a mistake and is not explained. Baby mode is the mode a committed seventeen-hour-
a-day player chooses.

*Extrapolated:* Baby mode puts you in charge of a Jelly Bean permanently stuck in an infant state —
every need decays several times faster, kitchen skills cannot be unlocked, and nothing is ever
self-sufficient. It is a hardcore mode wearing a soft name.

---

## 14. Weather & Ambience

The island has **weather**. Rain falls on the village and players report it as **cozy** — it is an
aesthetic feature, not a hazard. Weather is one of the reasons to just leave the game open.

The Jelly Bean's barks — *"Jelly Bean hungry"*, *"Mama, feed me"*, *"Jelly Bean cold, Papa help"*,
*"Jelly Bean, sleep, sleep"* — are the game's sonic signature. They are close enough in register to
ambient sleep audio that they can be, and are, mistaken for relaxing sounds and played at bedtime.

*Extrapolated:* A day/night cycle on real-world time, with weather rolling through on its own
schedule and a dedicated ambient/idle camera mode that lets the island play as a screensaver.

---

## 15. Social Features

- **Friends.** You have a friends list and can **send jelly coins** to them.
- **The bonus bean.** Gifting three friends earns you a bonus bean (see §6).
- **Comparing progress.** Level and life stage are visible to friends and are the standard opener
  between players ("What level are you on?" / "You're still in the larva stage").

*Extrapolated:* Friends can visit your island, help with a task once per day, and see your village
build-out. Gifting is capped per friend per day, which is what makes maintaining a wide friends
list worthwhile.

---

## 16. Expansions

The game ships **expansion packs**. The canon example is the **Viking expansion pack**, which is
where the blacksmith/swordsmith trade-and-hobby pairing comes from — it adds a themed content
layer on top of the base island rather than a separate mode.

*Extrapolated:* Each expansion adds a themed biome, a set of trades and hobbies, themed buildings,
a boss, and a flavor line. Expansions stack; a Jelly Bean can hold a Viking trade on a base-game
island. PC and mobile share expansion entitlement.

---

## 17. Retention & Notifications

- **Needs decay offline.** Your Jelly Bean gets hungry, cold, angry, and sleepy while the game is
  closed.
- **It calls for you.** The barks go out as push notifications — *"Mama! Feed me!"*, *"Papa help"*
  — addressed to the player as a parent.
- **Check-in cadence.** The game is built for many short sessions. Garden checks, need resolutions,
  and mini-games are all sized to fit in under a minute, and the game rewards reopening rather than
  staying open.
- **"Just checking."** The intended micro-session is a player who opens the app only to check on
  their Jelly Bean, not to play, and then plays.
- **Multi-device play.** Nothing prevents a player from running the game on several devices at once,
  and doing so is how the time zone flavor unlock works (see §6).
- **Session ceiling.** Roughly seventeen hours a day is a supported play pattern.

---

## 18. Open Questions

Things the source leaves genuinely undefined, which a builder must decide:

1. **Combat depth.** Turn-based, real-time, or auto-resolve? The transcript establishes that monster
   battles, a dungeon, and a boss exist, and nothing about how they play.
2. **The level curve.** Level 1497 is canon; what the XP requirement per level looks like, and what
   (if anything) besides flavors gates on level, is open.
3. **Farmed jelly beans.** You can grow 100 jelly beans. Whether they are food, currency,
   population, or a gag is unresolved.
4. **Currency semantics.** Deliberately unresolved in-fiction — but an implementation still needs a
   concrete rule for what each currency can actually buy.
5. **Death and permanence.** The life cycle has stages and an implied end. Whether a Jelly Bean
   dies, what happens to the island if it does, and whether there is a generational restart are all
   unaddressed.
6. **Art direction.** Nothing in the source describes the visual style beyond "graphics benefit
   from a good PC."
7. **Monetization specifics.** Bean bucks and expansion packs imply a store; its shape is open.
8. **Baby mode's actual rules.** Canon says only that it is harder.

---

## Appendix: Canon Glossary

| Term | Meaning |
|---|---|
| **Dr. Bubblegum** | Kind but stern professor; grants your plot of land, delivers tasks. A marshmallow with a heart of gold under a crunchy exterior. |
| **jelly coins** | The currency you earn. |
| **bean bucks** | The currency you spend. |
| **bonus bean** | Earned by gifting jelly coins to three friends; buys more jelly coins. |
| **kitchen skills** | The unlock that makes Jelly Beans self-sufficient. |
| **larva stage** | An early life-cycle stage. |
| **flavor** | Your Jelly Bean's variety; unlocked by leveling. |
| **space** | What an angry Jelly Bean wants. Costs bean bucks. |
| **digging holes** | Free alternative to giving space. Results vary. |
| **gumdrop challenge** | A named recurring challenge type. |
| **candy castle** | A location you escape from. |
| **watermelon witch** | A boss you defeat. |
| **baby mode** | A difficulty mode harder than regular mode. |
| **Viking expansion pack** | The canon expansion; source of the blacksmith/swordsmith trade pairing. |
