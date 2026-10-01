import Phaser from 'phaser';
import { COLORS, PHYSICS, TRAINING } from '../config/constants';
import { JointMotor } from '../physics/JointMotor';
import { Matter, worldPoint, wrapAngle, rotate, type Body, type Constraint, type Point } from '../physics/matter';

export type Pose = 'base' | 'straight' | 'tuck';
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
  pose: Pose = 'base';
  private readonly bones = new Map<string, Bone>();
  private readonly limbMotors = new Map<string, JointMotor>();
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly group = Matter.Body.nextGroup(true);
  private readonly waistStops: Constraint[] = [];
  private readonly pairedLimbs: Constraint[] = [];
  private tuckAmount = 0;
  private bentAmount = 0;
  private supportedPose = 1;
  private axialMomentum = 0;
  twistAngle = 0;
  twistVelocity = 0; // radians/second

  constructor(private readonly scene: Phaser.Scene) {
    const { x } = TRAINING.bar;
    // Begin below the solid bar, without any collider overlap at zero velocity.
    const y = TRAINING.bar.y + TRAINING.barHeight / 2 + 1;
    this.graphics = scene.add.graphics().setDepth(5);
    this.torso = this.bone('torso', { x, y: y + 88 }, { x, y: y + 132 }, 17, 4.2);
    this.pelvis = this.bone('pelvis', { x, y: y + 132 }, { x, y: y + 153 }, 24, 2.5);
    this.head = scene.matter.add.circle(x, y + 65, 14, this.options('head'));
    Matter.Body.setMass(this.head, 1.2);
    this.bodies.push(this.head);
    this.joint('neck', this.torso, this.head, { x, y: y + 84 }, 0, 0.8);
    this.joint('spine', this.torso, this.pelvis, { x, y: y + 132 }, 0, 1.6);
    // The existing pelvis is the lower torso: keep the chest rigid and limit the
    // single waist hinge with two slack physical stops, rather than more bones.
    for (const side of [-1, 1]) {
      const angle = side < 0 ? PHYSICS.waistMinAngle : PHYSICS.waistMaxAngle;
      const end = rotate({ x: 0, y: 18 }, angle);
      const maxLength = Math.hypot(end.x - side * 18, end.y + 16);
      const stop = scene.matter.add.constraint(this.torso, this.pelvis, maxLength, 1, {
          label: 'waist-stop',
          pointA: { x: side * 18, y: y + 132 - this.torso.position.y - 16 },
          pointB: { x: 0, y: y + 132 - this.pelvis.position.y + 18 },
          damping: 0,
        });
      // A maximum-distance brace: inside its limit the solver sees its current
      // length (zero force); beyond it, the rigid brace blocks further bending.
      // Evaluate on every solver iteration, including immediately after impacts.
      Object.defineProperty(stop, 'length', { get: () => Math.min(maxLength, Math.hypot(
        this.pelvis.position.x + stop.pointB.x - this.torso.position.x - stop.pointA.x,
        this.pelvis.position.y + stop.pointB.y - this.torso.position.y - stop.pointA.y,
      )) });
      this.waistStops.push(stop);
    }

    for (const side of ['left', 'right'] as const) {
      // Identical side-view anchors: two physical limbs share one silhouette.
      const offset = 0;
      const shoulder = { x: x + offset, y: y + 91 };
      const elbow = { x: x + offset + 6, y: y + 47 };
      const wrist = { x: x + offset + 4, y: y + 2 };
      const hip = { x: x + offset, y: y + 152 };
      const knee = { x: x + offset, y: y + 198 };
      const ankle = { x: x + offset, y: y + 244 };
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
    // Link corresponding elbows, wrists, knees and ankles. Together with the
    // shoulder/hip joints this keeps each pair moving as one rigid limb.
    for (const part of ['UpperArm', 'LowerArm', 'Thigh', 'Shin']) {
      const left = this.bones.get(`left${part}`)!;
      const right = this.bones.get(`right${part}`)!;
      const a = worldPoint(left.body, { x: 0, y: left.length / 2 });
      const b = worldPoint(right.body, { x: 0, y: right.length / 2 });
      this.pairedLimbs.push(scene.matter.add.constraint(left.body, right.body, 0, 1, {
        label: `paired:${part}`,
        pointA: { x: a.x - left.body.position.x, y: a.y - left.body.position.y },
        pointB: { x: b.x - right.body.position.x, y: b.y - right.body.position.y },
        damping: 0,
      }));
    }
  }

  private options(label: string): Phaser.Types.Physics.Matter.MatterBodyConfig {
    return {
      label: `nuro:${label}`,
      collisionFilter: { group: this.group },
      friction: 0.7,
      frictionStatic: 1,
      frictionAir: PHYSICS.airDrag,
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
      damping: 0,
    });
    this.joints.push(constraint);
    const motor = new JointMotor(parent, child, constraint, rest, strength);
    this.motors.push(motor);
    this.limbMotors.set(name, motor);
  }

  step(pose: Pose, gripAnchor: Point | null, twisting = false, grounded = false, deltaMs = PHYSICS.stepMs): void {
    const grabbed = gripAnchor !== null;
    this.pose = pose;
    const dt = deltaMs / 1000;
    const blend = 1 - Math.exp(-PHYSICS.poseTransitionSpeed * dt);
    this.tuckAmount += ((pose === 'tuck' ? 1 : 0) - this.tuckAmount) * blend;
    this.bentAmount += ((pose === 'straight' ? 0 : 1) - this.bentAmount) * blend;
    // Detaching changes support immediately, but muscles transition smoothly.
    // In particular, releasing during L must not snap the shoulder target.
    this.supportedPose += ((grabbed ? 1 : 0) - this.supportedPose)
      * (1 - Math.exp(-PHYSICS.releasePoseTransitionSpeed * dt));
    const tuck = this.tuckAmount;
    const bent = this.bentAmount;
    const waistAngle = wrapAngle(this.pelvis.angle - this.torso.angle);
    const shoulderFold = PHYSICS.baseShoulderAngle * bent
      + ((1.9 - 1.65 * this.supportedPose) - PHYSICS.baseShoulderAngle) * tuck;
    const elbowFold = PHYSICS.baseElbowAngle * bent
      + ((-1.5 + 0.25 * this.supportedPose) - PHYSICS.baseElbowAngle) * tuck;
    for (const [name, motor] of this.limbMotors) {
      let offset = 0;
      let strength = 1;
      if (name.includes('Hip')) {
        offset = PHYSICS.baseHipAngle * bent + (PHYSICS.tuckHipAngle - PHYSICS.baseHipAngle) * tuck;
        // Limit the TOTAL thigh fold relative to the chest. Adding waist and
        // hip flexion independently previously pushed the legs behind the body.
        offset = Math.max(offset, -PHYSICS.maxThighFold - waistAngle);
        strength += PHYSICS.poseStrength;
      }
      if (name.includes('Knee')) {
        offset = PHYSICS.baseKneeAngle * bent + (PHYSICS.tuckKneeAngle - PHYSICS.baseKneeAngle) * tuck;
        strength += PHYSICS.poseStrength;
      }
      // Coordinate shoulders/elbows with the waist: the chest tilts and rises,
      // carrying the pelvis upward instead of only rotating the thighs in place.
      if (name.includes('Shoulder')) offset = shoulderFold;
      if (name.includes('Elbow')) offset = elbowFold;
      if (name === 'spine') {
        offset = PHYSICS.baseWaistAngle * bent + (PHYSICS.tuckWaistAngle - PHYSICS.baseWaistAngle) * tuck;
        strength = 24;
      }
      if (name === 'neck' || name.includes('Shoulder') || name.includes('Elbow')) strength = 6;
      motor.target = motor.restAngle + offset;
      const straightRigidity = 1 + (PHYSICS.straightStiffness - 1) * (1 - bent);
      motor.step(strength * straightRigidity, deltaMs);
    }

    // All driving torques come from equal/opposite joint muscles. Pose changes
    // pump the pendulum through its support; there is no external swing force.
    for (const body of this.bodies) {
      // Gentle aerodynamic resistance. Matter velocity is normalized to 60 Hz;
      // convert to px/ms and rad/ms for its force/torque integration.
      Matter.Body.applyForce(body, body.position, {
        x: -body.mass * body.velocity.x / (1000 / 60) * PHYSICS.linearDamping / 1000,
        y: -body.mass * body.velocity.y / (1000 / 60) * PHYSICS.linearDamping / 1000,
      });
      body.torque -= body.inertia * body.angularVelocity / (1000 / 60) * PHYSICS.angularDamping / 1000;
    }
    this.stepTwist(twisting, grabbed, grounded, dt);
  }

  /**
   * Planar twist analogue: an inertial degree of freedom on the 2D ragdoll.
   * L = I*w persists without K. Mass/pose determine inertia, grips and ground exert
   * resistance. A small equal/opposite torque couple loads the real spine joints.
   * This is not a timer animation or a second planar somersault counter.
   */
  private stepTwist(pressed: boolean, grabbed: boolean, grounded: boolean, dt: number): void {
    const torque = pressed && !grounded ? PHYSICS.twistTorque : 0;
    this.axialMomentum += torque * dt;
    this.axialMomentum *= Math.exp(-(grounded ? 12 : grabbed ? 9 : PHYSICS.angularDamping) * dt);
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
    // Fixed side profile, including during K. Twist is shown by the suit seam,
    // never by yawing the face or separating the hands out of the play plane.
    const leftColor = COLORS.ink;
    const rightColor = COLORS.ink;
    for (const name of ['leftUpperArm', 'leftLowerArm', 'leftThigh', 'leftShin']) drawBone(name, leftColor);
    drawBone('torso', COLORS.ink, 16);
    drawBone('pelvis', COLORS.ink, 19);
    for (const name of ['rightUpperArm', 'rightLowerArm', 'rightThigh', 'rightShin']) drawBone(name, rightColor);

    for (const side of ['left', 'right']) {
      const knee = worldPoint(this.bones.get(`${side}Thigh`)!.body, { x: 0, y: 22 });
      g.fillStyle(COLORS.lime).fillCircle(knee.x, knee.y, 3);
      const ankle = worldPoint(this.bones.get(`${side}Shin`)!.body, { x: 0, y: 21 });
      const toe = worldPoint(this.bones.get(`${side}Shin`)!.body, { x: 8, y: 21 });
      g.lineStyle(8, COLORS.ink).lineBetween(ankle.x, ankle.y, toe.x, toe.y);
      g.fillStyle(COLORS.ink).fillCircle(toe.x, toe.y, 4);
    }
    const p = this.head.position;
    g.fillStyle(0xf5f5e9).fillCircle(p.x, p.y, 14);
    g.lineStyle(4, COLORS.ink).strokeCircle(p.x, p.y, 14);
    const nose = worldPoint(this.head, { x: 14, y: 1 });
    g.fillStyle(COLORS.ink).fillCircle(nose.x, nose.y, 3);
    const eye = worldPoint(this.head, { x: 6, y: -3 });
    g.fillStyle(COLORS.ink).fillCircle(eye.x, eye.y, 2);
    const chest = worldPoint(this.torso, { x: 7 * Math.sin(this.twistAngle), y: -7 });
    g.fillStyle(COLORS.lime, 0.7 + 0.3 * Math.cos(this.twistAngle)).fillCircle(chest.x, chest.y, 3);
  }

  destroy(): void {
    for (const pair of this.pairedLimbs) this.scene.matter.world.removeConstraint(pair);
    for (const stop of this.waistStops) this.scene.matter.world.removeConstraint(stop);
    for (const joint of this.joints) this.scene.matter.world.removeConstraint(joint);
    for (const body of this.bodies) this.scene.matter.world.remove(body);
    this.graphics.destroy();
  }
}
