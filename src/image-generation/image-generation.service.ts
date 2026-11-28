import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ComfyUiProvider } from './providers/comfyui.provider';
import { GeminiImageProvider } from './providers/gemini-image.provider';

@Injectable()
export class ImageGenerationService {
  constructor(
    private readonly geminiProvider: GeminiImageProvider,
    private readonly comfyUiProvider: ComfyUiProvider,
  ) {}

  async generateImage(prompt: string, aspectRatio: string): Promise<string> {
    const provider = (
      process.env.IMAGE_GENERATION_PROVIDER || 'gemini'
    ).toLowerCase();

    switch (provider) {
      case 'gemini':
        return this.geminiProvider.generateImage(prompt, aspectRatio);
      case 'comfyui':
        return this.comfyUiProvider.generateImage(prompt, aspectRatio);
      default:
        throw new ServiceUnavailableException(
          `Unsupported IMAGE_GENERATION_PROVIDER "${provider}". Use "gemini" or "comfyui".`,
        );
    }
  }
}
