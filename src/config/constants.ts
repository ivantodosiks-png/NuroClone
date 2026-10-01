export const COLORS = {
  background: 0xc9e5ef,
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
  swingForce: 0.00085,
  rotationTorque: 0.10,
  legRaiseStrength: 7,
  legRaiseTargetAngle: -2.6,
  tuckStrength: 3.2,
  twistTorque: 0.9, // axial N*m, separate from Matter's planar torque units
  poseTransitionSpeed: 7,
  autoGrabDistance: 38,
  autoGrabMaxVelocity: 16, // m/s at each hand, including angular velocity
  autoGrabCooldown: 280, // simulation ms
};

// Physics coordinates all belong to the same x/y plane. Depth is rendering only.
export const BARS = [
  { x: 860, y: 242, halfWidth: 14 },
  { x: 1130, y: 280, halfWidth: 14 },
  { x: 1430, y: 235, halfWidth: 14 },
  { x: 1760, y: 285, halfWidth: 14 },
  { x: 2070, y: 205, halfWidth: 14 },
];

export const TRAINING = {
  bar: BARS[0],
  platformDrop: 440,
  fallLimit: 1550,
  left: -1000,
  right: 4000,
};
