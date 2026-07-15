import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { ResourceScannerService } from './scanner/resource-scanner.service';
import { Resource } from './entities/resource.entity';
import { ResourceCategory } from './entities/resource-category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource, ResourceCategory]),
  ],
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourceScannerService],
  exports: [ResourcesService, ResourceScannerService],
})
export class ResourcesModule {}