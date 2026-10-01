import { clamp, wrapAngle, type Body, type Constraint } from './matter';

/** A torque-based PD muscle. Equal/opposite torques conserve internal momentum. */
export class JointMotor {
  public target: number;

  constructor(
    public readonly parent: Body,
    public readonly child: Body,
    public readonly constraint: Constraint,
    public readonly restAngle: number,
    private readonly strength = 1,
  ) {
    this.target = restAngle;
  }

  step(stiffness = 1): void {
    const error = wrapAngle(this.target - (this.child.angle - this.parent.angle));
    // Matter angularVelocity is normalized to 60 Hz. Convert to radians/ms.
    const speed = (this.child.angularVelocity - this.parent.angularVelocity) / (1000 / 60);
    const inertia = 1 / (this.parent.inverseInertia + this.child.inverseInertia);
    const acceleration = error * 0.00022 * stiffness - speed * 0.025;
    const torque = clamp(acceleration, -0.0007, 0.0007) * inertia * this.strength;
    this.child.torque += torque;
    this.parent.torque -= torque;
  }
}
