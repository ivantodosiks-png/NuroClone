import Phaser from 'phaser';
import { COLORS, PHYSICS, TRAINING } from '../config/constants';
import { JointMotor } from '../physics/JointMotor';
import { Matter, worldPoint, type Body, type Constraint, type Point } from '../physics/matter';

export type Pose = 'neutral' | 'tuck' | 'arch';
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
  private archAmount = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const { x, y } = TRAINING.bar;
    this.graphics = scene.add.graphics().setDepth(5);
    this.torso = this.bone('torso', { x, y: y + 88 }, { x, y: y + 132 }, 15, 3.5);
    this.pelvis = this.bone('pelvis', { x, y: y + 132 }, { x, y: y + 153 }, 23, 2.3);
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
      const upperArm = this.bone(`${side}UpperArm`, shoulder, elbow, 9, 0.65);
      const lowerArm = this.bone(`${side}LowerArm`, elbow, wrist, 8, 0.5);
      const thigh = this.bone(`${side}Thigh`, hip, knee, 12, 1.4);
      const shin = this.bone(`${side}Shin`, knee, ankle, 10, 0.95);
      this.joint(`${side}Shoulder`, this.torso, upperArm, shoulder, upperArm.angle, 1.3);
      this.joint(`${side}Elbow`, upperArm, lowerArm, elbow, lowerArm.angle - upperArm.angle, 0.9);
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
      frictionAir: 0.0015,
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
    const constraint = this.scene.matter.add.constraint(parent, child, 0, 0.97, {
      label: name,
      pointA: { x: anchor.x - parent.position.x, y: anchor.y - parent.position.y },
      pointB: { x: anchor.x - child.position.x, y: anchor.y - child.position.y },
      damping: 0.08,
    });
    this.joints.push(constraint);
    const motor = new JointMotor(parent, child, constraint, rest, strength);
    this.motors.push(motor);
    this.limbMotors.set(name, motor);
  }

  step(direction: number, pose: Pose, grabbed: boolean): void {
    this.pose = pose;
    this.tuckAmount += ((pose === 'tuck' ? 1 : 0) - this.tuckAmount) * 0.06;
    this.archAmount += ((pose === 'arch' ? 1 : 0) - this.archAmount) * 0.06;
    const tuck = this.tuckAmount;
    const arch = this.archAmount;
    for (const [name, motor] of this.limbMotors) {
      let offset = 0;
      if (name.includes('Hip')) offset = -1.9 * tuck + 0.22 * arch;
      if (name.includes('Knee')) offset = 2.45 * tuck - 0.1 * arch;
      if (name.includes('Shoulder')) offset = (grabbed ? 0.12 : 1.8) * tuck - 0.18 * arch;
      if (name.includes('Elbow')) offset = -1.45 * tuck;
      if (name === 'spine') offset = -0.32 * tuck + 0.28 * arch;
      motor.target = motor.restAngle + offset;
      motor.step(pose === 'arch' ? 1.35 : 1);
    }

    // A/D is physical assist: torque in flight, a tangential muscle force on the bar.
    for (const body of this.bodies) {
      body.torque -= direction * body.inertia * PHYSICS.driveAcceleration;
      if (grabbed && direction !== 0) {
        const dx = body.position.x - TRAINING.bar.x;
        const dy = body.position.y - TRAINING.bar.y;
        const distance = Math.max(40, Math.hypot(dx, dy));
        Matter.Body.applyForce(body, body.position, {
          x: direction * dy / distance * body.mass * 0.00105,
          y: -direction * dx / distance * body.mass * 0.00105,
        });
      }
    }
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
    for (const name of ['leftUpperArm', 'leftLowerArm', 'leftThigh', 'leftShin']) drawBone(name, COLORS.farLimb);
    drawBone('torso', COLORS.ink, 16);
    drawBone('pelvis', COLORS.ink, 21);
    for (const name of ['rightUpperArm', 'rightLowerArm', 'rightThigh', 'rightShin']) drawBone(name, COLORS.ink);

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
    const eye = worldPoint(this.head, { x: 6, y: -2 });
    g.fillStyle(COLORS.ink).fillCircle(eye.x, eye.y, 2);
    const chest = worldPoint(this.torso, { x: 0, y: -7 });
    g.fillStyle(COLORS.lime).fillCircle(chest.x, chest.y, 4);
  }

  destroy(): void {
    for (const joint of this.joints) this.scene.matter.world.removeConstraint(joint);
    for (const body of this.bodies) this.scene.matter.world.remove(body);
    this.graphics.destroy();
  }
}
