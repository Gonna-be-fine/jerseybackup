export interface SvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SvgMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type BoundarySide = 'front' | 'back' | 'unknown';

export interface ColorRegion {
  id: string;
  name: string;
  ename: string;
  side: BoundarySide;
  fill: string | null;
  /** Original SVG path data. Kept intact for downstream clipping and collision work. */
  geometry: string;
  /** Exact path bounds before transforms, then conservative AABB after SVG transforms. */
  geometryBounds: { x: number; y: number; width: number; height: number } | null;
  /** Transform from this path's local coordinates to the root SVG coordinate system. */
  matrix: SvgMatrix;

}

export interface ImageSlot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Axis-aligned bounds after applying the image and ancestor transforms. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Full SVG transform matrix from image-local coordinates to root SVG coordinates. */
  matrix: SvgMatrix;
  sourceTransform: string | null;
}

export interface TextPath {
  groupId: string;
  purpose: string;
  pathId: string | null;
  path: string;
}

export interface BoundaryContext {
  productType: string;
  sourceFile: string;
  viewBox: SvgViewBox;
  colorRegions: ColorRegion[];
  imageSlots: ImageSlot[];
  textPaths: TextPath[];
}
