import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class GeminiImageProvider {
  async generateImage(prompt: string, aspectRatio: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('GEMINI_API_KEY is not configured.');
    }

    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const baseUrl =
      process.env.GEMINI_API_BASE ||
      'https://generativelanguage.googleapis.com/v1beta';
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          imageConfig: { aspectRatio },
        },
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        body?.error?.message || `Gemini image request failed: ${response.status}`,
      );
    }

    const imagePart = body?.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData?.data,
    );
    if (!imagePart?.inlineData?.data) {
      throw new Error('Gemini did not return an image.');
    }

    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    return `data:${mimeType};base64,${imagePart.inlineData.data}`;
  }
}
