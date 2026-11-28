import { z } from 'zod';

const HexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

const TextElementSchema = z.object({
  text: z.string().min(1).max(20),
  fill: HexColorSchema,
  fontFamily: z
    .enum(['American Captain', 'Athletic', 'Komikazoom', 'Hardsign', 'summber-bike'])
    .optional(),
  fontSize: z.number().positive().max(200),
  isCurved: z.boolean(),
  curveValue: z.number(),
  leftRatio: z.number().min(0).max(1),
  topRatio: z.number().min(0).max(1),
});

const DecalSchema = z.object({
  role: z.string().min(1).max(64),
  libraryKeyword: z.string().max(100).optional(),
  designIdea: z.string().max(500),
  imagenPrompt: z.string().min(1).max(1000),
  leftRatio: z.number().min(0).max(1),
  topRatio: z.number().min(0).max(1),
  scale: z.number().positive().max(2),
});

const PatternSchema = z.object({
  source: z.enum(['preset', 'generated_svg']),
  patternId: z.string().optional(),
  libraryKeyword: z.string().max(100).optional(),
  brief: z.string().min(1).max(120),
  designIdea: z.string().max(500).optional(),
  targetMode: z.enum(['all', 'parts']),
  targetPartIds: z.array(z.string().min(1)).max(12),
  scale: z.number().positive().max(3),
  angle: z.number().min(0).max(360),
  opacity: z.number().min(0).max(1),
  offsetX: z.number().min(-200).max(200).optional(),
  offsetY: z.number().min(-200).max(200).optional(),
  patternColor: HexColorSchema.optional(),
  bgColorMode: z.string().max(64).optional(),
});

export const JerseyDesignOutputSchema = z.object({
  jerseyColors: z.record(z.string(), HexColorSchema),
  colorsRationale: z.string().max(1000).optional(),
  texts: z.array(TextElementSchema).max(2),
  decals: z.array(DecalSchema).max(3),
  patterns: z.array(PatternSchema).max(2),
  explanation: z.string().max(2000).optional(),
});

export type JerseyDesignOutput = z.infer<typeof JerseyDesignOutputSchema>;
