import Phaser from 'phaser';
import { BARS, COLORS, TRAINING } from '../config/constants';
import type { Body, Point } from '../physics/matter';

export type Bar = { id: number; x: number; y: number; halfWidth: number; body: Body };

/** The shaded park is scenery only. Bars, ground and Nuro share one 2D plane. */
export class TrainingLevel {
  readonly bars: Bar[] = [];
  private readonly shadow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    const backdrop = scene.add.graphics().setDepth(-5);
    // Distant rounded hills and shaded tree crowns suggest volume without any
    // depth coordinate, perspective transform or collision in the background.
    backdrop.fillStyle(0xc7dfd0).fillEllipse(700, 510, 1600, 240);
    backdrop.fillStyle(0xbad5bf).fillEllipse(1650, 510, 1400, 180);
    for (const [x, y, size] of [[330, 375, 55], [590, 410, 38], [1240, 390, 46], [1510, 355, 65]]) {
      backdrop.fillStyle(0xa2b6a2).fillRect(x - 5, y, 10, TRAINING.groundY - y);
      backdrop.fillStyle(0xa4c8af).fillEllipse(x + 7, y - 18, size * 1.35, size * 1.8);
      backdrop.fillStyle(0xbdd8b8).fillEllipse(x - 9, y - 27, size, size * 1.45);
      backdrop.fillStyle(0xd2e5c7, 0.75).fillEllipse(x - 15, y - 42, size * 0.5, size * 0.65);
    }

    const scenery = scene.add.graphics().setDepth(-3);
    const width = TRAINING.right - TRAINING.left;
    scenery.fillStyle(0x9cbd73).fillRect(TRAINING.left, TRAINING.groundY, width, 1800);
    scenery.fillStyle(0xb8d78a).fillRect(TRAINING.left, TRAINING.groundY, width, 7);
    scene.matter.add.rectangle((TRAINING.left + TRAINING.right) / 2, TRAINING.groundY + 100, width, 200, {
      isStatic: true, label: 'ground', friction: 0.8, restitution: 0.02,
    });

    for (let i = 0; i < BARS.length; i++) {
      const spec = BARS[i];
      const body = scene.matter.add.rectangle(spec.x, spec.y, spec.halfWidth * 2, TRAINING.barHeight, {
        isStatic: true, isSensor: false, label: `bar:${i}`,
        chamfer: { radius: 3 }, friction: 0.12, frictionStatic: 0.2, restitution: 0.08, slop: 0.01,
      });
      this.bars.push({ ...spec, id: i, body });
      // A level beam between two vertical posts; the muted posts are scenery
      // behind the play plane. The entire visible beam has a matching collider.
      for (const postX of [spec.x - spec.halfWidth, spec.x + spec.halfWidth]) {
        scenery.fillStyle(0x8ca59e).fillRect(postX - 4, spec.y, 8, TRAINING.groundY - spec.y);
        scenery.fillStyle(0x829968).fillEllipse(postX, TRAINING.groundY + 4, 24, 6);
      }
      scenery.fillStyle(COLORS.ink).fillRoundedRect(spec.x - spec.halfWidth, spec.y - TRAINING.barHeight / 2, spec.halfWidth * 2, TRAINING.barHeight, 3);
      scenery.lineStyle(2, 0x70938a).lineBetween(spec.x - spec.halfWidth + 3, spec.y - 4, spec.x + spec.halfWidth - 3, spec.y - 4);
    }
    this.shadow = scene.add.graphics().setDepth(-2);
  }

  render(center: Point): void {
    this.shadow.clear();
    const height = TRAINING.groundY - center.y;
    if (height < 0) return;
    this.shadow.fillStyle(0x547842, Math.max(0.035, 0.16 - height * 0.00022));
    this.shadow.fillEllipse(center.x, TRAINING.groundY + 5, 28 + height * 0.08, 7);
  }
}
