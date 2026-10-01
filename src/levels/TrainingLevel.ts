import Phaser from 'phaser';
import { COLORS, TRAINING } from '../config/constants';
import type { Body, Point } from '../physics/matter';

export class TrainingLevel {
  readonly bar: Body;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly points: Point[] = [];
  private lastTrailAt = 0;

  constructor(scene: Phaser.Scene) {
    const { x, y } = TRAINING.bar;
    const floor = TRAINING.floorY;
    if (!scene.textures.exists('grid-dot')) {
      const tile = scene.textures.createCanvas('grid-dot', 40, 40)!;
      const context = tile.getContext();
      context.fillStyle = '#dde3d9';
      context.beginPath();
      context.arc(20, 20, 0.85, 0, Math.PI * 2);
      context.fill();
      tile.refresh();
    }
    scene.add.tileSprite((TRAINING.left + TRAINING.right) / 2, (floor - 1000) / 2,
      TRAINING.right - TRAINING.left, floor + 1000, 'grid-dot').setDepth(-6).setAlpha(0.65);
    const backdrop = scene.add.graphics().setDepth(-5);
    backdrop.fillStyle(COLORS.floor).fillRect(TRAINING.left, floor, TRAINING.right - TRAINING.left, 1800);
    backdrop.lineStyle(1, 0xc6d0c3).lineBetween(TRAINING.left, floor, TRAINING.right, floor);
    for (let gx = TRAINING.left; gx <= TRAINING.right; gx += 80) {
      backdrop.lineStyle(1, 0xc6d0c3, 0.6).lineBetween(gx, floor, gx, floor + 8);
    }

    // The frame is scenery: only the horizontal bar and landing surfaces collide.
    const frame = scene.add.graphics().setDepth(-3);
    frame.lineStyle(1, 0xc9d4c6, 0.65).strokeCircle(x, y + 135, 276);
    frame.lineStyle(1, 0xc9d4c6, 0.4).strokeCircle(x, y + 135, 320);
    frame.lineStyle(2, 0xc0cdc0).lineBetween(x - 139, y + 10, x - 228, floor);
    frame.lineBetween(x + 139, y + 10, x + 228, floor);
    frame.lineStyle(8, 0xc1cebd).lineBetween(x - 139, y, x - 139, floor - 9);
    frame.lineBetween(x + 139, y, x + 139, floor - 9);
    frame.lineStyle(3, 0xe7eee0).lineBetween(x - 141, y + 10, x - 141, floor - 13);
    frame.lineBetween(x + 137, y + 10, x + 137, floor - 13);
    frame.fillStyle(0xabbca8).fillRoundedRect(x - 166, floor - 9, 55, 9, 4);
    frame.fillRoundedRect(x + 111, floor - 9, 55, 9, 4);
    frame.lineStyle(9, 0x90a58f).lineBetween(x - 149, y, x + 149, y);
    frame.lineStyle(3, 0xb6c5af).lineBetween(x - 145, y - 3, x + 145, y - 3);
    frame.lineStyle(7, COLORS.ink).lineBetween(x - TRAINING.bar.halfWidth, y, x + TRAINING.bar.halfWidth, y);
    frame.fillStyle(COLORS.lime).fillCircle(x - 139, y, 5).fillCircle(x + 139, y, 5);
    for (let bx = x - 32; bx < x + 36; bx += 6) {
      frame.lineStyle(1, 0xadc28f, 0.55).lineBetween(bx, y - 3, bx - 2, y + 3);
    }

    const mat = scene.add.graphics().setDepth(-2);
    mat.fillStyle(0xcedabf).fillRoundedRect(x - 234, floor - 14, 468, 14, 5);
    mat.fillStyle(0xdbe5c8).fillRoundedRect(x - 234, floor - 18, 468, 11, 5);
    mat.lineStyle(1, 0xb7c7aa).lineBetween(x - 217, floor - 8, x + 217, floor - 8);
    mat.lineStyle(1, 0xc3d1b1).lineBetween(x, floor - 17, x, floor - 2);

    scene.add.text(x + 159, y - 12, '01', { fontFamily: 'monospace', fontSize: '13px', color: '#84958c' }).setDepth(-2);
    scene.add.text(x, floor + 33, 'N U R O   /   M O V E M E N T   L A B', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#98a68e',
    }).setOrigin(0.5).setDepth(-2);

    scene.matter.add.rectangle((TRAINING.left + TRAINING.right) / 2, floor + 100, TRAINING.right - TRAINING.left, 200, {
      isStatic: true, label: 'floor', friction: 0.85, restitution: 0.05,
    });
    scene.matter.add.rectangle(x, floor - 8, 468, 20, {
      isStatic: true, label: 'landing-mat', friction: 0.9, restitution: 0.03, chamfer: { radius: 5 },
    });
    this.bar = scene.matter.add.rectangle(x, y, TRAINING.bar.halfWidth * 2, 7, {
      isStatic: true, isSensor: true, label: 'horizontal-bar',
    });
    this.shadow = scene.add.graphics().setDepth(-1);
    this.trail = scene.add.graphics().setDepth(0);
  }

  render(center: Point, speed: number, time: number, active: boolean): void {
    this.shadow.clear();
    const height = Math.max(0, TRAINING.floorY - center.y);
    const width = 30 + height * 0.13;
    this.shadow.fillStyle(0x456447, Math.max(0.025, 0.1 - height * 0.00013));
    this.shadow.fillEllipse(center.x, TRAINING.floorY - 18, width, 9);
    if (active && time - this.lastTrailAt > 60) {
      this.lastTrailAt = time;
      this.points.push({ ...center });
      if (this.points.length > 24) this.points.shift();
    }
    this.trail.clear();
    if (speed > 0.6) {
      this.points.forEach((p, index) => {
        this.trail.fillStyle(0x9bac83, (index / this.points.length) * 0.22).fillCircle(p.x, p.y, 2);
      });
    }
  }

  clearTrail(): void { this.points.length = 0; this.trail.clear(); }
}
