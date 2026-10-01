import Phaser from 'phaser';
import { BARS, COLORS, TRAINING } from '../config/constants';
import type { Body, Point } from '../physics/matter';

export type Bar = { id: number; x: number; y: number; halfWidth: number; body: Body };

/** Flat side-view scenery. Solid bars also supply the auto-grab anchors. */
export class TrainingLevel {
  readonly bars: Bar[] = [];
  private readonly shadow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    const backdrop = scene.add.graphics().setDepth(-5);
    backdrop.fillStyle(0xe2e7de, 0.7);
    for (let x = TRAINING.left; x <= TRAINING.right; x += 100) {
      backdrop.fillRect(x, 850, 1, 4);
    }
    const scenery = scene.add.graphics().setDepth(-3);
    for (let i = 0; i < BARS.length; i++) {
      const spec = BARS[i];
      const body = scene.matter.add.rectangle(spec.x, spec.y, spec.halfWidth * 2, TRAINING.barHeight, {
        isStatic: true,
        isSensor: false,
        label: `bar:${i}`,
        chamfer: { radius: 7 },
        friction: 0.12,
        frictionStatic: 0.2,
        restitution: 0.08,
        slop: 0.01,
      });
      this.bars.push({ ...spec, id: i, body });
      const floor = spec.y + TRAINING.platformDrop;
      // Flat support outline; only the short, clearly outlined bar is the apparatus collider.
      scenery.lineStyle(2, 0xc1cdc2).lineBetween(spec.x, spec.y + TRAINING.barHeight / 2, spec.x, floor);
      scenery.lineStyle(2, 0xd5ddd0).lineBetween(spec.x - 70, floor, spec.x, floor - 145);
      scenery.lineBetween(spec.x + 70, floor, spec.x, floor - 145);
      scenery.fillStyle(0xd8e1d0).fillRoundedRect(spec.x - 101, floor, 202, 22, 4);
      scenery.lineStyle(2, 0xa9bba0).lineBetween(spec.x - 98, floor, spec.x + 98, floor);
      scenery.fillStyle(COLORS.ink).fillRoundedRect(spec.x - spec.halfWidth, spec.y - TRAINING.barHeight / 2, spec.halfWidth * 2, TRAINING.barHeight, 7);
      scenery.lineStyle(2, 0x70938a).strokeRoundedRect(spec.x - spec.halfWidth, spec.y - TRAINING.barHeight / 2, spec.halfWidth * 2, TRAINING.barHeight, 7);
      scenery.lineStyle(2, COLORS.lime).lineBetween(spec.x - 7, spec.y, spec.x + 7, spec.y);
      scene.matter.add.rectangle(spec.x, floor + 11, 202, 22, {
        isStatic: true, label: `platform:${i}`, friction: 0.8, restitution: 0.02, chamfer: { radius: 4 },
      });
    }
    this.shadow = scene.add.graphics().setDepth(-2);
  }

  render(center: Point): void {
    this.shadow.clear();
    for (const bar of this.bars) {
      const floor = bar.y + TRAINING.platformDrop;
      const height = floor - center.y;
      if (height < 0 || Math.abs(center.x - bar.x) > 80) continue;
      this.shadow.fillStyle(0x819574, Math.max(0.025, 0.12 - height * 0.00018));
      this.shadow.fillEllipse(center.x, floor + 3, 25 + height * 0.06, 5);
    }
  }
}
