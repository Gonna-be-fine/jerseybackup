import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Resource } from './entities/resource.entity';
import { ResourceCategory } from './entities/resource-category.entity';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { ResourceScannerService } from './scanner/resource-scanner.service';

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceCategory)
    private readonly categoryRepository: Repository<ResourceCategory>,
    private readonly scannerService: ResourceScannerService,
  ) {}

  async findAll(query: QueryResourcesDto) {
    const { category, search, page = 1, limit = 40, sortBy = 'createdAt', sortOrder = 'DESC' } = query;
    
    const queryBuilder = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.category', 'category')
      .select([
        'resource.id',
        'resource.name',
        'resource.slug',
        'resource.categoryId',
        'resource.fileName',
        'resource.relativePath',
        'resource.hasPng',
        'resource.tags',
        'resource.sortOrder',
        'resource.isActive',
        'resource.createdAt',
        'resource.updatedAt',
        'category.id',
        'category.name',
        'category.slug',
        'category.folderName',
        'category.resourceCount',
      ])
      .where('resource.isActive = :isActive', { isActive: true });

    // 按类别筛选
    if (category && category !== 'All') {
      queryBuilder.andWhere('category.slug = :category', { category });
    }

    // 搜索功能
    if (search) {
      queryBuilder.andWhere(
        '(resource.name LIKE :search OR resource.tags LIKE :search)',
        { search: `%${search}%` }
      );
    }

    // 排序
    const validSortFields = ['name', 'createdAt', 'sortOrder'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`resource.${sortField}`, sortOrder);

    // 分页
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number) {
    const resource = await this.resourceRepository.findOne({
      where: { id, isActive: true },
      relations: ['category'],
    });

    if (!resource) {
      throw new Error(`资源 ID ${id} 不存在`);
    }

    return resource;
  }

  async findBySlug(slug: string) {
    const resource = await this.resourceRepository.findOne({
      where: { slug, isActive: true },
      relations: ['category'],
    });

    if (!resource) {
      throw new Error(`资源 slug "${slug}" 不存在`);
    }

    return resource;
  }

  async findAllCategories() {
    const categories = await this.categoryRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    return categories;
  }

  async findCategoryBySlug(slug: string) {
    const category = await this.categoryRepository.findOne({
      where: { slug, isActive: true },
    });

    if (!category) {
      throw new Error(`类别 "${slug}" 不存在`);
    }

    return category;
  }

  async getResourcesByCategory(categorySlug: string, page = 1, limit = 40) {
    const category = await this.findCategoryBySlug(categorySlug);
    
    const [items, total] = await this.resourceRepository.findAndCount({
      select: {
        id: true,
        name: true,
        slug: true,
        categoryId: true,
        fileName: true,
        relativePath: true,
        hasPng: true,
        tags: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        category: {
          id: true,
          name: true,
          slug: true,
          folderName: true,
          resourceCount: true,
        },
      },
      where: { categoryId: category.id, isActive: true },
      relations: ['category'],
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      category,
    };
  }

  async searchResources(query: string, page = 1, limit = 40) {
    const [items, total] = await this.resourceRepository.findAndCount({
      select: {
        id: true,
        name: true,
        slug: true,
        categoryId: true,
        fileName: true,
        relativePath: true,
        hasPng: true,
        tags: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        category: {
          id: true,
          name: true,
          slug: true,
          folderName: true,
          resourceCount: true,
        },
      },
      where: [
        { name: Like(`%${query}%`), isActive: true },
        { tags: Like(`%${query}%`), isActive: true },
      ],
      relations: ['category'],
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query,
    };
  }

  async scanResources() {
    this.logger.log('开始资源扫描...');
    try {
      await this.scannerService.scanAllResources();
      this.logger.log('资源扫描完成');
      return { message: '资源扫描完成' };
    } catch (error) {
      this.logger.error('资源扫描失败:', error);
      throw new Error(`资源扫描失败: ${error.message}`);
    }
  }

  async scanCategory(folderName: string) {
    this.logger.log(`扫描类别: ${folderName}`);
    try {
      await this.scannerService.scanSingleCategory(folderName);
      this.logger.log(`类别 "${folderName}" 扫描完成`);
      return { message: `类别 "${folderName}" 扫描完成` };
    } catch (error) {
      this.logger.error(`类别 "${folderName}" 扫描失败:`, error);
      throw new Error(`类别扫描失败: ${error.message}`);
    }
  }

  async getStats() {
    return await this.scannerService.getResourceStats();
  }

  async getResourceContent(id: number) {
    const resource = await this.findOne(id);
    return {
      id: resource.id,
      name: resource.name,
      svgContent: resource.svgContent,
      relativePath: resource.relativePath,
      hasPng: resource.hasPng,
      category: resource.category.name,
    };
  }
}
