import Phaser from 'phaser';
import { PHYSICS, TRAINING } from '../config/constants';
import { TrainingLevel } from '../levels/TrainingLevel';
import { Gymnast } from '../player/Gymnast';
import { GrabSystem } from '../player/GrabSystem';
import { PlayerController } from '../player/PlayerController';
import { clamp } from '../physics/matter';

export class GameScene extends Phaser.Scene {
  private gymnast!: Gymnast;
  private grabs!: GrabSystem;
  private controller!: PlayerController;
  private level!: TrainingLevel;
  private playing = false;
  private paused = false;
  private accumulator = 0;
  private elapsed = 0;
  private cameraCenter = { x: TRAINING.bar.x + 100, y: 420 };
  private baseZoom = 1;
  private pauseMenu?: HTMLDivElement;
  private readonly handleBlur = () => { if (this.playing && !this.paused) this.setPaused(true); };
  private readonly handleVisibility = () => { if (document.hidden) this.handleBlur(); };

  constructor() { super('GameScene'); }

  create(): void {
    this.matter.world.autoUpdate = false;
    this.playing = false;
    this.paused = false;
    this.level = new TrainingLevel(this);
    this.gymnast = new Gymnast(this);
    this.grabs = new GrabSystem(this, this.gymnast, this.level.bars);
    this.controller = new PlayerController(this);
    this.resize();
    this.scale.on('resize', this.resize, this);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  beginTraining(): void {
    this.playing = true;
    this.restart();
    document.querySelector('canvas')?.focus();
  }

  private resize(): void {
    const { width, height } = this.scale;
    this.baseZoom = Math.min(width / 1400, height / 900);
    this.cameras.main.setZoom(this.baseZoom).centerOn(this.cameraCenter.x, this.cameraCenter.y);
  }

  private setPaused(value: boolean): void {
    if (!this.playing) return;
    this.paused = value;
    this.accumulator = 0;
    this.controller.reset();
    this.pauseMenu?.remove();
    this.pauseMenu = undefined;
    if (value) {
      const root = document.createElement('div');
      root.className = 'pause-overlay';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', 'Pause');
      root.innerHTML = '<section class="menu-card"><h2>NUROCLONE</h2><button data-action="resume">RESUME</button><button data-action="menu">MENU</button></section>';
      root.querySelector('[data-action="resume"]')!.addEventListener('click', () => this.setPaused(false), { once: true });
      root.querySelector('[data-action="menu"]')!.addEventListener('click', () => {
        this.setPaused(false);
        this.playing = false;
        this.controller.reset();
        this.scene.launch('MenuScene');
        this.scene.bringToTop('MenuScene');
      }, { once: true });
      document.querySelector('#ui')!.append(root);
      this.pauseMenu = root;
      root.querySelector<HTMLButtonElement>('button')!.focus();
    }
  }

  private restart(): void {
    this.grabs.destroy();
    this.gymnast.destroy();
    this.gymnast = new Gymnast(this);
    this.grabs = new GrabSystem(this, this.gymnast, this.level.bars);
    this.controller.reset();
    this.elapsed = 0;
    this.accumulator = 0;
    this.cameraCenter = { x: TRAINING.bar.x + 100, y: 420 };
    this.cameras.main.setZoom(this.baseZoom).centerOn(this.cameraCenter.x, this.cameraCenter.y);
    this.setPaused(false);
    // New bodies have exactly zero linear/angular velocity. No physics step here.
  }

  update(_time: number, delta: number): void {
    if (!this.gymnast) return;
    if (this.playing) {
      if (this.controller.pausePressed()) this.setPaused(!this.paused);
      if (this.controller.restartPressed()) {
        this.restart();
        this.renderScene();
        return;
      }
      if (!this.paused && this.controller.releasePressed()) this.grabs.release();
    }

    if (this.playing && !this.paused) {
      this.accumulator += Math.min(delta, PHYSICS.maxFrameMs);
      while (this.accumulator >= PHYSICS.stepMs) {
        // Matter has discrete collisions. Subdivide fast translation AND rotation
        // so even a thin forearm cannot cross an entire bar between two checks.
        const travel = Math.max(...this.gymnast.bodies.map(b => {
          const radius = Math.hypot(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2;
          return (Math.hypot(b.velocity.x, b.velocity.y) + Math.abs(b.angularVelocity) * radius) * PHYSICS.stepMs / (1000 / 60);
        }));
        const substeps = Math.max(1, Math.ceil(travel / PHYSICS.maxCollisionTravel));
        const step = PHYSICS.stepMs / substeps;
        for (let i = 0; i < substeps; i++) {
          this.grabs.step(step);
          const grounded = this.level.bars.some(bar => this.gymnast.bodies.some(b =>
            b.bounds.max.x > bar.x - 100 && b.bounds.min.x < bar.x + 100
            && b.bounds.max.y >= bar.y + TRAINING.platformDrop - 2
            && b.bounds.min.y <= bar.y + TRAINING.platformDrop + 3));
          this.gymnast.step(this.controller.pose, this.grabs.anchor, this.controller.twist, grounded, step);
          this.matter.world.step(step);
        }
        this.accumulator -= PHYSICS.stepMs;
        this.elapsed += PHYSICS.stepMs;
      }

      const follow = 1 - Math.exp(-Math.min(delta, 50) / 360);
      const lead = 80 + clamp(this.gymnast.velocity.x * 0.12, -100, 100);
      this.cameraCenter.x += (this.gymnast.torso.position.x + lead - this.cameraCenter.x) * follow;
      this.cameraCenter.y += (this.gymnast.torso.position.y + 75 - this.cameraCenter.y) * follow;
      const targetZoom = this.baseZoom * (1 - clamp(this.gymnast.speed / 35, 0, 0.16));
      this.cameras.main.setZoom(this.cameras.main.zoom + (targetZoom - this.cameras.main.zoom) * follow);
      this.cameras.main.centerOn(this.cameraCenter.x, this.cameraCenter.y);
      const center = this.gymnast.center;
      if (!Number.isFinite(center.x + center.y) || center.y > TRAINING.fallLimit || center.x < TRAINING.left || center.x > TRAINING.right) this.restart();
    }
    this.renderScene();
  }

  private renderScene(): void {
    this.gymnast.render();
    this.grabs.render();
    this.level.render(this.gymnast.center);
  }

  snapshot() {
    return {
      playing: this.playing, paused: this.paused, elapsed: this.elapsed,
      state: this.grabs?.state, grabs: this.grabs?.count, barId: this.grabs?.barId,
      canGrab: this.grabs?.canGrab, coolingDown: this.grabs?.coolingDown,
      bars: this.level?.bars.map(b => ({id: b.id, x: b.x, y: b.y, isSensor: b.body.isSensor})),
      pose: this.gymnast?.pose, center: this.gymnast?.center,
      speed: this.gymnast?.speed, velocity: this.gymnast?.velocity,
      twistAngle: this.gymnast?.twistAngle, twistVelocity: this.gymnast?.twistVelocity,
      jointAngles: this.gymnast?.jointAngles, inertia: this.gymnast?.planarInertia,
      feet: this.gymnast?.feet.map(f => f.point),
      bodyCount: this.gymnast?.bodies.length, jointCount: this.gymnast?.joints.length,
      worldBodies: this.matter.world.getAllBodies().length,
      worldConstraints: this.matter.world.getAllConstraints().length,
      camera: { x: this.cameras.main.midPoint.x, y: this.cameras.main.midPoint.y, zoom: this.cameras.main.zoom },
      bodies: this.gymnast?.bodies.map(b => ({ label: b.label, x: b.position.x, y: b.position.y, angle: b.angle, angularVelocity: b.angularVelocity, vx: b.velocity.x, vy: b.velocity.y })),
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
    this.pauseMenu?.remove();
    this.controller.destroy();
    this.grabs.destroy();
    this.gymnast.destroy();
  }
}
