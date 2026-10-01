import Phaser from 'phaser';
import { PHYSICS, TRAINING } from '../config/constants';
import { TrainingLevel } from '../levels/TrainingLevel';
import { Gymnast } from '../player/Gymnast';
import { GrabSystem } from '../player/GrabSystem';
import { PlayerController } from '../player/PlayerController';
import { TrickTracker } from '../player/TrickTracker';
import { clamp, wrapAngle, type Body, type Point } from '../physics/matter';
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
  private readonly tricks = new TrickTracker();
  private cameraCenter = { x: TRAINING.bar.x, y: 430 };
  private baseZoom = 1;
  private landingSince = -1;
  private grounded = false;
  private readonly impactSpeeds = new Map<number, number>();
  private impactAngular = 0;
  private readonly contacts: { body: Body; points: Point[] }[] = [];
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
    this.matter.world.on('collisionstart', this.onCollision, this);
    this.matter.world.on('collisionactive', this.onCollision, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  beginTraining(): void {
    this.playing = true;
    this.paused = false;
    this.restart();
    this.hud?.destroy();
    this.hud = new HUD({
      resume: () => this.setPaused(false),
      restart: () => this.restart(),
    });
    document.querySelector('canvas')?.focus();
  }

  private resize(): void {
    const { width, height } = this.scale;
    this.baseZoom = Math.min(width / 1200, height / 850);
    this.cameras.main.setZoom(this.baseZoom).centerOn(this.cameraCenter.x, this.cameraCenter.y);
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
    this.tricks.reset();
    this.landingSince = -1;
    this.grounded = false;
    this.contacts.length = 0;
    this.cameraCenter = { x: TRAINING.bar.x, y: 430 };
    this.cameras.main.setZoom(this.baseZoom).centerOn(this.cameraCenter.x, this.cameraCenter.y);
    this.setPaused(false);
  }

  update(_time: number, delta: number): void {
    if (!this.gymnast) return;
    if (this.playing) {
      if (this.controller.pausePressed()) this.setPaused(!this.paused);
      if (this.controller.restartPressed()) this.restart();
      if (!this.paused && this.controller.releasePressed() && this.grabs.count > 0) {
        this.grabs.release();
        this.tricks.release(this.gymnast.torso.angle, this.gymnast.twistAngle);
        this.landingSince = -1;
      }
    }

    if (this.playing && !this.paused) {
      this.accumulator += Math.min(delta, PHYSICS.maxFrameMs);
      while (this.accumulator >= PHYSICS.stepMs) {
        const previousGrabs = this.grabs.count;
        this.grabs.step(PHYSICS.stepMs, !this.grounded && this.tricks.outcome !== 'crash');
        if (previousGrabs === 0 && this.grabs.count > 0) this.tricks.finish('regrab');
        this.gymnast.step(this.controller.direction, this.controller.pose, this.grabs.count > 0, this.controller.twist, this.grounded);
        this.contacts.length = 0;
        this.impactAngular = Math.abs(this.gymnast.torso.angularVelocity * 60);
        for (const body of this.gymnast.bodies) this.impactSpeeds.set(body.id, Math.hypot(body.velocity.x, body.velocity.y) * 60 / PHYSICS.pixelsPerMeter);
        this.matter.world.step(PHYSICS.stepMs);
        this.accumulator -= PHYSICS.stepMs;
        this.elapsed += PHYSICS.stepMs;
        this.checkLanding();
        if (!this.grounded) this.tricks.step(this.gymnast.torso.angle, this.gymnast.twistAngle);
      }

      const center = this.gymnast.center;
      // Track only the torso, so a leg raise cannot jerk the camera.
      const follow = 1 - Math.exp(-Math.min(delta, 50) / 360);
      this.cameraCenter.x += (this.gymnast.torso.position.x - this.cameraCenter.x) * follow;
      this.cameraCenter.y += (Math.min(this.gymnast.torso.position.y + 60, 550) - this.cameraCenter.y) * follow;
      const targetZoom = this.baseZoom * (1 - clamp(this.gymnast.speed / 18, 0, 0.2));
      this.cameras.main.setZoom(this.cameras.main.zoom + (targetZoom - this.cameras.main.zoom) * follow);
      this.cameras.main.centerOn(this.cameraCenter.x, this.cameraCenter.y);
      if (!Number.isFinite(center.x + center.y) || center.y > TRAINING.floorY + 600 || center.x < TRAINING.left + 100 || center.x > TRAINING.right - 100) {
        this.restart();
      }
    }

    this.gymnast.render();
    this.grabs.render();
    this.level.render(this.gymnast.center, this.gymnast.speed, this.elapsed, this.playing && !this.paused);
    this.hud?.update({
      score: this.tricks.score, flips: this.tricks.flips, twists: this.tricks.twists,
      lastTrick: this.tricks.lastTrick, bestScore: this.tricks.bestScore,
    });
  }

  private onCollision(event: { pairs: { bodyA: Body; bodyB: Body; collision: { supports: Point[] } }[] }): void {
    for (const pair of event.pairs) {
      const surface = [pair.bodyA, pair.bodyB].find(body => body.label === 'floor' || body.label === 'landing-mat');
      if (!surface) continue;
      const body = surface === pair.bodyA ? pair.bodyB : pair.bodyA;
      if (body.label.startsWith('nuro:')) this.contacts.push({ body, points: pair.collision.supports.filter(Boolean) });
    }
  }

  private checkLanding(): void {
    this.grounded = this.contacts.length > 0;
    if (!this.tricks.airborne) return;
    if (!this.grounded) { this.landingSince = -1; return; }
    const config = PHYSICS.landing;
    const feet = this.gymnast.feet;
    const badContact = this.contacts.some(contact => {
      const foot = feet.find(f => f.body === contact.body);
      return !foot || !contact.points.some(p => Math.hypot(p.x - foot.point.x, p.y - foot.point.y) <= config.footContactDistance);
    });
    const speed = Math.max(this.gymnast.speed, ...this.contacts.map(c => this.impactSpeeds.get(c.body.id) ?? 0));
    if (badContact || speed > config.maxSpeed || this.impactAngular > config.maxAngularVelocity
      || Math.abs(this.gymnast.twistVelocity) > config.maxTwistVelocity
      || Math.abs(wrapAngle(this.gymnast.torso.angle)) > config.maxTilt) {
      this.tricks.finish('crash');
      return;
    }
    if (this.landingSince < 0) this.landingSince = this.elapsed;
    if (this.elapsed - this.landingSince >= config.settleMs) this.tricks.finish('landing');
  }

  snapshot() {
    return {
      playing: this.playing, paused: this.paused, elapsed: this.elapsed,
      grabs: this.grabs?.count, canGrab: this.grabs?.canGrab,
      pose: this.gymnast?.pose, center: this.gymnast?.center,
      speed: this.gymnast?.speed, velocity: this.gymnast?.velocity,
      twistAngle: this.gymnast?.twistAngle, twistVelocity: this.gymnast?.twistVelocity,
      jointAngles: this.gymnast?.jointAngles, inertia: this.gymnast?.planarInertia,
      feet: this.gymnast?.feet.map(f => f.point),
      score: this.tricks.score, bestScore: this.tricks.bestScore, flips: this.tricks.flips, twists: this.tricks.twists,
      lastTrick: this.tricks.lastTrick, outcome: this.tricks.outcome, airborne: this.tricks.airborne,
      bodyCount: this.gymnast?.bodies.length, jointCount: this.gymnast?.joints.length,
      worldBodies: this.matter.world.getAllBodies().length,
      worldConstraints: this.matter.world.getAllConstraints().length,
      camera: { x: this.cameras.main.midPoint.x, y: this.cameras.main.midPoint.y, zoom: this.cameras.main.zoom },
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
    this.matter.world.off('collisionstart', this.onCollision, this);
    this.matter.world.off('collisionactive', this.onCollision, this);
    this.hud?.destroy();
    this.controller.destroy();
    this.grabs.destroy();
    this.gymnast.destroy();
  }
}
