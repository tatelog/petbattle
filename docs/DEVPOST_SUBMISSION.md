# PETBATTLE — Devpost Submission Package

Copy the English sections below into Devpost. Replace only the three placeholders marked `REQUIRED BEFORE SUBMIT`.

## Submission fields

**Project name**

PETBATTLE

**Tagline**

Turn any visual creation into a playable PET, battle with meaning—not file size—and unlock new creative media by learning.

**Track**

Education

**Try it**

https://tatelog.github.io/petbattle/

**Source code**

https://github.com/tatelog/petbattle

**Demo video**

`REQUIRED BEFORE SUBMIT: public YouTube URL for public/demo/petbattle-submission-en.mp4`

**Primary Codex Session ID**

`REQUIRED BEFORE SUBMIT: run /feedback in the primary PETBATTLE Codex thread and paste the Session ID`

**Team**

`REQUIRED BEFORE SUBMIT: confirm the Devpost entrant/team members and that every invitation was accepted`

## Short description

PETBATTLE is a browser-based educational battle game where a learner uploads an image, turns its meaning into a bounded set of “essences,” summons it as a PET, and fights in a 3D colosseum using Physical, Magic, and Defense commands. Winning is not based on file size, image resolution, or token usage. A deterministic rules engine converts semantic features into explainable stats. Battles award XP and action mastery; at Core Level 2, learners unlock a source-image-free SVG quest that teaches observation, decomposition, construction, validation, and reflection.

The complete CPU experience runs on GitHub Pages without an API key. An optional Cloudflare Worker uses GPT-5.6 Luna for structured semantic recognition and falls back to the local analyzer when unavailable. The same Worker supports sealed-action online battles without exposing the OpenAI API key to the browser.

## Inspiration

Generative tools make it easy to produce more files, but “more tokens” and “larger files” are poor measures of learning or creative quality. We wanted progression to reward a learner for understanding what they made and for acquiring new ways to express it. PETBATTLE turns that process into a game: creations become playable characters, battle choices become a learning record, and new formats become creative quests rather than passive feature unlocks.

## What it does

- Summons JPEG, PNG, and WebP artifacts through an animated magic circle.
- Extracts local visual features and normalizes meaning into 16 bounded essences.
- Optionally asks GPT-5.6 Luna for structured semantic candidates through a secure Worker.
- Displays only the learner's PET and explainable Core parameters before battle; the opponent is revealed at battle start.
- Runs an immersive 3D colosseum battle with Physical, Magic, Defense, counters, effects, an aerial camera descent, and fullscreen mode.
- Works without API credentials for local analysis, CPU battles, progression, and the SVG quest.
- Awards multi-match XP and mastery instead of allowing one match or a large file to produce an instant level-up.
- Unlocks a source-image-free SVG Evolution Quest at Level 2, with Observe → Decompose → Build → Verify guidance and a saved learning reflection.
- Persists progress and portfolio evidence locally, and supports Japanese/English plus light/dark themes.

## How we built it

The client uses React 19, TypeScript, Vite, Three.js, and React Three Fiber. Artifact parsing, stat derivation, battle resolution, progression, and SVG validation are separate deterministic modules with Vitest coverage. GitHub Actions tests and builds the app, then publishes it to GitHub Pages.

For optional AI recognition, the browser sends an image to a Cloudflare Worker. GPT-5.6 Luna returns a small structured semantic description—not final battle stats. Zod validates the response, and the same deterministic browser rules derive the PET parameters. This boundary makes the AI useful for meaning while keeping gameplay explainable, testable, and resistant to “spend more tokens to win.” The API key remains a Worker secret. If the Worker or model is unavailable, local analysis keeps the full core experience playable.

Codex was the primary implementation partner. We used it to inspect the unfinished source concept, redesign PETBATTLE as a new project, implement the 3D arena and sealed reveal, separate deterministic domain modules, build the Worker boundary, create progression and SVG learning quests, add multilingual themes, write tests, run browser QA, record demos, and deploy through GitHub Pages. We made the core product decisions: meaning rather than file size determines strength; the opponent remains hidden until battle; AI proposes semantics but deterministic code determines stats; and progression must require repeated play plus creative reflection.

## Challenges

The hardest problem was combining spectacle with fairness. The battle needed to feel like a game, but it could not reward resolution, byte count, or raw model usage. We solved this by limiting essence capacity per level and separating AI semantic recognition from deterministic stat calculation. Another challenge was keeping a 3D experience reliable on a static host. The local fallback, reduced-motion support, intro timeout, fullscreen battle region, and browser persistence make the demo resilient without a backend.

## Accomplishments

- A coherent summon-to-battle-to-evolution loop that runs from a public static URL.
- A 3D arena introduction and battle UI with no pre-battle opponent leak.
- API-free local play with an optional GPT-5.6 enhancement rather than an API dependency.
- Explainable progression that takes multiple matches and rewards action variety.
- A real Level 2 educational quest that creates safe, self-contained SVG and stores reflection evidence.
- Automated tests, production build, GitHub Pages deployment, accessibility labels, localization, and reduced-motion support.

## What we learned

AI works best here as a semantic collaborator, not an opaque judge. Keeping semantic extraction separate from battle math made the system easier to test and explain. We also learned that an educational mechanic becomes more credible when it produces evidence: the SVG quest does not merely unlock a file extension; it asks the learner to observe, decompose, construct, verify, and describe the decisions they made.

## What's next

The current runnable quest covers raster images and SVG. Future Core Levels can add code-driven effects, 3D formats such as GLB/OBJ/STL, and structured artifacts such as PDF and IFC. Each format will require its own sandbox, validator, learning objective, and explainable conversion rule. Online 1v1 can be expanded with matchmaking and teacher-created challenge rooms, while portfolios can evolve into exportable evidence for classrooms and workshops.

## Judging criteria mapping

| Criterion | Evidence in PETBATTLE |
|---|---|
| Technological Implementation | Non-trivial React/Three.js product; deterministic artifact, battle, progression, and SVG modules; optional GPT-5.6 Worker boundary; tests and browser QA; GitHub Pages CI/CD. |
| Design | Complete summon → parameter understanding → arena reveal → battle → XP → evolution loop; 3D intro, effects, fullscreen UI, responsive layout, themes, localization, and reduced motion. |
| Potential Impact | Gives students a motivating reason to learn new representation formats and records battle choices, creative process, reflection, and produced artifacts as evidence. |
| Quality of the Idea | Treats creations as playable expression tokens while explicitly preventing token count, resolution, or byte size from becoming pay-to-win power. |

## New work and provenance

PETBATTLE was created as a new repository during the July 13–21, 2026 Build Week submission period. It reinterprets an unfinished `tatelog/rakugaki` concept, but the submitted implementation was built during Build Week: the artifact model, deterministic stat rules, 3D arena, battle system, sealed opponent reveal, API-free analyzer, Worker integration, progression, SVG Evolution Quest, localization, tests, demo assets, and GitHub Pages deployment. The dated public commit history provides the implementation record.

## Testing instructions for judges

1. Open https://tatelog.github.io/petbattle/ in a current desktop browser.
2. No API key or account is required. The sample PET is ready immediately.
3. Optionally choose a JPEG, PNG, or WebP file up to the displayed level limit.
4. Select **Analyze meaning** / **意味を解析**.
5. Confirm that only the player's PET and parameter visualization are shown before battle.
6. Select **Start CPU Battle in 3D Colosseum**.
7. Watch the aerial camera descend; the opponent appears only when the battle starts.
8. Use Physical, Magic, and Defense. Defense counters Physical, Physical interrupts Magic, and Magic pierces Defense.
9. Finish a match to view XP and mastery. Existing browser progress may already expose the Level 2 SVG quest.
10. Switch language and theme from the header. All core CPU functionality remains API-free.

Local verification:

```powershell
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

