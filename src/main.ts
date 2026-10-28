import { Game, H, W, type GameOptions } from './game';
import { Sound } from './sound';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const sound = new Sound();

// Dev aids: ?debug=creatures,prizes forces early creatures / prize boxes; ?autoplay runs a scripted test run.
const params = new URLSearchParams(location.search);
const debug = (params.get('debug') ?? '').split(',');
const options: GameOptions = {
  debugCreatures: debug.includes('creatures'),
  debugPrizes: debug.includes('prizes'),
  autoplay: params.has('autoplay'),
};

let game = newGame(false);

function newGame(autostart: boolean): Game {
  const next = new Game(sound, options, autostart);
  next.onRestart = () => {
    game = newGame(true);
  };
  if (import.meta.env.DEV) (window as unknown as { avalanche: Game }).avalanche = next;
  return next;
}

/** Letterboxes the 1024×768 playfield into the window at full device resolution. */
let view = { scale: 1, x: 0, y: 0, dpr: 1 };
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  const scale = Math.min(innerWidth / W, innerHeight / H);
  view = { scale, x: (innerWidth - W * scale) / 2, y: (innerHeight - H * scale) / 2, dpr };
}
addEventListener('resize', resize);
resize();

const gameKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Backspace', 'Escape']);
addEventListener('keydown', (e) => {
  sound.unlock(); // browsers allow audio only after a user gesture
  if (gameKeys.has(e.code) || ((e.metaKey || e.ctrlKey) && /^Digit[1-4]$/.test(e.code))) e.preventDefault();
  if ((e.metaKey || e.ctrlKey) && !/^Digit[1-4]$/.test(e.code)) return; // leave ⌘Q, ⌘W, etc. to the app
  game.keyDown(e.code, e.key, e.repeat, e.metaKey || e.ctrlKey);
});
addEventListener('keyup', (e) => game.keyUp(e.code));
addEventListener('pointerdown', () => sound.unlock());
addEventListener('blur', () => game.focusLost());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.focusLost();
});

let last = 0;
function frame(now: number) {
  const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, 1 / 30);
  last = now;
  game.update(dt);
  draw();
  requestAnimationFrame(frame);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f2f7ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = view.scale * view.dpr;
  ctx.setTransform(k, 0, 0, k, view.x * view.dpr, view.y * view.dpr);
  game.render(ctx);
}
requestAnimationFrame(frame);

// Dev aid: `avalancheAdvance(seconds)` steps the game at 60 Hz and redraws at once. Background tabs throttle
// requestAnimationFrame, so this keeps scripted checks (and their screenshots) in step with the simulation.
if (import.meta.env.DEV) {
  (window as unknown as { avalancheAdvance: (s: number) => string }).avalancheAdvance = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) game.update(1 / 60);
    draw();
    return `${game.state} ${game.meters} m`;
  };
}
canvas.focus();

// Render all sounds after the first frame is up, so the title appears immediately.
setTimeout(() => sound.prepare(), 50);
