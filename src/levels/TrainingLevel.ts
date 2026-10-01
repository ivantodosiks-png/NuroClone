import Phaser from 'phaser';
import { BARS, TRAINING } from '../config/constants';
import type { Body, Point } from '../physics/matter';

export type Bar = { id: number; x: number; y: number; halfWidth: number; body: Body };

/** Oblique depth is purely scenery. All colliders and grip anchors remain x/y. */
export class TrainingLevel {
  readonly bars: Bar[] = [];
  private readonly sky: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.createSky();
    this.sky = scene.add.image(0, 0, 'sandbox-sky').setDepth(-30).setScrollFactor(0);
    const clouds = scene.add.graphics().setDepth(-20).setScrollFactor(0.16, 0.08);
    for (let i = -3; i < 15; i++) {
      const x = i * 380;
      const y = 480 + Math.sin(i * 2.7) * 110;
      clouds.fillStyle(0xffffff, 0.18).fillEllipse(x, y, 400, 54);
      clouds.fillStyle(0xffffff, 0.14).fillEllipse(x + 80, y - 20, 230, 70);
    }
    const back = scene.add.graphics().setDepth(-4);
    const front = scene.add.graphics().setDepth(8);
    for (let i = 0; i < BARS.length; i++) {
      const spec = BARS[i];
      this.bars.push({ ...spec, id: i, body: scene.matter.add.rectangle(spec.x, spec.y, spec.halfWidth * 2, 6, {
        isStatic: true, isSensor: true, label: `bar:${i}`,
      }) });
      this.drawStation(back, front, spec.x, spec.y);
      scene.matter.add.rectangle(spec.x, spec.y + TRAINING.platformDrop + 16, 202, 32, {
        isStatic: true, label: `platform:${i}`, friction: 0.8, restitution: 0.02,
        chamfer: { radius: 4 },
      });
    }
    this.shadow = scene.add.graphics().setDepth(-2);
  }

  private createSky(): void {
    if (this.scene.textures.exists('sandbox-sky')) return;
    const texture = this.scene.textures.createCanvas('sandbox-sky', 1600, 1000)!;
    const ctx = texture.getContext();
    const gradient = ctx.createLinearGradient(0, 0, 0, 1000);
    gradient.addColorStop(0, '#9ec7dc');
    gradient.addColorStop(0.6, '#d6e9ee');
    gradient.addColorStop(1, '#f6f7ec');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1600, 1000);
    const sun = ctx.createRadialGradient(1240, 160, 0, 1240, 160, 370);
    sun.addColorStop(0, 'rgba(255,255,243,.8)');
    sun.addColorStop(0.16, 'rgba(255,255,243,.35)');
    sun.addColorStop(1, 'rgba(255,255,243,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(800, 0, 800, 600);
    // Atmospheric ridgelines far below the suspended apparatus.
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = ['#c1d9df', '#cee1e4', '#e0ebeb'][layer];
      ctx.beginPath();
      ctx.moveTo(0, 1000);
      for (let x = 0; x <= 1650; x += 55) {
        const y = 770 + layer * 65 + Math.sin(x * 0.005 + layer) * 45 + Math.cos(x * 0.011 + layer * 3) * 25;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(1600, 1000);
      ctx.closePath();
      ctx.fill();
    }
    texture.refresh();
  }

  private drawStation(back: Phaser.GameObjects.Graphics, front: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const base = y + TRAINING.platformDrop;
    const poly = (g: Phaser.GameObjects.Graphics, color: number, points: number[], alpha = 1) =>
      g.fillStyle(color, alpha).fillPoints(Array.from({length: points.length / 2}, (_, i) => ({x: points[i * 2], y: points[i * 2 + 1]})), true);
    // A floating slab: top, front fascia and right side have distinct lighting.
    poly(back, 0x829eaa, [x-154,base+30, x+48,base+30, x+48,base+66, x-154,base+66]);
    poly(back, 0x638391, [x+48,base+30, x+154,base-30, x+154,base+6, x+48,base+66]);
    poly(back, 0xe6f0ee, [x-154,base+30, x-48,base-30, x+154,base-30, x+48,base+30]);
    back.lineStyle(2, 0xfafff4).lineBetween(x-154,base+30,x+48,base+30);
    back.lineStyle(3, 0xafc8cd).lineBetween(x-148,base+39,x+44,base+39);
    // Slim underside ribs make the thickness apparent from the camera angle.
    for (let dx = -130; dx < 40; dx += 27) back.lineStyle(1, 0x678996, 0.6).lineBetween(x+dx,base+44,x+dx,base+61);
    // The y=base physics surface cuts the top slab through the gameplay plane.
    poly(back, 0xc2d8d9, [x-96,base+4, x-79,base-6, x+100,base-6, x+83,base+4]);
    // Long, diagonal cast shadows on the deck, matching the upper-right sunlight.
    poly(back, 0x4d7282, [x+47,base-28,x+56,base-28,x+5,base+12,x-4,base+12], 0.2);
    back.fillStyle(0x728e9b).fillEllipse(x+53,base-30,29,11);
    // Far upright and bracing sit behind Nuro.
    back.lineStyle(3, 0x9eb8c2).lineBetween(x+111,base-29,x+54,y-30);
    back.lineStyle(12, 0x93afb9).lineBetween(x+53,base-30,x+53,y-30);
    back.lineStyle(3, 0xd6e7e8).lineBetween(x+50,base-34,x+50,y-32);
    back.fillStyle(0x7c9aa5).fillCircle(x+53,y-30,7);
    // Cylindrical bar runs along projected depth; the grip zone crosses z=0.
    back.lineStyle(9, 0x638393).lineBetween(x-53,y+30,x+53,y-30);
    back.lineStyle(3, 0xe1efed).lineBetween(x-53,y+27,x+53,y-33);
    back.lineStyle(9, 0x2c5363).lineBetween(x-13,y+7.4,x+13,y-7.4);
    back.lineStyle(2, 0xc5e5b0).lineBetween(x-11,y+4.3,x+11,y-8);
    // The near upright visibly occludes objects passing behind it.
    front.fillStyle(0x698b99).fillEllipse(x-53,base+30,30,11);
    front.lineStyle(13, 0x527887).lineBetween(x-53,base+28,x-53,y+30);
    front.lineStyle(4, 0xaac5ce).lineBetween(x-56,base+25,x-56,y+29);
    front.lineStyle(2, 0x759aa8).lineBetween(x-111,base+29,x-54,y+34);
    front.fillStyle(0xd8e9e8).fillEllipse(x-53,y+30,14,13);
    front.fillStyle(0x70929f).fillEllipse(x-53,y+30,7,7);
  }

  render(center: Point): void {
    const camera = this.scene.cameras.main;
    this.sky.setPosition(camera.width / 2, camera.height / 2).setDisplaySize(camera.width / camera.zoom, camera.height / camera.zoom);
    this.shadow.clear();
    // The projected shadow is the sole visual offset; Nuro's bodies are never moved in z.
    for (const bar of this.bars) {
      const top = bar.y + TRAINING.platformDrop;
      const height = top - center.y;
      if (height < -20 || Math.abs(center.x - bar.x) > 88) continue;
      const alpha = Math.max(0.025, 0.16 - Math.max(0,height) * 0.00022);
      this.shadow.fillStyle(0x335c6b, alpha);
      this.shadow.fillEllipse(center.x - 10, top + 2, 28 + Math.max(0,height) * 0.09, 9);
    }
  }
}
