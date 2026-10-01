export const COLORS = {
  background: 0xf3f5ef,
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
  poseStrength: 7,
  baseHipAngle: -2.6,
  baseKneeAngle: 0.3,
  baseWaistAngle: -0.3,
  tuckHipAngle: -2.75,
  tuckKneeAngle: 2.7,
  tuckWaistAngle: -0.38,
  waistMinAngle: -0.46,
  waistMaxAngle: 0.08,
  twistTorque: 0.9, // axial N*m, separate from Matter's planar torque units
  poseTransitionSpeed: 7,
  autoGrabDistance: 38,
  autoGrabMaxVelocity: 16, // m/s at each hand, including angular velocity
  autoGrabCooldown: 280, // simulation ms
  maxCollisionTravel: 3, // maximum endpoint travel per collision substep (px)
};

// Side-view bars: the drawn capsule and the solid collider have identical bounds.
export const BARS = [
  { x: 860, y: 242, halfWidth: 14 },
  { x: 1130, y: 280, halfWidth: 14 },
  { x: 1430, y: 235, halfWidth: 14 },
  { x: 1760, y: 285, halfWidth: 14 },
  { x: 2070, y: 205, halfWidth: 14 },
];

export const TRAINING = {
  bar: BARS[0],
  barHeight: 18,
  platformDrop: 440,
  fallLimit: 1550,
  left: -1000,
  right: 4000,
};
