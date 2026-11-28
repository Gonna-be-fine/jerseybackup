import { JerseyDesignOutputSchema } from './jersey-design.schema';

describe('JerseyDesignOutputSchema', () => {
  it('accepts a complete normalized design proposal', () => {
    const result = JerseyDesignOutputSchema.parse({
      jerseyColors: {
        COLOUR_BASE: '#111111',
        COLOUR_PRIMARY: '#D4AF37',
      },
      colorsRationale: '黑金配色突出力量感',
      texts: [{
        text: 'KING',
        fill: '#D4AF37',
        fontFamily: 'American Captain',
        fontSize: 48,
        isCurved: false,
        curveValue: 0,
        leftRatio: 0.5,
        topRatio: 0.55,
      }],
      decals: [{
        role: 'primary_badge',
        libraryKeyword: 'lion',
        designIdea: '狮子徽章',
        imagenPrompt: 'A gold lion sports emblem',
        leftRatio: 0.3,
        topRatio: 0.4,
        scale: 0.6,
      }],
      patterns: [{
        source: 'generated_svg',
        brief: 'Diagonal flame texture',
        targetMode: 'parts',
        targetPartIds: ['COLOUR_BASE'],
        scale: 1,
        angle: 20,
        opacity: 0.3,
      }],
      explanation: '黑金速度风格',
    });

    expect(result.jerseyColors.COLOUR_BASE).toBe('#111111');
  });

  it('rejects invalid colors and out-of-range placement ratios', () => {
    const result = JerseyDesignOutputSchema.safeParse({
      jerseyColors: { COLOUR_BASE: 'black' },
      texts: [{
        text: 'KING',
        fill: '#D4AF37',
        fontSize: 48,
        isCurved: false,
        curveValue: 0,
        leftRatio: 1.5,
        topRatio: 0.5,
      }],
      decals: [],
      patterns: [],
    });

    expect(result.success).toBe(false);
  });
});
