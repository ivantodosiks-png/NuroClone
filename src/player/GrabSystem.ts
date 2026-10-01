import Phaser from 'phaser';
import { PHYSICS, TRAINING } from '../config/constants';
import { clamp, rotate, type Body, type Constraint, type Point } from '../physics/matter';
import { Gymnast, type Hand, type Side } from './Gymnast';

export class GrabSystem {
  private readonly grips = new Map<Side, Constraint>();
  private releasedAt = -Infinity;
  private time = 0;
  private readonly markers: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene, private readonly gymnast: Gymnast, private readonly bar: Body) {
    this.markers = scene.add.graphics().setDepth(6);
    this.tryGrab();
  }

  get count(): number { return this.grips.size; }
  get coolingDown(): boolean { return this.time - this.releasedAt < PHYSICS.autoGrabCooldown; }

  nearestPoint(hand: Hand): Point {
    const p = this.gymnast.handPoint(hand);
    return { x: clamp(p.x, TRAINING.bar.x - TRAINING.bar.halfWidth, TRAINING.bar.x + TRAINING.bar.halfWidth), y: TRAINING.bar.y };
  }

  get canGrab(): boolean {
    if (this.coolingDown) return false;
    return this.gymnast.hands.some(hand => {
      const p = this.gymnast.handPoint(hand);
      const target = this.nearestPoint(hand);
      return !this.grips.has(hand.side) && Math.hypot(p.x - target.x, p.y - target.y) <= PHYSICS.autoGrabDistance && this.handSpeed(hand) <= PHYSICS.autoGrabMaxVelocity;
    });
  }

  private handSpeed(hand: Hand): number {
    const offset = rotate(hand.local, hand.body.angle);
    return Math.hypot(
      hand.body.velocity.x - hand.body.angularVelocity * offset.y,
      hand.body.velocity.y + hand.body.angularVelocity * offset.x,
    ) * 60 / PHYSICS.pixelsPerMeter;
  }

  step(delta: number, enabled = true): void {
    this.time += delta;
    if (enabled && !this.coolingDown) this.tryGrab();
  }

  private tryGrab(): void {
    for (const hand of this.gymnast.hands) {
      if (this.grips.has(hand.side)) continue;
      const point = this.gymnast.handPoint(hand);
      const target = this.nearestPoint(hand);
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance > PHYSICS.autoGrabDistance || this.handSpeed(hand) > PHYSICS.autoGrabMaxVelocity) continue;
      const offset = rotate(hand.local, hand.body.angle);
      const constraint = this.scene.matter.add.constraint(this.bar, hand.body, Math.max(2, distance), 0.98, {
        label: `grip:${hand.side}`,
        pointA: { x: target.x - this.bar.position.x, y: target.y - this.bar.position.y },
        pointB: offset,
        damping: 0.08,
      });
      this.grips.set(hand.side, constraint);
    }
  }

  release(): void {
    if (!this.count) return;
    for (const grip of this.grips.values()) this.scene.matter.world.removeConstraint(grip);
    this.grips.clear();
    this.releasedAt = this.time;
    // Deliberately do not write positions or velocities: release retains momentum.
  }

  render(): void {
    this.markers.clear();
    for (const hand of this.gymnast.hands) {
      const point = this.gymnast.handPoint(hand);
      if (this.grips.has(hand.side)) {
        this.markers.lineStyle(2, 0x97b862, 0.9).strokeCircle(point.x, point.y, 8);
        this.markers.fillStyle(0xd4ef8c).fillCircle(point.x, point.y, 4);
      } else if (this.canGrab) {
        this.markers.lineStyle(1.5, 0x97b862, 0.65).strokeCircle(point.x, point.y, 10);
      }
    }
  }

  destroy(): void { this.release(); this.markers.destroy(); }
}
