# Avalanche Run

An original downhill skiing arcade game. The avalanche is coming: ski as far as
you can, dodge trees, rocks and the locals, hit ramps for spins and grabs,
chain tricks into combos, grab prize boxes to buy time, and sign the
high-score board.

It's written in TypeScript (Canvas 2D + WebAudio, no frameworks, no asset
files) and runs in any modern browser. [Tauri](https://tauri.app) wraps the
same build as a small native app for **macOS** and **Windows**.

> This is the cross-platform successor to the original SpriteKit version,
> [git-cgallagher/avalanche-run](https://github.com/git-cgallagher/avalanche-run) (macOS only), which stays available as-is.

## Install

Download the latest installer from the
[Releases page](https://github.com/git-cgallagher/avalanche-run-web/releases/latest).

**macOS 11 or later (Apple silicon or Intel):** open `Avalanche Run_<version>_universal.dmg`
and drag **Avalanche Run** onto **Applications**. The app isn't notarized by Apple (that needs a paid
developer account), so the first launch is blocked. Open it once, dismiss the warning, then go to
**System Settings ▸ Privacy & Security** and click **Open Anyway**. Or run:

```bash
xattr -dr com.apple.quarantine "/Applications/Avalanche Run.app"
```

**Windows 10 or 11:** run `Avalanche Run_<version>_x64-setup.exe`. It installs for your user only,
with no admin prompt. The installer isn't code-signed, so SmartScreen may say "Windows protected your PC".
Click **More info ▸ Run anyway**. The game uses Microsoft Edge WebView2, which Windows 10 and 11 already include.

**In a browser:** unzip `AvalancheRun-web-<version>.zip` onto any static web host, or run it locally (below).

## Play

| Key | Action |
|---|---|
| ← → (A D) | Steer; in the air, spin |
| ↓ (S) | Tuck (faster); in the air, grab (ramp air only) |
| ↑ (W) | Brake |
| Space | Jump / start |
| P or Esc | Pause |
| M | Cycle sound: music + effects → effects only → muted |
| G or 1–4 | Game speed, on the title or pause screen (⌘/Ctrl+1–4 any time) |
| H | High scores (title screen) |
| Return or R | Ski again after you're buried |

**Scoring.** 1 point per meter, plus tricks at your **combo multiplier** (×1 up to ×8). Each trick adds one
to the chain; you have 3 seconds on the ground to land the next (the clock pauses in the air). Crashing
loses the combo.

| Trick | Base points |
|---|---|
| Spin off a ramp or jump | 250 per full turn (land within ~45° of straight or you wipe out) |
| Grab (hold ↓ for ¼ s on ramp air) | 100 |
| Big air (a second or more aloft) | 100 |
| Gate (between the blue flags, also a speed boost) | 100 |
| Hop a creature | 250 |
| Close call (just miss a creature) | 150 |
| Dodge a snowball mid-air | 100 |
| Clear (jump a tree or rock) / prize box | 50 |

**Prize boxes** turn up every 120–220 m and either freeze the avalanche for 4 s or shove it back 50 m.

**The locals**, from 200 m on, one at a time and more often the further down you get (a red **!** warns
you): a belly-sliding **penguin**, a charging **polar bear**, a **yeti** (a horned fuzzball) that lobs
snowballs from the sidelines, and a **narwhal** that breaches out of a ripple in the snow ahead.

**Game speed.** Chill 0.75×, Normal 1×, Fast 1.25×, Turbo 1.5× scale the whole simulation. High scores
record the slowest speed used in a run.

Settings and the top-10 table are stored locally (localStorage).

## Develop

Requires Node 22+. The desktop app also needs Rust (stable) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
npm ci
npm run dev            # http://localhost:5173
npm run build          # type-check + browser build in dist/
npx tauri dev          # desktop window with hot reload
npx tauri build        # installer for this OS (src-tauri/target/release/bundle/)
```

Dev-only URL options: `?debug=creatures,prizes` forces early creatures and frequent prize boxes,
`?autoplay` drives a scripted test run, and in dev builds `avalancheAdvance(seconds)` in the console
steps the game and redraws at once.

## License

MIT.
