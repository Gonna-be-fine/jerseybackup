import { BadRequestException, Injectable } from '@nestjs/common';
import { svgPathProperties } from 'svg-path-properties';
import { ColorRegion, SvgMatrix } from './boundary.types';

export interface PlacementRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacementValidationResult {
  valid: boolean;
  regionId: string;
  placement: PlacementRectangle;
  reason: string | null;
  tolerance: number;
}

/**
 * Converts SVG path segments into sampled contours and checks whether an
 * axis-aligned image rectangle fits completely inside one filled contour.
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

    const bounds = region.geometryBounds;
    if (!bounds || !this.rectangleInsideBounds(placement, bounds)) {
      return this.result(false, region.id, placement, 'outside-region-bounds');
    }

    let contours: Array<Array<{ x: number; y: number }>>;
    try {
      contours = this.buildContours(region.geometry, region.matrix);
    } catch {
      throw new BadRequestException(
        `Unable to build contours for SVG region "${region.id}".`,
      );
    }

    const corners = this.rectangleCorners(placement);
    const fits = contours.some((contour) => this.rectangleFitsContour(corners, placement, contour));

    return this.result(
      fits,
      region.id,
      placement,
      fits ? null : 'rectangle-crosses-or-exceeds-path-outline',
    );
  }

  private buildContours(
    path: string,
    matrix: SvgMatrix,
  ): Array<Array<{ x: number; y: number }>> {
    const properties = new svgPathProperties(path);
    const contours: Array<Array<{ x: number; y: number }>> = [];
    let current: Array<{ x: number; y: number }> = [];

    const transform = (point: { x: number; y: number }) => ({
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    });

    const pushPoint = (point: { x: number; y: number }) => {
      const transformed = transform(point);
      const previous = current[current.length - 1];
      if (
        !previous ||
        Math.hypot(previous.x - transformed.x, previous.y - transformed.y) > this.epsilon
      ) {
        current.push(transformed);
      }
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
      // A discontinuity between segment endpoints indicates a new M subpath.
      if (
        current.length &&
        Math.hypot(
          current[current.length - 1].x - transform(part.start).x,
          current[current.length - 1].y - transform(part.start).y,
        ) > this.epsilon
      ) {
        finishContour();
      }

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
    corners: Array<{ x: number; y: number }>,
    rectangle: PlacementRectangle,
    contour: Array<{ x: number; y: number }>,
  ): boolean {
    if (!corners.every((point) => this.pointInPolygon(point, contour))) {
      return false;
    }

    // Reject when any image edge crosses the actual path boundary.
    const contourEdges = this.edges(contour);
    const rectangleEdges = this.edges([...corners, corners[0]]);
    for (const [a, b] of rectangleEdges) {
      for (const [c, d] of contourEdges) {
        if (this.segmentsIntersect(a, b, c, d)) return false;
      }
    }

    // A concave notch/void can be entirely enclosed by the image rectangle
    // without any rectangle corner leaving the polygon.
    if (contour.some((point) => this.pointInRectangle(point, rectangle))) {
      return false;
    }

    return true;
  }

  private pointInPolygon(
    point: { x: number; y: number },
    polygon: Array<{ x: number; y: number }>,
  ): boolean {
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

  private pointOnSegment(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): boolean {
    const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
    if (Math.abs(cross) > this.epsilon) return false;
    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    if (dot < -this.epsilon) return false;
    const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    return dot <= lengthSquared + this.epsilon;
  }

  private segmentsIntersect(
    a: { x: number; y: number }, b: { x: number; y: number },
    c: { x: number; y: number }, d: { x: number; y: number },
  ): boolean {
    const orient = (p: typeof a, q: typeof a, r: typeof a) =>
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

  private edges(points: Array<{ x: number; y: number }>) {
    const edges: Array<[typeof points[number], typeof points[number]]> = [];
    for (let i = 0; i < points.length - 1; i++) edges.push([points[i], points[i + 1]]);
    return edges;
  }

  private rectangleCorners(rectangle: PlacementRectangle) {
    const { x, y, width, height } = rectangle;
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }

  private rectangleInsideBounds(
    rectangle: PlacementRectangle,
    bounds: { x: number; y: number; width: number; height: number },
  ): boolean {
    return (
      rectangle.x >= bounds.x - this.epsilon &&
      rectangle.y >= bounds.y - this.epsilon &&
      rectangle.x + rectangle.width <= bounds.x + bounds.width + this.epsilon &&
      rectangle.y + rectangle.height <= bounds.y + bounds.height + this.epsilon
    );
  }

  private pointInRectangle(point: { x: number; y: number }, rectangle: PlacementRectangle) {
    return (
      point.x > rectangle.x + this.epsilon &&
      point.x < rectangle.x + rectangle.width - this.epsilon &&
      point.y > rectangle.y + this.epsilon &&
      point.y < rectangle.y + rectangle.height - this.epsilon
    );
  }

  private assertPlacement(rectangle: PlacementRectangle): void {
    const values = [rectangle.x, rectangle.y, rectangle.width, rectangle.height];
    if (
      values.some((value) => !Number.isFinite(value)) ||
      rectangle.width <= 0 ||
      rectangle.height <= 0
    ) {
      throw new BadRequestException(
        'Placement x/y must be finite and width/height must be positive.',
      );
    }
  }

  private result(
    valid: boolean,
    regionId: string,
    placement: PlacementRectangle,
    reason: string | null,
  ): PlacementValidationResult {
    return {
      valid,
      regionId,
      placement,
      reason,
      tolerance: this.curveTolerance,
    };
  }
}
