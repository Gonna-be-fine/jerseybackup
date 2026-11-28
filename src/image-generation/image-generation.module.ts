import { Module } from '@nestjs/common';
import { ComfyUiProvider } from './providers/comfyui.provider';
import { GeminiImageProvider } from './providers/gemini-image.provider';
import { ImageGenerationService } from './image-generation.service';

@Module({
  providers: [
    GeminiImageProvider,
    ComfyUiProvider,
    ImageGenerationService,
  ],
  exports: [ImageGenerationService],
})
export class ImageGenerationModule {}
