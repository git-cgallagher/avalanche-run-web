import { rand } from './rng';

/** Emitter settings, mirroring SKEmitterNode: every `*Range` is the full spread, centered on its base value. */
export interface EmitterSpec {
  rate: number;
  life: number;
  rangeX: number;
  rangeY?: number;
  angle: number;
  angleRange: number;
  speed: number;
  speedRange: number;
  /** Dot diameter at scale 1. */
  size: number;
  scale: number;
  scaleRange: number;
  alpha: number;
  alphaSpeed?: number;
  color: string;
  ay?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  size: number;
  alpha: number;
}

/** A dot-particle emitter in whatever coordinate space it's drawn in (its own origin at x, y). */
export class Emitter {
  private particles: Particle[] = [];
  private carry = 0;

  constructor(private spec: EmitterSpec, public x = 0, public y = 0) {}

  get done(): boolean {
    return this.particles.length === 0;
  }

  spawn(count: number) {
    const s = this.spec;
    for (let i = 0; i < count; i++) {
      const angle = s.angle + rand(-s.angleRange / 2, s.angleRange / 2);
      const speed = s.speed + rand(-s.speedRange / 2, s.speedRange / 2);
      this.particles.push({
        x: this.x + rand(-s.rangeX / 2, s.rangeX / 2),
        y: this.y + rand(-(s.rangeY ?? 0) / 2, (s.rangeY ?? 0) / 2),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        size: s.size * Math.max(0.05, s.scale + rand(-s.scaleRange / 2, s.scaleRange / 2)),
        alpha: s.alpha,
      });
    }
  }

  update(dt: number, emitting = true) {
    const s = this.spec;
    if (emitting) {
      this.carry += s.rate * dt;
      const whole = Math.floor(this.carry);
      this.carry -= whole;
      this.spawn(whole);
    }
    for (const p of this.particles) {
      p.age += dt;
      p.vy += (s.ay ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha += (s.alphaSpeed ?? 0) * dt;
    }
    this.particles = this.particles.filter((p) => p.age < s.life && p.alpha > 0);
  }

  /** Fast-forwards so a continuous emitter (snowfall) starts full. */
  prefill(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 30) this.update(1 / 30);
  }

  draw(c: CanvasRenderingContext2D) {
    c.fillStyle = this.spec.color;
    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      c.beginPath();
      c.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }
}
