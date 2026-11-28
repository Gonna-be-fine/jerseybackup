import { Controller, Get, Param } from '@nestjs/common';
import { BoundaryService } from './boundary.service';

@Controller('boundary')
export class BoundaryController {
  constructor(private readonly boundaryService: BoundaryService) {}

  @Get()
  getSupportedProductTypes() {
    return {
      productTypes: this.boundaryService.getSupportedProductTypes(),
    };
  }

  @Get(':productType')
  getBoundary(@Param('productType') productType: string) {
    return this.boundaryService.getBoundary(productType);
  }
}
