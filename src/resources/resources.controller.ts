import { 
  Controller, 
  Get, 
  Post, 
  Query, 
  Param, 
  HttpException, 
  HttpStatus,
  UseGuards
} from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  async getResources(@Query() query: QueryResourcesDto) {
    try {
      return await this.resourcesService.findAll(query);
    } catch (error) {
      throw new HttpException(
        { message: '获取资源列表失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('categories')
  async getCategories() {
    try {
      return await this.resourcesService.findAllCategories();
    } catch (error) {
      throw new HttpException(
        { message: '获取类别列表失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('category/:slug')
  async getResourcesByCategory(
    @Param('slug') slug: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '40'
  ) {
    try {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      return await this.resourcesService.getResourcesByCategory(slug, pageNum, limitNum);
    } catch (error) {
      throw new HttpException(
        { message: '获取类别资源失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('search')
  async searchResources(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '40'
  ) {
    try {
      if (!query) {
        throw new Error('搜索关键词不能为空');
      }
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      return await this.resourcesService.searchResources(query, pageNum, limitNum);
    } catch (error) {
      throw new HttpException(
        { message: '搜索资源失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async getResource(@Param('id') id: string) {
    try {
      const resourceId = parseInt(id, 10);
      return await this.resourcesService.findOne(resourceId);
    } catch (error) {
      throw new HttpException(
        { message: '获取资源详情失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id/content')
  async getResourceContent(@Param('id') id: string) {
    try {
      const resourceId = parseInt(id, 10);
      return await this.resourcesService.getResourceContent(resourceId);
    } catch (error) {
      throw new HttpException(
        { message: '获取资源内容失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('slug/:slug')
  async getResourceBySlug(@Param('slug') slug: string) {
    try {
      return await this.resourcesService.findBySlug(slug);
    } catch (error) {
      throw new HttpException(
        { message: '获取资源详情失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('scan')
  // @UseGuards(JwtAuthGuard)
  async scanResources() {
    try {
      return await this.resourcesService.scanResources();
    } catch (error) {
      throw new HttpException(
        { message: '资源扫描失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('scan/:category')
  @UseGuards(JwtAuthGuard)
  async scanCategory(@Param('category') category: string) {
    try {
      return await this.resourcesService.scanCategory(category);
    } catch (error) {
      throw new HttpException(
        { message: '类别扫描失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard)
  async getStats() {
    try {
      return await this.resourcesService.getStats();
    } catch (error) {
      throw new HttpException(
        { message: '获取统计信息失败', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}