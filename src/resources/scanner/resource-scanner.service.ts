import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ResourceCategory } from '../entities/resource-category.entity';
import { Resource } from '../entities/resource.entity';

@Injectable()
export class ResourceScannerService {
  private readonly logger = new Logger(ResourceScannerService.name);
  private readonly baseDir = process.env.RESOURCE_BASE_DIR || 'E:\\兼职\\svgs-download\\py';

  constructor(
    @InjectRepository(ResourceCategory)
    private readonly categoryRepository: Repository<ResourceCategory>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async scanAllResources(): Promise<void> {
    this.logger.log(`Scanning resource directory: ${this.baseDir}`);

    if (!fs.existsSync(this.baseDir)) {
      throw new Error(`Resource directory does not exist: ${this.baseDir}`);
    }

    const items = fs.readdirSync(this.baseDir);
    let totalCategories = 0;
    let totalResources = 0;

    for (const item of items) {
      const itemPath = path.join(this.baseDir, item);
      if (!fs.statSync(itemPath).isDirectory()) continue;

      const categoryStats = await this.scanCategoryFolder(item);
      totalCategories += 1;
      totalResources += categoryStats.resourceCount;

      this.logger.log(`Scanned category "${item}": ${categoryStats.resourceCount} resources`);
    }

    this.logger.log(`Resource scan complete: ${totalCategories} categories, ${totalResources} resources`);
  }

  async scanSingleCategory(folderName: string): Promise<void> {
    this.logger.log(`Scanning category: ${folderName}`);

    const categoryPath = path.join(this.baseDir, folderName);
    if (!fs.existsSync(categoryPath) || !fs.statSync(categoryPath).isDirectory()) {
      throw new Error(`Category folder does not exist: ${folderName}`);
    }

    await this.scanCategoryFolder(folderName);
    this.logger.log(`Category "${folderName}" scan complete`);
  }

  async getResourceStats(): Promise<{
    totalCategories: number;
    totalResources: number;
    categoriesWithCounts: Array<{ name: string; count: number }>;
  }> {
    const categories = await this.categoryRepository.find({
      relations: ['resources'],
    });

    const totalCategories = categories.length;
    const totalResources = categories.reduce((sum, cat) => sum + cat.resources.length, 0);
    const categoriesWithCounts = categories.map((cat) => ({
      name: cat.name,
      count: cat.resources.length,
    }));

    return {
      totalCategories,
      totalResources,
      categoriesWithCounts,
    };
  }

  private async scanCategoryFolder(folderName: string): Promise<{ resourceCount: number }> {
    const categoryPath = path.join(this.baseDir, folderName);
    const slug = this.generateSlug(folderName);

    let category = await this.categoryRepository.findOne({ where: { slug } });

    if (!category) {
      category = this.categoryRepository.create({
        name: folderName,
        slug,
        folderName,
        isActive: true,
      });
    } else {
      category.name = folderName;
      category.folderName = folderName;
    }

    category = await this.categoryRepository.save(category);

    const files = fs.readdirSync(categoryPath);
    const svgFiles = files.filter((file) => file.toLowerCase().endsWith('.svg'));
    const pngFiles = files.filter((file) => file.toLowerCase().endsWith('.png'));

    let resourceCount = 0;

    for (const svgFile of svgFiles) {
      const baseName = path.basename(svgFile, '.svg');
      const pngFile = pngFiles.find((png) => path.basename(png, '.png') === baseName);
      const relativePath = path.join(folderName, svgFile).replace(/\\/g, '/');
      const resourceSlug = this.generateSlug(`${folderName}-${baseName}`);

      let resource = await this.resourceRepository.findOne({
        where: { slug: resourceSlug },
      });

      if (!resource) {
        resource = this.resourceRepository.create({
          name: baseName,
          slug: resourceSlug,
          categoryId: category.id,
          fileName: svgFile,
          relativePath,
          hasPng: !!pngFile,
          svgContent: '',
          isActive: true,
        });
      } else {
        resource.name = baseName;
        resource.fileName = svgFile;
        resource.relativePath = relativePath;
        resource.hasPng = !!pngFile;
        resource.svgContent = '';
      }

      await this.resourceRepository.save(resource);
      resourceCount += 1;
    }

    category.resourceCount = resourceCount;
    await this.categoryRepository.save(category);

    return { resourceCount };
  }

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}
