/**
 * Categorical and sequential colour series for analytics and card artwork.
 *
 * tokens-ignore-file: colour series are data, not design decisions. A
 * categorical ramp is chosen for perceptual separation across N series, and the
 * heat-map scale is a contribution ramp with its own dark counterpart; naming
 * 40 token slots (`--pi-color-series-17`) would add vocabulary without adding
 * meaning. What the token contract requires is that such literals live in ONE
 * place instead of being scattered through components — which is what this
 * module is for. Everything else colour-related in the app reads tokens.
 */

/** Ten-hue categorical ramp: pie/donut charts, tag distribution, legends. */
export const CATEGORICAL_SERIES: string[] = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#08AEEA',
  '#2AF598',
  '#4FACFE',
  '#FF9A8B',
  '#FF6A88',
  '#A9C9FF',
  '#FEE140',
];

/** Two-stop gradients for note/blog card artwork, indexed by card id. */
export const CARD_GRADIENTS: [string, string][] = [
  ['#FF6B6B', '#4ECDC4'],
  ['#764BA2', '#667EEA'],
  ['#2E3192', '#1BFFFF'],
  ['#6B73FF', '#000DFF'],
  ['#FC466B', '#3F5EFB'],
  ['#11998E', '#38EF7D'],
  ['#536976', '#292E49'],
  ['#4776E6', '#8E54E9'],
  ['#1A2980', '#26D0CE'],
  ['#4B134F', '#C94B4B'],
];

/**
 * Three-stop gradients for the analytics stat cards, written as utilities.
 *
 * These are Tailwind arbitrary-value classes, so the values stay in the class
 * string; kept here so the rotation lives with the other series.
 */
export const STAT_CARD_GRADIENTS: string[] = [
  'from-[#FF6B6B] via-[#4ECDC4] to-[#45B7D1]',
  'from-[#08AEEA] via-[#2AF598] to-[#4FACFE]',
  'from-[#FF9A8B] via-[#FF6A88] to-[#FF99AC]',
  'from-[#A9C9FF] via-[#FFBBEC] to-[#F3A0F7]',
  'from-[#21D4FD] via-[#2876F9] to-[#B721FF]',
  'from-[#FEE140] via-[#FA709A] to-[#FF8177]',
];

/**
 * Colour presets offered when creating plan categories. Stored per category in
 * the database (`color` column), so the values are persisted data: renaming or
 * re-ordering the keys is safe, changing a value repaints existing categories.
 */
export const CATEGORY_COLOR_PRESETS: { key: string; value: string }[] = [
  { key: 'teal', value: '#20808D' },
  { key: 'cyan', value: '#1FB8CD' },
  { key: 'ink', value: '#091717' },
  { key: 'amber', value: '#B4791E' },
  { key: 'rose', value: '#B4426B' },
  { key: 'violet', value: '#6D5AE6' },
  { key: 'green', value: '#2F7D5B' },
  { key: 'slate', value: '#5A6B7B' },
];

/** Contribution heat-map scale, lightest → densest, per theme. */
export const HEATMAP_SCALE: { light: string[]; dark: string[] } = {
  light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
};
