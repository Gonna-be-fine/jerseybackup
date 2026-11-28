import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post(':productType/validate-placement')
  validatePlacement(
    @Param('productType') productType: string,
    @Body() body: {
      targetRegion: string;
      x: number;
      y: number;
      width: number;
      height: number;
    },
  ) {
    return this.boundaryService.validatePlacement(productType, body);
  }

  @Get(':productType')
  getBoundary(@Param('productType') productType: string) {
    return this.boundaryService.getBoundary(productType);
  }
}
