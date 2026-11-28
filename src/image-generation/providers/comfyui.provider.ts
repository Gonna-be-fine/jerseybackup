import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OnModuleDestroy } from '@nestjs/common';
import { Agent, fetch as undiciFetch } from 'undici';
import { promises as fs } from 'fs';
import * as path from 'path';

type ComfyUiImage = {
  filename: string;
  subfolder?: string;
  type?: string;
};

@Injectable()
export class ComfyUiProvider implements OnModuleDestroy {
  private readonly dispatcher = new Agent();

  async onModuleDestroy() {
    await this.dispatcher.close();
  }

  private request(url: string, init: Record<string, unknown> = {}) {
    return undiciFetch(url, { ...init, dispatcher: this.dispatcher } as any);
  }

  async generateImage(prompt: string, aspectRatio: string): Promise<string> {
    const baseUrl = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const workflowPath = process.env.COMFYUI_WORKFLOW_PATH?.trim();
    if (!workflowPath) {
      throw new ServiceUnavailableException(
        'COMFYUI_WORKFLOW_PATH is not configured. Export an API-format workflow from ComfyUI first.',
      );
    }

    const absoluteWorkflowPath = path.resolve(process.cwd(), workflowPath);
    const workflowText = await fs.readFile(absoluteWorkflowPath, 'utf8');
    const workflow = JSON.parse(workflowText) as Record<string, any>;

    this.setNodeInput(
      workflow,
      process.env.COMFYUI_PROMPT_NODE_ID,
      process.env.COMFYUI_PROMPT_INPUT || 'text',
      prompt,
      true,
    );
    this.setNodeInput(
      workflow,
      process.env.COMFYUI_NEGATIVE_PROMPT_NODE_ID,
      process.env.COMFYUI_NEGATIVE_PROMPT_INPUT || 'text',
      process.env.COMFYUI_NEGATIVE_PROMPT || '',
      false,
    );
    this.setNodeInput(
      workflow,
      process.env.COMFYUI_SEED_NODE_ID,
      process.env.COMFYUI_SEED_INPUT || 'seed',
      Math.floor(Math.random() * 2 ** 31),
      false,
    );

    const dimensions = this.getDimensions(aspectRatio);
    this.setNodeInput(
      workflow,
      process.env.COMFYUI_WIDTH_NODE_ID,
      process.env.COMFYUI_WIDTH_INPUT || 'width',
      dimensions.width,
      false,
    );
    this.setNodeInput(
      workflow,
      process.env.COMFYUI_HEIGHT_NODE_ID,
      process.env.COMFYUI_HEIGHT_INPUT || 'height',
      dimensions.height,
      false,
    );

    const clientId = randomUUID();
    const submitResponse = await this.request(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
    const submitBody = (await submitResponse.json()) as {
      prompt_id?: string;
      error?: string | { message?: string };
    };
    const submitError =
      typeof submitBody.error === 'string'
        ? submitBody.error
        : submitBody.error?.message;
    if (!submitResponse.ok || !submitBody.prompt_id) {
      throw new Error(
        submitError || `ComfyUI prompt submission failed: ${submitResponse.status}`,
      );
    }

    const image = await this.waitForImage(
      baseUrl,
      String(submitBody.prompt_id),
    );
    return this.downloadImage(baseUrl, image);
  }

  private setNodeInput(
    workflow: Record<string, any>,
    nodeId: string | undefined,
    inputName: string,
    value: unknown,
    required: boolean,
  ) {
    if (!nodeId) {
      if (required) {
        throw new ServiceUnavailableException(
          'COMFYUI_PROMPT_NODE_ID must identify the positive prompt node in the API workflow.',
        );
      }
      return;
    }

    const node = workflow[nodeId];
    if (!node?.inputs || !(inputName in node.inputs)) {
      throw new Error(
        `ComfyUI workflow node "${nodeId}" does not contain input "${inputName}".`,
      );
    }
    node.inputs[inputName] = value;
  }

  private getDimensions(aspectRatio: string) {
    const [rawWidth, rawHeight] = aspectRatio.split(':').map(Number);
    const ratio =
      Number.isFinite(rawWidth) && Number.isFinite(rawHeight) && rawWidth > 0 && rawHeight > 0
        ? rawWidth / rawHeight
        : 1;
    const maxDimension = Number(process.env.COMFYUI_MAX_IMAGE_DIMENSION) || 1024;
    const scale = maxDimension / Math.max(ratio, 1);
    const width = Math.max(64, Math.round((scale * ratio) / 64) * 64);
    const height = Math.max(64, Math.round(scale / 64) * 64);
    return { width, height };
  }

  private async waitForImage(
    baseUrl: string,
    promptId: string,
  ): Promise<ComfyUiImage> {
    const timeoutMs = Number(process.env.COMFYUI_TIMEOUT_MS) || 180000;
    const pollIntervalMs = Number(process.env.COMFYUI_POLL_INTERVAL_MS) || 1000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const response = await this.request(
        `${baseUrl}/history/${encodeURIComponent(promptId)}`,
      );
      if (!response.ok) {
        throw new Error(`ComfyUI history request failed: ${response.status}`);
      }

      const history = await response.json();
      const job = history?.[promptId];
      const outputs = job?.outputs || {};
      const preferredNodeId = process.env.COMFYUI_OUTPUT_NODE_ID;
      const preferredOutput = preferredNodeId
        ? outputs[preferredNodeId]
        : undefined;
      const outputNodes = preferredOutput
        ? [preferredOutput]
        : Object.values(outputs);
      const image = (outputNodes as any[])
        .flatMap((output) => output?.images || [])
        .find((item) => item?.filename);

      if (image) {
        return image as ComfyUiImage;
      }

      const status = job?.status?.status_str;
      if (status === 'error') {
        throw new Error('ComfyUI workflow execution failed. Check the ComfyUI server logs.');
      }
    }

    throw new Error(`ComfyUI image generation timed out after ${timeoutMs}ms.`);
  }

  private async downloadImage(
    baseUrl: string,
    image: ComfyUiImage,
  ): Promise<string> {
    const query = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder || '',
      type: image.type || 'output',
    });
    const response = await this.request(`${baseUrl}/view?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`ComfyUI image download failed: ${response.status}`);
    }

    const mimeType =
      response.headers.get('content-type') ||
      this.mimeTypeFromFilename(image.filename);
    const data = Buffer.from(await response.arrayBuffer()).toString('base64');
    return `data:${mimeType};base64,${data}`;
  }

  private mimeTypeFromFilename(filename: string) {
    const extension = path.extname(filename).toLowerCase();
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.webp') return 'image/webp';
    return 'image/png';
  }
}
