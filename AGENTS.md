# AGENTS.md — avalanche-run-web

Cross-platform Avalanche Run: TypeScript + Canvas 2D + WebAudio (no framework, no asset files), wrapped by
Tauri 2 for macOS and Windows. A port of the SpriteKit original in `~/Code/avalanche-run` (kept as-is).

## Layout
- `src/game.ts`: the `Game` class (state machine, physics, course, tricks/combos, prizes, HUD, overlays) and `Tune`.
- `src/creatures.ts`: penguin, polar bear, yeti (snowballs), narwhal, as functions over `Game`.
- `src/art.ts`: vector art in **y-up** coordinates (the world layer is flipped), ported point for point from SpriteKit.
- `src/synth.ts`: offline synth for every effect and the music loop. `src/sound.ts`: WebAudio playback, unlocked on the first key press.
- `src/storage.ts`: settings + top-10 table in localStorage (every access try/catch'd).
- `src/particles.ts`: SKEmitterNode-style dot emitters. `src/main.ts`: canvas letterboxing, input, loop.
- `src-tauri/`: minimal Tauri shell (no plugins, no commands, strict CSP). Icons come from `npx tauri icon assets/icon.png -o src-tauri/icons`
  (the Android and iOS outputs are deleted).

## Commands
`npm run dev` · `npm run build` (tsc + vite) · `npx tauri dev` · `npx tauri build [--target universal-apple-darwin]`.

## Releasing
1. In a PR, bump `version` in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, and add a
   `## X.Y.Z — date` section to `CHANGELOG.md`.
2. After merging, tag `main` with `vX.Y.Z` and push it. `release.yml` checks the versions match, builds the macOS universal DMG
   and the Windows NSIS installer, zips the browser build, and publishes a release with that version's CHANGELOG notes.

Unsigned: macOS is ad-hoc signed (`signingIdentity: "-"`) and not notarized, and Windows isn't code-signed. The README covers
"Open Anyway" and SmartScreen's "Run anyway". Proper signing needs an Apple Developer membership ($99/yr) and a Windows
certificate or Azure Trusted Signing.

## Verifying visually
In the browser pane: open `/?autoplay&debug=creatures,prizes`, then call `avalancheAdvance(seconds)` in the console and
screenshot. A background pane throttles `requestAnimationFrame` so the game barely advances on its own, and screenshots
trail the canvas by about a frame, so **wait ~2 s after advancing before a screenshot**. Autoplay ignores focus loss,
because screenshots blur the page.

## Gotchas
- Port 5173 is Tauri's `devUrl`; the dev server honors `PORT` for preview tooling. The workspace preview config lives in
  `~/Code/.claude/launch.json` (entry `avalanche-web`, port 5199), not in this repo.
- Browsers block audio until a user gesture: `Sound.prepare()` renders PCM early, and `unlock()` builds the AudioContext on the first key press.
- Originality rule: this is its own game. Don't add mechanics, characters or art copied from any existing skiing game.
  The yeti is a horned periwinkle fuzzball that throws snowballs from the sidelines, never a pursuer that eats the skier.
- Dependency versions were pinned at least two weeks old when added (Tauri CLI 2.12.2, tauri 2.12.3, tauri-build 2.7.2,
  Vite 8.3.4, TypeScript 7.0.2).
