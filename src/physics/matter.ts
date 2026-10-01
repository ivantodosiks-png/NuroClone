import Phaser from 'phaser';

// Use Phaser's bundled Matter instance; never mix two separate Matter engines.
// Phaser 3.90 exposes this runtime module but omits its value from its .d.ts.
export const Matter = (Phaser.Physics.Matter as unknown as { Matter: { Body: typeof MatterJS.Body } }).Matter;
export type Body = MatterJS.BodyType;
export type Constraint = MatterJS.ConstraintType;
export type Point = { x: number; y: number };

export function rotate(point: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
}

export function worldPoint(body: Body, local: Point): Point {
  const offset = rotate(local, body.angle);
  return { x: body.position.x + offset.x, y: body.position.y + offset.y };
}

export function localPoint(body: Body, world: Point): Point {
  return rotate({ x: world.x - body.position.x, y: world.y - body.position.y }, -body.angle);
}

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
