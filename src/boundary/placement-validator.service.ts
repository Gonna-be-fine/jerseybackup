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
        // Use the exact segment endpoint on the final sample. Arc-length
        // interpolation can otherwise leave tiny endpoint drift, splitting
        // one closed contour into several open contours.
        const point =
          i === steps
            ? part.end
            : part.getPointAtLength((part.length * i) / steps);
        pushPoint(point);
      }
    }

    finishContour();
    return contours;
  }

  private rectangleFitsContour(
    corners: PlacementPoint[],
    contour: PlacementPoint[],
  ): boolean {
    const rectangle = [...corners, corners[0]];

    // Sample every rectangle edge. This catches an edge that exits and re-enters
    // a concave contour even when both rectangle endpoints happen to be inside.
    for (let edgeIndex = 0; edgeIndex < corners.length; edgeIndex += 1) {
      const start = corners[edgeIndex];
      const end = corners[(edgeIndex + 1) % corners.length];
      const edgeLength = Math.hypot(end.x - start.x, end.y - start.y);
      const steps = Math.max(1, Math.ceil(edgeLength / this.curveTolerance));

      for (let step = 0; step <= steps; step += 1) {
        const ratio = step / steps;
        const point = {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
        };
        if (!this.pointInPolygon(point, contour)) return false;
      }
    }

    // Reject a concave notch/void fully enclosed by the image rectangle.
    // Boundary contact is rejected as well, preserving the conservative policy.
    if (contour.some((point) => this.pointInPolygon(point, rectangle))) {
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
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    // Closed SVG contours and rectangles repeat their first point at the end.
    // A zero-length closing edge must only match that exact point; otherwise
    // the cross/dot test would incorrectly classify every point as on-segment.
    if (lengthSquared <= this.epsilon * this.epsilon) {
      return Math.hypot(p.x - a.x, p.y - a.y) <= this.epsilon;
    }

    const cross = (p.y - a.y) * dx - (p.x - a.x) * dy;
    if (Math.abs(cross) > this.epsilon) return false;
    const dot = (p.x - a.x) * dx + (p.y - a.y) * dy;
    if (dot < -this.epsilon) return false;
    return dot <= lengthSquared + this.epsilon;
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
