export const COLORS = {
  background: 0xddeef4,
  ink: 0x193c4b,
  muted: 0x84958c,
  grid: 0xdde3d9,
  lime: 0xd4ef8c,
  teal: 0x618f7d,
  farLimb: 0x739aa7,
  floor: 0xe8ece2,
};

export const PHYSICS = {
  stepMs: 1000 / 120,
  maxFrameMs: 50,
  pixelsPerMeter: 95,
  gravity: 0.95,
  airDrag: 0.0002, // Matter frictionAir per nominal 60 Hz frame
  linearDamping: 0.015, // per second; applied as a force, never a velocity reset
  angularDamping: 0.025, // per second; applied as torque
  poseStrength: 11,
  straightStiffness: 2,
  baseHipAngle: -2.25,
  baseKneeAngle: 0.18,
  baseWaistAngle: -0.42,
  baseShoulderAngle: -0.4,
  baseElbowAngle: -0.55,
  maxThighFold: 2.7,
  tuckHipAngle: -2.55,
  tuckKneeAngle: 2.8,
  tuckWaistAngle: -0.48,
  waistMinAngle: -0.55,
  waistMaxAngle: 0.08,
  twistTorque: 2.2, // axial N*m, separate from Matter's planar torque units
  poseTransitionSpeed: 7,
  releasePoseTransitionSpeed: 4.5,
  autoGrabDistance: 38,
  autoGrabMaxVelocity: 16, // m/s at each hand, including angular velocity
  autoGrabCooldown: 280, // simulation ms
  maxCollisionTravel: 3, // maximum endpoint travel per collision substep (px)
};

// Side-view bars: the drawn capsule and the solid collider have identical bounds.
export const BARS = [
  { x: 860, y: 242, halfWidth: 70 },
  { x: 1400, y: 190, halfWidth: 70 },
];

export const TRAINING = {
  bar: BARS[0],
  barHeight: 12,
  groundY: 527,
  fallLimit: 1550,
  left: -1000,
  right: 4000,
};
