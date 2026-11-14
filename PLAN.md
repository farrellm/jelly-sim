# Jelly Bean Simulator — Single-PR Implementation Plan

This plan breaks the milestones defined in [DESIGN.md](DESIGN.md) into atomic, reviewable **single Pull Request (PR)** steps. Every PR leaves `main` buildable, tested, and deployable to GitHub Pages.

---

## Milestone 0: Project Foundation & CI/CD

### PR-01: Scaffold Vite + React + TypeScript + Vitest Project
- **Milestone:** M0
- **Depends On:** None
- **Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`, `tests/smoke.test.ts`
- **Scope:**
  - Initialize Vite with React + TypeScript (`strict: true`).
  - Configure `vite.config.ts` with relative/repo `base` path (`./`) for static GitHub Pages serving.
  - Add Vitest (`jsdom` environment) and a starter smoke test.
  - Add iPhone viewport shell in `index.html` (`viewport-fit=cover`, `user-scalable=no`) and CSS variables using `100dvh`, `env(safe-area-inset-top)`, and `env(safe-area-inset-bottom)`.
- **Verification:** `npm run typecheck`, `npm test`, and `npm run build` succeed cleanly.

### PR-02: PWA Manifest, Mobile Shell Layout & GitHub Pages CI/CD
- **Milestone:** M0
- **Depends On:** PR-01
- **Files:** `public/manifest.webmanifest`, `public/icons/*`, `index.html`, `.github/workflows/deploy.yml`, `src/ui/MobileShell.tsx`
- **Scope:**
  - Add PWA `manifest.webmanifest` (`display: standalone`, portrait orientation) and Apple touch meta tags/placeholder icons.
  - Build `MobileShell` responsive frame (Top HUD slot, middle 3D viewport slot, bottom thumb-zone dock slot) verified at `390x844` (iPhone portrait).
  - Add GitHub Actions workflow `.github/workflows/deploy.yml` to run typecheck, tests, Vite build, and deploy `dist/` to GitHub Pages.
- **Verification:** Local preview renders inside `390x844` without horizontal scroll or clipped safe areas; CI workflow YAML passes actionlint/syntax checks.

---

## Milestone 1: Core Simulation Engine & Persistence

### PR-03: Game Types, Constants & XP / Life Stage / Flavor Tables
- **Milestone:** M1
- **Depends On:** PR-01
- **Files:** `src/engine/types.ts`, `src/engine/constants.ts`, `src/engine/progression.ts`, `tests/engine/progression.test.ts`
- **Scope:**
  - Define immutable data types for `GameState`, `GameMode` (`regular` | `baby`), `LifeStage` (`larva` | `sprout` | `scholar` | `citizen` | `elder`), `Needs`, `WeatherState`, `Inventory`, `BuildingSlot`, `CropSlot`, `QuestState`, and `FlavorDef`.
  - Implement level curve supporting `Lv 1..1497+`, stage evolution gates, and unlockable Flavor definitions (including time-window metadata).
- **Verification:** Unit tests verify level thresholds up to Lv 1497+, stage transitions, and Baby Mode 1.5x XP multiplier.

### PR-04: Simulation Tick, Needs Decay, Weather & Offline Catch-Up
- **Milestone:** M1
- **Depends On:** PR-03
- **Files:** `src/engine/simulation.ts`, `src/engine/weather.ts`, `tests/engine/simulation.test.ts`
- **Scope:**
  - Implement pure deterministic `tickSimulation(state, deltaMs, nowMs)` advancing Hunger, Warmth, Energy, Hygiene, and Anger/Mood.
  - Implement Baby Mode (`2.0x` decay multiplier + frequent tantrums) vs. Regular Mode.
  - Implement Weather cycling (`sunny` -> `breezy` -> `rain`) with rain cooling outside beans and auto-watering crops.
  - Implement offline catch-up capped at 12 hours (`0.35x` decay factor) so returning players never soft-lock.
- **Verification:** Deterministic Vitest suite testing Regular vs. Baby decay, rain warmth drain, self-sufficiency auto-eat when unlocked, and 12h offline catch-up bounds.

### PR-05: Dual Economy, Core Actions & IndexedDB Persistence
- **Milestone:** M1
- **Depends On:** PR-04
- **Files:** `src/engine/actions.ts`, `src/engine/persistence.ts`, `src/state/useGameStore.ts`, `tests/engine/actions.test.ts`, `tests/engine/persistence.test.ts`
- **Scope:**
  - Implement pure state reducers/actions: Feed, Sleep, Use Toilet, Gather Feather, Knit Blanket, Dig Hole (with coin/feather drops & anger reduction), and **"Give It Space"** (14+ Bean Bucks plot expansion + anger reset).
  - Implement Zustand store `useGameStore` wired to IndexedDB persistence (with `localStorage` fallback), 2s debounced save, `visibilitychange`/`pagehide` flush, schema migration, and JSON Export/Import.
- **Verification:** Unit tests cover all actions, insufficient-currency guards, save/load round-trip, and corrupted-JSON import rejection.

---

## Milestone 2: Blender MCP Environment & Hero Assets

> All PRs in this milestone (and asset PRs in M4–M6) author assets directly in Blender via **Blender MCP**, verify silhouette/scale/origin via `render_viewport_to_path` / `get_screenshot_of_area_as_image`, store reproducible generator scripts under `assets-src/scripts/`, and export `.glb` to `public/assets/models/`.

### PR-06: Blender MCP Pipeline Helpers & `island_base.glb` + `env_props.glb`
- **Milestone:** M2
- **Depends On:** PR-01
- **Files:** `assets-src/scripts/common_export.py`, `assets-src/scripts/build_island.py`, `public/assets/models/island_base.glb`, `public/assets/models/env_props.glb`
- **Scope:**
  - Create reusable `bpy` helper functions (metric setup, clean material builder, bottom-center origin setter, glTF `.glb` exporter with `export_yup=True` and applied transforms).
  - Model via Blender MCP: cozy floating island (`island_base.glb`) with sandy rim, grass plateau, central House pad, 8 building pads, 4 farm tiles, 6 dig spots, and wooden harbor dock.
  - Model `env_props.glb` containing named nodes: `hole_dirt`, `dirt_mound`, `feather`, `cozy_blanket`, `rain_cloud`, and `dock_boat`.
- **Verification:** Blender MCP viewport render screenshot inspected from 3/4 + top angles; `island_base.glb` <= 2,500 tris, `env_props.glb` <= 1,200 tris.

### PR-07: Blender MCP Hero Characters (`jelly_larva.glb`, `jelly_bean.glb`, `npc_dr_bubblegum.glb`)
- **Milestone:** M2
- **Depends On:** PR-06
- **Files:** `assets-src/scripts/build_characters.py`, `public/assets/models/jelly_larva.glb`, `public/assets/models/jelly_bean.glb`, `public/assets/models/npc_dr_bubblegum.glb`
- **Scope:**
  - Model `jelly_larva.glb` (segmented translucent-glossy bean grub with eyes) and `jelly_bean.glb` (classic kidney bean silhouette with named animatable child nodes `Body`, `Eye_L`, `Eye_R`, `Mouth`, `Hand_L`, `Hand_R`, `Foot_L`, `Foot_R`, `Hat_Socket`).
  - Model `npc_dr_bubblegum.glb` (crunchy pink gumball professor head, thick glasses, mini lab coat, bow tie).
- **Verification:** Blender MCP render thumbnails confirm glossy bean sheen, bottom-center `(0,0,0)` origins, and combined hero tris < 4,000.

### PR-08: Blender MCP Starter Buildings (`bldg_house.glb`, `bldg_toilet.glb`)
- **Milestone:** M2
- **Depends On:** PR-06
- **Files:** `assets-src/scripts/build_starter_buildings.py`, `public/assets/models/bldg_house.glb`, `public/assets/models/bldg_toilet.glb`
- **Scope:**
  - Model `bldg_house.glb` (jelly-shaped cottage with separately hinged `Door` node for Dr. Bubblegum knocks, cozy chimney, glowing window).
  - Model `bldg_toilet.glb` (cute pastel bathroom booth with flush handle).
- **Verification:** Blender MCP viewport render verified; door pivot sits cleanly at hinge edge; both `.glb` files under 2,500 tris combined.

---

## Milestone 3: Interactive 3D Island & Core Care Loop

### PR-09: Three.js `SceneController`, GLB Loader & Touch Orbit Camera
- **Milestone:** M3
- **Depends On:** PR-02, PR-05, PR-07, PR-08
- **Files:** `src/scene/SceneController.ts`, `src/scene/assetLoader.ts`, `src/scene/TouchOrbitControls.ts`, `src/ui/IslandViewport.tsx`
- **Scope:**
  - Mount WebGL renderer inside `IslandViewport` with `dpr <= 2`, sky gradient synced to local time of day, directional sun + hemisphere light, and blob shadow planes.
  - Load `island_base.glb`, `bldg_house.glb`, and active Jelly Bean (`jelly_larva.glb` or `jelly_bean.glb` based on stage).
  - Implement smooth single-finger orbit + two-finger pinch zoom (`touch-action: none`) and tap raycasting returning clicked world object/pad IDs.
- **Verification:** Renders 3D island + Jelly Bean at 60 FPS in mobile viewport (`390x844`) with zero WebGL warnings.

### PR-10: Jelly Bean Procedural Animations, Needs HUD & Onboarding Mode Select
- **Milestone:** M3
- **Depends On:** PR-09
- **Files:** `src/scene/BeanAnimator.ts`, `src/ui/NeedsHud.tsx`, `src/ui/OnboardingModal.tsx`, `src/ui/ThumbDock.tsx`
- **Scope:**
  - Add procedural squash-and-stretch idle bounce, happy jump, shivering (when cold), crimson angry wobble + steam puffs, and sleep curl.
  - Build `NeedsHud` (5 compact need bars, Level/Stage pill, Jelly Coins / Bean Bucks counters) and `ThumbDock` (bottom 5-tab bar + contextual quick actions).
  - Build `OnboardingModal` letting player name their bean and pick **Regular Mode** or **Baby Mode** (*"a lot harder than regular mode"*).
- **Verification:** Component tests + visual verification that Needs HUD updates live and Baby Mode badge/decay visibly differs from Regular Mode.

### PR-11: Core Care Loop — Feeding, Toilet, Rain, Feathers, Blankets & Digging Holes
- **Milestone:** M3
- **Depends On:** PR-10
- **Files:** `src/scene/WeatherFX.ts`, `src/scene/PlotPropsManager.ts`, `src/ui/CareActionBar.tsx`, `src/ui/SaveSettingsModal.tsx`
- **Scope:**
  - Implement `WeatherFX` instanced raindrops + cloud overhead during Rain; spawn tappable 3D `feather` pickups during Breezy weather.
  - Implement tap-to-dig holes on the 6 island dirt spots (showing `hole_dirt` / `dirt_mound`), calming Anger and popping floating coin/feather feedback.
  - Wire **"Give It Space"** button (14+ Bean Bucks), **Build Toilet** (25 Jelly Coins), **Knit Blanket** (3 Feathers -> warm equip), and **Save Export/Import** modal.
- **Verification:** Playthrough test: feed apple, weather turns rainy, gather 3 feathers & knit blanket to warm bean, build toilet, calm anger by digging holes or spending 14 Bean Bucks.

### PR-12: Dr. Bubblegum Visits, Quest Log & Web Audio Synth
- **Milestone:** M3
- **Depends On:** PR-11
- **Files:** `src/engine/quests.ts`, `src/audio/SoundEngine.ts`, `src/ui/QuestDrawer.tsx`, `src/ui/BubblegumDialog.tsx`, `tests/engine/quests.test.ts`
- **Scope:**
  - Build Web Audio API `SoundEngine` (iOS first-tap unlock, SFX for squish, coin chime, door knock, shovel dig, rain ambience, and cute pitch-modulated bean cries *"Jelly Bean hungry!"* / *"Sleep, sleep"* speech bubbles + mute toggle).
  - Animate Dr. Bubblegum walking up to the House `Door`, knocking, and presenting starter Story Quests (Plot Intro -> Build Toilet -> Calm Anger -> Farm Prep).
- **Verification:** Unit tests for quest completion triggers; audio unlocks cleanly on pointerdown with zero uncaught iOS `AudioContext` errors.

---

## Milestone 4: Farming, Village & Self-Sufficiency

### PR-13: Blender MCP Village Buildings, Crops & Items Packs
- **Milestone:** M4
- **Depends On:** PR-06
- **Files:** `assets-src/scripts/build_village_and_farm.py`, `public/assets/models/bldg_hamburger_stand.glb`, `public/assets/models/bldg_college.glb`, `public/assets/models/bldg_neighbor_cottage.glb`, `public/assets/models/bldg_craft_bench.glb`, `public/assets/models/crops_pack.glb`, `public/assets/models/items_pack.glb`
- **Scope:**
  - Model via Blender MCP and verify viewport screenshots for: Hamburger Stand, Jelly College, Neighbor Cottage, Craft Bench, Crops Pack (`sprout`, `parsley`, `tomato`, `candy_cane`, `bean_bush`), and Items Pack (`apple`, `hamburger`, `jelly_coin`, `bean_buck`, `bonus_bean`, `gumdrop`, `world_clock`).
- **Verification:** All 6 `.glb` bundles inspected via Blender MCP render screenshots and stay within per-asset triangle budgets.

### PR-14: Farming System (Parsley, Tomatoes, Candy Canes & 100 Jelly Beans)
- **Milestone:** M4
- **Depends On:** PR-05, PR-11, PR-13
- **Files:** `src/engine/farming.ts`, `src/scene/FarmRenderer.ts`, `src/ui/FarmSheet.tsx`, `tests/engine/farming.test.ts`
- **Scope:**
  - Unlock and render 4 interactive 3D Garden Plots on the island.
  - Implement planting, rain auto-watering + manual watering boost, offline crop growth progress, and harvesting **Parsley**, **Tomatoes**, **Candy Canes**, and the **100-Jelly-Bean Bush**!
  - Wire Craft Bench to turn crops + meat/bread tokens into **Hamburgers** and **Full Lunches**.
- **Verification:** Unit tests for all 4 crop timers, rain growth bonus, and 100 Jelly Bean harvest payout; visual check of crop stage meshes on island plots.

### PR-15: Island Village Neighbors & 3-Friend "Bonus Bean" Loop
- **Milestone:** M4
- **Depends On:** PR-13, PR-14
- **Files:** `src/engine/village.ts`, `src/ui/VillageSheet.tsx`, `src/scene/VillageRenderer.ts`, `tests/engine/village.test.ts`
- **Scope:**
  - Allow building up to 3 **Neighbor Cottages** inhabited by autonomous AI neighbor Jelly Beans (*Berry*, *Pip*, *Mochi*) strolling the island.
  - Implement Lee's **"Send Jelly Coins to 3 Friends -> Get a Bonus Bean"** mechanic and the **Bean Exchange** (convert Bonus Beans into Jelly Coins or Bean Bucks) with balanced cooldowns.
- **Verification:** Unit tests verify 3-friend gift tracking, Bonus Bean award, and Exchange conversions; neighbor beans visibly wander village pads.

### PR-16: Jelly College, Kitchen Skills, Jobs & Time-Zone Flavor Wardrobe
- **Milestone:** M4
- **Depends On:** PR-14, PR-15
- **Files:** `src/engine/college.ts`, `src/engine/flavors.ts`, `src/ui/CollegeSheet.tsx`, `src/ui/BeanWardrobeSheet.tsx`, `tests/engine/college.test.ts`
- **Scope:**
  - Build **Jelly College** building & enrollment courses: **Kitchen Skills** (unlocks **Hamburger Stand** & self-sufficient auto-eating!), **Botany**, and **Combat Arts**.
  - Unlock **Jobs** (Hamburger Chef, Master Gardener, Scholar) producing passive income.
  - Implement **Flavor Wardrobe** applying real-time shader/color palettes to the 3D Jelly Bean mesh, including local-clock **Time-of-Day Flavors** and the unlockable **World Clock Dial** toy (honoring Lee's time-zone trick).
- **Verification:** Unit tests confirm Kitchen Skills unlocks self-sufficiency; wardrobe recolors 3D Jelly Bean live; World Clock Dial shifts lighting and unlocks timed flavors.

---

## Milestone 5: Mini-Games & Candy Castle Combat

### PR-17: Blender MCP Candy Castle, Monsters & Watermelon Witch Assets
- **Milestone:** M5
- **Depends On:** PR-06
- **Files:** `assets-src/scripts/build_candy_castle.py`, `public/assets/models/bldg_candy_castle.glb`, `public/assets/models/monsters_candy.glb`, `public/assets/models/boss_watermelon_witch.glb`
- **Scope:**
  - Model via Blender MCP: `bldg_candy_castle.glb` (peppermint towers & frosting archway), `monsters_candy.glb` (`gumdrop_golem`, `sour_worm`, `licorice_bat`), and `boss_watermelon_witch.glb` (striped melon witch with witch hat & candy staff).
- **Verification:** Blender MCP front & 3/4 renders checked; named enemy nodes cleanly separated for Three.js combat animation.

### PR-18: Mini-Games — Hole Digger Frenzy & Feather Catch
- **Milestone:** M5
- **Depends On:** PR-10, PR-12
- **Files:** `src/minigames/HoleDiggerGame.tsx`, `src/minigames/FeatherCatchGame.tsx`, `src/ui/ArcadeSheet.tsx`, `tests/minigames/rewards.test.ts`
- **Scope:**
  - Build **Hole Digger Frenzy** (30s portrait tapper: whack dirt mounds around an impatient bean, dodge boots, earn Bean Bucks + Jelly Coins).
  - Build **Feather Catch** (30s thumb-drag collector during a rainstorm: catch falling feathers, dodge puddles, earn Feathers + Bean Bucks).
- **Verification:** High-score & Bean Buck payouts tested in unit/component tests; smooth 60 FPS canvas/DOM interaction in `390x844` touch mode.

### PR-19: Mini-Game — Gumdrop Challenge
- **Milestone:** M5
- **Depends On:** PR-18
- **Files:** `src/minigames/GumdropChallenge.tsx`, `tests/minigames/gumdrop.test.ts`
- **Scope:**
  - Build **Gumdrop Challenge**: 4-lane thumb-tapper / sequence challenge synced to synthesized Web Audio notes, with combo multipliers and Bean Buck payouts.
- **Verification:** Unit tests for combo scoring & reward payout; touch input latency verified cleanly on mobile viewport.

### PR-20: Candy Castle Dungeon & Watermelon Witch Boss Battle
- **Milestone:** M5
- **Depends On:** PR-16, PR-17
- **Files:** `src/minigames/CandyCastleBattle.ts`, `src/scene/BattleStage.ts`, `src/ui/BattleOverlay.tsx`, `tests/minigames/battle.test.ts`
- **Scope:**
  - Build 5-encounter Candy Castle run (3 sugar monster fights, 1 candy trap event, and **Watermelon Witch** boss fight) rendered on a dedicated Three.js diorama stage accessed from the Dock Boat.
  - Implement portrait turn/timing combat (**Bonk**, **Flavor Blast**, timed **Shield/Dodge**), boss *Rind Shield* phase, and victory rewards (**25 Bean Bucks**, XP burst, Candy Castle trophy).
- **Verification:** Unit tests simulate full 5-stage victory and defeat retreat paths; 3D boss battle renders and plays cleanly on mobile viewport.

---

## Milestone 6: Viking Expansion & Dr. Bubblegum Endgame

### PR-21: Blender MCP Viking Expansion Pack Assets
- **Milestone:** M6
- **Depends On:** PR-06
- **Files:** `assets-src/scripts/build_viking_pack.py`, `public/assets/models/viking_pack.glb`
- **Scope:**
  - Model via Blender MCP: `viking_forge` (stone hearth & thatched longhouse roof), `anvil`, `viking_helmet` (attaches to Jelly Bean `Hat_Socket`), `forged_sword` (attaches to `Hand_R`), and `viking_longship` (moored at harbor pier).
- **Verification:** Blender MCP render verified; `viking_helmet` and `forged_sword` align accurately with `jelly_bean.glb` socket positions.

### PR-22: Viking Expansion — Blacksmith Trade, Swordsmith Hobby & Expeditions
- **Milestone:** M6
- **Depends On:** PR-20, PR-21
- **Files:** `src/engine/viking.ts`, `src/ui/VikingSheet.tsx`, `tests/engine/viking.test.ts`
- **Scope:**
  - Add unlockable **Viking Expansion Pack** (50 Bean Bucks or Lv 150) adding snowy pier props, Longship, and **Viking Forge**.
  - Implement **Blacksmith** trade (crafts tool upgrades for passive Jelly Coins) and **Swordsmith** hobby (forges increasingly strong swords boosting Candy Castle & Expedition damage).
  - Add 3 Viking Expeditions reusing the battle engine: *Battle of Svoldaar*, *Battle of Stamford Bridge*, and the notoriously tough *Ice Giant's Palace*.
- **Verification:** Unit tests verify Blacksmith passive yield, Swordsmith weapon scaling, and all 3 Viking expedition outcomes.

### PR-23: Endgame Quests, Chore Wheel "Heart of Gold" & Prestige Lv 1497+ Polish
- **Milestone:** M6
- **Depends On:** PR-12, PR-22
- **Files:** `src/engine/chores.ts`, `src/ui/ChoreWheelModal.tsx`, `src/engine/quests.ts`
- **Scope:**
  - Complete Dr. Bubblegum's full storyline arc culminating in his `"marshmallow with a heart of gold"` reveal after escaping Candy Castle and reaching Citizen/Elder stage.
  - Add the optional **"Ship Chore Wheel"** check-in inside Dr. Bubblegum's notebook rewarding real-life break check-ins with a 15-minute *"Heart of Gold"* cozy buff.
  - Tune XP curve & prestige milestones through **Level 1497+**.
- **Verification:** Unit tests confirm quest chain completion from intro through endgame; Lv 1497+ progression remains numerically stable without overflow.

---

## Milestone 7: iPhone Polish, Performance & Launch QA

### PR-24: iPhone WebGL Performance Audit, Asset Compression & Frame Pacing
- **Milestone:** M7
- **Depends On:** PR-23
- **Files:** `src/scene/SceneController.ts`, `src/scene/PerformanceMonitor.ts`, `src/ui/QualityToggle.tsx`
- **Scope:**
  - Profile draw calls, triangle counts, and shader overhead on mobile WebGL profile; dispose geometries/materials cleanly on scene transitions (preventing iOS Safari WebGL memory leaks).
  - Add optional **Battery Saver (30 FPS / Low FX)** toggle in Settings alongside default 60 FPS mode.
- **Verification:** Active island scene stays under 30,000 triangles and < 40 draw calls; zero WebGL context loss during repeated mini-game/battle transitions.

### PR-25: Playwright Mobile E2E Suite, Accessibility & Production Documentation
- **Milestone:** M7
- **Depends On:** PR-24
- **Files:** `tests/e2e/iphone-playthrough.spec.ts`, `playwright.config.ts`, `README.md`, `src/ui/*` (aria labels & contrast audit)
- **Scope:**
  - Add Playwright E2E suite emulating iPhone (`390x844`, `hasTouch: true`, `isMobile: true`) covering: Onboarding (Regular & Baby Mode), Care actions, Digging Holes, Farming, Village/Bonus Bean, Mini-Game launch, Candy Castle entry, and Save persistence across page reload.
  - Audit all interactive buttons for `>= 44x44px` hit areas and `aria-label` accessibility.
  - Write `README.md` with local dev commands, Blender MCP asset regeneration guide, and GitHub Pages URL instructions.
- **Verification:** `npm run typecheck`, `npm test`, `npm run build`, and `npx playwright test` all pass cleanly in CI; live GitHub Pages deployment verified on iPhone Safari.
