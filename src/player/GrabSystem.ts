import Phaser from 'phaser';
import { PHYSICS } from '../config/constants';
import { clamp, rotate, type Constraint, type Point } from '../physics/matter';
import { Gymnast, type Hand } from './Gymnast';
import type { Bar } from '../levels/TrainingLevel';

export class GrabSystem {
  private grips: [Constraint, Constraint] | null = null;
  private heldBar: Bar | null = null;
  private releasedAt = -Infinity;
  private time = 0;
  private readonly markers: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene, private readonly gymnast: Gymnast, private readonly bars: readonly Bar[]) {
    this.markers = scene.add.graphics().setDepth(6);
    this.tryGrab();
  }

  get state(): 'GRABBED' | 'RELEASED' { return this.grips ? 'GRABBED' : 'RELEASED'; }
  get count(): 0 | 2 { return this.grips ? 2 : 0; }
  get barId(): number | null { return this.heldBar?.id ?? null; }
  get anchor(): Point | null { return this.heldBar ? { x: this.heldBar.x, y: this.heldBar.y } : null; }
  get coolingDown(): boolean { return this.time - this.releasedAt < PHYSICS.autoGrabCooldown; }

  private target(hand: Hand, bar: Bar): Point {
    const p = this.gymnast.handPoint(hand);
    return { x: clamp(p.x, bar.x - bar.halfWidth, bar.x + bar.halfWidth), y: bar.y };
  }

  private handSpeed(hand: Hand): number {
    const offset = rotate(hand.local, hand.body.angle);
    return Math.hypot(
      hand.body.velocity.x - hand.body.angularVelocity * offset.y,
      hand.body.velocity.y + hand.body.angularVelocity * offset.x,
    ) * 60 / PHYSICS.pixelsPerMeter;
  }

  private candidate(): Bar | null {
    if (this.grips || this.coolingDown) return null;
    let nearest: Bar | null = null;
    let bestDistance = Infinity;
    for (const bar of this.bars) {
      let maxDistance = 0;
      const bothReach = this.gymnast.hands.every(hand => {
        const p = this.gymnast.handPoint(hand);
        const target = this.target(hand, bar);
        const distance = Math.hypot(p.x - target.x, p.y - target.y);
        maxDistance = Math.max(maxDistance, distance);
        return distance <= PHYSICS.autoGrabDistance && this.handSpeed(hand) <= PHYSICS.autoGrabMaxVelocity;
      });
      if (bothReach && maxDistance < bestDistance) {
        nearest = bar;
        bestDistance = maxDistance;
      }
    }
    return nearest;
  }

  get canGrab(): boolean { return this.candidate() !== null; }

  step(delta: number): void {
    this.time += delta;
    this.tryGrab();
  }

  private tryGrab(): void {
    const bar = this.candidate();
    if (!bar) return;
    // Both hands are validated against ONE bar before either constraint exists.
    const createGrip = (hand: Hand): Constraint => {
      const point = this.gymnast.handPoint(hand);
      const target = this.target(hand, bar);
      return this.scene.matter.add.constraint(bar.body, hand.body, Math.max(2, Math.hypot(point.x - target.x, point.y - target.y)), 0.92, {
        label: `grip:${bar.id}:${hand.side}`,
        pointA: { x: target.x - bar.x, y: target.y - bar.y },
        pointB: rotate(hand.local, hand.body.angle),
        damping: 0.015,
      });
    };
    this.grips = [createGrip(this.gymnast.hands[0]), createGrip(this.gymnast.hands[1])];
    this.heldBar = bar;
    // Never set a body position, velocity, angle or angular velocity here.
  }

  release(): void {
    if (!this.grips) return;
    for (const grip of this.grips) this.scene.matter.world.removeConstraint(grip);
    this.grips = null;
    this.heldBar = null;
    this.releasedAt = this.time;
  }

  render(): void {
    this.markers.clear();
    if (!this.grips) return;
    for (const hand of this.gymnast.hands) {
      const p = this.gymnast.handPoint(hand);
      this.markers.fillStyle(0xd4ef8c).fillCircle(p.x, p.y, 4);
    }
  }

  destroy(): void { this.release(); this.markers.destroy(); }
}
