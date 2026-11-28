import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { BOUNDARY_TEMPLATE_FILES } from './boundary.constants';
import { BoundaryContext } from './boundary.types';
import { SvgBoundaryParser } from './svg-boundary.parser';

@Injectable()
export class BoundaryService {
  private readonly cache = new Map<string, BoundaryContext>();

  constructor(private readonly parser: SvgBoundaryParser) {}

  getSupportedProductTypes(): string[] {
    return Object.keys(BOUNDARY_TEMPLATE_FILES);
  }

  async getBoundary(productType: string): Promise<BoundaryContext> {
    const normalizedType = (productType || '').trim().toLowerCase();

    if (!/^[a-z0-9-]+$/.test(normalizedType)) {
      throw new BadRequestException('Invalid productType.');
    }

    const cached = this.cache.get(normalizedType);
    if (cached) return cached;

    const filename = BOUNDARY_TEMPLATE_FILES[normalizedType];
    if (!filename) {
      throw new NotFoundException(
        `No boundary template configured for productType "${normalizedType}".`,
      );
    }

    // Works in both src/boundary during development and dist/boundary after build.
    // nest-cli.json copies src/sources into dist/sources.
    const sourceFile = join(__dirname, '..', 'sources', 'boundry', filename);

    let svg: string;
    try {
      svg = await readFile(sourceFile, 'utf8');
    } catch {
      throw new NotFoundException(
        `Boundary SVG not found: ${filename}. Check the sources/boundry asset path.`,
      );
    }

    const context = this.parser.parse(svg, normalizedType, filename);
    this.cache.set(normalizedType, context);
    return context;
  }

  clearCache(productType?: string): void {
    if (productType) {
      this.cache.delete(productType.trim().toLowerCase());
      return;
    }
    this.cache.clear();
  }
}
