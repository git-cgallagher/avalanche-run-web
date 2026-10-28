import { P } from './palette';

/**
 * Vector art for every sprite. Each function draws around its own origin in **y-up** coordinates
 * (the world layer is flipped so +y is uphill), matching the original SpriteKit art point for point.
 */
type Ctx = CanvasRenderingContext2D;

export function ellipse(c: Ctx, w: number, h: number, fill: string, x = 0, y = 0, stroke?: string, lineWidth = 0, rotation = 0) {
  c.beginPath();
  c.ellipse(x, y, w / 2, h / 2, rotation, 0, Math.PI * 2);
  if (fill !== 'none') {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke && lineWidth > 0) {
    c.strokeStyle = stroke;
    c.lineWidth = lineWidth;
    c.stroke();
  }
}

export function polygon(c: Ctx, points: number[], fill: string, stroke?: string, lineWidth = 0) {
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke && lineWidth > 0) {
    c.strokeStyle = stroke;
    c.lineWidth = lineWidth;
    c.lineJoin = 'round';
    c.stroke();
  }
}

/** A rectangle centered on (x, y), optionally rotated, like an SKSpriteNode of a flat color. */
export function rect(c: Ctx, x: number, y: number, w: number, h: number, fill: string, rotation = 0) {
  c.fillStyle = fill;
  if (rotation === 0) {
    c.fillRect(x - w / 2, y - h / 2, w, h);
    return;
  }
  c.save();
  c.translate(x, y);
  c.rotate(rotation);
  c.fillRect(-w / 2, -h / 2, w, h);
  c.restore();
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, lineWidth = 0) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke && lineWidth > 0) {
    c.strokeStyle = stroke;
    c.lineWidth = lineWidth;
    c.stroke();
  }
}

/** Pine tree; origin is the base of the trunk (the collision point). */
function tree(c: Ctx) {
  ellipse(c, 40, 13, P.shade, 9, 0);
  rect(c, 0, 4, 6, 10, P.trunk);
  for (const [w, h, y] of [[40, 26, 7], [32, 22, 19], [22, 18, 30]]) {
    polygon(c, [-w / 2, y, w / 2, y, 0, y + h], P.pine, P.pineDark, 1.5);
  }
  polygon(c, [-6, 41, 6, 41, 0, 48], P.white);
}

function rock(c: Ctx) {
  ellipse(c, 40, 14, P.shade, 6, -4);
  polygon(c, [-17, -6, -13, 8, -2, 14, 11, 11, 17, 0, 12, -9, -4, -11], P.rock, P.rockDark, 1.5);
  polygon(c, [-11, 5, -2, 11, 6, 9, -3, 2], P.rockLight);
  polygon(c, [-6, 11, 4, 13, 9, 10, 0, 9], P.white);
}

/** Snow bump: a shaded crescent under a bright dome. */
function mogul(c: Ctx) {
  ellipse(c, 54, 26, P.shade, 0, -4);
  ellipse(c, 48, 21, P.white, -1, 1);
}

/** Kicker ramp; the lip faces downhill (−y). */
function ramp(c: Ctx) {
  rect(c, 0, -21, 58, 8, P.shade);
  polygon(c, [-24, 17, 24, 17, 29, -17, -29, -17], P.ice, P.iceEdge, 2);
  c.strokeStyle = P.iceEdge;
  c.lineWidth = 3;
  c.lineJoin = 'round';
  for (const y of [8, -4]) {
    c.beginPath();
    c.moveTo(-10, y + 5);
    c.lineTo(0, y - 3);
    c.lineTo(10, y + 5);
    c.stroke();
  }
}

/** Gate pole with a pennant pointing toward the gate's center. */
function gatePole(c: Ctx, flagRight: boolean) {
  ellipse(c, 14, 5, P.shade, 5, 0);
  rect(c, 0, 18, 3, 36, P.ink);
  const dir = flagRight ? 1 : -1;
  polygon(c, [0, 36, 0, 22, 20 * dir, 29], P.gate);
}

/** Orange boundary marker at the edge of the run. */
function post(c: Ctx) {
  ellipse(c, 12, 5, P.shade, 4, 0);
  rect(c, 0, 13, 5, 26, P.boundary);
  rect(c, 0, 16, 5, 5, P.white);
}

function dimple(c: Ctx) {
  ellipse(c, 26, 7, P.dimple);
}

/** Top-down skier facing −y (downhill). Origin is the center of the boots. */
export function skier(c: Ctx) {
  for (const x of [-5, 5]) roundRect(c, x - 1.75, -21, 3.5, 40, 1.75, P.ink);
  for (const x of [-12, 12]) rect(c, x, 7, 1.6, 24, P.rockDark, x > 0 ? 0.18 : -0.18);
  roundRect(c, -8, -11, 16, 11, 4, P.pants);
  ellipse(c, 22, 17, P.jacket, 0, 2.5, P.jacketDark, 1.5);
  ellipse(c, 13, 13, P.helmet, 0, -1.5, P.helmetDark, 1.2);
  rect(c, 0, -6, 9, 2.5, P.ink);
}

/** Belly-sliding penguin, head toward +x. */
function penguin(c: Ctx) {
  ellipse(c, 46, 14, P.shade, 2, -9);
  for (const y of [-11, 11]) ellipse(c, 15, 6, P.penguin, 0, y, undefined, 0, y > 0 ? 0.35 : -0.35);
  for (const y of [-4, 4]) ellipse(c, 8, 5, P.beak, -21, y);
  ellipse(c, 38, 20, P.penguin);
  ellipse(c, 26, 8, P.white, -2, -6);
  ellipse(c, 17, 16, P.penguin, 17, 1);
  ellipse(c, 5, 5, P.white, 20, 4);
  ellipse(c, 2.4, 2.4, P.ink, 21, 4);
  polygon(c, [24, 3, 33, 0, 24, -2], P.beak);
}

/** Polar bear seen from above, charging toward +y. */
function polarBear(c: Ctx) {
  ellipse(c, 48, 62, P.shade, 7, -6);
  for (const [x, y] of [[-17, 16], [17, 16], [-16, -21], [16, -21]]) ellipse(c, 13, 11, P.bearPaw, x, y, P.bearEdge, 1.5);
  ellipse(c, 38, 56, P.bearFur, 0, 0, P.bearEdge, 2);
  for (const x of [-10, 10]) ellipse(c, 10, 10, P.bearFur, x, 40, P.bearEdge, 1.5);
  ellipse(c, 26, 24, P.bearFur, 0, 30, P.bearEdge, 2);
  ellipse(c, 12, 10, P.bearPaw, 0, 39);
  ellipse(c, 6, 4, P.ink, 0, 43);
  for (const x of [-6, 6]) ellipse(c, 3.2, 3.2, P.ink, x, 32);
}

/** The yeti here is a round, horned periwinkle fuzzball that lobs snowballs. */
function yeti(c: Ctx) {
  ellipse(c, 62, 20, P.shade, 6, -27);
  for (const x of [-10, 10]) ellipse(c, 13, 8, P.furDark, x, -26);
  for (const x of [-27, 27]) ellipse(c, 16, 27, P.fur, x, 8, P.furDark, 2, x > 0 ? -0.5 : 0.5);
  const fluff: number[] = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const r = i % 2 === 0 ? 29 : 23;
    fluff.push(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  polygon(c, fluff, P.fur, P.furDark, 2);
  for (const dir of [-1, 1]) polygon(c, [dir * 12, 20, dir * 6, 25, dir * 24, 42], P.horn, P.helmetDark, 1);
  ellipse(c, 28, 19, P.furFace, 0, 3);
  for (const x of [-6, 6]) ellipse(c, 5, 6, P.ink, x, 7);
  ellipse(c, 13, 6, P.ink, 0, -3);
  for (const x of [-3, 3]) rect(c, x, -1.5, 2.5, 3, P.white);
}

/** Narwhal, tusk toward +x. */
function narwhal(c: Ctx) {
  polygon(c, [22, 3, 66, 1, 22, -2], P.tusk, P.helmetDark, 0.8);
  polygon(c, [-22, 0, -38, 13, -33, 0, -38, -13], P.narwhalDark);
  ellipse(c, 54, 25, P.narwhal, 0, 0, P.narwhalDark, 1.5);
  ellipse(c, 34, 9, P.narwhalBelly, 3, -6);
  for (const [x, y, s] of [[-12, 5, 5], [-3, 8, 4], [6, 4, 3.5], [-16, -2, 3], [2, 1, 2.5]]) ellipse(c, s, s * 0.8, P.narwhalDark, x, y);
  ellipse(c, 3, 3, P.ink, 17, 3);
}

function snowball(c: Ctx) {
  ellipse(c, 18, 18, P.white, 0, 0, P.shade, 2);
}

/** Wrapped prize box with a bow, seen from above. */
function prizeBox(c: Ctx) {
  ellipse(c, 40, 14, P.shade, 5, -15);
  roundRect(c, -15, -15, 30, 30, 4, P.prize, P.prizeDark, 2);
  rect(c, 0, 0, 7, 30, P.ribbon);
  rect(c, 0, 0, 30, 7, P.ribbon);
  for (const dir of [-1, 1]) ellipse(c, 13, 9, P.ribbon, dir * 7, 3, P.helmetDark, 1, dir * 0.5);
  ellipse(c, 6, 6, P.helmetDark, 0, 1);
}

export const art = {
  tree,
  rock,
  mogul,
  ramp,
  poleL: (c: Ctx) => gatePole(c, true),
  poleR: (c: Ctx) => gatePole(c, false),
  post,
  dimple,
  penguin,
  bear: polarBear,
  yeti,
  narwhal,
  snowball,
  prize: prizeBox,
} satisfies Record<string, (c: Ctx) => void>;

export type ArtName = keyof typeof art;
