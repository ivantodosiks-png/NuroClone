export const COLORS = {
  background: 0xf5f5ef,
  ink: 0x173e35,
  muted: 0x84958c,
  grid: 0xdde3d9,
  lime: 0xd4ef8c,
  teal: 0x618f7d,
  farLimb: 0x829b8c,
  floor: 0xe8ece2,
};

export const PHYSICS = {
  stepMs: 1000 / 120,
  maxFrameMs: 50,
  pixelsPerMeter: 95,
  gravity: 1.35,
  swingForce: 0.00065,
  rotationTorque: 0.10,
  legRaiseStrength: 7,
  legRaiseTargetAngle: -2.6,
  tuckStrength: 3.2,
  twistTorque: 0.9, // axial N*m, separate from Matter's planar torque units
  poseTransitionSpeed: 7,
  autoGrabDistance: 25,
  autoGrabMaxVelocity: 9, // m/s at the hand, including angular velocity
  autoGrabCooldown: 450, // simulation ms
  landing: {
    maxSpeed: 8.5, // m/s, measured BEFORE the contact solver removes velocity
    maxAngularVelocity: 5, // rad/s
    maxTwistVelocity: 9, // rad/s
    maxTilt: 0.6, // radians from upright
    footContactDistance: 15, // contact must be at the ankle end of a shin
    settleMs: 220,
  },
};

export const TRAINING = {
  bar: { x: 860, y: 242, halfWidth: 38 },
  floorY: 700,
  left: -2000,
  right: 3800,
};
