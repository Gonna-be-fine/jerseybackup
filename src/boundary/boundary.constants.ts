export const COLOR_REGION_METADATA: Record<
  string,
  { name: string; ename: string }
> = {
  COLOUR_BASE: { name: '基础色', ename: 'Base Color' },
  COLOUR_SECONDARY: {
    name: '肩部与袖子',
    ename: 'Shoulder & Sleeves',
  },
  COLOUR_PRIMARY: { name: '辅助色', ename: 'Accent Color' },
  COLOUR_HEM: { name: '下摆边色', ename: 'Hem Color' },
  COLOUR_BASE_REVERSE: {
    name: '背面基础色',
    ename: 'Reverse Base Color',
  },
  COLOUR_SECONDARY_REVERSE: {
    name: '背面肩部与袖子',
    ename: 'Reverse Shoulder & Sleeves',
  },
  COLOUR_PRIMARY_REVERSE: {
    name: '背面辅助色',
    ename: 'Reverse Accent Color',
  },
  COLOUR_TERTIARY: {
    name: '第三颜色',
    ename: 'Tertiary Color',
  },
};

export const TEXT_GROUP_PURPOSE: Record<string, string> = {
  NUMBER_FRONT_GROUP: '正面号码',
  NUMBER_BACK_GROUP: '背面号码',
  PLAYER_NAME_GROUP: '球员名字',
  TEAM_NAME_GROUP: '队伍名称',
};

/**
 * productType -> SVG filename.
 * Add a mapping here when a new product template is placed in sources/boundry.
 */
export const BOUNDARY_TEMPLATE_FILES: Record<string, string> = {
  basketball: 'basketball-jersey.svg',
};
