import { Module } from '@nestjs/common';
import { BoundaryController } from './boundary.controller';
import { BoundaryService } from './boundary.service';
import { SvgBoundaryParser } from './svg-boundary.parser';

@Module({
  controllers: [BoundaryController],
  providers: [BoundaryService, SvgBoundaryParser],
  exports: [BoundaryService],
})
export class BoundaryModule {}
