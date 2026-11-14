# Jelly Bean Simulator — Game Design & Technical Architecture Document

> **Working Title:** Jelly Bean Simulator (`jelly-sim`)
> **Platform:** Mobile-First Single Page Application (iPhone / iOS Safari), served statically on GitHub Pages
> **Architecture:** 100% Client-Side Computation & Persistence (Zero Backend)
> **3D Asset Pipeline:** Blender via Blender MCP -> `.glb` (glTF 2.0)

---

## 1. Source Material Extraction (`TRANSCRIPT.md`)

All lore, mechanics, characters, items, and jokes below are extracted directly from [TRANSCRIPT.md](TRANSCRIPT.md) (Story Pirates Podcast episode *"Chicken Hat / Rock and Roll Dining Room"*). Line numbers refer to `TRANSCRIPT.md`.

### 1.1 Identity, Tone & Platform Lore
- **Title:** *Jelly Bean Simulator* (L7, L10, L17, L44, L45, L52, L68, L70, L74–75).
- **Tagline / Satirical Pitch:** *"It's the only game that truly, realistically simulates what it's like to be a Jelly Bean."* (L11).
- **Core Objective:** *"The goal isn't just for your Jelly Bean to survive, you want your Jelly Bean to thrive!"* (L12).
- **Platform Vibes:** Played obsessively on mobile phones ("shell phones", L10) and also on high-spec PCs (*"honestly very impressive dual-monitor PC setup. It really helps with the graphics and processing speed"*, L44, L53).
- **Play Intensity:** Highly addictive cozy/task loop (*"roughly 17 hours a day"*, L45).
- **Meta-Theme:** Screen time vs. real-world chores—*"in a way, chores are kind of like a real-life video game. You get little tasks, and when you finish them, you feel like you accomplished something."* (L72–73). Earlier joke: *"We threw our chore wheel overboard in a previous episode."* (L13).

### 1.2 Life Cycle, Progression & Modes
- **Life Stages:** Take care of a Jelly Bean *"through all the stages of its life cycle"* (L10).
  - Explicitly named stage: **Larva stage** (*"you're still in the larva stage"*, L18).
  - Implied later stages: Childhood/Youth -> **College** -> **Job / Adulthood** (L11).
- **Levels:** Very deep level scale (e.g., **Level 1497** cited casually in L18).
- **Flavors:** Unlockable Jelly Bean flavors (*"I think I unlocked a new flavor"*, L18; *"unlock unlimited flavors"*, L70).
- **Difficulty / Modes:**
  - **Regular Mode**
  - **Baby Mode:** Explicitly *"a lot harder than regular mode"* (L45).

### 1.3 Needs, Weather, Moods & Voice Cues
- **Hunger & Feeding:**
  - Voice/alert lines: *"Jelly Bean! Jelly Bean! Jelly Bean hungry! Jelly Bean hungry!"*, *"Mama! Mama! Feed me!"*, *"I'm so hungry."* (L8, L114–115).
  - Food items mentioned: **Apple** (L8), **Hamburgers** (via Hamburger Stand, L9), **Lunch / Sandwiches** (L51–52), **Parsley**, **Tomatoes**, **Candy Cane** (L14).
- **Temperature & Weather:**
  - Dynamic **Rain** (*"It's raining in my Jelly Bean village, so cozy!"*, L9).
  - Cold state & voice line: *"Jelly Bean cold. Papa help. No, no. My Jelly Bean is cold. I need to gather feathers to knit him a blanket."* (L49, L115).
- **Sleep / Rest:**
  - Voice/alert lines: *"I'm so sleepy. Jellybean, sleep, sleep."* (L114–115).
- **Hygiene / Sanitation:**
  - Building a **Toilet** using Jelly Coins is an early milestone (L9).
- **Anger, "Giving It Space" & Digging Holes:**
  - Jelly Beans frequently get mad/angry at the player (L9, L12, L50).
  - Two explicit calming/coping mechanics:
    1. **Spend Bean Bucks to "give it space"** (*"My Jelly Bean is angry at me. But I need 14 more bean bucks in order to give it space."*, L9).
    2. **Dig more holes** (*"Mine is so mad at me right now. Maybe I need to dig more holes."*, L12; *"My Jelly Bean is still angry at me. I better dig more holes."*, L50).

### 1.4 Island Village, Buildings, Self-Sufficiency & Careers
- **Starter Plot & Housing:**
  - Dr. Bubblegum gives your Jelly Bean its **plot of land** on an island (L15).
  - You build it a **house** (with a knockable door, L15) and expand into an **entire island village to live with other Jelly Beans** (L10).
- **Structures & Stations:**
  - **House** (L10, L15)
  - **Toilet** (built with Jelly Coins, L9)
  - **Hamburger Stand** (L9)
  - **Garden / Farm** (L14)
- **Self-Sufficiency & Skills:**
  - **Kitchen Skills:** Unlocking kitchen skills makes Jelly Beans self-sufficient and *"really changes the game"* (L9, L45).
- **Education & Jobs:**
  - Jelly Bean can **go to college** and **get a job** (L11).
  - Trade vs. hobby distinction: *"blacksmith by trade and a swordsmith by hobby"* (L45).

### 1.5 Farming, Gathering & Crafting
- **Farming Crops:** *"I grew parsley, tomatoes, a candy cane, and 100 jelly beans. Farming is one of my favorite tasks in this game."* (L14).
- **Gathering & Crafting:** Gather **feathers** to **knit a blanket** when Jelly Bean is cold (L49).

### 1.6 Characters, Bosses, Dungeons & Quests
- **Dr. Bubblegum:** *"the kind but stern professor who greets you on your island and gives your Jelly Bean its plot of land. And often throughout the game, he will visit you to give you new tasks."* (L15). Personality: *"Once you get past his crunchy exterior, Dr. Bubblegum is a marshmallow with a heart of gold."* (L62).
- **Monsters & Combat:** *"you can battle monsters"* (L11).
- **Dungeons & Bosses:**
  - **Candy Castle** (escape/dungeon encounter, L18).
  - **Watermelon Witch** (boss defeated upon escaping Candy Castle, L18).
- **Challenges & Quests:**
  - **Mini-games** (played to earn Bean Bucks, L9).
  - **Gumdrop Challenge** (L61).
  - **Jelly Bean Quests / Tasks** (L11, L15, L73).

### 1.7 Economy, Social Loops & Exploits
- **Dual Currencies:**
  - **Jelly Coins** (earned via gameplay, spent on utilities like a **toilet**, L9; also giftable to friends, L69).
  - **Bean Bucks** (earned via **mini-games**, spent to **give your Jelly Bean space** and improve the island, L9, L11).
  - Joke: *"What's the difference between jelly coins and bean bucks? ... It makes more sense once you start playing."* (L11–12).
- **In-World "Exploits" (Lee's Hacks, L69–70):**
  - **3-Friend Bonus Bean Loop:** *"if I send jelly coins to three friends, I get a bonus bean, which I can then use to buy more jelly coins."* (L69–70).
  - **Time-Zone Flavor Trick:** *"if I set up each phone to a different time zone, I can unlock unlimited flavors."* (L70).

### 1.8 Expansion Content
- **Viking Expansion Pack** (L44–45):
  - Adds **Blacksmith** trade and **Swordsmith** hobby (L45).
  - Thematic nods from Siegfried's dialogue: *Battle of Svoldaar* (L44, L63–64), *Battle of Stamford Bridge* (L64–65), and *Expedition to the Ice Giant's Palace* (noted as *"very hard"*, L65).

---

## 2. Game Vision, Pillars & Core Loop

### 2.1 High-Concept Pitch
A tactile, humorous, cozy-chaotic **3D virtual pet & island village life simulator** built specifically for one-handed portrait play on iPhone. You raise a squishy, expressive Jelly Bean from needy **Larva** to self-sufficient **College Graduate & Master Artisan**, build a bustling **Island Village**, farm bizarrely delicious crops, play punchy thumb mini-games, battle the **Watermelon Witch** in the **Candy Castle**, and uncover Dr. Bubblegum's surprisingly tender heart.

### 2.2 Design Pillars
1. **Tactile Squish & Instant Charm:** Every tap produces juicy squash-and-stretch 3D motion, glossy translucent jelly shaders, and synthesized "baby-bean" audio cues (`"Jelly Bean hungry!"`, `"Sleep, sleep!"`).
2. **Survival -> Self-Sufficiency -> Thriving:** Early play is frantic Tamagotchi care (especially in **Baby Mode**); mid-game unlocks **Kitchen Skills**, **Farming**, **College**, and **Jobs** so your village thrives even while you battle monsters.
3. **One-Handed iPhone First:** All primary controls sit in the lower 40% thumb zone in portrait mode; zero tiny text, zero hover-dependent interactions.
4. **Honest Single-Player Satire:** All "F2P mobile tropes" from the podcast (Jelly Coins vs. Bean Bucks, Bonus Beans, time-zone flavor hopping, screen-time reminders) are realized as **100% free, zero-monetization, client-side gameplay puzzles and jokes**.

### 2.3 Core Gameplay Loop
```
  [Care for Needs: Feed, Warm w/ Blanket, Sleep, Toilet]
         │                               ▲
         ▼                               │ (Calm Anger via Digging Holes
  [Earn XP & Jelly Coins]                │  or Spending Bean Bucks to Give Space)
         │                               │
         ├──► [Farm Crops (Parsley, Tomatoes, Candy Cane, 100 Jelly Beans)]
         ├──► [Build Island Village (House, Toilet, Hamburger Stand, Neighbors)]
         ├──► [Play Mini-Games & Gumdrop Challenges ──► Earn Bean Bucks]
         └──► [Level Up (1..1497+) ──► Evolve Life Stage & Unlock Flavors]
                    │
                    ▼
         [Go to College ──► Unlock Kitchen Skills & Jobs ──► Self-Sufficiency!]
                    │
                    ▼
         [Escape Candy Castle / Defeat Watermelon Witch / Viking Expansion]
```

---

## 3. Detailed Game Systems

### 3.1 Modes & Life Cycle Progression
- **Game Modes (selected on New Game; also toggleable via New Game+ / Prestige):**
  - **Regular Mode:** Balanced decay rates, gentle rain penalties, friendly Dr. Bubblegum pacing.
  - **Baby Mode:** *"A lot harder than regular mode."* Need decay is **2.0x faster**, rain chills twice as fast, anger spikes quickly when ignored, and the Jelly Bean frequently cries `"Mama! Feed me!"` / `"Papa help!"`. Rewards **1.5x XP** and a `"Baby Mode Survivor"` badge + exclusive Pacifier/Bib accessory.
- **Life Stages (driven by XP & Milestone Gates):**
  1. **Stage 1 — Larva (Lv 1–9):** Legless, translucent squishy bean-grub. Slow wobble, high need dependency, cannot cook or farm alone.
  2. **Stage 2 — Sprout (Lv 10–49):** Stubby arms/feet sprout; can play Mini-Games and help pick up feathers.
  3. **Stage 3 — Scholar / Teen (Lv 50–199):** Unlocks **Jelly College** enrollment, **Kitchen Skills**, and **Candy Castle** scouting.
  4. **Stage 4 — Citizen / Adult (Lv 200–999):** Graduates College, takes a **Job** (Chef, Botanist, Guard, or **Blacksmith**), reaches **Self-Sufficiency** (auto-eats from Hamburger Stand / pantry when stocked!).
  5. **Stage 5 — Elder / Legend (Lv 1000–1497+):** Unlocks Prestige Island slots, Master Flavors, and **Ice Giant's Palace** (Viking Expansion).
- **Level Curve (1 to 1497+):**
  - Fast, dopamine-friendly progression modeled as `xpRequired(L) = floor(25 * L^1.15)` so players hit Level 10 in ~5 minutes, Level 100 within a few sessions, and Level 1497+ as an achievable long-tail milestone.

### 3.2 Needs, Weather, Anger & Care Mechanics
Five core meters (`0–100`), displayed as compact pill gauges at the top HUD:
1. **Hunger:** Replenished by feeding items from the Pantry (**Apple** +20, **Tomato** +25, **Parsley** +15 + Mood boost, **Candy Cane** +30 + Sugar Rush speed, **Hamburger** +60, **Full Lunch** +80).
2. **Warmth:** Drops steadily during **Rain** weather events if outside. Restored by dragging a knitted **Blanket** onto the Jelly Bean (crafted from **3 Feathers**) or bringing it inside its **House**.
3. **Energy:** Restored by tapping the House bed (`"Sleep, sleep"`). Passive recovery when asleep (accelerated 10x in real-time, or via offline time).
4. **Hygiene:** Drops after eating. Before building a **Toilet**, Hygiene decays and triggers Anger; once a **Toilet** is built on the island, the Jelly Bean uses it automatically (or on tap) for Hygiene +100 and a small Jelly Coin tip!
5. **Calm / Mood (Inverse of Anger):**
   - When Hunger, Warmth, Energy, or Hygiene fall below 25 (or during Baby Mode tantrums), the Jelly Bean enters the **Angry** state (crimson tint, furious bounce, steam puffs).
   - **Ways to resolve Anger:**
     - **Dig Holes:** Switch to the **Shovel** tool and tap empty grass/dirt tiles on your plot to dig holes. Each hole dug reduces Anger by 18 and has a chance to unearth **1–3 Jelly Coins**, a **Feather**, or a **Mystery Seed** (up to 6 active holes on the plot; holes refill naturally over time or on tap).
     - **Give It Space:** Spend **Bean Bucks** (starts at **14 Bean Bucks**, scales modestly per expansion tier) on the **"Give It Space"** action. This expands the Jelly Bean's personal plot radius / adds a quiet Zen Cushion zone, instantly clears Anger to 0, and permanently slows future Anger buildup by 10% per tier.

### 3.3 Weather & Time-of-Day System
- **Dynamic Client-Side Weather:** Cycles smoothly every 4–8 minutes between **Sunny**, **Breezy** (spawns extra drifting **Feathers**), and **Cozy Rain** (waters all Farm Crops automatically, boosts House coziness if Warmth > 60, drains Warmth if unblanketed outside).
- **Time-Zone / Clock Flavor System:**
  - Uses local device clock (`new Date()`) to set island sky lighting (Dawn, Day, Sunset, Starlight).
  - Certain rare **Flavors** (e.g., *Midnight Licorice*, *Sunrise Citrus*, *High-Noon Mango*) unlock during specific clock hours.
  - **Lee's Time-Zone Easter Egg:** In the Flavor Wardrobe, players can either wait for the local hour OR unlock the **"World Clock Dial"** (an in-game toy item sold by Dr. Bubblegum) that lets you manually shift your island's time zone to collect *"unlimited flavors"* cleanly without touching iOS system settings!

### 3.4 Island Village, Buildings & Self-Sufficiency
The Island is a rotatable/zoomable 3D floating isle divided into:
- **Center Plaza & House Plot** (starts with Dr. Bubblegum's welcome sign + Starter Plot).
- **8 Buildable Village Pads** (expandable via **"Give It Space"**).
- **4 Farm Tiles** + **6 Diggable Dirt Spots**.
- **Harbor / Dock** (connects to Candy Castle boat & Viking Longship).

| Structure | Unlock Cost | Function |
|---|---|---|
| **Starter House** | Free (Gifted by Dr. Bubblegum) | Shelter from rain, Sleep bed, front door where Dr. Bubblegum knocks with new quests. Upgradable aesthetic tiers. |
| **Toilet** | 25 Jelly Coins | Fixes Hygiene decay; prevents Hygiene-induced tantrums; awards +2 Jelly Coins per flush. |
| **Garden Plot (x4)** | 15 Jelly Coins each | Grow **Parsley**, **Tomatoes**, **Candy Canes**, and **100-Bean Bushes**. |
| **Hamburger Stand** | 80 Jelly Coins + Kitchen Skills Lv 1 | Generates passive Jelly Coins; cooks **Hamburgers**; enables **Self-Sufficiency** (hungry Adult/Scholar beans buy/eat burgers automatically). |
| **Jelly College** | 120 Jelly Coins + 10 Bean Bucks | Enroll your bean to unlock **Kitchen Skills**, **Botany**, **Combat Arts**, and **Jobs**. |
| **Neighbor Cottage (x3)** | 60 Jelly Coins each | Moves AI NPC Jelly Beans (*Berry*, *Pip*, *Mochi*) into your village so you live *"with other Jelly Beans"*. Enables daily **Send Coins to 3 Friends** loop! |
| **Knit & Craft Bench** | 40 Jelly Coins | Turn gathered **Feathers** into **Cozy Blankets** (+Warmth gear) and **Lunchboxes**. |
| **Viking Longhouse & Forge** | Viking Expansion Pack | Unlocks **Blacksmith** trade, **Swordsmith** hobby, and Viking Expeditions. |

### 3.5 Farming & Gathering
- **Farming Crops:**
  - **Parsley** (30s growth): Cheap, gives +Mood and +15 Hunger; used in Lunchboxes.
  - **Tomatoes** (90s growth): +25 Hunger; key ingredient for Hamburgers.
  - **Candy Cane** (3m growth): +30 Hunger, +25 Battle Energy for Candy Castle.
  - **Jelly Bean Bush** (5m growth): Harvests **100 Jelly Beans** (tracked as a whimsical collectible/XP burst + pantry stock + Jelly Coin payout!).
- **Gathering:**
  - **Feathers:** Drift onto the island during Breezy weather or pop out when digging holes; 3 Feathers knit into 1 **Cozy Blanket**.

### 3.6 Dual Economy: Jelly Coins, Bean Bucks & The Bonus Bean Loop
- **Jelly Coins (Soft Currency):**
  - *Earned from:* Feeding/Caring ticks, Toilets, Digging Holes, Farming, Hamburger Stand, Doctor's Tasks.
  - *Spent on:* Food, Seeds, Island Buildings, Neighbor Gifts.
- **Bean Bucks (Hard Currency — 100% Free, Earned In-Game):**
  - *Earned from:* Mini-Games, Gumdrop Challenges, Candy Castle / Watermelon Witch victories, Bonus Bean Exchange.
  - *Spent on:* **"Give It Space"** (14+ Bean Bucks), Rare Flavors, College Tuition, Viking Expansion Pack.
- **Lee's "3-Friend Bonus Bean" Loop (100% Client-Side):**
  - Once you have 3 Neighbor Cottages (or NPC pen-pals in your Contact Shell Book), you can **Send 5 Jelly Coins to 3 Friends** once per cooldown (e.g. 5 minutes or once per in-game day).
  - Sending to all 3 awards **1 Bonus Bean**.
  - **Bean Exchange** lets you trade **1 Bonus Bean -> 30 Jelly Coins** OR **3 Bonus Beans -> 10 Bean Bucks**, playfully fulfilling Lee's *"I get a bonus bean, which I can then use to buy more jelly coins"* arbitrage loop with balanced cooldowns!

### 3.7 Mini-Games & Gumdrop Challenges
Quick 30–45 second portrait thumb games launched from the Arcade tab (cost 0 energy, award **Bean Bucks** + XP):
1. **Hole Digger Frenzy:** Rapidly tap dirt mounds popping up around an angry Jelly Bean for 30s. Avoid buried boots; hit golden clods for bonus Jelly Coins and **5–12 Bean Bucks**.
2. **Feather Catch:** Drag your Jelly Bean left/right at the bottom of the screen during a rainstorm to catch floating feathers while dodging rain-puddles; earns Feathers + **Bean Bucks**.
3. **Gumdrop Challenge:** Colorful 4-lane falling-gumdrop rhythm/tapper (or Simon-says gumdrop bounce sequence). Completing rounds awards **Bean Bucks** + Sugar Stars.

### 3.8 Candy Castle & Watermelon Witch (Monster Battles)
- Accessed via the Island Dock boat once Lv 15+ (or when Dr. Bubblegum assigns the quest).
- **Candy Castle Escape:** A 5-stage mini-dungeon crawl (3 Monster Encounters + 1 Trap Room + **Boss: The Watermelon Witch**).
- **Combat Mechanics (Portrait Turn-Based / Active Timing):**
  - Your Jelly Bean stands on the left/bottom; monsters (Gumdrop Golem, Sour Worm, Licorice Bat, **Watermelon Witch**) face you in 3D.
  - Three thumb buttons: **Bonk** (melee / Swordsmith slash), **Flavor Blast** (special skill based on equipped Flavor), **Shield / Dodge** (timed tap during enemy telegraph).
  - **Watermelon Witch Boss:** Throws exploding melon-seeds and casts *Rind Shield*; defeating her escapes the Candy Castle, grants a trophy decoration, massive XP, and **25 Bean Bucks**.

### 3.9 NPCs & Quests
- **Dr. Bubblegum:**
  - Appears at your House door (literally knocks with an audio *"knock-knock"* cue and floating speech bubble) whenever you reach a milestone or need direction.
  - Speaks with crunchy-professor firmness (*"Have you checked your real-life garden? No? Well, at least water your tomatoes!"*) hiding a marshmallow-sweet heart of gold (*"You're doing wonderfully, little bean."*).
  - Provides **Story Quests** (Build Toilet -> Dig Holes -> Grow 100 Jelly Beans -> Unlock Kitchen Skills -> Escape Candy Castle -> Unlock Viking Pack) and repeatable **Daily Tasks**.
- **Chore Wheel Easter Egg:** An optional *"Ship Chore Check-In"* button inside Dr. Bubblegum's notebook where checking off real-life breaks (drink water, stretch, tidy up) grants a cozy **"Heart of Gold" Buff** (zero anger decay for 15 minutes) without ever blocking gameplay.

### 3.10 Viking Expansion Pack
- Unlockable in-game via **50 Bean Bucks** (or reaching Level 150) at the Island Dock:
  - Transforms the Harbor into a snowy **Viking Pier** with a Longship.
  - Unlocks **Viking Helmet & Beard/Braids** accessory + **Viking Forge** building.
  - Unlocks **Blacksmith** (Trade: crafts sturdy tools/gear for passive Jelly Coins) and **Swordsmith** (Hobby: upgrades combat weapon damage for Candy Castle & Expeditions).
  - Adds 3 Expeditions:
    1. *Battle of Svoldaar* (medium difficulty; quirky flavor ending *"found them at the mall"*)
    2. *Battle of Stamford Bridge* (hard difficulty)
    3. *Ice Giant's Palace* (notoriously hard endgame gauntlet — *"very hard"*, huge prestige rewards!).

---

## 4. iPhone SPA, Client-Side Architecture & GitHub Pages

### 4.1 Deployment & Static Hosting (GitHub Pages)
- **Bundler:** Vite + TypeScript + React.
- **Base Path:** Configured via `vite.config.ts` (`base: './'` or `/jelly-sim/` matching repository pages URL) so all relative asset fetches (`assets/models/*.glb`) resolve identically locally and on GitHub Pages.
- **SPA Routing:** State-driven modal/tab navigation (no server-dependent path routing; optional `#hash` deep links for screens) so refreshes never hit a GitHub Pages 404.
- **GitHub Actions:** Automated `.github/workflows/deploy.yml` running `tsc --noEmit`, `vitest run`, `vite build`, and deploying `dist/` via `actions/deploy-pages`.

### 4.2 iPhone / iOS Safari UX & Ergonomics
- **Viewport & Safe Areas:**
  - `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`
  - Root container uses `height: 100dvh`, `padding-top: env(safe-area-inset-top)`, `padding-bottom: env(safe-area-inset-bottom)` so UI clears Dynamic Island and Home Indicator.
- **PWA Support:**
  - `manifest.webmanifest` (`display: standalone`, `orientation: portrait`), `apple-touch-icon`, `apple-mobile-web-app-capable` meta tags so users can install it on their iPhone Home Screen.
- **Thumb-Zone Layout (Portrait 390x844 baseline):**
  - **Top 15%:** Compact Needs Pills (Hunger, Warmth, Energy, Hygiene, Mood) + Jelly Coins / Bean Bucks / Bonus Beans + Level/Stage badge.
  - **Middle 55%:** Full-bleed interactive 3D Island Canvas (`touch-action: none`, orbit pan/pinch-zoom + tap raycasting on Jelly Bean, House, Crops, Holes, Dr. Bubblegum).
  - **Bottom 30%:** Contextual Action Bar (Feed, Knit/Blanket, Dig, Give Space) + 5-tab Bottom Dock (**Island**, **Farm**, **Village**, **Play**, **Bean**).
  - **No Hover States:** All tooltips/inspectors open via tap or long-press bottom sheets. Minimum `44x44px` tap targets.

### 4.3 Client-Side State, Persistence & Offline Simulation
- **Single Source of Truth:** Pure TypeScript simulation state managed in a **Zustand** store (`GameState`), completely decoupled from Three.js rendering (`SceneController` subscribes to state snapshots).
- **Persistence:**
  - Primary storage: **IndexedDB** (`idb-keyval` or lightweight native wrapper) saving serialized `GameState` with schema `version` for forward migrations.
  - Debounced auto-save every 2s on mutation + `visibilitychange` / `pagehide` flush (critical on iOS Safari where `beforeunload` is unreliable).
  - **JSON Save Export / Import:** Copy-to-clipboard / download `.json` backup so players can transfer saves or guard against Safari 7-day ITP cache eviction.
- **Offline Elapsed-Time Catch-Up:**
  - On app resume/boot, compute `dt = clamp(Date.now() - state.lastTickAt, 0, MAX_OFFLINE_MS)` (capped at 12 hours so returning after a week doesn't punish unfairly).
  - Apply deterministic offline simulation steps: crop growth completes, Hamburger Stand & Blacksmith produce coins, needs decay (slower offline factor `0.35x`, capped so Jelly Bean stays alive and grumpy rather than soft-locked).

### 4.4 Web Audio API Procedural Sound Engine
- Zero large `.mp3` downloads needed: synthesize juicy pops, coin chimes, rain white-noise, door knocks, and cute formant-filtered "bean chirps" using Web Audio API.
- **iOS Audio Unlock:** `AudioContext.resume()` triggered cleanly on the user's first tap (`pointerdown`), with a prominent Mute/SFX toggle in the HUD.

### 4.5 Mobile WebGL Performance Budgets (Three.js)
- **Renderer:** Single `THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })`.
- **DPR Cap:** `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` — avoids 3x retina fragment fill-rate thermal throttling on iPhone.
- **Shadows:** Prefer cheap projected blob shadows (`PlaneGeometry` radial alpha circle beneath characters/buildings) + single directional sun light with `1024x1024` shadow map (or toggleable quality tier) to maintain locked 60 FPS on iPhone.
- **Geometry Budget:** < 30,000 triangles visible on screen at once; instanced meshes for grass tufts, raindrops, and gumdrops.
- **Materials:** `MeshPhysicalMaterial` (low roughness, subtle clearcoat/transmission-free sheen via specular + emissive rim or matcap) for the glossy Jelly Bean body without expensive multi-pass transmission render targets.

### 4.6 Directory Structure
```text
jelly-sim/
├── .github/workflows/deploy.yml   # CI test + GitHub Pages deploy
├── assets-src/                    # Blender scripts & source .blend files
│   └── scripts/                   # Reproducible bpy scripts run via Blender MCP
├── public/
│   ├── assets/models/             # Exported game-ready .glb files
│   ├── icons/                     # PWA / Apple touch icons
│   └── manifest.webmanifest
├── src/
│   ├── engine/                    # Pure TS simulation, economy, offline tick, save
│   ├── state/                     # Zustand store + actions + persistence
│   ├── audio/                     # Web Audio API synth & rain ambience
│   ├── scene/                     # Three.js SceneController, loaders, animations
│   ├── minigames/                 # Hole Digger, Feather Catch, Gumdrop, Candy Castle
│   ├── ui/                        # React HUD, bottom sheets, onboarding, modals
│   ├── App.tsx
│   └── main.tsx
├── tests/                         # Vitest unit tests + Playwright mobile E2E
├── DESIGN.md
├── PLAN.md
├── package.json
└── vite.config.ts
```

---

## 5. Blender MCP 3D Asset Pipeline

All 3D models are authored in Blender using the **Blender MCP** server (`execute_blender_code`, `get_objects_summary`, `get_object_detail_summary`, `render_viewport_to_path`, `get_screenshot_of_area_as_image`) and exported as `.glb` assets into `public/assets/models/`.

### 5.1 Technical Standards for Blender -> Three.js
1. **Units & Orientation:** Blender Metric (`1.0` unit = `1m`). Objects face `-Y` (Blender front) and export with `export_yup=True` so they face `+Z` cleanly in Three.js.
2. **Origin:** Bottom-center `(0, 0, 0)` at ground contact for all buildings, crops, NPCs, and Jelly Beans (simplifies island grid snapping and squash-and-stretch scaling from the base!).
3. **Clean Transforms & Modifiers:** Always run `bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)` and convert bevel/subsurf modifiers cleanly before export (`Subdivision` kept at level 1–2 max to stay within mobile triangle budgets).
4. **Materials:** Principled BSDF with base color (or vertex colors / small baked palette), roughness, metallic, and clearcoat (on jelly meshes) — avoids external image texture dependencies where flat/stylized PBR shines, keeping `.glb` files tiny (`15–80 KB` each!).
5. **Hierarchy for Animation:** Separate named child meshes where procedural Three.js animation is needed (e.g., `Body`, `Eye_L`, `Eye_R`, `Accessory_Socket` on Jelly Beans; `Door` on House; `Fan` or `Sign` on Hamburger Stand).
6. **Visual Verification Gate:** Every asset creation PR uses `render_viewport_to_path` / `get_screenshot_of_area_as_image` from front + 3/4 angles to visually verify silhouette, origin placement, and materials before committing `.glb` exports.

### 5.2 Complete Asset Manifest

| Category | Asset File (`.glb`) | Target Tris | Key Mesh Parts / Notes |
|---|---|---|---|
| **Characters** | `jelly_larva.glb` | ~800 | Segmented squishy bean-larva, glossy jelly coat, expressive eyes |
| | `jelly_bean.glb` | ~1,200 | Classic curved kidney/jelly-bean silhouette, `Eye_L/R`, `Mouth`, `Hand_L/R`, `Foot_L/R`, `Hat_Socket` |
| | `npc_dr_bubblegum.glb` | ~1,600 | Crunchy gumball head, professor glasses, mini lab coat, bow tie |
| | `boss_watermelon_witch.glb` | ~2,000 | Striped watermelon body, witch hat, candy-cane broom/staff |
| | `monsters_candy.glb` | ~1,800 (pack) | Gumdrop Golem, Sour Worm, Licorice Bat (separate named nodes) |
| **Island & Env** | `island_base.glb` | ~2,500 | Cozy floating island, sandy shore, central grass plateau, plot rings, dock |
| | `env_props.glb` | ~1,200 (pack) | Dug Hole (`hole_dirt`), Dirt Mound, Feather, Cozy Blanket, Cloud, Boat |
| **Buildings** | `bldg_house.glb` | ~1,500 | Jelly-shaped cozy cottage with knockable `Door`, chimney, warm window |
| | `bldg_toilet.glb` | ~900 | Cute pastel outhouse / porcelain throne booth with flush handle |
| | `bldg_hamburger_stand.glb` | ~1,600 | Striped awning kiosk, giant roof burger sign, grill counter |
| | `bldg_college.glb` | ~1,800 | Mini brick-and-candy campus hall with graduation-cap roof |
| | `bldg_neighbor_cottage.glb` | ~1,100 | Compact colorful neighbor pod house (recolorable roof in Three.js) |
| | `bldg_craft_bench.glb` | ~900 | Knitting basket & wooden workbench for blankets/lunches |
| | `bldg_candy_castle.glb` | ~2,200 | Peppermint towers & frosting gate (dock destination / diorama) |
| **Farming & Food** | `crops_pack.glb` | ~1,400 (pack) | Garden bed + Sprout, Parsley, Tomato plant, Candy Cane stalk, 100-Bean Bush |
| | `items_pack.glb` | ~1,200 (pack) | Apple, Hamburger, Jelly Coin, Bean Buck, Bonus Bean, Gumdrop, World Clock |
| **Viking Pack** | `viking_pack.glb` | ~2,400 (pack) | Viking Longhouse/Forge, Anvil, Horned Helmet, Forged Sword, Longship |

---

## 6. High-Level Milestones

| Milestone | Name | Goal & Key Deliverables | Exit Criteria |
|---|---|---|---|
| **M0** | **Project Foundation & CI/CD** | Vite + TS + React + Vitest + Playwright + GitHub Pages deploy workflow; mobile iPhone viewport shell (`100dvh`, safe-areas, PWA manifest). | Live blank/hello SPA deploys cleanly to GitHub Pages; `tsc`, `vitest`, and `vite build` pass in CI; loads cleanly in 390x844 mobile viewport. |
| **M1** | **Core Simulation Engine & Persistence** | Pure TS state model, needs decay, life stages (Lv 1–1497+), Regular vs. Baby Mode, dual currency, offline catch-up, IndexedDB save + JSON export/import. | Full simulation suite runs headlessly with comprehensive Vitest unit coverage; state persists across reloads & offline time deltas. |
| **M2** | **Blender MCP Environment & Hero Assets** | Use Blender MCP to model, verify via viewport renders, and export `island_base.glb`, `jelly_larva.glb`, `jelly_bean.glb`, `npc_dr_bubblegum.glb`, `bldg_house.glb`, and `env_props.glb`. | All `.glb` files load cleanly in Three.js with correct ground origins, scale, glossy bean materials, and <30k scene triangle budget. |
| **M3** | **Interactive 3D Island & Core Care Loop** | Three.js `SceneController` with touch orbit/zoom/tap raycasting, squash-and-stretch animations, top HUD + thumb dock, Feeding, Toilet, Rain/Weather, Feather Gathering -> Blanket Knitting, Anger -> Digging Holes & "Give It Space", Dr. Bubblegum intro quests, Web Audio synth. | End-to-end playable virtual pet loop on iPhone portrait viewport: feed, sleep, toilet, knit blanket, dig holes, calm anger, hear synthesized cues. |
| **M4** | **Farming, Village & Self-Sufficiency** | Blender MCP `bldg_*`, `crops_pack`, `items_pack`; 4 Garden Plots (Parsley, Tomatoes, Candy Cane, 100 Jelly Beans); Hamburger Stand; 3 Neighbor Cottages + 3-Friend Bonus Bean loop; Jelly College -> Kitchen Skills & Jobs; Time-Zone Flavor Wardrobe. | Player can farm all 4 crops, reach self-sufficiency via College + Kitchen Skills + Hamburger Stand, trade Bonus Beans, and unlock clock-based Flavors. |
| **M5** | **Mini-Games & Candy Castle Combat** | Blender MCP `bldg_candy_castle.glb`, `monsters_candy.glb`, `boss_watermelon_witch.glb`; 3 thumb mini-games (Hole Digger Frenzy, Feather Catch, Gumdrop Challenge); 5-stage Candy Castle + Watermelon Witch boss battle. | All 3 mini-games award Bean Bucks reliably; player can enter Candy Castle, defeat the Watermelon Witch, and claim victory rewards. |
| **M6** | **Viking Expansion & Dr. Bubblegum Endgame** | Blender MCP `viking_pack.glb`; Viking Expansion unlock, Forge building, Blacksmith trade & Swordsmith hobby, Svoldaar / Stamford Bridge / Ice Giant's Palace expeditions, Chore Wheel "Heart of Gold" Easter egg. | Complete progression from Lv 1 Larva -> Lv 1497+ Viking Master Artisan; all transcript lore integrated. |
| **M7** | **iPhone Polish, Performance & Launch QA** | Asset/draw-call optimization, frame-rate stability pass, haptics-like visual juice, accessibility/mute controls, full Playwright mobile E2E suite, README & GitHub Pages production launch. | Zero console errors, 60 FPS target on mobile WebGL profile, offline PWA verified, all E2E & unit tests green on `main`. |
