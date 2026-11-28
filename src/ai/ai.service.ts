import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { PointsService } from '../points/points.service';
import { ResourcesService } from '../resources/resources.service';
import { JerseyDesignAgent } from '../agent/jersey-design-agent.service';
import { JerseyDesignOutputSchema } from '../agent/schemas/jersey-design.schema';
import { ImageGenerationService } from '../image-generation/image-generation.service';
import { AiDesignDto } from './dto/ai-design.dto';
import { AiLogoDto } from './dto/ai-logo.dto';
import { AiModelPreviewDto } from './dto/ai-model-preview.dto';
import { AiTask } from './entities/ai-task.entity';

const AI_COSTS = {
  design: 8,
  logo: 16,
  modelPreview: 25,
}; 

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_PROXY_URL =
  process.env.GEMINI_PROXY_URL ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy;
const AI_IMAGE_DEBUG_DIR = process.env.AI_IMAGE_DEBUG_DIR || 'debug-ai-images';

if (GEMINI_PROXY_URL) {
  setGlobalDispatcher(new ProxyAgent(GEMINI_PROXY_URL));
}

type GeminiPart = {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
};

type DesignPatternPlan = {
  source: 'preset' | 'generated_svg';
  patternId?: string;
  libraryKeyword?: string;
  brief: string;
  designIdea?: string;
  targetMode: 'all' | 'parts';
  targetPartIds: string[];
  scale: number;
  angle: number;
  opacity: number;
  offsetX?: number;
  offsetY?: number;
  patternColor?: string;
  bgColorMode?: string;
  url?: string | null;
  category?: string;
  name?: string;
};

type AvailablePatternOption = {
  id: string;
  name?: string;
  category?: string;
  keywords?: string[];
  url?: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly pointsService: PointsService,
    private readonly resourcesService: ResourcesService,
    @InjectRepository(AiTask)
    private readonly aiTaskRepository: Repository<AiTask>,
    private readonly jerseyDesignAgent: JerseyDesignAgent,
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  async generateDesign(userId: number, dto: AiDesignDto) {
    const task = await this.createTask(userId, 'ai_design', dto.prompt, AI_COSTS.design);
    let charged = false;

    try {
      await this.chargeForTask(userId, AI_COSTS.design, 'ai_design');
      charged = true;

      const result = await this.buildDesignResult(dto, userId, String(task.id));
      await this.completeTask(task, result);

      const balance = await this.pointsService.getBalance(userId);
      return {
        costPoints: AI_COSTS.design,
        pointsBalance: balance.pointsBalance,
        result,
      };
    } catch (error) {
      if (charged) {
        await this.refundForFailedTask(userId, AI_COSTS.design, 'ai_design');
      }
      await this.failTask(task, error);
      throw error;
    }
  }

  async generateLogo(userId: number, dto: AiLogoDto) {
    const task = await this.createTask(userId, 'ai_logo', dto.prompt, AI_COSTS.logo);
    let charged = false;

    try {
      await this.chargeForTask(userId, AI_COSTS.logo, 'ai_logo');
      charged = true;

      const result = await this.buildLogoResult(dto);
      await this.completeTask(task, result);

      const balance = await this.pointsService.getBalance(userId);
      return {
        costPoints: AI_COSTS.logo,
        pointsBalance: balance.pointsBalance,
        result,
      };
    } catch (error) {
      if (charged) {
        await this.refundForFailedTask(userId, AI_COSTS.logo, 'ai_logo');
      }
      await this.failTask(task, error);
      throw error;
    }
  }

  async generateModelPreview(userId: number, dto: AiModelPreviewDto) {
    const task = await this.createTask(
      userId,
      'ai_model_preview',
      dto.prompt,
      AI_COSTS.modelPreview,
    );
    let charged = false;

    try {
      await this.chargeForTask(userId, AI_COSTS.modelPreview, 'ai_model_preview');
      charged = true;

      const result = await this.buildModelPreviewResult(dto);
      await this.completeTask(task, result);

      const balance = await this.pointsService.getBalance(userId);
      return {
        costPoints: AI_COSTS.modelPreview,
        pointsBalance: balance.pointsBalance,
        result,
      };
    } catch (error) {
      if (charged) {
        await this.refundForFailedTask(userId, AI_COSTS.modelPreview, 'ai_model_preview');
      }
      await this.failTask(task, error);
      throw error;
    }
  }

  private async chargeForTask(
    userId: number,
    costPoints: number,
    bizType: string,
  ) {
    await this.pointsService.consumePoints(
      userId,
      costPoints,
      bizType,
      `AI 功能消费 ${costPoints} 积分`,
    );
  }

  private async refundForFailedTask(userId: number, costPoints: number, bizType: string) {
    await this.pointsService.refundPoints(
      userId,
      costPoints,
      bizType,
      `AI 功能生成失败，退回 ${costPoints} 积分`,
    );
  }

  private async completeTask(task: AiTask, result: unknown) {
    task.status = 'success';
    task.result = result;
    await this.aiTaskRepository.save(task);
  }

  private async createTask(
    userId: number,
    taskType: string,
    prompt: string,
    costPoints: number,
  ) {
    const task = this.aiTaskRepository.create({
      userId,
      taskType,
      prompt,
      costPoints,
      status: 'pending',
    });
    return this.aiTaskRepository.save(task);
  }

  private async failTask(task: AiTask, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    task.status = 'failed';
    task.errorMessage = message;
    await this.aiTaskRepository.save(task);
  }

  private async buildDesignResult(dto: AiDesignDto, userId: number, taskId: string) {
    let result: any = await this.tryBuildRealDesignResult(dto, userId, taskId);
    if (!result) {
      result = await this.buildFallbackDesignResult(dto);
    }

    if (Array.isArray(result.decals)) {
      for (const decal of result.decals) {
        if (decal.libraryKeyword) {
          decal.localMatches = await this.getLocalMatches(decal.libraryKeyword, 3);
        }
      }
    }

    const actualRegionIds = Array.isArray(result._actualRegionIds)
      ? new Set<string>(result._actualRegionIds)
      : new Set<string>(Object.keys(result.jerseyColors || {}));
    delete result._actualRegionIds;

    result.patterns = await this.resolveDesignPatterns(
      result.patterns || [],
      dto,
      actualRegionIds,
    );

    if (dto.generateCustomDecal) {
      const primaryBadgeDecal =
        result.decals?.find((decal) => decal.role === 'primary_badge') || result.decals?.[0];
      if (primaryBadgeDecal?.imagenPrompt) {
        result.generatedBadgeImage = await this.generateSvgDataUrl(
          `A highly detailed sportswear decal emblem of ${primaryBadgeDecal.imagenPrompt}`,
          'badge',
        );
        result.generatedBadgeFormat = 'svg';
      }
    }

    return result;
  }

  private async tryBuildRealDesignResult(dto: AiDesignDto, userId: number, taskId: string) {
    if (!this.hasZhipuKey()) return null;

    const productType = dto.productType || 'sportswear';
    const colorPartSummary = (dto.availableColorParts || [])
      .map(
        (part) =>
          `${part.id}${part.name ? ` (${part.name})` : ''}${part.color ? ` current ${part.color}` : ''}`,
      )
      .join(', ');
    const currentColorsSummary = dto.currentColors
      ? Object.entries(dto.currentColors)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
      : '';
    const patternSummary = (dto.availablePatterns || [])
      .map((pattern) => {
        const keywords = Array.isArray(pattern.keywords) ? pattern.keywords.join('/') : '';
        return `${pattern.id}: ${pattern.name || pattern.id}${pattern.category ? ` [${pattern.category}]` : ''}${keywords ? ` keywords(${keywords})` : ''}`;
      })
      .join('; ');

    const systemInstruction = `You are a high-end athletic sportswear fashion designer.
Given a design intent/concept described by a client, formulate a professional "Design Catalog Sketch Proposal".
Return strict JSON only. No markdown.
Do not include double quote characters inside string values unless they are valid JSON escapes.
Keep every string value short and single-line.
You must recommend jersey colors, a Chinese colorsRationale, 0-2 typographic elements, 0-3 decorative badge decal specifications, and 0-2 pattern specifications.
Typography coordinates use leftRatio/topRatio from 0.1 to 0.9. Main titles usually use leftRatio 0.5 and topRatio 0.54 to 0.60. Numbers use topRatio 0.70 to 0.76.
Fonts must be one of: American Captain, Athletic, Komikazoom, Hardsign, summber-bike.
The garment productType is "${productType}".
Available editable color parts: ${colorPartSummary || 'not provided; inspect the SVG with get_jersey_boundary and use its actual color-region IDs'}.
Actual SVG boundary information: not yet inspected. You MUST call get_jersey_boundary before finalizing the design. Use only IDs returned by that tool. For any proposed decal placement, call validate_image_placement and revise invalid placements.
Only use region IDs that exist in the actual template; do not assume every semantic ColorPrevList ID exists. The jerseyColors object must contain only actual color-region IDs returned by get_jersey_boundary; omit missing IDs such as COLOUR_HEM when the template does not contain them.
Current part colors: ${currentColorsSummary || 'not provided'}.
Primary text already on garment: ${dto.primaryText || 'none'}.
Available reusable preset patterns: ${patternSummary || 'none, AI may choose generated_svg when a custom repeat pattern is needed'}.
Use patterns for repeating body textures such as camo, stripes, lightning textures, geometry, mesh, halftone, or subtle all-over motifs.
Use decals for badges, mascots, crests, emblems, sponsors, and symbolic chest graphics.
Patterns must include source, patternId when using source preset, libraryKeyword, brief, designIdea in Chinese, targetMode, targetPartIds, scale, angle, opacity, offsetX, offsetY, patternColor, bgColorMode.
If a custom repeat texture is required and presets are not a good match, use source generated_svg.
When targetMode is all, targetPartIds must be an empty array. When targetMode is parts, targetPartIds must be chosen only from available editable color parts.
Decals must include role, libraryKeyword, designIdea in Chinese, imagenPrompt, leftRatio, topRatio, scale.
The JSON shape must be:
{
  "jerseyColors": {"COLOUR_BASE":"#hex","COLOUR_PRIMARY":"#hex"},
  "colorsRationale": "Chinese sentence",
  "texts": [{"text":"...","fill":"#hex","fontFamily":"...","fontSize":44,"isCurved":true,"curveValue":30,"leftRatio":0.5,"topRatio":0.54}],
  "decals": [{"role":"primary_badge","libraryKeyword":"star","designIdea":"...","imagenPrompt":"...","leftRatio":0.33,"topRatio":0.42,"scale":0.65}],
  "patterns": [{"source":"preset","patternId":"stripes_diag","libraryKeyword":"stripes","brief":"fast diagonal stripe repeat","designIdea":"...","targetMode":"parts","targetPartIds":["COLOUR_BASE"],"scale":1.0,"angle":0,"opacity":0.28,"offsetX":0,"offsetY":0,"patternColor":"#ffffff","bgColorMode":"use_part_color"}],
  "explanation": "Chinese paragraph"
}`;

    try {
      const threadId = dto.conversationId
        ? `user-${userId}-design-${dto.conversationId}`
        : `user-${userId}-design-${taskId}`;
      const agentResult = await this.jerseyDesignAgent.generateDesign(
        systemInstruction,
        `Design Request: ${dto.prompt}`,
        threadId,
      );
      const parsedDesign = JerseyDesignOutputSchema.parse(
        this.parseGeminiJsonObject(agentResult.text),
      );
      const boundaryResult = agentResult.toolResults.find(
        (item) => item.name === 'get_jersey_boundary',
      );
      const allowedRegionIds = boundaryResult
        ? new Set(
            (JSON.parse(boundaryResult.content)?.colorRegions || []).map(
              (region: { id: string }) => region.id,
            ),
          )
        : undefined;
      const normalized = this.normalizeDesignResult(parsedDesign, allowedRegionIds);
      return {
        ...normalized,
        _actualRegionIds: allowedRegionIds ? Array.from(allowedRegionIds) : Object.keys(normalized.jerseyColors),
      };
    } catch (error) {
      this.logger.warn(`Zhipu LangGraph design agent failed, fallback will be used: ${this.getErrorMessage(error)}`);
      return null;
    }
  }

  private async buildLogoResult(dto: AiLogoDto) {
    const keyword = this.pickKeyword(dto.prompt);
    const matches = await this.getLocalMatches(keyword, 9);
    const outputFormat = dto.outputFormat || 'png';
    const imageUrl =
      outputFormat === 'svg'
        ? await this.tryBuildRealLogoSvg(dto)
        : await this.tryBuildRealLogoImage(dto);

    return {
      keyword,
      outputFormat,
      imageUrl: imageUrl || matches[0]?.svgUrl || null,
      localMatches: matches,
    };
  }

  private async tryBuildRealLogoSvg(dto: AiLogoDto) {
    if (!this.hasGeminiKey()) return null;

    const stylePrompt = dto.style ? `Logo style preset: ${dto.style}. ` : '';
    const colorContext = dto.inheritColors
      ? `Use jersey colors: base ${dto.baseColor || '#ffffff'}, accent ${dto.accentColor || '#111111'}. `
      : '';
    try {
      return await this.generateSvgDataUrl(
        `${stylePrompt}Central subject is: "${dto.prompt}". ${colorContext}Modern detailed sportswear vector emblem with layered mascot/logo illustration.`,
        'logo',
      );
    } catch (error) {
      this.logger.warn(`Gemini logo SVG generation failed, fallback will be used: ${this.getErrorMessage(error)}`);
      return null;
    }
  }

  private async tryBuildRealLogoImage(dto: AiLogoDto) {
    if (!this.hasImageGenerationConfig()) return null;

    const stylePrompt = dto.style ? `Logo style preset: ${dto.style}. ` : '';
    const colorContext = dto.inheritColors
      ? `The primary colors must match jersey colors: base ${dto.baseColor || '#ffffff'}, accent ${dto.accentColor || '#111111'}. `
      : '';
    try {
      return await this.generateImageDataUrl(
        `${stylePrompt}Central subject is: "${dto.prompt}". ${colorContext}Clean outline, no complex gradients or busy photo textures, isolated on pure solid white background, sharp vector sportswear sticker feel.`,
        '1:1',
      );
    } catch (error) {
      this.logger.warn(`Gemini logo image generation failed, fallback will be used: ${this.getErrorMessage(error)}`);
      return null;
    }
  }

  private async buildModelPreviewResult(dto: AiModelPreviewDto) {
    if (!this.hasGeminiKey()) {
      return { accepted: true, imageUrl: null, usedGemini: false };
    }

    const prompt = `${dto.prompt}

Critical icon placement rule: every logo, crest, badge, emblem, and decorative icon must stay in the exact same relative position, scale, spacing, and alignment as shown in the reference preview. Do not move icons to a different chest, sleeve, shoulder, collar, hem, or torso zone.`;
    const parts: GeminiPart[] = [{ text: prompt }];
    this.appendDataUrlPart(parts, dto.snap3d, 'Reference Image 1: 3D WebGL Mockup');
    this.appendDataUrlPart(parts, dto.snap2d, 'Reference Image 2: 2D Layout Blueprint');

    try {
      const imageUrl = await this.generateImageDataUrlFromParts(parts, '1:1');
      return { accepted: true, imageUrl, usedGemini: true };
    } catch (error) {
      this.logger.warn(`Gemini model preview failed: ${this.getErrorMessage(error)}`);
      return { accepted: true, imageUrl: null, usedGemini: false };
    }
  }

  private async buildFallbackDesignResult(dto: AiDesignDto) {
    const lowerPrompt = dto.prompt.toLowerCase();
    const isFire =
      lowerPrompt.includes('fire') ||
      lowerPrompt.includes('red') ||
      dto.prompt.includes('火') ||
      dto.prompt.includes('红') ||
      lowerPrompt.includes('phoenix');
    const isMinimal =
      lowerPrompt.includes('minimal') ||
      lowerPrompt.includes('white') ||
      dto.prompt.includes('极简') ||
      dto.prompt.includes('白');

    const palette = isFire
      ? {
          base: '#9a1010',
          secondary: '#130c0c',
          primary: '#ffbb00',
          hem: '#130c0c',
          text: 'PHOENIX',
          number: '08',
          keyword: 'flame',
          rationale: '高饱和烈焰红与炭黑形成强对抗视觉，适合强调速度、爆发和团队斗志。',
        }
      : isMinimal
        ? {
            base: '#f5f5f7',
            secondary: '#1c1c1e',
            primary: '#651fff',
            hem: '#1c1c1e',
            text: 'NEO-GRID',
            number: '01',
            keyword: 'hexagon',
            rationale: '冷白底色搭配深灰结构线和电光紫点缀，呈现克制、科技和高级运动感。',
          }
        : {
            base: '#1e3a8a',
            secondary: '#0f172a',
            primary: '#22c55e',
            hem: '#0f172a',
            text: 'AURORA',
            number: '23',
            keyword: 'star',
            rationale: '深蓝主色稳重清晰，荧光绿作为速度线点亮整体，让球衣更适合赛场识别。',
          };

    return {
      jerseyColors: {
        COLOUR_BASE: palette.base,
        COLOUR_SECONDARY: palette.secondary,
        COLOUR_PRIMARY: palette.primary,
        COLOUR_HEM: palette.hem,
      },
      colorsRationale: palette.rationale,
      texts: [
        {
          text: palette.text,
          fill: palette.secondary,
          fontFamily: 'American Captain',
          fontSize: 44,
          isCurved: true,
          curveValue: 30,
          leftRatio: 0.5,
          topRatio: 0.54,
        },
        {
          text: palette.number,
          fill: palette.primary,
          fontFamily: 'Athletic',
          fontSize: 66,
          isCurved: false,
          curveValue: 0,
          leftRatio: 0.5,
          topRatio: 0.72,
        },
      ],
      decals: [
        {
          role: 'primary_badge',
          libraryKeyword: palette.keyword,
          designIdea: '核心徽章用于强化球队精神符号，建议放在左胸或中心偏上位置。',
          imagenPrompt: `A clean sports emblem featuring ${palette.keyword}`,
          leftRatio: 0.33,
          topRatio: 0.42,
          scale: 0.65,
        },
        {
          role: 'brand_logo',
          libraryKeyword: 'shield',
          designIdea: '盾牌元素适合作为品牌识别，传递防守、秩序和团队凝聚力。',
          imagenPrompt: 'A minimalist high tech sportswear shield logo',
          leftRatio: 0.67,
          topRatio: 0.42,
          scale: 0.45,
        },
        {
          role: 'sponsor',
          libraryKeyword: 'star',
          designIdea: '星形横向标识适合胸前赞助位，增强冠军感和纪念属性。',
          imagenPrompt: 'A clean horizontal sports award motif featuring a tiny star',
          leftRatio: 0.5,
          topRatio: 0.33,
          scale: 0.55,
        },
      ],
      patterns: [
        {
          source: isMinimal ? 'preset' : 'generated_svg',
          patternId: isMinimal ? 'carbon_hexagon' : '',
          libraryKeyword: isMinimal ? 'hexagon' : 'flame',
          brief: isMinimal ? 'subtle technical hex mesh repeat' : 'flame speed shards repeat texture',
          designIdea: isMinimal
            ? '主身片加入轻量科技六边形暗纹，增强质感但不过分抢戏。'
            : '主身片叠加火焰速度碎片重复纹理，强化爆发感与进攻气质。',
          targetMode: 'parts',
          targetPartIds: ['COLOUR_BASE'],
          scale: isMinimal ? 0.95 : 1.1,
          angle: isMinimal ? 0 : 18,
          opacity: isMinimal ? 0.18 : 0.3,
          offsetX: 0,
          offsetY: 0,
          patternColor: isMinimal ? palette.primary : '#ffffff',
          bgColorMode: 'use_part_color',
        },
      ],
      explanation: `基于“${dto.prompt}”生成的球衣方案：先确定主色情绪，再用胸前文字、号码、底纹与徽章建立团队识别。`,
    };
  }

  private normalizeDesignResult(result: any, allowedRegionIds?: Set<string>) {
    if (
      !result?.jerseyColors ||
      !Array.isArray(result.texts) ||
      !Array.isArray(result.decals) ||
      !Array.isArray(result.patterns)
    ) {
      throw new BadRequestException('AI 返回的设计结构不完整');
    }

    const jerseyColors = Object.fromEntries(
      Object.entries(result.jerseyColors).filter(([regionId, color]) =>
        this.isHexColor(String(color)) &&
        (!allowedRegionIds || allowedRegionIds.has(regionId)),
      ),
    );
    if (
      !jerseyColors.COLOUR_BASE &&
      (!allowedRegionIds || allowedRegionIds.has('COLOUR_BASE'))
    ) {
      jerseyColors.COLOUR_BASE = '#f5f5f7';
    }

    return {
      jerseyColors,
      colorsRationale: result.colorsRationale || '',
      texts: result.texts.slice(0, 2).map((text) => ({
        text: String(text.text || 'TEAM').slice(0, 20),
        fill: text.fill || '#111111',
        fontFamily: text.fontFamily || 'American Captain',
        fontSize: Number(text.fontSize) || 44,
        isCurved: Boolean(text.isCurved),
        curveValue: Number(text.curveValue) || 0,
        leftRatio: Number(text.leftRatio) || 0.5,
        topRatio: Number(text.topRatio) || 0.6,
      })),
      decals: result.decals.slice(0, 3).map((decal) => ({
        role: decal.role || 'primary_badge',
        libraryKeyword: decal.libraryKeyword || 'star',
        designIdea: decal.designIdea || '',
        imagenPrompt: decal.imagenPrompt || `A clean sports emblem featuring ${decal.libraryKeyword || 'star'}`,
        leftRatio: Number(decal.leftRatio) || 0.5,
        topRatio: Number(decal.topRatio) || 0.42,
        scale: Number(decal.scale) || 0.6,
      })),
      patterns: result.patterns.slice(0, 2).map((pattern) => ({
        source: pattern.source === 'generated_svg' ? 'generated_svg' : 'preset',
        patternId: pattern.patternId || '',
        libraryKeyword: pattern.libraryKeyword || '',
        brief: String(pattern.brief || pattern.libraryKeyword || 'sports repeat texture').slice(
          0,
          120,
        ),
        designIdea: pattern.designIdea || '',
        targetMode: pattern.targetMode === 'parts' ? 'parts' : 'all',
        targetPartIds: Array.isArray(pattern.targetPartIds)
          ? pattern.targetPartIds.map((partId) => String(partId)).slice(0, 6)
          : [],
        scale: this.clampNumber(pattern.scale, 0.2, 3, 1),
        angle: this.clampNumber(pattern.angle, 0, 360, 0),
        opacity: this.clampNumber(pattern.opacity, 0.1, 1, 0.3),
        offsetX: this.clampNumber(pattern.offsetX, -200, 200, 0),
        offsetY: this.clampNumber(pattern.offsetY, -200, 200, 0),
        patternColor: pattern.patternColor || '#ffffff',
        bgColorMode: pattern.bgColorMode || 'use_part_color',
        url: pattern.url || null,
        name: pattern.name || '',
        category: pattern.category || '',
      })),
      explanation: result.explanation || '',
    };
  }

  private async resolveDesignPatterns(
    patterns: DesignPatternPlan[],
    dto: AiDesignDto,
    inferredPartIds: Set<string> = new Set(),
  ): Promise<DesignPatternPlan[]> {
    if (!Array.isArray(patterns) || !patterns.length) {
      return [];
    }

    const requestedPartIds = new Set((dto.availableColorParts || []).map((part) => part.id));
    const availablePartIds = inferredPartIds.size
      ? new Set(
          requestedPartIds.size
            ? Array.from(requestedPartIds).filter((partId) => inferredPartIds.has(partId))
            : Array.from(inferredPartIds),
        )
      : requestedPartIds;
    const availablePatterns = Array.isArray(dto.availablePatterns) ? dto.availablePatterns : [];
    const resolvedPatterns: DesignPatternPlan[] = [];

    for (const rawPattern of patterns) {
      const normalized = this.normalizePatternPlan(rawPattern, availablePartIds);
      if (!normalized) {
        continue;
      }

      if (normalized.source === 'preset') {
        const preset = this.findBestPatternPreset(
          availablePatterns,
          normalized.patternId,
          normalized.libraryKeyword,
          normalized.brief,
        );
        if (preset?.url) {
          normalized.patternId = preset.id;
          normalized.name = preset.name;
          normalized.category = preset.category;
          normalized.url = preset.url;
          if (!normalized.libraryKeyword) {
            normalized.libraryKeyword = preset.keywords?.[0] || preset.name || preset.id;
          }
        } else {
          normalized.source = 'generated_svg';
        }
      }

      if (normalized.source === 'generated_svg') {
        try {
          normalized.url = await this.generatePatternSvgDataUrl(normalized, dto);
        } catch (error) {
          this.logger.warn(
            `Pattern SVG generation failed, trying preset fallback: ${this.getErrorMessage(error)}`,
          );
          const fallbackPreset = this.findBestPatternPreset(
            availablePatterns,
            normalized.patternId,
            normalized.libraryKeyword,
            normalized.brief,
          );
          if (fallbackPreset?.url) {
            normalized.source = 'preset';
            normalized.patternId = fallbackPreset.id;
            normalized.name = fallbackPreset.name;
            normalized.category = fallbackPreset.category;
            normalized.url = fallbackPreset.url;
          } else {
            continue;
          }
        }
      }

      if (normalized.url) {
        resolvedPatterns.push(normalized);
      }
    }

    return resolvedPatterns.slice(0, 2);
  }

  private normalizePatternPlan(
    pattern: DesignPatternPlan,
    availablePartIds: Set<string>,
  ): DesignPatternPlan | null {
    if (!pattern || !pattern.brief) {
      return null;
    }

    const targetMode = pattern.targetMode === 'parts' ? 'parts' : 'all';
    const filteredPartIds =
      targetMode === 'parts'
        ? (Array.isArray(pattern.targetPartIds) ? pattern.targetPartIds : []).filter((partId) =>
            availablePartIds.has(partId),
          )
        : [];

    return {
      source: pattern.source === 'generated_svg' ? 'generated_svg' : 'preset',
      patternId: pattern.patternId || '',
      libraryKeyword: pattern.libraryKeyword || '',
      brief: String(pattern.brief).slice(0, 120),
      designIdea: pattern.designIdea || '',
      targetMode: filteredPartIds.length > 0 ? targetMode : 'all',
      targetPartIds: filteredPartIds.length > 0 ? filteredPartIds : [],
      scale: this.clampNumber(pattern.scale, 0.2, 3, 1),
      angle: this.clampNumber(pattern.angle, 0, 360, 0),
      opacity: this.clampNumber(pattern.opacity, 0.1, 1, 0.3),
      offsetX: this.clampNumber(pattern.offsetX, -200, 200, 0),
      offsetY: this.clampNumber(pattern.offsetY, -200, 200, 0),
      patternColor: this.isHexColor(pattern.patternColor) ? pattern.patternColor : '#ffffff',
      bgColorMode: pattern.bgColorMode || 'use_part_color',
    };
  }

  private findBestPatternPreset(
    patterns: AvailablePatternOption[],
    patternId?: string,
    libraryKeyword?: string,
    brief?: string,
  ) {
    if (!Array.isArray(patterns) || !patterns.length) {
      return null;
    }

    const normalizedId = (patternId || '').toLowerCase();
    if (normalizedId) {
      const directMatch = patterns.find((pattern) => pattern.id.toLowerCase() === normalizedId);
      if (directMatch) {
        return directMatch;
      }
    }

    const haystack = `${libraryKeyword || ''} ${brief || ''}`.toLowerCase();
    if (!haystack.trim()) {
      return patterns[0];
    }

    let best: AvailablePatternOption | null = null;
    let bestScore = -1;
    for (const pattern of patterns) {
      const terms = [
        pattern.id,
        pattern.name || '',
        pattern.category || '',
        ...(Array.isArray(pattern.keywords) ? pattern.keywords : []),
      ]
        .filter(Boolean)
        .map((term) => term.toLowerCase());
      const score = terms.reduce((acc, term) => (haystack.includes(term) ? acc + 1 : acc), 0);
      if (score > bestScore) {
        best = pattern;
        bestScore = score;
      }
    }
    return bestScore > 0 ? best : null;
  }

  private async generatePatternSvgDataUrl(pattern: DesignPatternPlan, dto: AiDesignDto) {
    if (!this.hasGeminiKey()) {
      throw new Error('Gemini key missing for pattern generation');
    }

    const partSummary = pattern.targetPartIds.length
      ? pattern.targetPartIds.join(', ')
      : 'all editable garment panels';
    const prompt = `Act as an expert seamless SVG pattern designer for sportswear printing.

Create a repeatable SVG tile pattern for a ${dto.productType || 'sportswear'} garment.
Pattern brief: ${pattern.brief}.
Chinese design idea: ${pattern.designIdea || '运动感重复底纹'}.
Target garment panels: ${partSummary}.
Preferred pattern keyword: ${pattern.libraryKeyword || 'sports texture'}.
Preferred foreground color: ${pattern.patternColor || '#ffffff'}.

Constraints:
- Do not render any text, letters, numbers, or Chinese characters.
- Output ONLY valid raw SVG XML, no markdown.
- Use one <svg> root with xmlns="http://www.w3.org/2000/svg", width="256", height="256", viewBox="0 0 256 256".
- Transparent background only.
- Design must work as a repeating tile for jersey fabric.
- Use 1 to 3 colors maximum, with crisp vector paths and simple geometry.
- Avoid text, logos, mascots, photos, filters, masks, or raster images.
- Prefer angular, sporty, repeat-friendly forms such as camo shards, lightning streaks, speed lines, mesh, halftone, chevrons, grids, or geometric motion cues.
- Keep elements balanced near tile edges so repeated tiling feels natural.
- No external assets, scripts, CSS, or embedded images.`;

    const response = await this.generateGeminiContent(GEMINI_TEXT_MODEL, [{ text: prompt }], {
      maxOutputTokens: 4096,
    });
    const svg = this.sanitizeSvg(this.extractText(response));
    const base64 = Buffer.from(svg, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  }

  private clampNumber(value: unknown, min: number, max: number, fallback: number) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, num));
  }

  private isHexColor(value?: string) {
    return typeof value === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value);
  }

  private pickKeyword(prompt: string) {
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('lion') || prompt.includes('狮')) return 'lion';
    if (lowerPrompt.includes('eagle') || prompt.includes('鹰')) return 'eagle';
    if (lowerPrompt.includes('dragon') || prompt.includes('龙')) return 'dragon';
    if (lowerPrompt.includes('wolf') || prompt.includes('狼')) return 'wolf';
    if (lowerPrompt.includes('fire') || prompt.includes('火')) return 'flame';
    if (lowerPrompt.includes('shield') || prompt.includes('盾')) return 'shield';
    if (lowerPrompt.includes('star') || prompt.includes('星')) return 'star';
    return 'star';
  }

  private async getLocalMatches(keyword: string, limit: number) {
    const queryResult = await this.resourcesService.findAll({
      search: keyword,
      limit,
      page: 1,
    });

    return queryResult.items.map((item) => ({
      id: item.id,
      name: item.name,
      svgContent: item.svgContent,
      relativePath: item.relativePath,
      svgUrl: `${process.env.RESOURCE_BASE_URL || 'http://localhost:3000'}/resources/${item.relativePath}`,
    }));
  }

  private async generateImageDataUrl(prompt: string, aspectRatio: string) {
    return this.imageGenerationService.generateImage(prompt, aspectRatio);
  }

  private async generateImageDataUrlFromParts(parts: GeminiPart[], aspectRatio: string) {
    const response = await this.generateGeminiContent(GEMINI_IMAGE_MODEL, parts, {
      imageConfig: { aspectRatio },
    });
    const imagePart = this.extractImagePart(response);
    await this.saveDebugImage(imagePart.data, imagePart.mimeType);
    return `data:${imagePart.mimeType};base64,${imagePart.data}`;
  }

  private async generateSvgDataUrl(subjectPrompt: string, kind: 'badge' | 'logo') {
    const prompt = `Act as an expert SVG designer. Generate a responsive, modern, and highly detailed SVG ${kind} for sportswear printing.

Subject:
${subjectPrompt}

Constraints & Code Requirements:
- Output ONLY valid, raw, unwrapped XML SVG code. No explanations, no markdown wrapper, no \`\`\`xml.
- Use a single <svg> root with xmlns="http://www.w3.org/2000/svg", viewBox="0 0 800 800", width="800", height="800", preserveAspectRatio="xMidYMid meet".
- Transparent background: do not draw a background rectangle, checkerboard, white square, or solid backdrop.
- Use clean semantic elements: <defs>, <linearGradient>, <radialGradient>, <g>, <path>, <circle>, <ellipse>, <polygon>, <line>, and <text> only.
- Group logical parts using <g> with clean id attributes such as id="outer-shield", id="main-mascot", id="accent-lines", id="highlights", id="typography".
- Use vector-friendly math: precise cubic bezier curves for smooth organic shapes and dynamic sports-logo silhouettes.
- Create a rich layered emblem, not a simple icon: include 12 to 30 visible vector elements, layered highlights, contour strokes, internal detail lines, and 2 to 4 gradient definitions.
- Keep it practical for Fabric.js and jersey printing: no raster images, no embedded base64, no external links, no scripts, no animations, no CSS imports, no filters, no masks.
- Use the provided jersey colors when present, plus darker/lighter accent variants. Keep contrast strong on fabric.
- Center the artwork with padding and make it look like a professional badge/logo decal for the chest of a jersey.`;

    const response = await this.generateGeminiContent(GEMINI_TEXT_MODEL, [{ text: prompt }], {
      maxOutputTokens: 8192,
    });
    const svg = this.sanitizeSvg(this.extractText(response));
    const base64 = Buffer.from(svg, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  }

  private sanitizeSvg(text: string) {
    const svg = this.extractSvgMarkup(text);
    if (!svg) {
      throw new Error('Gemini did not return SVG markup');
    }

    let sanitized = svg
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '')
      .replace(/\s(?:href|xlink:href)=["'](?:https?:|data:|javascript:)[^"']*["']/gi, '')
      .trim();

    if (!/xmlns=/.test(sanitized)) {
      sanitized = sanitized.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    return sanitized;
  }

  private extractSvgMarkup(text: string) {
    const normalized = text
      .trim()
      .replace(/^```(?:svg|xml)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const match = normalized.match(/<svg[\s\S]*?<\/svg>/i);
    return match?.[0] || null;
  }

  private async saveDebugImage(base64Data: string, mimeType: string) {
    try {
      const extension = this.getImageExtension(mimeType);
      const safeModel = GEMINI_IMAGE_MODEL.replace(/[^\w.-]/g, '_');
      const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeModel}.${extension}`;
      const debugDir = path.resolve(process.cwd(), AI_IMAGE_DEBUG_DIR);
      const filePath = path.join(debugDir, fileName);

      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
      this.logger.log(`Saved Gemini image debug file: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Failed to save Gemini image debug file: ${this.getErrorMessage(error)}`);
    }
  }

  private getImageExtension(mimeType: string) {
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    return 'png';
  }

  private async generateGeminiContent(model: string, parts: GeminiPart[], config: Record<string, unknown> = {}) {
    if (!this.hasGeminiKey()) {
      throw new BadRequestException('后端未配置 GEMINI_API_KEY');
    }

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: config,
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.error?.message || `Gemini request failed: ${response.status}`);
    }

    return body;
  }

  private extractText(response: any) {
    const text = response?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!text) {
      throw new Error('Gemini 未返回文本结果');
    }

    return text;
  }

  private parseGeminiJsonObject(text: string) {
    const normalized = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const jsonText = this.extractFirstJsonObject(normalized) || normalized;

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      const preview = jsonText.replace(/\s+/g, ' ').slice(0, 1500);
      throw new Error(`${this.getErrorMessage(error)}. Gemini JSON preview: ${preview}`);
    }
  }

  private extractFirstJsonObject(text: string) {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }

    return null;
  }

  private extractImagePart(response: any) {
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      throw new Error('Gemini 未返回图片结果');
    }

    return {
      data: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
    };
  }

  private appendDataUrlPart(parts: GeminiPart[], dataUrl: string | undefined, label: string) {
    if (!dataUrl) return;
    const base64Index = dataUrl.indexOf(';base64,');
    if (base64Index === -1) return;

    const mimeType = dataUrl.substring(5, base64Index) || 'image/png';
    const data = dataUrl.substring(base64Index + 8);
    parts.push({ text: `[${label}]` });
    parts.push({ inlineData: { data, mimeType } });
  }

  private hasGeminiKey() {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  }

  private hasImageGenerationConfig() {
    const provider = (process.env.IMAGE_GENERATION_PROVIDER || 'gemini').toLowerCase();
    if (provider === 'comfyui') {
      return Boolean(process.env.COMFYUI_WORKFLOW_PATH?.trim());
    }
    if (provider === 'gemini') {
      return this.hasGeminiKey();
    }
    return true;
  }

  private hasZhipuKey() {
    return Boolean(process.env.ZHIPUAI_API_KEY?.trim() && process.env.ZHIPU_MODEL?.trim());
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
