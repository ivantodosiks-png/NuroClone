import Phaser from 'phaser';
import { PHYSICS, TRAINING } from '../config/constants';
import { TrainingLevel } from '../levels/TrainingLevel';
import { Gymnast } from '../player/Gymnast';
import { GrabSystem } from '../player/GrabSystem';
import { PlayerController } from '../player/PlayerController';
import { HUD } from '../ui/HUD';

export class GameScene extends Phaser.Scene {
  private gymnast!: Gymnast;
  private grabs!: GrabSystem;
  private controller!: PlayerController;
  private level!: TrainingLevel;
  private hud?: HUD;
  private playing = false;
  private paused = false;
  private accumulator = 0;
  private elapsed = 0;
  private maxSpeed = 0;
  private progress = 0;
  private cameraCenter = { x: 720, y: 430 };
  private readonly handleBlur = () => { if (this.playing && !this.paused) this.setPaused(true); };
  private readonly handleVisibility = () => { if (document.hidden) this.handleBlur(); };

  constructor() { super('GameScene'); }

  create(): void {
    this.matter.world.autoUpdate = false;
    this.playing = false;
    this.paused = false;
    this.level = new TrainingLevel(this);
    this.gymnast = new Gymnast(this);
    this.grabs = new GrabSystem(this, this.gymnast, this.level.bar);
    this.controller = new PlayerController(this);
    this.resize();
    this.scale.on('resize', this.resize, this);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  beginTraining(): void {
    this.playing = true;
    this.paused = false;
    this.restart();
    this.hud?.destroy();
    this.hud = new HUD({
      pause: () => this.setPaused(!this.paused),
      resume: () => this.setPaused(false),
      restart: () => this.restart(),
      menu: () => this.returnToMenu(),
    });
    document.querySelector('canvas')?.focus();
  }

  private resize(): void {
    const { width, height } = this.scale;
    const zoom = Math.min(width / 1440, height / 900);
    this.cameras.main.setZoom(zoom).centerOn(this.cameraCenter.x, this.cameraCenter.y);
  }

  private setPaused(value: boolean): void {
    if (!this.playing) return;
    this.paused = value;
    this.accumulator = 0;
    this.controller.reset();
    this.hud?.setPaused(value);
  }

  private restart(): void {
    this.grabs.destroy();
    this.gymnast.destroy();
    this.gymnast = new Gymnast(this);
    this.grabs = new GrabSystem(this, this.gymnast, this.level.bar);
    this.controller.reset();
    this.level.clearTrail();
    this.elapsed = 0;
    this.accumulator = 0;
    this.maxSpeed = 0;
    this.progress = 0;
    this.cameraCenter = { x: 720, y: 430 };
    this.cameras.main.centerOn(720, 430);
    this.setPaused(false);
  }

  private returnToMenu(): void {
    this.hud?.destroy();
    this.hud = undefined;
    this.playing = false;
    this.paused = false;
    this.restart();
    this.scene.launch('MenuScene');
    this.scene.bringToTop('MenuScene');
  }

  update(_time: number, delta: number): void {
    if (!this.gymnast) return;
    if (this.playing) {
      if (this.controller.pausePressed()) this.setPaused(!this.paused);
      if (this.controller.restartPressed()) this.restart();
      if (!this.paused && this.controller.grabPressed()) this.grabs.toggle();
    }

    if (this.playing && !this.paused) {
      this.accumulator += Math.min(delta, PHYSICS.maxFrameMs);
      while (this.accumulator >= PHYSICS.stepMs) {
        this.grabs.step(PHYSICS.stepMs);
        this.gymnast.step(this.controller.direction, this.controller.pose, this.grabs.count > 0);
        this.matter.world.step(PHYSICS.stepMs);
        this.accumulator -= PHYSICS.stepMs;
        this.elapsed += PHYSICS.stepMs;
      }
      this.maxSpeed = Math.max(this.maxSpeed, this.gymnast.speed);
      if (this.progress === 0 && this.maxSpeed > 1.4) this.progress = 1;
      if (this.progress === 1 && this.controller.pose === 'tuck') this.progress = 2;
      if (this.progress === 2 && this.grabs.count === 0) this.progress = 3;

      const center = this.gymnast.center;
      // Follow the center of mass; only the camera is interpolated, never physics bodies.
      const follow = 1 - Math.exp(-delta / 420);
      this.cameraCenter.x += (center.x - 140 - this.cameraCenter.x) * follow;
      this.cameraCenter.y += (Math.min(550, Math.max(220, center.y + 50)) - this.cameraCenter.y) * follow;
      this.cameras.main.centerOn(this.cameraCenter.x, this.cameraCenter.y);
      if (!Number.isFinite(center.x + center.y) || center.y > TRAINING.floorY + 600 || center.x < TRAINING.left + 100 || center.x > TRAINING.right - 100) {
        this.restart();
      }
    }

    this.gymnast.render();
    this.grabs.render();
    this.level.render(this.gymnast.center, this.gymnast.speed, this.elapsed, this.playing && !this.paused);
    this.hud?.update({
      fps: this.game.loop.actualFps,
      speed: this.gymnast.speed,
      angular: this.gymnast.torso.angularVelocity * 60,
      grabs: this.grabs.count,
      pose: this.gymnast.pose,
      canGrab: this.grabs.canGrab,
      seeking: this.grabs.isSeeking,
      grounded: this.gymnast.bodies.some(b => b.bounds.max.y > TRAINING.floorY - 21),
      elapsed: this.elapsed,
      maxSpeed: this.maxSpeed,
      direction: this.controller.direction,
      progress: this.progress,
    }, performance.now());
  }

  snapshot() {
    return {
      playing: this.playing, paused: this.paused, elapsed: this.elapsed,
      grabs: this.grabs?.count, canGrab: this.grabs?.canGrab,
      pose: this.gymnast?.pose, center: this.gymnast?.center,
      speed: this.gymnast?.speed, velocity: this.gymnast?.velocity,
      bodyCount: this.gymnast?.bodies.length, jointCount: this.gymnast?.joints.length,
      worldBodies: this.matter.world.getAllBodies().length,
      worldConstraints: this.matter.world.getAllConstraints().length,
      camera: { x: this.cameras.main.midPoint.x, y: this.cameras.main.midPoint.y },
      bodies: this.gymnast?.bodies.map(b => ({ label: b.label, x: b.position.x, y: b.position.y, angle: b.angle, angularVelocity: b.angularVelocity })),
      joints: this.gymnast?.joints.map(c => ({
        label: c.label,
        error: Math.hypot(c.bodyA!.position.x + c.pointA.x - c.bodyB!.position.x - c.pointB.x, c.bodyA!.position.y + c.pointA.y - c.bodyB!.position.y - c.pointB.y),
      })),
      hands: this.gymnast?.hands.map(h => ({ side: h.side, ...this.gymnast.handPoint(h) })),
    };
  }

  private cleanup(): void {
    this.scale.off('resize', this.resize, this);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.hud?.destroy();
    this.controller.destroy();
    this.grabs.destroy();
    this.gymnast.destroy();
  }
}
