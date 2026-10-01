import Phaser from 'phaser';
import { COLORS, PHYSICS, TRAINING } from '../config/constants';
import { JointMotor } from '../physics/JointMotor';
import { Matter, worldPoint, wrapAngle, type Body, type Constraint, type Point } from '../physics/matter';

export type Pose = 'neutral' | 'raise' | 'tuck';
export type Side = 'left' | 'right';
type Bone = { body: Body; length: number; width: number };
export type Hand = { side: Side; body: Body; local: Point };

/** Eleven independent rigid bodies, connected by ten physical joints. */
export class Gymnast {
  readonly bodies: Body[] = [];
  readonly joints: Constraint[] = [];
  readonly motors: JointMotor[] = [];
  readonly hands: Hand[] = [];
  readonly torso: Body;
  readonly pelvis: Body;
  readonly head: Body;
  pose: Pose = 'neutral';
  private readonly bones = new Map<string, Bone>();
  private readonly limbMotors = new Map<string, JointMotor>();
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly group = Matter.Body.nextGroup(true);
  private tuckAmount = 0;
  private raiseAmount = 0;
  private drive = 0;
  private axialMomentum = 0;
  twistAngle = 0;
  twistVelocity = 0; // radians/second

  constructor(private readonly scene: Phaser.Scene) {
    const { x, y } = TRAINING.bar;
    this.graphics = scene.add.graphics().setDepth(5);
    this.torso = this.bone('torso', { x, y: y + 88 }, { x, y: y + 132 }, 17, 4.2);
    this.pelvis = this.bone('pelvis', { x, y: y + 132 }, { x, y: y + 153 }, 24, 2.5);
    this.head = scene.matter.add.circle(x, y + 65, 14, this.options('head'));
    Matter.Body.setMass(this.head, 1.2);
    this.bodies.push(this.head);
    this.joint('neck', this.torso, this.head, { x, y: y + 84 }, 0, 0.8);
    this.joint('spine', this.torso, this.pelvis, { x, y: y + 132 }, 0, 1.6);

    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? -1 : 1;
      const shoulder = { x: x + sign * 7, y: y + 91 };
      const elbow = { x: x + sign * 19, y: y + 47 };
      const wrist = { x: x + sign * 24, y: y + 2 };
      const hip = { x: x + sign * 7, y: y + 152 };
      const knee = { x: x + sign * 12, y: y + 198 };
      const ankle = { x: x + sign * 17, y: y + 244 };
      const upperArm = this.bone(`${side}UpperArm`, shoulder, elbow, 10, 0.95);
      const lowerArm = this.bone(`${side}LowerArm`, elbow, wrist, 9, 0.75);
      const thigh = this.bone(`${side}Thigh`, hip, knee, 12, 1.4);
      const shin = this.bone(`${side}Shin`, knee, ankle, 10, 0.95);
      this.joint(`${side}Shoulder`, this.torso, upperArm, shoulder, upperArm.angle, 1.5);
      this.joint(`${side}Elbow`, upperArm, lowerArm, elbow, lowerArm.angle - upperArm.angle, 1.8);
      this.joint(`${side}Hip`, this.pelvis, thigh, hip, thigh.angle, 1.8);
      this.joint(`${side}Knee`, thigh, shin, knee, shin.angle - thigh.angle, 1.2);
      this.hands.push({ side, body: lowerArm, local: { x: 0, y: this.bones.get(`${side}LowerArm`)!.length / 2 } });
    }
  }

  private options(label: string): Phaser.Types.Physics.Matter.MatterBodyConfig {
    return {
      label: `nuro:${label}`,
      collisionFilter: { group: this.group },
      friction: 0.7,
      frictionStatic: 1,
      frictionAir: 0.0008,
      restitution: 0.06,
      slop: 0.02,
    };
  }

  private bone(name: string, start: Point, end: Point, width: number, mass: number): Body {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const body = this.scene.matter.add.rectangle(
      (start.x + end.x) / 2, (start.y + end.y) / 2, width, length,
      { ...this.options(name), chamfer: { radius: width / 2 - 1 } },
    );
    Matter.Body.setAngle(body, Math.atan2(end.y - start.y, end.x - start.x) - Math.PI / 2);
    Matter.Body.setMass(body, mass);
    this.bones.set(name, { body, width, length });
    this.bodies.push(body);
    return body;
  }

  private joint(name: string, parent: Body, child: Body, anchor: Point, rest: number, strength: number): void {
    // Matter stores rotating offsets in world orientation; pass the initial world offsets.
    const constraint = this.scene.matter.add.constraint(parent, child, 0, 0.995, {
      label: name,
      pointA: { x: anchor.x - parent.position.x, y: anchor.y - parent.position.y },
      pointB: { x: anchor.x - child.position.x, y: anchor.y - child.position.y },
      // Length constraints stay rigid; PD muscles damp relative joint rotation.
      // Large linear constraint damping incorrectly drains whole-body spin.
      damping: 0.005,
    });
    this.joints.push(constraint);
    const motor = new JointMotor(parent, child, constraint, rest, strength);
    this.motors.push(motor);
    this.limbMotors.set(name, motor);
  }

  step(direction: number, pose: Pose, grabbed: boolean, twisting = false, grounded = false): void {
    this.pose = pose;
    const dt = PHYSICS.stepMs / 1000;
    const blend = 1 - Math.exp(-PHYSICS.poseTransitionSpeed * dt);
    this.tuckAmount += ((pose === 'tuck' ? 1 : 0) - this.tuckAmount) * blend;
    this.raiseAmount += ((pose === 'raise' ? 1 : 0) - this.raiseAmount) * blend;
    this.drive += (direction - this.drive) * (1 - Math.exp(-5 * dt));
    const tuck = this.tuckAmount;
    const raise = this.raiseAmount;
    for (const [name, motor] of this.limbMotors) {
      let offset = 0;
      let strength = 1;
      if (name.includes('Hip')) {
        offset = -2.4 * tuck + PHYSICS.legRaiseTargetAngle * raise;
        strength += raise * PHYSICS.legRaiseStrength + tuck * PHYSICS.tuckStrength;
      }
      if (name.includes('Knee')) {
        offset = 2.6 * tuck;
        strength += raise * PHYSICS.legRaiseStrength + tuck * PHYSICS.tuckStrength;
      }
      if (name.includes('Shoulder')) offset = (grabbed ? 0 : 1.9) * tuck;
      if (name.includes('Elbow')) offset = (grabbed ? -0.2 : -1.5) * tuck;
      if (name === 'spine') { offset = -0.18 * tuck - 0.12 * raise; strength = 2; }
      motor.target = motor.restAngle + offset;
      motor.step(strength);
    }

    // Fixed total torque: tucking decreases actual planar inertia, increasing spin.
    const totalInertia = this.bodies.reduce((sum, body) => sum + body.inertia, 0);
    for (const body of this.bodies) {
      body.torque -= this.drive * PHYSICS.rotationTorque * body.inertia / totalInertia;
      if (grabbed && Math.abs(this.drive) > 0.001) {
        const dx = body.position.x - TRAINING.bar.x;
        const dy = body.position.y - TRAINING.bar.y;
        const distance = Math.max(40, Math.hypot(dx, dy));
        Matter.Body.applyForce(body, body.position, {
          x: this.drive * dy / distance * body.mass * PHYSICS.swingForce,
          y: -this.drive * dx / distance * body.mass * PHYSICS.swingForce,
        });
      }
    }
    this.stepTwist(twisting, grabbed, grounded, dt);
  }

  /**
   * 2.5D analogue: a torque-integrated axial degree of freedom on the 2D ragdoll.
   * L = I*w persists without K. Mass/pose determine inertia, grips and ground exert
   * resistance. A small equal/opposite torque couple loads the real spine joints.
   * This is not a timer animation or a second planar somersault counter.
   */
  private stepTwist(pressed: boolean, grabbed: boolean, grounded: boolean, dt: number): void {
    const torque = pressed && !grounded ? PHYSICS.twistTorque : 0;
    this.axialMomentum += torque * dt;
    this.axialMomentum *= Math.exp(-(grounded ? 12 : grabbed ? 9 : 0.025) * dt);
    this.twistVelocity = this.axialMomentum / this.twistInertia;
    this.twistAngle += this.twistVelocity * dt;
    if (torque !== 0) {
      const reaction = torque * 0.018;
      this.torso.torque += reaction;
      this.pelvis.torque -= reaction;
    }
  }

  get twistInertia(): number {
    // Axial inertia in kg*m² for a thin stickman; perpendicular mass offsets
    // increase it when the legs are raised, while folded arms reduce it.
    const axis = { x: -Math.sin(this.torso.angle), y: Math.cos(this.torso.angle) };
    let inertia = 0;
    for (const body of this.bodies) {
      const dx = body.position.x - this.torso.position.x;
      const dy = body.position.y - this.torso.position.y;
      const perpendicular = (dx * axis.y - dy * axis.x) / PHYSICS.pixelsPerMeter;
      const radius = 0.06 * (1 - this.tuckAmount * 0.25);
      inertia += body.mass * (radius * radius + perpendicular * perpendicular * 0.08);
    }
    return Math.max(0.1, inertia);
  }

  get feet(): { body: Body; point: Point }[] {
    return ['left', 'right'].map(side => {
      const bone = this.bones.get(`${side}Shin`)!;
      return { body: bone.body, point: worldPoint(bone.body, { x: 0, y: bone.length / 2 }) };
    });
  }

  get jointAngles(): Record<string, number> {
    return Object.fromEntries([...this.limbMotors].map(([name, motor]) =>
      [name, wrapAngle(motor.child.angle - motor.parent.angle - motor.restAngle)]));
  }

  get planarInertia(): number {
    const center = this.center;
    return this.bodies.reduce((sum, b) => sum + b.inertia + b.mass * ((b.position.x - center.x) ** 2 + (b.position.y - center.y) ** 2), 0);
  }

  get center(): Point {
    let x = 0, y = 0, mass = 0;
    for (const body of this.bodies) {
      x += body.position.x * body.mass;
      y += body.position.y * body.mass;
      mass += body.mass;
    }
    return { x: x / mass, y: y / mass };
  }

  get velocity(): Point {
    let x = 0, y = 0, mass = 0;
    for (const body of this.bodies) {
      x += body.velocity.x * body.mass;
      y += body.velocity.y * body.mass;
      mass += body.mass;
    }
    return { x: x / mass * 60, y: y / mass * 60 };
  }

  get speed(): number {
    const v = this.velocity;
    return Math.hypot(v.x, v.y) / PHYSICS.pixelsPerMeter;
  }

  handPoint(hand: Hand): Point { return worldPoint(hand.body, hand.local); }

  render(): void {
    const g = this.graphics;
    g.clear();
    const drawBone = (name: string, color: number, width?: number) => {
      const bone = this.bones.get(name)!;
      const a = worldPoint(bone.body, { x: 0, y: -bone.length / 2 + 3 });
      const b = worldPoint(bone.body, { x: 0, y: bone.length / 2 - 3 });
      const w = width ?? bone.width;
      g.lineStyle(w, color, 1).lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(color).fillCircle(a.x, a.y, w / 2).fillCircle(b.x, b.y, w / 2);
    };
    const facing = Math.cos(this.twistAngle);
    const leftColor = facing >= 0 ? COLORS.farLimb : COLORS.ink;
    const rightColor = facing >= 0 ? COLORS.ink : COLORS.farLimb;
    for (const name of ['leftUpperArm', 'leftLowerArm', 'leftThigh', 'leftShin']) drawBone(name, leftColor);
    drawBone('torso', COLORS.ink, 12 + 4 * Math.abs(facing));
    drawBone('pelvis', COLORS.ink, 15 + 6 * Math.abs(facing));
    for (const name of ['rightUpperArm', 'rightLowerArm', 'rightThigh', 'rightShin']) drawBone(name, rightColor);

    for (const side of ['left', 'right']) {
      const knee = worldPoint(this.bones.get(`${side}Thigh`)!.body, { x: 0, y: 22 });
      g.fillStyle(COLORS.lime).fillCircle(knee.x, knee.y, 3);
      const ankle = worldPoint(this.bones.get(`${side}Shin`)!.body, { x: 0, y: 21 });
      const toe = worldPoint(this.bones.get(`${side}Shin`)!.body, { x: 8, y: 21 });
      g.lineStyle(8, side === 'left' ? COLORS.farLimb : COLORS.ink).lineBetween(ankle.x, ankle.y, toe.x, toe.y);
      g.fillStyle(side === 'left' ? COLORS.farLimb : COLORS.ink).fillCircle(toe.x, toe.y, 4);
    }
    const p = this.head.position;
    g.fillStyle(COLORS.background).fillCircle(p.x, p.y, 14);
    g.lineStyle(4, COLORS.ink).strokeCircle(p.x, p.y, 14);
    const eye = worldPoint(this.head, { x: 6 * facing, y: -2 });
    g.fillStyle(COLORS.ink).fillCircle(eye.x, eye.y, 2);
    const chest = worldPoint(this.torso, { x: 7 * Math.sin(this.twistAngle), y: -7 });
    g.fillStyle(COLORS.lime, 0.3 + 0.7 * Math.max(0, facing)).fillCircle(chest.x, chest.y, 4);
  }

  destroy(): void {
    for (const joint of this.joints) this.scene.matter.world.removeConstraint(joint);
    for (const body of this.bodies) this.scene.matter.world.remove(body);
    this.graphics.destroy();
  }
}
