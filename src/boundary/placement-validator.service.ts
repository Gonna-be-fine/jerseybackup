import { BadRequestException, Injectable } from '@nestjs/common';
import { svgPathProperties } from 'svg-path-properties';
import { ColorRegion, SvgMatrix } from './boundary.types';

export interface PlacementRectangle {
  /** Unrotated rectangle top-left in root SVG coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Clockwise rotation in degrees around the rectangle center. */
  rotation?: number;
}

export interface PlacementPoint {
  x: number;
  y: number;
}

export interface PlacementValidationResult {
  valid: boolean;
  regionId: string;
  placement: PlacementRectangle;
  /** Four rotated corners in root SVG coordinates, clockwise from top-left. */
  corners: PlacementPoint[];
  reason: string | null;
  tolerance: number;
}

/**
 * Checks whether an axis-aligned or rotated image rectangle fits completely
 * inside one sampled filled SVG contour.
 *
 * This is a geometric preflight check, not a print-production guarantee:
 * holes/fill-rule semantics and fabric seam allowances need template metadata.
 */
@Injectable()
export class PlacementValidator {
  private readonly curveTolerance = 6;
  private readonly epsilon = 1e-5;

  validate(region: ColorRegion, placement: PlacementRectangle): PlacementValidationResult {
    this.assertPlacement(placement);
    const corners = this.rectangleCorners(placement);
    const bounds = region.geometryBounds;

    if (!bounds || !this.polygonInsideBounds(corners, bounds)) {
      return this.result(false, region.id, placement, corners, 'outside-region-bounds');
    }

    let contours: Array<Array<PlacementPoint>>;
    try {
      contours = this.buildContours(region.geometry, region.matrix);
    } catch {
      throw new BadRequestException(
        `Unable to build contours for SVG region "${region.id}".`,
      );
    }

    const fits = contours.some((contour) => this.rectangleFitsContour(corners, contour));
    return this.result(
      fits,
      region.id,
      placement,
      corners,
      fits ? null : 'rectangle-crosses-or-exceeds-path-outline',
    );
  }

  private buildContours(path: string, matrix: SvgMatrix): Array<Array<PlacementPoint>> {
    const properties = new svgPathProperties(path);
    const contours: Array<Array<PlacementPoint>> = [];
    let current: PlacementPoint[] = [];

    const transform = (point: PlacementPoint): PlacementPoint => ({
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    });

    const pushPoint = (point: PlacementPoint) => {
      const transformed = transform(point);
      const previous = current[current.length - 1];
      if (
        !previous ||
        Math.hypot(previous.x - transformed.x, previous.y - transformed.y) > this.epsilon
      ) current.push(transformed);
    };

    const finishContour = () => {
      if (current.length >= 3) {
        const first = current[0];
        const last = current[current.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) > this.epsilon) {
          current.push({ ...first });
        }
        contours.push(current);
      }
      current = [];
    };

    for (const part of properties.getParts()) {
      if (
        current.length &&
        Math.hypot(
          current[current.length - 1].x - transform(part.start).x,
          current[current.length - 1].y - transform(part.start).y,
        ) > this.epsilon
      ) finishContour();

      if (!current.length) pushPoint(part.start);
      const steps = Math.max(1, Math.ceil(part.length / this.curveTolerance));
      for (let i = 1; i <= steps; i++) {
        pushPoint(part.getPointAtLength((part.length * i) / steps));
      }
    }

    finishContour();
    return contours;
  }

  private rectangleFitsContour(
    corners: PlacementPoint[],
    contour: PlacementPoint[],
  ): boolean {
    if (!corners.every((point) => this.pointInPolygon(point, contour))) return false;

    const contourEdges = this.edges(contour);
    const rectangleEdges = this.edges([...corners, corners[0]]);
    for (const [a, b] of rectangleEdges) {
      for (const [c, d] of contourEdges) {
        if (this.segmentsIntersect(a, b, c, d)) return false;
      }
    }

    // Reject a concave notch/void fully enclosed by the rotated image polygon.
    if (contour.some((point) => this.pointInPolygon(point, [...corners, corners[0]]))) {
      return false;
    }
    return true;
  }

  private pointInPolygon(point: PlacementPoint, polygon: PlacementPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (this.pointOnSegment(point, a, b)) return true;
      const intersects =
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private pointOnSegment(p: PlacementPoint, a: PlacementPoint, b: PlacementPoint): boolean {
    const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
    if (Math.abs(cross) > this.epsilon) return false;
    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    if (dot < -this.epsilon) return false;
    const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    return dot <= lengthSquared + this.epsilon;
  }

  private segmentsIntersect(
    a: PlacementPoint, b: PlacementPoint, c: PlacementPoint, d: PlacementPoint,
  ): boolean {
    const orient = (p: PlacementPoint, q: PlacementPoint, r: PlacementPoint) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if (
      ((o1 > this.epsilon && o2 < -this.epsilon) || (o1 < -this.epsilon && o2 > this.epsilon)) &&
      ((o3 > this.epsilon && o4 < -this.epsilon) || (o3 < -this.epsilon && o4 > this.epsilon))
    ) return true;
    return (
      (Math.abs(o1) <= this.epsilon && this.pointOnSegment(c, a, b)) ||
      (Math.abs(o2) <= this.epsilon && this.pointOnSegment(d, a, b)) ||
      (Math.abs(o3) <= this.epsilon && this.pointOnSegment(a, c, d)) ||
      (Math.abs(o4) <= this.epsilon && this.pointOnSegment(b, c, d))
    );
  }

  private edges(points: PlacementPoint[]): Array<[PlacementPoint, PlacementPoint]> {
    const edges: Array<[PlacementPoint, PlacementPoint]> = [];
    for (let i = 0; i < points.length - 1; i++) edges.push([points[i], points[i + 1]]);
    return edges;
  }

  private rectangleCorners(rectangle: PlacementRectangle): PlacementPoint[] {
    const { x, y, width, height } = rectangle;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radians = ((rectangle.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ].map((point) => ({
      x: cx + (point.x - cx) * cos - (point.y - cy) * sin,
      y: cy + (point.x - cx) * sin + (point.y - cy) * cos,
    }));
  }

  private polygonInsideBounds(
    points: PlacementPoint[],
    bounds: { x: number; y: number; width: number; height: number },
  ): boolean {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return (
      Math.min(...xs) >= bounds.x - this.epsilon &&
      Math.min(...ys) >= bounds.y - this.epsilon &&
      Math.max(...xs) <= bounds.x + bounds.width + this.epsilon &&
      Math.max(...ys) <= bounds.y + bounds.height + this.epsilon
    );
  }

  private assertPlacement(rectangle: PlacementRectangle): void {
    const values = [
      rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.rotation ?? 0,
    ];
    if (
      values.some((value) => !Number.isFinite(value)) ||
      rectangle.width <= 0 ||
      rectangle.height <= 0
    ) {
      throw new BadRequestException(
        'Placement x/y/rotation must be finite and width/height must be positive.',
      );
    }
  }

  private result(
    valid: boolean,
    regionId: string,
    placement: PlacementRectangle,
    corners: PlacementPoint[],
    reason: string | null,
  ): PlacementValidationResult {
    return {
      valid,
      regionId,
      placement: { ...placement, rotation: placement.rotation ?? 0 },
      corners,
      reason,
      tolerance: this.curveTolerance,
    };
  }
}
