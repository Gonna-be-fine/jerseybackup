import { Module } from '@nestjs/common';
import { BoundaryController } from './boundary.controller';
import { BoundaryService } from './boundary.service';
import { SvgBoundaryParser } from './svg-boundary.parser';
import { PlacementValidator } from './placement-validator.service';

@Module({
  controllers: [BoundaryController],
  providers: [BoundaryService, SvgBoundaryParser, PlacementValidator],
  exports: [BoundaryService],
})
export class BoundaryModule {}
