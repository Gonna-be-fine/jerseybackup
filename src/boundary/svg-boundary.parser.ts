import { Injectable, BadRequestException } from '@nestjs/common';
import { svgPathBbox } from 'svg-path-bbox';
import {
  BoundaryContext,
  ColorRegion,
  ImageSlot,
  SvgMatrix,
  SvgViewBox,
  TextPath,
} from './boundary.types';
import {
  COLOR_REGION_METADATA,
  TEXT_GROUP_PURPOSE,
} from './boundary.constants';

interface SvgNode {
  tag: string;
  attributes: Record<string, string>;
  children: SvgNode[];
}

const IDENTITY_MATRIX: SvgMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

@Injectable()
export class SvgBoundaryParser {
  parse(svg: string, productType: string, sourceFile: string): BoundaryContext {
    const root = this.parseXml(svg);
    if (root.tag !== 'svg') {
      throw new BadRequestException('The boundary template root must be <svg>.');
    }

    const viewBox = this.parseViewBox(root.attributes.viewBox);
    const colorRegions = this.extractColorRegions(root);
    const imageSlots = this.extractImageSlots(root);
    const textPaths = this.extractTextPaths(root);

    return {
      productType,
      sourceFile,
      viewBox,
      colorRegions,
      imageSlots,
      textPaths,
    };
  }

  /**
   * A small XML element-tree reader dedicated to SVG metadata extraction.
   * It handles quoted attributes, comments, declarations and self-closing tags.
   * It deliberately does not attempt to render SVG or interpret path geometry.
   */
  private parseXml(xml: string): SvgNode {
    const documentRoot: SvgNode = {
      tag: '#document',
      attributes: {},
      children: [],
    };
    const stack: SvgNode[] = [documentRoot];
    const tokenPattern =
      /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/?[\w:.-]+(?:\s[^<>]*?)?\s*\/?>/g;

    const tokens = xml.match(tokenPattern) || [];
    if (!tokens.length) {
      throw new BadRequestException('The SVG file is empty or malformed.');
    }

    for (const token of tokens) {
      if (
        token.startsWith('<!--') ||
        token.startsWith('<?') ||
        token.startsWith('<!') && !token.startsWith('<![CDATA[')
      ) {
        continue;
      }

      if (token.startsWith('</')) {
        if (stack.length <= 1) {
          throw new BadRequestException('Malformed SVG closing tag.');
        }
        stack.pop();
        continue;
      }

      const tagMatch = token.match(/^<\s*([^\s/>]+)/);
      if (!tagMatch) continue;

      const tag = tagMatch[1];
      const attributes: Record<string, string> = {};
      const attributeSource = token
        .slice(tagMatch[0].length)
        .replace(/\/?>\s*$/, '');
      const attributePattern =
        /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let attributeMatch: RegExpExecArray | null;

      while ((attributeMatch = attributePattern.exec(attributeSource))) {
        attributes[attributeMatch[1]] =
          attributeMatch[2] ?? attributeMatch[3] ?? '';
      }

      const node: SvgNode = { tag, attributes, children: [] };
      stack[stack.length - 1].children.push(node);

      if (!/\/\s*>$/.test(token)) {
        stack.push(node);
      }
    }

    if (documentRoot.children.length !== 1) {
      throw new BadRequestException(
        'The SVG must contain exactly one root element.',
      );
    }

    return documentRoot.children[0];
  }

  private parseViewBox(value?: string): SvgViewBox {
    if (!value) {
      throw new BadRequestException('SVG viewBox is required.');
    }

    const values = value
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (values.length !== 4 || values.some((item) => !Number.isFinite(item))) {
      throw new BadRequestException(`Invalid SVG viewBox: ${value}`);
    }

    const [x, y, width, height] = values;
    if (width <= 0 || height <= 0) {
      throw new BadRequestException('SVG viewBox width and height must be positive.');
    }

    return { x, y, width, height };
  }

  private extractColorRegions(root: SvgNode): ColorRegion[] {
    const regions: ColorRegion[] = [];

    const visit = (node: SvgNode, parentMatrix: SvgMatrix) => {
      const localMatrix = this.parseTransform(node.attributes.transform);
      const worldMatrix = this.multiplyMatrices(parentMatrix, localMatrix);

      if (node.tag === 'path') {
        const id = node.attributes.id;
        const geometry = node.attributes.d;
        if (id?.startsWith('COLOUR_') && geometry) {
          const metadata = COLOR_REGION_METADATA[id] || {
            name: id,
            ename: id,
          };

          let geometryBounds: ColorRegion['geometryBounds'] = null;
          try {
            const [minX, minY, maxX, maxY] = svgPathBbox(geometry);
            const localBounds = {
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY,
            };
            geometryBounds = this.transformRectangle(
              worldMatrix,
              localBounds.width,
              localBounds.height,
              localBounds.x,
              localBounds.y,
            );
          } catch {
            throw new BadRequestException(
              `Unable to calculate SVG geometry bounds for color region "${id}".`,
            );
          }

          regions.push({
            id,
            name: metadata.name,
            ename: metadata.ename,
            side: id.endsWith('_REVERSE') || id.includes('_REVERSE_')
              ? 'back'
              : 'front',
            fill: node.attributes.fill || null,
            geometry,
            geometryBounds,
            matrix: worldMatrix,
          });
        }
      }

      for (const child of node.children) {
        visit(child, worldMatrix);
      }
    };

    visit(root, IDENTITY_MATRIX);
    return regions;
  }

  private extractImageSlots(root: SvgNode): ImageSlot[] {
    const slots: ImageSlot[] = [];

    const visit = (node: SvgNode, parentMatrix: SvgMatrix) => {
      const localMatrix = this.parseTransform(node.attributes.transform);
      const worldMatrix = this.multiplyMatrices(parentMatrix, localMatrix);

      if (node.tag === 'image') {
        const id = node.attributes.id;
        if (id?.startsWith('LOGO_')) {
          const width = this.parseNumber(node.attributes.width);
          const height = this.parseNumber(node.attributes.height);
          const x = this.parseNumber(node.attributes.x || '0');
          const y = this.parseNumber(node.attributes.y || '0');

          if (width > 0 && height > 0) {
            const matrix = this.multiplyMatrices(
              worldMatrix,
              this.translateMatrix(x, y),
            );
            const bounds = this.transformRectangle(matrix, width, height);

            slots.push({
              id,
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
              bounds,
              matrix,
              sourceTransform: node.attributes.transform || null,
            });
          }
        }
      }

      for (const child of node.children) {
        visit(child, worldMatrix);
      }
    };

    visit(root, IDENTITY_MATRIX);
    return slots;
  }

  private extractTextPaths(root: SvgNode): TextPath[] {
    const result: TextPath[] = [];
    const seen = new Set<string>();

    this.walk(root, (node) => {
      if (node.tag !== 'g') return;
      const groupId = node.attributes.id;
      const purpose = groupId ? TEXT_GROUP_PURPOSE[groupId] : undefined;
      if (!groupId || !purpose || seen.has(groupId)) return;

      seen.add(groupId);
      const paths: SvgNode[] = [];
      this.collectDescendantPaths(node, paths);

      for (const pathNode of paths) {
        const path = pathNode.attributes.d;
        if (!path) continue;

        result.push({
          groupId,
          purpose,
          pathId: pathNode.attributes.id || null,
          path,
        });
      }
    });

    return result;
  }

  private collectDescendantPaths(node: SvgNode, output: SvgNode[]): void {
    for (const child of node.children) {
      if (child.tag === 'path') output.push(child);
      this.collectDescendantPaths(child, output);
    }
  }

  private walk(node: SvgNode, visitor: (node: SvgNode) => void): void {
    visitor(node);
    for (const child of node.children) this.walk(child, visitor);
  }

  private parseNumber(value?: string): number {
    if (!value) return 0;
    const match = value.trim().match(/^[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/i);
    return match ? Number(match[0]) : 0;
  }

  private parseTransform(value?: string): SvgMatrix {
    if (!value) return { ...IDENTITY_MATRIX };

    const transformPattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
    let result = { ...IDENTITY_MATRIX };
    let match: RegExpExecArray | null;

    while ((match = transformPattern.exec(value))) {
      const name = match[1];
      const args = match[2]
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);

      let next: SvgMatrix | null = null;
      switch (name) {
        case 'matrix':
          if (args.length === 6) {
            next = {
              a: args[0],
              b: args[1],
              c: args[2],
              d: args[3],
              e: args[4],
              f: args[5],
            };
          }
          break;
        case 'translate':
          next = this.translateMatrix(args[0] || 0, args[1] || 0);
          break;
        case 'scale':
          next = {
            a: args[0] ?? 1,
            b: 0,
            c: 0,
            d: args[1] ?? args[0] ?? 1,
            e: 0,
            f: 0,
          };
          break;
        case 'rotate': {
          const angle = ((args[0] || 0) * Math.PI) / 180;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const rotation: SvgMatrix = {
            a: cos,
            b: sin,
            c: -sin,
            d: cos,
            e: 0,
            f: 0,
          };
          if (args.length >= 3) {
            const [cx, cy] = [args[1], args[2]];
            next = this.multiplyMatrices(
              this.translateMatrix(cx, cy),
              this.multiplyMatrices(
                rotation,
                this.translateMatrix(-cx, -cy),
              ),
            );
          } else {
            next = rotation;
          }
          break;
        }
        case 'skewX': {
          const tangent = Math.tan(((args[0] || 0) * Math.PI) / 180);
          next = { a: 1, b: 0, c: tangent, d: 1, e: 0, f: 0 };
          break;
        }
        case 'skewY': {
          const tangent = Math.tan(((args[0] || 0) * Math.PI) / 180);
          next = { a: 1, b: tangent, c: 0, d: 1, e: 0, f: 0 };
          break;
        }
      }

      if (next) result = this.multiplyMatrices(result, next);
    }

    return result;
  }

  private translateMatrix(x: number, y: number): SvgMatrix {
    return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
  }

  /** Matrix multiplication for SVG's [a c e; b d f; 0 0 1] representation. */
  private multiplyMatrices(left: SvgMatrix, right: SvgMatrix): SvgMatrix {
    return {
      a: left.a * right.a + left.c * right.b,
      b: left.b * right.a + left.d * right.b,
      c: left.a * right.c + left.c * right.d,
      d: left.b * right.c + left.d * right.d,
      e: left.a * right.e + left.c * right.f + left.e,
      f: left.b * right.e + left.d * right.f + left.f,
    };
  }

  private transformRectangle(
    matrix: SvgMatrix,
    width: number,
    height: number,
    x = 0,
    y = 0,
  ): { x: number; y: number; width: number; height: number } {
    const points = [
      this.transformPoint(matrix, x, y),
      this.transformPoint(matrix, x + width, y),
      this.transformPoint(matrix, x, y + height),
      this.transformPoint(matrix, x + width, y + height),
    ];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  private transformPoint(
    matrix: SvgMatrix,
    x: number,
    y: number,
  ): { x: number; y: number } {
    return {
      x: matrix.a * x + matrix.c * y + matrix.e,
      y: matrix.b * x + matrix.d * y + matrix.f,
    };
  }
}
