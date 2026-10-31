/**
 * Component geometry, pin coordinates, and wire projection utilities.
 * Supports rotation (90°, 180°, 270°), flip horizontal, flip vertical,
 * and wire-to-wire branch snapping & splitting.
 */

import { CircuitComponent, PinState, Wire } from '../types';

export function getComponentWidth(comp: CircuitComponent): number {
  if (comp.type === 'mcu8051') return 180;
  if (comp.type === 'resistor') return 70;
  if (comp.type === 'led') return 50;
  if (comp.type === 'ammeter' || comp.type === 'voltmeter') return 60;
  if (comp.type === 'button' || comp.type === 'switch') return 60;
  if (comp.type === 'npn') return 45;
  if (comp.type === 'sevseg_ca' || comp.type === 'sevseg_cc') return 100;
  if (comp.type === 'buzzer') return 60;
  return 40;
}

export function getComponentHeight(comp: CircuitComponent): number {
  if (comp.type === 'mcu8051') return 410;
  if (comp.type === 'resistor') return 20;
  if (comp.type === 'led') return 30;
  if (comp.type === 'ammeter' || comp.type === 'voltmeter') return 40;
  if (comp.type === 'npn') return 50;
  if (comp.type === 'sevseg_ca' || comp.type === 'sevseg_cc') return 130;
  if (comp.type === 'buzzer') return 50;
  return 30;
}

/**
 * Calculates world coordinates of a component pin taking into account
 * component (x, y), center-origin rotation (0, 90, 180, 270), and flips (flipH, flipV).
 */
export function getPinWorldPos(comp: CircuitComponent, pin: PinState): { x: number; y: number } {
  const w = getComponentWidth(comp);
  const h = getComponentHeight(comp);
  const cx = w / 2;
  const cy = h / 2;

  // Offset from component center
  let dx = pin.relX - cx;
  let dy = pin.relY - cy;

  // 1. Flip Horizontal & Vertical (applied in local space)
  if (comp.flipH) {
    dx = -dx;
  }
  if (comp.flipV) {
    dy = -dy;
  }

  // 2. Rotation (degrees clockwise)
  const rot = (((comp.rotation || 0) % 360) + 360) % 360;
  if (rot === 90) {
    const tmp = dx;
    dx = -dy;
    dy = tmp;
  } else if (rot === 180) {
    dx = -dx;
    dy = -dy;
  } else if (rot === 270) {
    const tmp = dx;
    dx = dy;
    dy = -tmp;
  }

  return {
    x: Math.round(comp.x + cx + dx),
    y: Math.round(comp.y + cy + dy),
  };
}

/**
 * Projects point P onto line segment AB, returning the closest point and distance.
 */
export function getClosestPointOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): { x: number; y: number; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    return { x: a.x, y: a.y, dist: d };
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const dist = Math.hypot(p.x - projX, p.y - projY);

  return { x: projX, y: projY, dist };
}

/**
 * Finds the closest point on any segment of a wire to worldPos.
 * Snaps to 10px grid.
 */
export function getClosestPointOnWire(
  wire: Wire,
  worldPos: { x: number; y: number }
): { point: { x: number; y: number }; segmentIndex: number; dist: number } | null {
  if (!wire.points || wire.points.length < 2) return null;

  let bestDist = Infinity;
  let bestPoint = { x: 0, y: 0 };
  let bestSegIndex = 0;

  for (let i = 0; i < wire.points.length - 1; i++) {
    const a = wire.points[i];
    const b = wire.points[i + 1];
    const res = getClosestPointOnSegment(worldPos, a, b);
    if (res.dist < bestDist) {
      bestDist = res.dist;
      bestPoint = {
        x: Math.round(res.x / 10) * 10,
        y: Math.round(res.y / 10) * 10,
      };
      bestSegIndex = i;
    }
  }

  return { point: bestPoint, segmentIndex: bestSegIndex, dist: bestDist };
}

/**
 * Inserts a junction point into a wire's points array if not already present.
 */
export function insertPointIntoWire(wire: Wire, pt: { x: number; y: number }): Wire {
  const points = [...wire.points];
  const snapX = Math.round(pt.x / 10) * 10;
  const snapY = Math.round(pt.y / 10) * 10;

  // Check if point matches any existing vertex
  for (let i = 0; i < points.length; i++) {
    if (Math.round(points[i].x) === snapX && Math.round(points[i].y) === snapY) {
      return wire; // Already exists
    }
  }

  // Find which segment this point lies on
  let bestSeg = 0;
  let bestDist = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const res = getClosestPointOnSegment({ x: snapX, y: snapY }, points[i], points[i + 1]);
    if (res.dist < bestDist) {
      bestDist = res.dist;
      bestSeg = i;
    }
  }

  // Insert point between bestSeg and bestSeg + 1
  points.splice(bestSeg + 1, 0, { x: snapX, y: snapY });

  return {
    ...wire,
    points,
  };
}
