import { Injectable } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { svgPathBbox } from 'svg-path-bbox';
import { ZhipuChatModelProvider } from '../../agent/providers/zhipu-chat-model.provider';

const TILE_SIZE = 256;
const MAX_ATTEMPTS = 3;
const MAX_SVG_LENGTH = 60_000;
const MAX_ELEMENTS = 250;

const PatternState = Annotation.Root({
  brief: Annotation<string>(),
  productType: Annotation<string>(),
  patternColor: Annotation<string>(),
  svg: Annotation<string>(),
  issues: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  attempts: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  valid: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
});

type PatternStateValue = typeof PatternState.State;

export interface SvgPatternGenerationResult {
  svg: string;
  attempts: number;
  validation: {
    valid: true;
    checks: string[];
    warnings: string[];
  };
}

@Injectable()
export class SvgPatternPipelineService {
  private graph: any;

  constructor(private readonly modelProvider: ZhipuChatModelProvider) {}

  async generate(input: {
    brief: string;
    designIdea?: string;
    productType?: string;
    patternColor?: string;
  }): Promise<SvgPatternGenerationResult> {
    const initialState = {
      brief: [input.brief, input.designIdea || ''].filter(Boolean).join('\n'),
      productType: input.productType || 'sportswear',
      patternColor: this.normalizeHex(input.patternColor) || '#ffffff',
      svg: '',
      issues: [],
      attempts: 0,
      valid: false,
    };

    const result = await this.getGraph().invoke(initialState, {
      recursionLimit: 12,
    });

    if (!result.valid) {
      throw new Error(
        `SVG pattern did not pass validation after ${result.attempts} attempts: ${(result.issues || []).join('; ')}`,
      );
    }

    return {
      svg: result.svg,
      attempts: result.attempts,
      validation: {
        valid: true,
        checks: [
          'SVG XML structure',
          'Allowed vector elements and attributes',
          'No scripts, external resources, or embedded raster images',
          'Tile viewBox and geometry bounds',
          'Editable single-color token',
          'Path geometry syntax',
        ],
        warnings: [
          'Seamless visual continuity is not mathematically proven; inspect the repeated tile preview before production.',
        ],
      },
    };
  }

  private getGraph() {
    if (this.graph) return this.graph;

    const generate = async (state: PatternStateValue) => ({
      svg: await this.requestSvg(state, ''),
      attempts: 1,
    });

    const validate = async (state: PatternStateValue) => {
      const result = this.validateAndNormalizeSvg(state.svg, state.patternColor);
      return {
        svg: result.svg,
        valid: result.valid,
        issues: result.issues,
      };
    };

    const repair = async (state: PatternStateValue) => ({
      svg: await this.requestSvg(state, state.issues.join('\n')),
      attempts: state.attempts + 1,
      valid: false,
    });

    const routeAfterValidation = (state: PatternStateValue) => {
      if (state.valid) return 'done';
      return state.attempts < MAX_ATTEMPTS ? 'repair' : 'failed';
    };

    this.graph = new StateGraph(PatternState)
      .addNode('generate', generate)
      .addNode('validate', validate)
      .addNode('repair', repair)
      .addEdge(START, 'generate')
      .addEdge('generate', 'validate')
      .addConditionalEdges('validate', routeAfterValidation, {
        done: END,
        repair: 'repair',
        failed: END,
      })
      .addEdge('repair', 'validate')
      .compile();

    return this.graph;
  }

  private async requestSvg(state: PatternStateValue, validationIssues: string) {
    const model = this.modelProvider.createChatModel();
    const repairContext = validationIssues
      ? `\nThe previous SVG failed deterministic validation. Fix every issue below without changing the design intent:\n${validationIssues}\n`
      : '';

    const response = await model.invoke([
      new SystemMessage(`You are a professional sportswear seamless-tile SVG pattern engineer.
Return ONLY one complete raw SVG XML document. Do not use Markdown fences or explanations.
The tile must be visually repeatable on all four edges and suitable for high-resolution fabric printing.
Use a 256 by 256 user-space tile with viewBox="0 0 256 256".
Use vector geometry only: svg, defs, g, path, rect, circle, ellipse, polygon, polyline, line. Do not use transform attributes; write geometry directly in tile coordinates.
Never use text, images, scripts, CSS stylesheets, filters, masks, foreignObject, animation, or external resources.
Use no more than 1 foreground color. Every visible fill/stroke must use exactly var(--pattern-color, ${state.patternColor}); use fill="none" for transparent shapes.
Do not hard-code any other color. This allows the application to recolor the pattern.
Do not modify any jersey template, UV, clipPath, garment boundary, or panel geometry. Generate only a standalone repeating tile.
Keep the SVG concise (under 60 KB) and use clean path geometry.
Avoid overly thin details: use stroke-width of at least 1.2 when strokes are needed.
The pattern must have deliberate edge continuity: forms touching one tile edge should continue at the opposite edge with matching positions and shapes.
`),
      new HumanMessage(`Garment type: ${state.productType}\nPattern brief: ${state.brief}\nEditable pattern color token: ${state.patternColor}\n${repairContext}Generate the complete SVG tile now.`),
    ]);

    const raw =
      typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .filter((part: any) => part && typeof part === 'object' && 'text' in part)
              .map((part: any) => String(part.text))
              .join('')
          : '';

    const svg = this.extractSvg(raw);
    if (!svg) {
      throw new Error('Zhipu did not return a complete SVG document.');
    }
    return svg;
  }

  private extractSvg(value: string) {
    return value
      .trim()
      .replace(/^\uFEFF/, '')
      .replace(/^\`\`\`(?:svg|xml)?\s*/i, '')
      .replace(/\s*\`\`\`$/i, '')
      .trim();
  }

  private validateAndNormalizeSvg(svgInput: string, patternColor: string) {
    const issues: string[] = [];
    let svg = this.extractSvg(svgInput);

    if (!svg || !/^<svg(?:\s|>)/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
      return { valid: false, svg, issues: ['SVG root element is missing or incomplete.'] };
    }
    if (svg.length > MAX_SVG_LENGTH) {
      issues.push(`SVG exceeds the ${MAX_SVG_LENGTH} character size limit.`);
    }

    const forbiddenTags = [
      'script', 'foreignObject', 'image', 'text', 'use', 'filter', 'mask',
      'iframe', 'audio', 'video', 'animate', 'animateTransform', 'set',
    ];
    for (const tag of forbiddenTags) {
      if (new RegExp(`<\\s*${tag}(?:\\s|>)`, 'i').test(svg)) {
        issues.push(`Forbidden SVG element: <${tag}>.`);
      }
    }

    if (/\son[a-z]+\s*=/i.test(svg)) issues.push('Event-handler attributes are not allowed.');
    if (/\b(?:href|xlink:href)\s*=/i.test(svg)) issues.push('External or linked resources are not allowed.');
    if (/url\s*\(/i.test(svg)) issues.push('CSS url() references are not allowed.');
    if (/<!DOCTYPE|<!ENTITY/i.test(svg)) issues.push('DOCTYPE and XML entities are not allowed.');
    if (/<\?xml-stylesheet/i.test(svg)) issues.push('External XML stylesheets are not allowed.');

    const rootMatch = svg.match(/^<svg\b([^>]*)>/i);
    if (!rootMatch) {
      issues.push('Could not parse the SVG root tag.');
    } else {
      const rootAttributes = rootMatch[1];
      if (!/\bxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(rootAttributes)) {
        issues.push('SVG root must declare the standard SVG namespace.');
      }
      const viewBox = rootAttributes.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!viewBox || !/^0\s+0\s+256\s+256$/.test(viewBox.trim())) {
        issues.push('SVG viewBox must be exactly "0 0 256 256".');
      }
    }

    const allowedTags = new Set([
      'svg', 'defs', 'g', 'path', 'rect', 'circle', 'ellipse',
      'polygon', 'polyline', 'line',
    ]);
    const tokens = svg.match(/<!--[\s\S]*?-->|<[^>]+>/g) || [];
    const stack: string[] = [];
    let elementCount = 0;
    let geometryCount = 0;
    let rootCount = 0;
    const allowedAttributes = new Set([
      'xmlns', 'width', 'height', 'viewBox', 'id', 'd', 'x', 'y',
      'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
      'width', 'height', 'points', 'fill', 'stroke',
      'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule',
      'opacity', 'fill-opacity', 'stroke-opacity',
    ]);

    for (const token of tokens) {
      if (token.startsWith('<!--') || token.startsWith('<?')) continue;
      if (/^<\//.test(token)) {
        const closing = token.match(/^<\/\s*([\w:-]+)/)?.[1];
        const expected = stack.pop();
        if (!closing || expected !== closing) {
          issues.push('SVG elements are not properly nested.');
          break;
        }
        continue;
      }
      if (/^<!/.test(token)) continue;

      const tag = token.match(/^<\s*([\w:-]+)/)?.[1];
      if (!tag) continue;
      elementCount += 1;
      if (!allowedTags.has(tag)) issues.push(`Unsupported SVG element: <${tag}>.`);
      if (tag === 'svg') rootCount += 1;
      if (['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'].includes(tag)) {
        geometryCount += 1;
      }

      const selfClosing = /\/\s*>$/.test(token);
      const attrText = token.slice(tag.length + 1).replace(/\/?>\s*$/, '');
      const attrPattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      const attributes: Record<string, string> = {};
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrPattern.exec(attrText))) {
        const name = attrMatch[1];
        const value = attrMatch[2] ?? attrMatch[3] ?? '';
        attributes[name] = value;
        if (!allowedAttributes.has(name)) {
          issues.push(`Unsupported SVG attribute: ${name}.`);
        }
        if (['fill', 'stroke'].includes(name) && value !== 'none' &&
            !/^var\(--pattern-color,\s*#[0-9a-fA-F]{6}\)$/.test(value)) {
          issues.push(`${name} must use the editable --pattern-color token or none.`);
        }
      }

      if (['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'].includes(tag)) {
        const hasVisibleFill = Boolean(attributes.fill && attributes.fill !== 'none');
        const hasVisibleStroke = Boolean(attributes.stroke && attributes.stroke !== 'none');
        if (!hasVisibleFill && !hasVisibleStroke) {
          issues.push(`<${tag}> must use an editable fill or stroke color token.`);
        }
      }

      if (['rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'].includes(tag)) {
        const numeric = (name: string, fallback = 0) =>
          attributes[name] === undefined ? fallback : Number(attributes[name]);
        let bounds: [number, number, number, number] | null = null;

        if (tag === 'rect') {
          const x = numeric('x');
          const y = numeric('y');
          const width = numeric('width');
          const height = numeric('height');
          if (width <= 0 || height <= 0) issues.push('Rect width and height must be positive.');
          bounds = [x, y, x + width, y + height];
        } else if (tag === 'circle') {
          const cx = numeric('cx');
          const cy = numeric('cy');
          const radius = numeric('r');
          if (radius <= 0) issues.push('Circle radius must be positive.');
          bounds = [cx - radius, cy - radius, cx + radius, cy + radius];
        } else if (tag === 'ellipse') {
          const cx = numeric('cx');
          const cy = numeric('cy');
          const rx = numeric('rx');
          const ry = numeric('ry');
          if (rx <= 0 || ry <= 0) issues.push('Ellipse radii must be positive.');
          bounds = [cx - rx, cy - ry, cx + rx, cy + ry];
        } else if (tag === 'line') {
          const x1 = numeric('x1');
          const y1 = numeric('y1');
          const x2 = numeric('x2');
          const y2 = numeric('y2');
          bounds = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
        } else {
          const rawPoints = attributes.points || '';
          const values = rawPoints.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)?.map(Number) || [];
          if (values.length < 6 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) {
            issues.push(`${tag} must contain at least three valid coordinate pairs.`);
          } else {
            const xs = values.filter((_value, index) => index % 2 === 0);
            const ys = values.filter((_value, index) => index % 2 === 1);
            bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          }
        }

        if (bounds) {
          if (bounds.some((value) => !Number.isFinite(value))) {
            issues.push(`<${tag}> contains invalid geometry coordinates.`);
          } else if (
            bounds[0] < -32 || bounds[1] < -32 ||
            bounds[2] > TILE_SIZE + 32 || bounds[3] > TILE_SIZE + 32
          ) {
            issues.push(`<${tag}> geometry extends more than 32 units beyond the tile.`);
          }
        }
      }
      if (!selfClosing) stack.push(tag);
    }

    if (rootCount !== 1) issues.push('SVG must contain exactly one root <svg> element.');
    if (stack.length) issues.push('SVG contains unclosed elements.');
    if (elementCount > MAX_ELEMENTS) issues.push(`SVG contains too many elements (max ${MAX_ELEMENTS}).`);
    if (geometryCount < 1) issues.push('SVG must contain at least one vector geometry element.');

    const pathPattern = /<path\b([^>]*)>/gi;
    let pathMatch: RegExpExecArray | null;
    while ((pathMatch = pathPattern.exec(svg))) {
      const d = pathMatch[1].match(/\bd\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      if (!d) {
        issues.push('Every path element must include a d attribute.');
        continue;
      }
      try {
        const bounds = svgPathBbox(d[1] ?? d[2] ?? '');
        if (bounds.some((value) => !Number.isFinite(value))) {
          issues.push('Path contains invalid geometry coordinates.');
        } else {
          const [minX, minY, maxX, maxY] = bounds;
          if (
            minX < -32 || minY < -32 ||
            maxX > TILE_SIZE + 32 || maxY > TILE_SIZE + 32
          ) {
            issues.push('Path geometry extends more than 32 units beyond the tile.');
          }
        }
      } catch {
        issues.push('Path d attribute contains invalid SVG path data.');
      }
    }

    // Normalize all visible colors to a single CSS custom-property token. The
    // frontend can recolor the same vector tile without regenerating geometry.
    const color = this.normalizeHex(patternColor) || '#ffffff';
    svg = svg.replace(
      /\b(fill|stroke)\s*=\s*(["'])(?!none["'])[^"']*\2/gi,
      (_match, attribute) => `${attribute}="var(--pattern-color, ${color})"`,
    );

    const uniqueIssues = Array.from(new Set(issues));
    return {
      valid: uniqueIssues.length === 0,
      svg,
      issues: uniqueIssues,
    };
  }

  private normalizeHex(value?: string) {
    if (!value) return null;
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    return null;
  }
}
