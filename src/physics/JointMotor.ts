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

  step(stiffness = 1, deltaMs = 1000 / 120): void {
    const error = wrapAngle(this.target - (this.child.angle - this.parent.angle));
    // Matter angularVelocity is normalized to 60 Hz. Convert to radians/ms.
    const speed = (this.child.angularVelocity - this.parent.angularVelocity) / (1000 / 60);
    const inertia = 1 / (this.parent.inverseInertia + this.child.inverseInertia);
    // Implicit PD coefficients keep strong muscles stable at every collision
    // substep; explicit high-gain damping would alternate torques and shake.
    const spring = 0.00032 * stiffness * this.strength;
    const damping = 0.036 * Math.sqrt(stiffness) * this.strength;
    const acceleration = (error * spring - speed * (damping + spring * deltaMs))
      / (1 + damping * deltaMs + spring * deltaMs * deltaMs);
    const torque = clamp(acceleration, -0.0012, 0.0012) * inertia;
    this.child.torque += torque;
    this.parent.torque -= torque;
  }
}
