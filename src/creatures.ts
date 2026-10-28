import { ellipse } from './art';
import { H, Tune, W, sx, sy, text, type Game } from './game';
import { P } from './palette';
import { clamp, pick, rand } from './rng';
import type { Effect } from './synth';

export type CreatureKind = 'yeti' | 'penguin' | 'bear' | 'narwhal';

const kinds: readonly CreatureKind[] = ['yeti', 'penguin', 'bear', 'narwhal'];

const info: Record<CreatureKind, { name: string; radius: number; call: Effect; crash: string }> = {
  yeti: { name: 'Yeti', radius: 26, call: 'yeti', crash: 'Yeti bonk!' },
  penguin: { name: 'Penguin', radius: 18, call: 'penguin', crash: 'Penguin strike!' },
  bear: { name: 'Polar bear', radius: 26, call: 'bear', crash: 'Bear hug!' },
  narwhal: { name: 'Narwhal', radius: 26, call: 'narwhal', crash: 'Narwhaled!' },
};

/** A local who turns up uninvited. One attacks at a time, picked at random. */
export class Creature {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  age = 0;
  side = 1;
  facing = 0;
  hurts = true;
  spent = false; // already hit, hopped or near-missed: no more contact or bonus
  closest = Infinity;
  done = false;
  thrown = 0;
  hidden = false;
  xScale = 1;
  yScale = 1;
  rotation = 0;
  ripple: { x: number; y: number } | null = null;
  breachAge = -1;

  constructor(readonly kind: CreatureKind) {}
}

export class Snowball {
  readonly flight = 0.85;
  t = 0;
  done = false;
  ground = { x: 0, y: 0 };
  height = 0;

  constructor(readonly from: { x: number; y: number }, readonly to: { x: number; y: number }) {
    this.ground = { ...from };
  }

  drawBall(c: CanvasRenderingContext2D, game: Game) {
    game.drawArt(c, 'snowball', this.ground.x, this.ground.y + this.height, 1 + this.height / 200);
  }
}

/**
 * Behaviors:
 * - Penguin belly-slides across the run in front of you.
 * - Polar bear charges uphill at you, steering for the first moment, then committing.
 * - Yeti runs along the edge of the screen and lobs three snowballs at where you're headed.
 * - Narwhal leaves a ripple in the snow ahead, then breaches out of it as you arrive.
 */
export function updateCreatures(game: Game, dt: number) {
  if (game.creatures.length === 0 && (game.options.debugCreatures || game.meters >= Tune.creaturesFrom)) {
    game.nextAttack -= dt;
    if (game.nextAttack <= 0) {
      spawn(game);
      scheduleNextAttack(game);
    }
  }
  for (const creature of game.creatures) {
    advance(game, creature, dt);
    if (!creature.done) checkContact(game, creature);
  }
  for (const snowball of game.snowballs) advanceSnowball(game, snowball, dt);
  game.creatures = game.creatures.filter((c) => !c.done);
  game.snowballs = game.snowballs.filter((s) => !s.done);
}

/** Attacks get more frequent the further down the mountain you are. */
export function scheduleNextAttack(game: Game) {
  if (game.options.debugCreatures) {
    game.nextAttack = 1.2;
    return;
  }
  const low = Math.max(4, 11 - game.meters / 350);
  game.nextAttack = rand(low, low + 6);
}

function spawn(game: Game) {
  const kind = game.options.debugCreatures ? kinds[game.attackCount % kinds.length] : pick(kinds.filter((k) => k !== game.lastCreature));
  game.attackCount++;
  game.lastCreature = kind;

  const c = new Creature(kind);
  c.side = Math.random() < 0.5 ? 1 : -1;
  const { pos, vel, heading, camBase } = game;

  switch (kind) {
    case 'penguin': {
      const ahead = clamp(vel + 150, 260, 520);
      c.x = camBase.x + c.side * (W / 2 + 60);
      c.y = pos.y - ahead;
      c.vx = -c.side * 480;
      c.vy = -Math.max(200, vel * 0.7);
      c.xScale = -c.side;
      break;
    }
    case 'bear':
      c.x = pos.x + rand(-180, 180);
      c.y = camBase.y - H / 2 - 60;
      break;
    case 'yeti':
      c.x = camBase.x + c.side * (W / 2 + 80);
      c.y = pos.y - 120;
      break;
    case 'narwhal': {
      const lead = clamp(vel, 260, 540);
      const limit = Tune.halfWidth - 60;
      c.x = clamp(pos.x + Math.sin(heading) * lead + rand(-40, 40), -limit, limit);
      c.y = Math.min(pos.y - Math.cos(heading) * lead, pos.y - 220);
      c.hidden = true;
      c.hurts = false;
      c.ripple = { x: c.x, y: c.y };
      break;
    }
  }

  game.creatures.push(c);
  game.play('warn', 0.7);
  if (kind !== 'narwhal') game.play(info[kind].call);
}

function advance(game: Game, c: Creature, dt: number) {
  c.age += dt;
  const { pos, camBase } = game;
  switch (c.kind) {
    case 'penguin':
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rotation = Math.sin(c.age * 14) * 0.12;
      if (c.age > 1 && Math.abs(c.x - camBase.x) > W / 2 + 160) c.done = true;
      break;

    case 'bear': {
      if (c.age < 1.6) {
        const want = Math.atan2(-(pos.x - c.x), pos.y - c.y);
        let diff = want - c.facing;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        c.facing += clamp(diff, -1.1 * dt, 1.1 * dt);
      }
      c.x += -Math.sin(c.facing) * 250 * dt;
      c.y += Math.cos(c.facing) * 250 * dt;
      c.rotation = c.facing;
      c.yScale = 1 + Math.sin(c.age * 16) * 0.06;
      if (c.y > camBase.y + H / 2 + 120 || c.age > 9) c.done = true;
      break;
    }

    case 'yeti': {
      const inX = camBase.x + c.side * (W / 2 - 70);
      const outX = camBase.x + c.side * (W / 2 + 90);
      const leaving = c.thrown >= 3 && c.age > 4.2;
      c.x += ((leaving ? outX : inX) - c.x) * Math.min(1, dt * 5);
      c.y = pos.y - 120 + Math.sin(c.age * 9) * 4;
      c.yScale = 1 + Math.sin(c.age * 10) * 0.05;
      const throwTimes = [1, 2, 3];
      if (c.thrown < throwTimes.length && c.age >= throwTimes[c.thrown]) {
        throwSnowball(game, c);
        c.thrown++;
      }
      if (leaving && Math.abs(c.x - outX) < 12) c.done = true;
      break;
    }

    case 'narwhal':
      if (c.breachAge < 0) {
        if ((c.age > 0.5 && pos.y - c.y < 170) || c.age > 1.8) breach(game, c);
      } else {
        const t = c.age - c.breachAge;
        c.hurts = t > 0.08 && t < 0.9;
        if (t > 1.3) c.done = true;
      }
      break;
  }
}

function checkContact(game: Game, c: Creature) {
  if (!c.hurts || c.spent) return;
  const radius = info[c.kind].radius;
  const distance = Math.hypot(c.x - game.pos.x, c.y - game.pos.y);
  if (distance < radius + 10) {
    if (game.airLeft > 0 && game.canSpin) {
      c.spent = true;
      game.award(`Hopped the ${info[c.kind].name.toLowerCase()}`, 250, 'clear');
    } else if (game.airLeft <= 0 && game.stun <= 0) {
      c.spent = true;
      game.crash(info[c.kind].crash);
    }
  } else if (c.kind !== 'yeti') {
    c.closest = Math.min(c.closest, distance);
    if (c.closest < radius + 70 && distance > c.closest + 60 && game.stun <= 0) {
      c.spent = true;
      game.award('Close call', 150, 'clear');
    }
  }
}

function breach(game: Game, c: Creature) {
  c.breachAge = c.age;
  c.ripple = null;
  c.hidden = false;
  c.rotation = Math.PI / 2 + rand(-0.35, 0.35);
  game.burst(c.x, c.y, P.white, 60, 12, 0.6, 160, 0.8, -1.2);
  game.play('narwhal');
  game.shake = Math.max(game.shake, 4);
}

function throwSnowball(game: Game, c: Creature) {
  const lead = 0.85;
  const travel = game.vel * lead;
  const to = {
    x: game.pos.x + Math.sin(game.heading) * travel + rand(-25, 25),
    y: game.pos.y - Math.cos(game.heading) * travel + rand(-25, 25),
  };
  game.snowballs.push(new Snowball({ x: c.x - c.side * 22, y: c.y + 30 }, to));
  game.play('toss', 0.7);
}

function advanceSnowball(game: Game, s: Snowball, dt: number) {
  s.t += dt / s.flight;
  const k = Math.min(1, s.t);
  s.ground = { x: s.from.x + (s.to.x - s.from.x) * k, y: s.from.y + (s.to.y - s.from.y) * k };
  s.height = Math.sin(Math.PI * k) * 130;
  if (k < 1) return;

  s.done = true;
  game.addSplat(s.to.x, s.to.y);
  game.play('splat');
  const distance = Math.hypot(game.pos.x - s.to.x, game.pos.y - s.to.y);
  if (distance < 30) {
    if (game.airLeft <= 0 && game.stun <= 0) game.crash('Snowballed!');
    else if (game.airLeft > 0 && game.canSpin) game.award('Dodged', 100, 'clear');
  } else if (distance < 80 && game.stun <= 0) {
    game.award('Close call', 75, null);
  }
}

/** Adds creature sprites to the depth-sorted list, and draws flat things (ripples, snowball shadows) right away. */
export function drawCreatureWorld(game: Game, c: CanvasRenderingContext2D, sprites: { y: number; draw: () => void }[]) {
  for (const s of game.snowballs) ellipse(c, 18, 7, P.shade, s.ground.x, s.ground.y);
  for (const cr of game.creatures) {
    if (cr.ripple) {
      const pulse = 1.025 + 0.225 * Math.sin((game.time * Math.PI) / 0.3);
      for (const [w, h] of [[80, 30], [50, 18]]) ellipse(c, w * pulse, h * pulse, 'none', cr.ripple.x, cr.ripple.y, P.iceEdge, 3);
    }
    if (cr.hidden) continue;
    if (cr.kind === 'narwhal') {
      // Breaching: pop up, hang, then sink and fade. Drawn later so it sits above the course.
      const t = cr.age - cr.breachAge;
      const scale = t < 0.18 ? 0.2 + (0.9 * t) / 0.18 : t < 0.78 ? 1.1 : 1.1 - (0.8 * Math.min(1, (t - 0.78) / 0.3));
      const alpha = t < 0.78 ? 1 : Math.max(0, 1 - (t - 0.78) / 0.3);
      sprites.push({
        y: -Infinity,
        draw: () => {
          c.globalAlpha = alpha;
          game.drawArt(c, 'narwhal', cr.x, cr.y, scale, cr.rotation);
          c.globalAlpha = 1;
        },
      });
      continue;
    }
    sprites.push({ y: cr.y, draw: () => game.drawArt(c, cr.kind, cr.x, cr.y, 1, cr.rotation, cr.xScale, cr.yScale) });
  }
}

/** Edge-of-screen warning badges while a creature is arriving. */
export function drawCreatureScreen(game: Game, c: CanvasRenderingContext2D) {
  const hx = W / 2 - 44;
  const hy = H / 2 - 44;
  for (const cr of game.creatures) {
    if (cr.age > 1.3 || cr.breachAge >= 0) continue; // a breached narwhal is its own warning
    const x = sx(clamp(cr.x - game.camBase.x, -hx, hx));
    const y = sy(clamp(cr.y - game.camBase.y, -hy + 10, hy - 100));
    const pulse = 1.06 + 0.06 * Math.sin((game.time * Math.PI) / 0.25);
    c.save();
    c.translate(x, y);
    c.scale(pulse, pulse);
    c.beginPath();
    c.arc(0, 0, 22, 0, Math.PI * 2);
    c.fillStyle = P.danger;
    c.fill();
    c.strokeStyle = P.white;
    c.lineWidth = 3;
    c.stroke();
    text(c, '!', 0, 1, 30, 'bold', P.white, 'center');
    text(c, info[cr.kind].name.toUpperCase(), 0, 36, 13, 'bold', P.danger, 'center');
    c.restore();
  }
}
