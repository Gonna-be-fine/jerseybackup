import { ServiceUnavailableException } from '@nestjs/common';
import { ComfyUiProvider } from './providers/comfyui.provider';
import { GeminiImageProvider } from './providers/gemini-image.provider';
import { ImageGenerationService } from './image-generation.service';

describe('ImageGenerationService', () => {
  const gemini = {
    generateImage: jest.fn().mockResolvedValue('data:image/png;base64,gemini'),
  };
  const comfyui = {
    generateImage: jest.fn().mockResolvedValue('data:image/png;base64,comfy'),
  };
  let service: ImageGenerationService;
  const originalProvider = process.env.IMAGE_GENERATION_PROVIDER;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ImageGenerationService(
      gemini as unknown as GeminiImageProvider,
      comfyui as unknown as ComfyUiProvider,
    );
  });

  afterAll(() => {
    if (originalProvider === undefined) {
      delete process.env.IMAGE_GENERATION_PROVIDER;
    } else {
      process.env.IMAGE_GENERATION_PROVIDER = originalProvider;
    }
  });

  it('uses Gemini by default', async () => {
    delete process.env.IMAGE_GENERATION_PROVIDER;

    await expect(service.generateImage('badge prompt', '1:1')).resolves.toContain('gemini');
    expect(gemini.generateImage).toHaveBeenCalledWith('badge prompt', '1:1');
    expect(comfyui.generateImage).not.toHaveBeenCalled();
  });

  it('routes image generation to ComfyUI when selected', async () => {
    process.env.IMAGE_GENERATION_PROVIDER = 'comfyui';

    await expect(service.generateImage('badge prompt', '1:1')).resolves.toContain('comfy');
    expect(comfyui.generateImage).toHaveBeenCalledWith('badge prompt', '1:1');
    expect(gemini.generateImage).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider', async () => {
    process.env.IMAGE_GENERATION_PROVIDER = 'unknown';

    await expect(service.generateImage('badge prompt', '1:1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
