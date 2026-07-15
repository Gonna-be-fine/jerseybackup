import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { AiDesignDto } from './dto/ai-design.dto';
import { AiLogoDto } from './dto/ai-logo.dto';
import { AiModelPreviewDto } from './dto/ai-model-preview.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('design')
  generateDesign(@Request() req, @Body() dto: AiDesignDto) {
    return this.aiService.generateDesign(req.user.id, dto);
  }

  @Post('logo')
  generateLogo(@Request() req, @Body() dto: AiLogoDto) {
    return this.aiService.generateLogo(req.user.id, dto);
  }

  @Post('model-preview')
  generateModelPreview(@Request() req, @Body() dto: AiModelPreviewDto) {
    return this.aiService.generateModelPreview(req.user.id, dto);
  }
}
