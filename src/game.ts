import { art, ellipse, skier, type ArtName } from './art';
import { Creature, Snowball, drawCreatureScreen, drawCreatureWorld, updateCreatures, type CreatureKind } from './creatures';
import { P } from './palette';
import { Emitter } from './particles';
import { clamp, rand, randInt, seeded } from './rng';
import type { Sound } from './sound';
import type { Effect } from './synth';
import { Leaderboard, Settings, speedLabel } from './storage';

export const W = 1024;
export const H = 768;

/** Gameplay tuning. Distances are world points; 10 points = 1 meter. +y is uphill. */
export const Tune = {
  halfWidth: 1100, // the run is 2,200 pt wide
  maxHeading: 1.35, // ~77° from straight downhill
  steerRate: 2.8, // rad/s
  gravity: 400,
  drag: 0.42,
  tuckBoost: 1.4,
  brake: 560,
  maxSpeed: 1250,
  jumpAir: 0.5, // seconds aloft from a Space jump
  spinRate: 12, // rad/s while airborne
  landingSlop: 0.8, // radians off straight that still lands clean
  grabTime: 0.25, // seconds of ↓ in the air that count as a grab
  grabMinAir: 0.8, // grabs only count on ramp-sized air, so hops can't farm them
  comboWindow: 3, // seconds to chain the next trick
  maxMultiplier: 8,
  pointsPerMeter: 10,
  lookAhead: 200, // skier sits this far above screen center
  maxGap: 1200, // avalanche never falls further behind than this
  rowSpacing: 80,
  creaturesFrom: 200, // meters before the locals start showing up
  prizeSpacing: [1200, 2200] as const, // points between prize boxes (120–220 m)
  prizePush: 500, // a distance prize shoves the avalanche back 50 m
  prizeFreeze: 4, // a time prize stops the avalanche for this many seconds
};

const Keys = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  tuck: ['ArrowDown', 'KeyS'],
  brake: ['ArrowUp', 'KeyW'],
  jump: 'Space',
  pause: ['KeyP', 'Escape'],
  confirm: ['Enter', 'NumpadEnter'],
  restart: 'KeyR',
  sound: 'KeyM',
  scores: 'KeyH',
  speed: 'KeyG',
  delete: 'Backspace',
};

type State = 'title' | 'scores' | 'playing' | 'paused' | 'buried' | 'naming' | 'over';
type ObstacleKind = 'tree' | 'rock' | 'mogul' | 'ramp' | 'gate' | 'prize' | 'decor';

interface Obstacle {
  kind: ObstacleKind;
  art: ArtName;
  x: number;
  y: number;
  scale: number;
  radius: number;
  used: boolean;
  /** Seconds since a prize was collected (its pop animation); -1 until then. */
  popped: number;
}

interface Track { x: number; y: number; rotation: number; length: number; age: number }
interface Popup { text: string; color: string; x: number; y: number; age: number }
interface Splat { x: number; y: number; age: number }
interface PanelItem { text: string; size: number; font: Font; color: string; x: number; y: number; align: CanvasTextAlign }
interface Panel { items: PanelItem[]; height: number }
type Font = 'bold' | 'demi' | 'mono';

export interface GameOptions {
  debugCreatures: boolean;
  debugPrizes: boolean;
  autoplay: boolean;
}

const fonts: Record<Font, (size: number) => string> = {
  bold: (s) => `800 ${s}px "Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif`,
  demi: (s) => `600 ${s}px "Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif`,
  mono: (s) => `bold ${s}px Menlo, Consolas, "Courier New", monospace`,
};

/** Camera-space (origin at screen center, +y up) to canvas pixels. */
export const sx = (x: number) => W / 2 + x;
export const sy = (y: number) => H / 2 - y;

export class Game {
  state: State = 'title';
  pos = { x: 0, y: 0 };
  heading = 0;
  vel = 0;
  airLeft = 0;
  airTotal = 0;
  canSpin = false; // true for real jumps; mogul bumps can't be spun or count as clears
  spin = 0;
  grabTime = 0;
  stun = 0;
  avY = 540;
  camBase = { x: 0, y: 0 };
  cam = { x: 0, y: 0 };
  shake = 0;
  points = 0;
  comboChain = 0;
  comboTimer = 0;
  creatures: Creature[] = [];
  snowballs: Snowball[] = [];
  nextAttack = rand(3, 7);
  lastCreature?: CreatureKind;
  attackCount = 0;
  splats: Splat[] = [];
  bursts: Emitter[] = [];
  /** Animation clock in simulated seconds (scaled by game speed). */
  time = 0;

  private obstacles: Obstacle[] = [];
  private spawnedTo = 0;
  private keys = new Set<string>();
  private overTimer = 0;
  private popupSlot = 0;
  private playerName = '';
  private nextPrizeY = -900;
  private frozenTime = 0;
  private slowestSpeed = 1; // the leaderboard records the slowest speed used in a run
  private debugPrizeTimer = 2;
  private tracks: Track[] = [];
  private popups: Popup[] = [];
  private tumble = 0; // seconds left in the crash spin animation
  private skierAlpha = 1;
  private artYScale = 1;
  private overlay: Panel | null = null;
  private nameItem: PanelItem | null = null;
  private fadeIn: number;
  private snowfall: Emitter;
  private puffs: Emitter;
  private avalancheBack: Path2D;
  private avalancheFront: Path2D;
  private autopilotClock = 0;
  private autopilotStep = 0;

  /** Set by main.ts: swaps in a fresh Game for the next run. */
  onRestart: () => void = () => {};

  constructor(private sound: Sound, readonly options: GameOptions, autostart = false) {
    this.fadeIn = autostart ? 0.35 : 0;
    this.snowfall = new Emitter({
      rate: 50, life: 10, rangeX: 1300, angle: -Math.PI / 2 - 0.25, angleRange: 0.4,
      speed: 70, speedRange: 30, size: 12, scale: 0.35, scaleRange: 0.25, alpha: 0.9, color: P.white,
    }, 0, 420);
    this.snowfall.prefill(10);
    this.puffs = new Emitter({
      rate: 160, life: 0.9, rangeX: 2400, rangeY: 10, angle: -Math.PI / 2, angleRange: 0.8,
      speed: 110, speedRange: 60, size: 20, scale: 0.9, scaleRange: 0.6, alpha: 0.9, alphaSpeed: -1, color: P.white,
    }, 0, -18);
    this.avalancheBack = avalancheFront(30, 7);
    this.avalancheFront = avalancheFront(24, 3);
    if (options.debugCreatures) this.nextAttack = 1.2;

    this.spawnRows();
    this.updateCamera(0, true);
    this.sound.startMusic();
    if (autostart) this.start();
    else this.showTitle();
  }

  get meters(): number {
    return Math.floor(Math.max(0, -this.pos.y) / Tune.pointsPerMeter);
  }

  private get score(): number {
    return this.meters + this.points;
  }

  private get multiplier(): number {
    return Math.min(1 + this.comboChain, Tune.maxMultiplier);
  }

  // MARK: - Course generation

  private place(art: ArtName, kind: ObstacleKind, x: number, y: number, radius = 0, scale = 1): Obstacle {
    const obstacle: Obstacle = { kind, art, x, y, scale, radius: radius * scale, used: false, popped: -1 };
    this.obstacles.push(obstacle);
    return obstacle;
  }

  private spawnRows() {
    const w = Tune.halfWidth;
    while (this.spawnedTo > this.pos.y - 1000) {
      this.spawnedTo -= Tune.rowSpacing;
      const y = this.spawnedTo;
      const row = Math.round(-y / Tune.rowSpacing);

      // Run boundary: posts on the edge, forest beyond it.
      for (const side of [-1, 1]) {
        if (row % 2 === 0) this.place('post', 'decor', side * (w + 8), y);
        for (let i = 0; i < 2; i++) this.place('tree', 'decor', side * (w + rand(50, 300)), y + rand(-40, 40), 0, rand(0.9, 1.5));
      }
      for (let i = 0; i < 2; i++) this.place('dimple', 'decor', rand(-w, w), y + rand(-40, 40));

      if (y < this.nextPrizeY) {
        this.place('prize', 'prize', rand(-w + 80, w - 80), y, 22);
        this.nextPrizeY -= rand(...Tune.prizeSpacing);
        continue;
      }

      if (y >= -450) continue; // keep the start area clear
      const density = Math.min(1.4 + -y / 9000, 5);
      let count = Math.floor(density);
      if (Math.random() < density - count) count++;
      for (let i = 0; i < count; i++) {
        const x = rand(-w + 40, w - 40);
        const py = y + rand(-30, 30);
        const roll = randInt(0, 100);
        if (roll < 46) this.place('tree', 'tree', x, py, 13, rand(0.85, 1.3));
        else if (roll < 62) this.place('rock', 'rock', x, py, 15, rand(0.8, 1.2));
        else if (roll < 80) this.place('mogul', 'mogul', x, py, 24);
        else if (roll < 91) this.place('ramp', 'ramp', x, py);
        else this.place('poleL', 'gate', x, py, 70);
      }
    }
  }

  private cleanup() {
    const top = this.camBase.y + H / 2 + 120;
    this.obstacles = this.obstacles.filter((o) => o.y <= top && (o.popped < 0 || o.popped < 0.25));
  }

  // MARK: - Input

  keyDown(code: string, key: string, repeat: boolean, modifier: boolean) {
    if (this.state === 'naming') {
      this.typeName(code, key);
      return;
    }
    this.keys.add(code);
    if (repeat) return;

    const digit = /^Digit([1-4])$/.exec(code);
    const menuState = this.state === 'title' || this.state === 'scores' || this.state === 'paused';
    if (digit && (modifier || menuState)) {
      Settings.speedIndex = Number(digit[1]) - 1;
      this.speedChanged();
      return;
    }
    if (code === Keys.sound) {
      this.popup(this.sound.cycleMode(), P.ink);
      this.sound.play('blip');
      return;
    }
    if (code === Keys.speed && menuState) {
      Settings.cycleSpeed();
      this.speedChanged();
      return;
    }

    switch (this.state) {
      case 'title':
        if (code === Keys.jump || Keys.confirm.includes(code)) this.start();
        if (code === Keys.scores) this.showScores();
        break;
      case 'scores':
        if (code === Keys.jump || Keys.confirm.includes(code)) this.start();
        if (code === Keys.scores || Keys.pause.includes(code)) this.showTitle();
        break;
      case 'playing':
        if (code === Keys.jump) this.jump();
        if (Keys.pause.includes(code)) this.setPaused(true);
        break;
      case 'paused':
        if (Keys.pause.includes(code) || code === Keys.jump) this.setPaused(false);
        break;
      case 'over':
        if (Keys.confirm.includes(code) || code === Keys.restart) this.onRestart();
        break;
      default:
        break;
    }
  }

  keyUp(code: string) {
    this.keys.delete(code);
  }

  /** Key-up events are lost while the window is in the background, so drop held keys and pause. */
  focusLost() {
    if (this.options.autoplay) return; // scripted runs keep going when screenshots steal focus
    this.keys.clear();
    if (this.state === 'playing') this.setPaused(true);
  }

  private held(codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  private speedChanged() {
    this.popup(`Speed: ${speedLabel(Settings.speed)}`, P.ink);
    this.sound.play('blip');
    if (this.state === 'title') this.showTitle();
    if (this.state === 'paused') this.showPause();
  }

  // MARK: - Game flow

  private start() {
    this.slowestSpeed = Settings.speed.multiplier;
    this.state = 'playing';
    this.overlay = null;
  }

  private setPaused(paused: boolean) {
    if (paused) {
      this.state = 'paused';
      this.showPause();
    } else {
      this.state = 'playing';
      this.overlay = null;
    }
    this.sound.pauseMusic(paused);
  }

  private bury() {
    this.state = 'buried';
    this.overTimer = 0;
    this.vel = 0;
    this.keys.clear();
    this.comboChain = 0;
    this.sound.stopMusic();
    this.sound.play('buried');
  }

  private finishRun() {
    if (Leaderboard.qualifies(this.score)) {
      this.state = 'naming';
      this.playerName = Leaderboard.lastName;
      this.showNameEntry();
      this.sound.play('highScore');
    } else {
      this.state = 'over';
      this.showLeaderboard('BURIED!', `${fmt(this.meters)} m  ·  score ${fmt(this.score)}${this.speedNote}`, null, 'Press Return to ski again');
    }
  }

  private typeName(code: string, key: string) {
    if (Keys.confirm.includes(code)) {
      this.commitName();
      return;
    }
    if (code === Keys.delete) {
      if (!this.playerName) return;
      this.playerName = this.playerName.slice(0, -1);
    } else if (key.length === 1 && this.playerName.length < 12 && /^[\p{L}\p{N} \-.']$/u.test(key)) {
      this.playerName += key.toUpperCase();
    } else {
      return;
    }
    this.sound.play('blip', 0.6);
    if (this.nameItem) this.nameItem.text = this.playerName + '_';
  }

  private commitName() {
    const name = this.playerName.trim() || 'SKIER';
    Leaderboard.lastName = name;
    const rank = Leaderboard.record({
      name, score: this.score, meters: this.meters, date: new Date().toISOString(), speed: this.slowestSpeed,
    });
    this.state = 'over';
    this.sound.play('trick');
    this.showLeaderboard('HIGH SCORES', `${name} takes #${rank + 1}`, rank, 'Press Return to ski again');
  }

  // MARK: - Overlays

  private showTitle() {
    this.state = 'title';
    this.showPanel('AVALANCHE RUN', [
      'Outrun the avalanche. Ski as far as you can.',
      '← →  steer     ↓  tuck     ↑  brake     Space  jump',
      'In the air: hold ← → to spin, ↓ to grab. Chain tricks for combos.',
      'Grab prize boxes to freeze or push back the avalanche.',
      'Watch out for the locals. Jump them for big points.',
      '',
      'Space  start     H  high scores     M  sound',
      `G or 1–4  game speed: ${speedLabel(Settings.speed)}`,
    ]);
  }

  private showPause() {
    this.showPanel('PAUSED', ['Press P to keep skiing', `G or 1–4  game speed: ${speedLabel(Settings.speed)}`]);
  }

  private showScores() {
    this.state = 'scores';
    this.showLeaderboard('HIGH SCORES', null, null, 'Space  start     H  back');
  }

  /** " · Turbo" when the run wasn't at normal speed. */
  private get speedNote(): string {
    return this.slowestSpeed === 1 ? '' : `  ·  ${Settings.nameFor(this.slowestSpeed)}`;
  }

  private showNameEntry() {
    const rank = Leaderboard.rankFor(this.score);
    this.presentPanel((line) => {
      line('NEW HIGH SCORE!', 44);
      line(`#${rank + 1}  ·  ${fmt(this.score)} points  ·  ${fmt(this.meters)} m${this.speedNote}`, 19, 'demi');
      line('', 8);
      this.nameItem = line(this.playerName + '_', 34, 'mono', P.gate);
      line('', 8);
      line('Type your name, then press Return', 17, 'demi');
    });
  }

  private showPanel(title: string, lines: string[]) {
    this.presentPanel((line) => {
      line(title, 48);
      line('', 6);
      for (const text of lines) line(text, 19, 'demi');
    });
  }

  private showLeaderboard(title: string, subtitle: string | null, highlight: number | null, footer: string) {
    const entries = Leaderboard.entries;
    this.presentPanel((line, cells) => {
      line(title, 44);
      if (subtitle) line(subtitle, 19, 'demi');
      line('', 10);
      if (entries.length === 0) line('No scores yet. Go set one!', 17, 'demi');
      entries.forEach((entry, i) => {
        const color = i === highlight ? P.gate : P.ink;
        const speed = entry.speed === undefined || entry.speed === 1 ? '' : Settings.nameFor(entry.speed);
        cells(28, [
          { text: `${i + 1}.`, x: -200, align: 'right' },
          { text: entry.name, x: -185, align: 'left' },
          { text: speed, x: 40, align: 'right' },
          { text: `${fmt(entry.meters)} m`, x: 130, align: 'right' },
          { text: fmt(entry.score), x: 260, align: 'right' },
        ], color);
      });
      line('', 12);
      line(footer, 17, 'demi');
    });
  }

  /** Lays lines out top-down, then sizes a rounded panel to fit and centers it. */
  private presentPanel(
    build: (
      line: (text: string, size: number, font?: Font, color?: string) => PanelItem,
      cells: (height: number, columns: { text: string; x: number; align: CanvasTextAlign }[], color: string) => void,
    ) => void,
  ) {
    const items: PanelItem[] = [];
    this.nameItem = null;
    let y = 0;
    const line = (text: string, size: number, font: Font = 'bold', color: string = P.ink) => {
      y -= size * 0.75;
      const item: PanelItem = { text, size, font, color, x: 0, y, align: 'center' };
      if (text) items.push(item);
      y -= size * 0.75;
      return item;
    };
    const cells = (height: number, columns: { text: string; x: number; align: CanvasTextAlign }[], color: string) => {
      y -= height / 2;
      for (const col of columns) items.push({ text: col.text, size: 18, font: 'mono', color, x: col.x, y, align: col.align });
      y -= height / 2;
    };
    build(line, cells);
    const height = -y + 64;
    for (const item of items) item.y += height / 2 - 32;
    this.overlay = { items, height };
  }

  // MARK: - Simulation

  update(dt: number) {
    const rate = Settings.speed.multiplier;
    const sim = dt * rate;
    this.time += sim;
    if (this.options.autoplay) this.autopilot(dt);

    switch (this.state) {
      case 'playing': {
        // Substep at 60 Hz or finer so fast speeds can't tunnel through trees.
        const steps = Math.max(1, Math.ceil(sim * 60 - 0.01));
        for (let i = 0; i < steps && this.state === 'playing'; i++) this.step(sim / steps);
        break;
      }
      case 'buried':
        this.stepBuried(sim);
        break;
      default:
        this.sound.setRumble(0);
    }

    this.updateEffects(dt, sim);
    this.updateCamera(dt);
    this.fadeIn = Math.max(0, this.fadeIn - dt);
  }

  private step(dt: number) {
    const prevY = this.pos.y;
    this.slowestSpeed = Math.min(this.slowestSpeed, Settings.speed.multiplier);

    if (this.stun > 0) {
      this.stun -= dt;
    } else if (this.airLeft > 0) {
      const grabbing = this.canSpin && this.held(Keys.tuck);
      if (this.canSpin) {
        if (this.held(Keys.left)) this.spin -= Tune.spinRate * dt;
        if (this.held(Keys.right)) this.spin += Tune.spinRate * dt;
        if (grabbing) this.grabTime += dt;
      }
      this.artYScale = grabbing ? 0.8 : 1;
      this.airLeft -= dt;
      if (this.airLeft <= 0) this.land();
    } else {
      if (this.held(Keys.left)) this.heading -= Tune.steerRate * dt;
      if (this.held(Keys.right)) this.heading += Tune.steerRate * dt;
      this.heading = clamp(this.heading, -Tune.maxHeading, Tune.maxHeading);
      let accel = Tune.gravity * Math.cos(this.heading) * (this.held(Keys.tuck) ? Tune.tuckBoost : 1) - Tune.drag * this.vel;
      if (this.held(Keys.brake)) accel -= Tune.brake;
      this.vel = clamp(this.vel + accel * dt, 0, Tune.maxSpeed);
    }

    this.pos.x += this.vel * Math.sin(this.heading) * dt;
    this.pos.y -= this.vel * Math.cos(this.heading) * dt;

    const limit = Tune.halfWidth - 24;
    if (Math.abs(this.pos.x) > limit) {
      this.pos.x = Math.sign(this.pos.x) * limit;
      this.heading = -Math.sign(this.pos.x) * Math.abs(this.heading) * 0.5;
      this.vel *= 0.85;
    }

    // The combo clock only runs while you're on the ground.
    if (this.comboChain > 0 && this.airLeft <= 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboChain = 0;
    }

    if (this.options.debugPrizes) {
      this.debugPrizeTimer -= dt;
      if (this.debugPrizeTimer <= 0) {
        this.debugPrizeTimer = 2;
        this.place('prize', 'prize', this.pos.x + Math.sin(this.heading) * 300, this.pos.y - Math.cos(this.heading) * 300, 22);
      }
    }
    this.collide(prevY);
    updateCreatures(this, dt);
    this.layTracks(dt);

    if (this.frozenTime > 0) this.frozenTime = Math.max(0, this.frozenTime - dt);
    const avalancheSpeed = this.frozenTime > 0 ? 0 : Math.min(320 + -this.pos.y * 0.014, 860);
    this.avY = Math.min(this.avY - avalancheSpeed * dt, this.pos.y + Tune.maxGap);
    const gap = this.avY - this.pos.y;
    if (gap < 420 && this.frozenTime <= 0) this.shake = Math.max(this.shake, ((420 - gap) / 420) * 6);
    const rumble = clamp((800 - gap) / 800, 0, 1);
    this.sound.setRumble(this.frozenTime > 0 ? rumble * 0.25 : rumble);
    if (gap <= 6) this.bury();

    this.spawnRows();
    this.cleanup();
  }

  private stepBuried(dt: number) {
    this.overTimer += dt;
    this.sound.setRumble(Math.max(0, 1 - this.overTimer / 1.2));
    this.skierAlpha = Math.max(0, 1 - this.overTimer / 0.4);
    if (this.overTimer < 1.2) this.avY -= 380 * dt;
    if (this.overTimer > 1.2 && !this.overlay) this.finishRun();
  }

  private collide(prevY: number) {
    const grounded = this.airLeft <= 0 && this.stun <= 0;
    for (const o of this.obstacles) {
      if (o.used || o.kind === 'decor') continue;
      const dy = this.pos.y - o.y;
      if (Math.abs(dy) >= 90) continue;
      const dx = this.pos.x - o.x;
      const distance = Math.hypot(dx, dy);
      switch (o.kind) {
        case 'tree':
        case 'rock':
          if (distance >= o.radius + 8) break;
          if (this.airLeft > 0) {
            if (!this.canSpin) break;
            o.used = true;
            this.award('Clear', 50, 'clear');
          } else if (this.stun <= 0) {
            o.used = true;
            this.crash(o.kind === 'tree' ? 'Timber!' : 'Rocked!');
          }
          break;
        case 'mogul':
          if (!grounded || Math.abs(dx) >= o.radius || Math.abs(dy) >= 12) break;
          o.used = true;
          this.vel *= 0.65;
          this.launch(0.18, false);
          break;
        case 'ramp':
          if (!grounded || Math.abs(dx) >= 28 || Math.abs(dy) >= 16) break;
          o.used = true;
          this.launch(0.5 + this.vel / 1400, true);
          this.sound.play('jump');
          break;
        case 'gate':
          if (!(prevY > o.y && this.pos.y <= o.y)) break;
          o.used = true;
          if (Math.abs(dx) < o.radius - 4) {
            this.vel = Math.min(Tune.maxSpeed, this.vel + 110);
            this.award('Gate', 100, 'gate');
          }
          break;
        case 'prize':
          if (distance >= o.radius + 12) break;
          o.used = true;
          o.popped = 0;
          this.collectPrize(o.x, o.y);
          break;
      }
    }
  }

  /**
   * Prize boxes buy time (freeze the avalanche) or distance (shove it back).
   * A distance prize would be wasted when the avalanche is already far back, so that rolls time instead.
   */
  private collectPrize(x: number, y: number) {
    const gap = this.avY - this.pos.y;
    if (gap > Tune.maxGap - Tune.prizePush / 2 || Math.random() < 0.5) {
      this.frozenTime += Tune.prizeFreeze;
      this.popup(`Avalanche frozen +${Tune.prizeFreeze}s`, P.frozen);
    } else {
      this.avY = Math.min(this.avY + Tune.prizePush, this.pos.y + Tune.maxGap);
      this.popup(`Avalanche pushed back +${Tune.prizePush / Tune.pointsPerMeter} m`, P.frozen);
    }
    this.award('Prize', 50, null);
    this.sound.play('prize');
    this.burst(x, y, P.ribbon, 40, 10, 0.5, 180, 0.7, -1.4);
  }

  burst(x: number, y: number, color: string, count: number, size: number, scale: number, speed: number, life: number, alphaSpeed: number) {
    const emitter = new Emitter({
      rate: 0, life, rangeX: 0, angle: 0, angleRange: Math.PI * 2, speed, speedRange: speed / 2,
      size, scale, scaleRange: scale * 0.7, alpha: 1, alphaSpeed, color,
    }, x, y);
    emitter.spawn(count);
    this.bursts.push(emitter);
  }

  jump() {
    if (this.airLeft > 0 || this.stun > 0 || this.vel <= 80) return;
    this.launch(Tune.jumpAir, true);
    this.sound.play('jump');
  }

  private launch(time: number, spinnable: boolean) {
    this.airLeft = time;
    this.airTotal = time;
    this.canSpin = spinnable;
    this.spin = 0;
    this.grabTime = 0;
  }

  private land() {
    this.airLeft = 0;
    this.artYScale = 1;
    const turn = Math.PI * 2;
    const turns = Math.round(this.spin / turn);
    const miss = Math.abs(this.spin - turns * turn);
    this.spin = 0;
    if (miss >= Tune.landingSlop) {
      this.crash('Wipeout!');
      return;
    }
    this.sound.play('land', 0.7);
    if (!this.canSpin) return;

    const tricks: string[] = [];
    let base = 0;
    const spins = Math.abs(turns);
    if (spins > 0) {
      tricks.push(`${spins * 360}`);
      base += spins * 250;
    }
    if (this.airTotal >= Tune.grabMinAir && this.grabTime >= Tune.grabTime) {
      tricks.push('Grab');
      base += 100;
    }
    if (this.airTotal >= 1) {
      tricks.push('Big air');
      base += 100;
    }
    this.grabTime = 0;
    if (base > 0) this.award(tricks.join(' + '), base, 'trick');
  }

  /** Scores a trick at the current combo multiplier and extends the chain. */
  award(trick: string, base: number, sound: Effect | null) {
    const multiplier = this.multiplier;
    const gained = base * multiplier;
    this.points += gained;
    this.comboChain++;
    this.comboTimer = Tune.comboWindow;
    this.popup(multiplier > 1 ? `${trick} +${fmt(gained)}  ×${multiplier}` : `${trick} +${fmt(gained)}`, P.gate);
    if (sound) this.sound.play(sound);
    if (multiplier > 1) this.sound.play('comboUp', 0.5);
  }

  crash(message: string) {
    this.stun = 1.1;
    this.vel = 0;
    this.airLeft = 0;
    this.spin = 0;
    this.grabTime = 0;
    this.shake = 10;
    this.artYScale = 1;
    this.tumble = 0.7;
    this.popup(message, P.danger);
    this.sound.play('crash');
    if (this.comboChain >= 2) {
      this.popup('Combo lost', P.danger);
      this.sound.play('comboLost', 0.6);
    }
    this.comboChain = 0;
  }

  play(effect: Effect, volume = 1) {
    this.sound.play(effect, volume);
  }

  private layTracks(dt: number) {
    if (this.airLeft > 0 || this.stun > 0 || this.vel <= 10) return;
    const length = this.vel * dt + 1.5;
    const dir = { x: Math.sin(this.heading), y: -Math.cos(this.heading) };
    const perp = { x: Math.cos(this.heading), y: Math.sin(this.heading) };
    for (const side of [-5, 5]) {
      this.tracks.push({
        x: this.pos.x + perp.x * side - (dir.x * length) / 2,
        y: this.pos.y + perp.y * side - (dir.y * length) / 2,
        rotation: this.heading,
        length,
        age: 0,
      });
    }
  }

  private updateEffects(dt: number, sim: number) {
    for (const t of this.tracks) t.age += sim;
    this.tracks = this.tracks.filter((t) => t.age < 2.5);
    for (const p of this.popups) p.age += sim;
    this.popups = this.popups.filter((p) => p.age < 0.9);
    for (const s of this.splats) s.age += sim;
    this.splats = this.splats.filter((s) => s.age < 1.2);
    for (const b of this.bursts) b.update(sim, false);
    this.bursts = this.bursts.filter((b) => !b.done);
    for (const o of this.obstacles) if (o.popped >= 0) o.popped += sim;
    if (this.tumble > 0) this.tumble = Math.max(0, this.tumble - sim);
    this.snowfall.update(dt);
    this.puffs.update(sim);
  }

  private updateCamera(dt: number, snap = false) {
    const limit = Tune.halfWidth + 140 - W / 2;
    const targetX = clamp(this.pos.x, -limit, limit);
    this.camBase.x = snap ? targetX : this.camBase.x + (targetX - this.camBase.x) * Math.min(1, dt * 6);
    this.camBase.y = this.pos.y - Tune.lookAhead;
    this.shake = Math.max(0, this.shake - dt * 20);
    this.cam.x = this.camBase.x + rand(-1, 1) * this.shake;
    this.cam.y = this.camBase.y + rand(-1, 1) * this.shake;
  }

  popup(text: string, color: string) {
    this.popupSlot = (this.popupSlot + 1) % 3;
    // Keep it on screen even when the skier is near the edge.
    const x = clamp(this.pos.x - this.camBase.x, -W / 2 + 190, W / 2 - 190);
    this.popups.push({ text, color, x, y: Tune.lookAhead + 48 + this.popupSlot * 30, age: 0 });
  }

  addSplat(x: number, y: number) {
    this.splats.push({ x, y, age: 0 });
  }

  // MARK: - Rendering

  render(c: CanvasRenderingContext2D) {
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.clip();
    c.fillStyle = P.snow;
    c.fillRect(0, 0, W, H);

    // World layer: +y up, camera at screen center.
    c.save();
    c.translate(W / 2 - this.cam.x, H / 2 + this.cam.y);
    c.scale(1, -1);
    this.drawWorld(c);
    c.restore();

    // Camera layer (+y up) for snowfall, then screen text.
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(1, -1);
    this.snowfall.draw(c);
    c.restore();
    this.drawScreen(c);

    if (this.fadeIn > 0) {
      c.globalAlpha = this.fadeIn / 0.35;
      c.fillStyle = P.snow;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
    c.restore();
  }

  private drawWorld(c: CanvasRenderingContext2D) {
    const top = this.cam.y + H / 2 + 80;
    const bottom = this.cam.y - H / 2 - 80;
    const visible = (y: number) => y < top && y > bottom;

    // Flat ground layer: dimples, tracks, splats, ripples, shadows.
    for (const o of this.obstacles) if (o.art === 'dimple' && visible(o.y)) this.drawArt(c, 'dimple', o.x, o.y);
    c.fillStyle = P.track;
    for (const t of this.tracks) {
      c.globalAlpha = t.age < 1.5 ? 1 : Math.max(0, 1 - (t.age - 1.5));
      c.save();
      c.translate(t.x, t.y);
      c.rotate(t.rotation);
      c.fillRect(-1.1, -t.length / 2, 2.2, t.length);
      c.restore();
    }
    c.globalAlpha = 1;
    for (const s of this.splats) {
      c.globalAlpha = s.age < 0.6 ? 1 : Math.max(0, 1 - (s.age - 0.6) / 0.6);
      ellipse(c, 36, 14, P.white, s.x, s.y, P.shade, 2);
    }
    c.globalAlpha = 1;
    const hop = this.hop;
    c.globalAlpha = this.skierAlpha;
    const shadowScale = 1 - hop / 160;
    ellipse(c, 26 * shadowScale, 10 * shadowScale, P.shade, this.pos.x, this.pos.y);
    c.globalAlpha = 1;

    // Upright sprites, sorted so things further downhill draw on top.
    const sprites: { y: number; draw: () => void }[] = [];
    for (const o of this.obstacles) {
      if (o.art === 'dimple' || !visible(o.y)) continue;
      sprites.push({ y: o.y, draw: () => this.drawObstacle(c, o) });
    }
    if (this.airLeft <= 0) sprites.push({ y: this.pos.y - 0.01, draw: () => this.drawSkier(c, hop) });
    drawCreatureWorld(this, c, sprites);
    sprites.sort((a, b) => b.y - a.y);
    for (const s of sprites) s.draw();

    // Airborne layer, then the avalanche over everything.
    if (this.airLeft > 0) this.drawSkier(c, hop);
    for (const s of this.snowballs) s.drawBall(c, this);
    for (const b of this.bursts) b.draw(c);
    this.drawAvalanche(c);
  }

  private get hop(): number {
    return this.airLeft > 0 ? Math.sin(Math.PI * (1 - this.airLeft / this.airTotal)) * Math.min(70, this.airTotal * 95) : 0;
  }

  drawArt(c: CanvasRenderingContext2D, name: ArtName, x: number, y: number, scale = 1, rotation = 0, xScale = 1, yScale = 1) {
    c.save();
    c.translate(x, y);
    if (rotation) c.rotate(rotation);
    if (scale !== 1 || xScale !== 1 || yScale !== 1) c.scale(scale * xScale, scale * yScale);
    art[name](c);
    c.restore();
  }

  private drawObstacle(c: CanvasRenderingContext2D, o: Obstacle) {
    if (o.kind === 'gate') {
      this.drawArt(c, 'poleL', o.x - 70, o.y);
      this.drawArt(c, 'poleR', o.x + 70, o.y);
      return;
    }
    if (o.kind === 'prize') {
      if (o.popped >= 0) {
        const k = Math.min(1, o.popped / 0.25);
        c.globalAlpha = 1 - k;
        this.drawArt(c, 'prize', o.x, o.y, 1 + 0.8 * k);
        c.globalAlpha = 1;
      } else {
        this.drawArt(c, 'prize', o.x, o.y, 1 + 0.06 * (1 - Math.cos((this.time * Math.PI) / 0.45)));
      }
      return;
    }
    this.drawArt(c, o.art, o.x, o.y, o.scale);
  }

  private drawSkier(c: CanvasRenderingContext2D, hop: number) {
    c.save();
    c.globalAlpha = this.skierAlpha;
    c.translate(this.pos.x, this.pos.y + hop);
    c.rotate(this.heading + this.spin);
    const s = 1 + hop / 140;
    c.scale(s, s);
    if (this.tumble > 0) c.rotate(Math.PI * 4 * (1 - this.tumble / 0.7));
    c.scale(1, this.artYScale);
    skier(c);
    c.restore();
  }

  private drawAvalanche(c: CanvasRenderingContext2D) {
    c.save();
    c.translate(this.camBase.x, this.avY);
    c.globalAlpha = this.frozenTime > 0 ? 0.75 : 1;
    this.puffs.draw(c);
    c.globalAlpha = this.frozenTime > 0 ? 0.75 : 1;
    const phase = (this.time % 1.4) / 0.7;
    const f = phase < 1 ? phase : 2 - phase;
    c.save();
    c.translate(24 * f, -14 - 6 * f);
    c.fillStyle = P.shade;
    c.fill(this.avalancheBack);
    c.restore();
    c.fillStyle = P.white;
    c.fill(this.avalancheFront);
    c.strokeStyle = P.shade;
    c.lineWidth = 2;
    c.stroke(this.avalancheFront);
    c.restore();
  }

  private drawScreen(c: CanvasRenderingContext2D) {
    c.textBaseline = 'middle';
    for (const p of this.popups) {
      const alpha = p.age < 0.5 ? 1 : Math.max(0, 1 - (p.age - 0.5) / 0.4);
      text(c, p.text, sx(p.x), sy(p.y + (50 * p.age) / 0.9), 24, 'bold', p.color, 'center', alpha);
    }
    drawCreatureScreen(this, c);
    this.drawHUD(c);
    if (this.overlay) this.drawPanel(c, this.overlay);
  }

  private drawHUD(c: CanvasRenderingContext2D) {
    text(c, `${fmt(this.meters)} m`, sx(-490), sy(350), 28, 'bold', P.ink, 'left');
    text(c, fmt(this.score), sx(490), sy(350), 28, 'bold', P.ink, 'right');
    text(c, `best ${fmt(Math.max(Leaderboard.best, this.score))}`, sx(490), sy(322), 15, 'demi', P.inkSoft, 'right');
    const speed = Settings.speed;
    if (speed.multiplier !== 1) text(c, `${speed.name.toUpperCase()} ${speed.multiplier}×`, sx(-490), sy(322), 15, 'bold', P.amber, 'left');

    // Avalanche gap meter.
    c.beginPath();
    c.roundRect(sx(-122), sy(354) - 8, 244, 16, 8);
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    c.fill();
    c.strokeStyle = P.shade;
    c.lineWidth = 2;
    c.stroke();
    const fraction = clamp((this.avY - this.pos.y) / Tune.maxGap, 0, 1);
    let fill: string = fraction < 0.3 ? P.danger : fraction < 0.6 ? P.amber : P.gate;
    let title = 'AVALANCHE GAP';
    if (this.frozenTime > 0) {
      fill = P.frozen;
      title = `FROZEN ${this.frozenTime.toFixed(1)}s`;
    }
    c.fillStyle = fill;
    c.fillRect(sx(-118), sy(354) - 4, 236 * Math.max(0.02, fraction), 8);
    text(c, title, sx(0), sy(330), 13, 'bold', P.inkSoft, 'center');

    const showCombo = this.comboChain > 0 && (this.state === 'playing' || this.state === 'paused');
    if (showCombo) {
      text(c, `COMBO ×${this.multiplier}`, sx(490), sy(294), 20, 'bold', P.gate, 'right');
      const width = 120 * Math.max(0.01, this.comboTimer / Tune.comboWindow);
      c.fillStyle = P.gate;
      c.fillRect(sx(490) - width, sy(277) - 2.5, width, 5);
    }
  }

  private drawPanel(c: CanvasRenderingContext2D, panel: Panel) {
    c.beginPath();
    c.roundRect(sx(-340), sy(panel.height / 2), 680, panel.height, 20);
    c.fillStyle = 'rgba(255, 255, 255, 0.92)';
    c.fill();
    c.strokeStyle = P.shade;
    c.lineWidth = 2;
    c.stroke();
    for (const item of panel.items) text(c, item.text, sx(item.x), sy(item.y), item.size, item.font, item.color, item.align);
  }

  // MARK: - Dev aid

  /**
   * `?autoplay` drives a scripted run for visual checks: hold tuck, weave and hop, then brake until
   * buried and sign the high-score table as CLAUDE.
   */
  private autopilot(dt: number) {
    this.autopilotClock += dt;
    const t = this.autopilotClock;
    const press = (code: string, key = '') => this.keyDown(code, key, false, false);
    if (this.autopilotStep === 0 && t > 1) {
      press('Space');
      press('ArrowDown');
      this.autopilotStep = 1;
    }
    if (this.autopilotStep === 1) {
      const i = Math.floor((t - 1) / 0.7);
      const phase = (t - 1) % 0.7;
      const weave = i % 3 === 0 && phase > 0.1 && phase < 0.4;
      const leftward = i % 2 === 0;
      for (const [code, on] of [['ArrowLeft', weave && leftward], ['ArrowRight', weave && !leftward]] as const) {
        if (on) this.keys.add(code);
        else this.keys.delete(code);
      }
      if (i % 4 === 0 && phase < dt * 1.5) this.jump();
      if (t > 19.5) {
        this.keys.clear();
        this.keys.add('ArrowUp');
        this.autopilotStep = 2;
      }
    }
    if (this.autopilotStep === 2 && this.state === 'naming') {
      for (const ch of 'CLAUDE') this.typeName(`Key${ch}`, ch);
      this.autopilotStep = 3;
      this.autopilotClock = 0;
    }
    if (this.autopilotStep === 3 && this.autopilotClock > 1.5) {
      this.typeName('Enter', 'Enter');
      this.autopilotStep = 4;
    }
  }
}

function avalancheFront(depth: number, seed: number): Path2D {
  const next = seeded(seed);
  const w = 1800;
  const path = new Path2D();
  path.moveTo(-w, 1800);
  path.lineTo(-w, 0);
  let x = -w;
  while (x < w) {
    const step = rand(50, 110, next);
    const bulge = rand(0.5, 1, next) * depth;
    path.quadraticCurveTo(x + step / 2, -bulge * 2, x + step, 0);
    x += step;
  }
  path.lineTo(x, 1800);
  path.closePath();
  return path;
}

export function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, font: Font,
  color: string, align: CanvasTextAlign, alpha = 1) {
  c.globalAlpha = alpha;
  c.font = fonts[font](size);
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillText(s, x, y);
  c.globalAlpha = 1;
}

export const fmt = (n: number) => n.toLocaleString('en-US');

