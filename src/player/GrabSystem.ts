import Phaser from 'phaser';
import { PHYSICS, TRAINING } from '../config/constants';
import { clamp, rotate, type Body, type Constraint, type Point } from '../physics/matter';
import { Gymnast, type Hand, type Side } from './Gymnast';

export class GrabSystem {
  private readonly grips = new Map<Side, Constraint>();
  private seekingUntil = 0;
  private time = 0;
  private readonly markers: Phaser.GameObjects.Graphics;
  lastAction: 'held' | 'released' | 'missed' | 'searching' = 'held';

  constructor(private readonly scene: Phaser.Scene, private readonly gymnast: Gymnast, private readonly bar: Body) {
    this.markers = scene.add.graphics().setDepth(6);
    this.tryGrab();
  }

  get count(): number { return this.grips.size; }
  get isSeeking(): boolean { return this.seekingUntil > this.time; }

  nearestPoint(hand: Hand): Point {
    const p = this.gymnast.handPoint(hand);
    return { x: clamp(p.x, TRAINING.bar.x - TRAINING.bar.halfWidth, TRAINING.bar.x + TRAINING.bar.halfWidth), y: TRAINING.bar.y };
  }

  get canGrab(): boolean {
    return this.gymnast.hands.some(hand => {
      const p = this.gymnast.handPoint(hand);
      const target = this.nearestPoint(hand);
      return Math.hypot(p.x - target.x, p.y - target.y) <= PHYSICS.grabRadius;
    });
  }

  toggle(): void {
    if (this.count > 0) {
      this.release();
      return;
    }
    // A brief buffer helps catch a moving hand. Only proximity can create a grip.
    this.seekingUntil = this.time + 240;
    this.lastAction = 'searching';
    this.tryGrab();
  }

  step(delta: number): void {
    this.time += delta;
    if (this.isSeeking) this.tryGrab();
    else if (this.lastAction === 'searching') this.lastAction = 'missed';
  }

  private tryGrab(): void {
    for (const hand of this.gymnast.hands) {
      if (this.grips.has(hand.side)) continue;
      const point = this.gymnast.handPoint(hand);
      const target = this.nearestPoint(hand);
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance > PHYSICS.grabRadius) continue;
      const offset = rotate(hand.local, hand.body.angle);
      const constraint = this.scene.matter.add.constraint(this.bar, hand.body, Math.max(2, distance), 0.86, {
        label: `grip:${hand.side}`,
        pointA: { x: target.x - this.bar.position.x, y: target.y - this.bar.position.y },
        pointB: offset,
        damping: 0.045,
      });
      this.grips.set(hand.side, constraint);
      this.lastAction = 'held';
    }
  }

  release(): void {
    for (const grip of this.grips.values()) this.scene.matter.world.removeConstraint(grip);
    this.grips.clear();
    this.seekingUntil = 0;
    this.lastAction = 'released';
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
