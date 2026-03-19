import chalk from 'chalk';

type ThemeName = 'blue-violet' | 'teal-lime' | 'copper-rose';

interface LogoRow {
  leadingSpaces: number;
  segments: [string, string, string, string, string];
  gaps: [number, number, number, number];
}

interface LogoTheme {
  name: ThemeName;
  title: string;
  subtitle: string;
  colors: [string, string, string, string, string];
}

const FROZEN_LOGO_ROWS: LogoRow[] = [
  {
    leadingSpaces: 1,
    segments: ['█████╗', '███████╗', '█████╗', '██████╗', '█████╗'],
    gaps: [2, 3, 2, 3],
  },
  {
    leadingSpaces: 0,
    segments: ['██╔══██╗', '██╔════╝', '██╔══██╗', '██╔══██╗', '██╔══██╗'],
    gaps: [1, 2, 1, 1],
  },
  {
    leadingSpaces: 0,
    segments: ['███████║', '██║  ███╗', '██║  ██║', '██████╔╝', '███████║'],
    gaps: [1, 1, 1, 1],
  },
  {
    leadingSpaces: 0,
    segments: ['██╔══██║', '██║   ██║', '██║  ██║', '██╔══██╗', '██╔══██║'],
    gaps: [1, 1, 1, 1],
  },
  {
    leadingSpaces: 0,
    segments: ['██║  ██║', '╚██████╔╝', '╚█████╔╝', '██║  ██║', '██║  ██║'],
    gaps: [1, 1, 1, 1],
  },
  {
    leadingSpaces: 0,
    segments: ['╚═╝  ╚═╝', '╚═════╝', '╚════╝', '╚═╝  ╚═╝', '╚═╝  ╚═╝'],
    gaps: [2, 3, 2, 1],
  },
];

const THEMES: LogoTheme[] = [
  {
    name: 'blue-violet',
    title: 'Blue to Violet',
    subtitle: 'Closest to the modern AI CLI look',
    colors: ['#59B7FF', '#7B8CFF', '#A879FF', '#C77FEA', '#D97DCE'],
  },
  {
    name: 'teal-lime',
    title: 'Teal to Lime',
    subtitle: 'Most distinct from other AI tool brands',
    colors: ['#59C7FF', '#4FD1B5', '#74C95B', '#92D643', '#B3E23A'],
  },
  {
    name: 'copper-rose',
    title: 'Copper to Rose',
    subtitle: 'Warmer and more tool-brand oriented',
    colors: ['#F0A178', '#E48D6E', '#D37B78', '#C9758F', '#C370A8'],
  },
];

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const PLAIN_ROWS = FROZEN_LOGO_ROWS.map(renderPlainRow);
const VISIBLE_COLUMNS = getVisibleColumns(PLAIN_ROWS);
const VISIBLE_COLUMN_INDEX = new Map(VISIBLE_COLUMNS.map((column, index) => [column, index]));
const SHADOW_OFFSET_X = 2;
const SHADOW_OFFSET_Y = 1;

function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function interpolateColor(start: RgbColor, end: RgbColor, factor: number): RgbColor {
  return {
    r: Math.round(start.r + (end.r - start.r) * factor),
    g: Math.round(start.g + (end.g - start.g) * factor),
    b: Math.round(start.b + (end.b - start.b) * factor),
  };
}

function darkenColor(color: RgbColor, factor: number): RgbColor {
  return {
    r: Math.max(0, Math.round(color.r * factor)),
    g: Math.max(0, Math.round(color.g * factor)),
    b: Math.max(0, Math.round(color.b * factor)),
  };
}

function getGradientColor(colors: LogoTheme['colors'], position: number): RgbColor {
  const palette = colors.map(hexToRgb);
  const segmentCount = palette.length - 1;
  const scaled = position * segmentCount;
  const index = Math.min(Math.floor(scaled), segmentCount - 1);
  const factor = scaled - index;

  return interpolateColor(palette[index], palette[index + 1], factor);
}

function renderPlainRow(row: LogoRow): string {
  return (
    ' '.repeat(row.leadingSpaces) +
    row.segments[0] +
    ' '.repeat(row.gaps[0]) +
    row.segments[1] +
    ' '.repeat(row.gaps[1]) +
    row.segments[2] +
    ' '.repeat(row.gaps[2]) +
    row.segments[3] +
    ' '.repeat(row.gaps[3]) +
    row.segments[4]
  );
}

function getVisibleColumns(rows: string[]): number[] {
  const columns = new Set<number>();

  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (row[index] === ' ') {
        continue;
      }

      columns.add(index);
    }
  }

  return [...columns].sort((a, b) => a - b);
}

function getColumnGradientColor(colors: LogoTheme['colors'], column: number): RgbColor {
  const visibleIndex = VISIBLE_COLUMN_INDEX.get(column);

  if (visibleIndex === undefined) {
    return getGradientColor(colors, 0);
  }

  const span = Math.max(1, VISIBLE_COLUMNS.length - 1);
  const position = visibleIndex / span;
  return getGradientColor(colors, position);
}

function renderTheme(theme: LogoTheme): string {
  const header = chalk.bold(theme.title);
  const meta = chalk.dim(`${theme.name}  •  ${theme.subtitle}`);
  const rows = renderLogoWithShadow(PLAIN_ROWS, theme.colors).join('\n');

  return `${header}\n${meta}\n\n${rows}`;
}

function renderLogoWithShadow(rows: string[], colors: LogoTheme['colors']): string[] {
  const width = Math.max(...rows.map((row) => row.length)) + SHADOW_OFFSET_X;
  const height = rows.length + SHADOW_OFFSET_Y;
  const output: string[] = [];
  const frontMask = new Set<string>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let column = 0; column < row.length; column += 1) {
      if (row[column] !== ' ') {
        frontMask.add(`${rowIndex}:${column}`);
      }
    }
  }

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    let rendered = '';

    for (let column = 0; column < width; column += 1) {
      const frontChar = rows[rowIndex]?.[column] ?? ' ';
      const shadowSourceRow = rowIndex - SHADOW_OFFSET_Y;
      const shadowSourceColumn = column - SHADOW_OFFSET_X;
      const shadowChar = rows[shadowSourceRow]?.[shadowSourceColumn] ?? ' ';

      if (frontChar !== ' ') {
        const color = getColumnGradientColor(colors, column);
        rendered += chalk.rgb(color.r, color.g, color.b)(frontChar);
        continue;
      }

      if (shadowChar !== ' ' && shouldRenderShadow(frontMask, rowIndex, column)) {
        const shadowColor = darkenColor(getColumnGradientColor(colors, shadowSourceColumn), 0.38);
        rendered += chalk.rgb(shadowColor.r, shadowColor.g, shadowColor.b)(shadowChar);
        continue;
      }

      rendered += ' ';
    }

    output.push(rendered.replace(/\s+$/u, ''));
  }

  return output;
}

function shouldRenderShadow(frontMask: Set<string>, rowIndex: number, column: number): boolean {
  const blockers: Array<[number, number]> = [
    [rowIndex, column],
    [rowIndex, column - 1],
    [rowIndex, column - 2],
    [rowIndex - 1, column],
    [rowIndex - 1, column - 1],
    [rowIndex - 1, column - 2],
  ];

  return !blockers.some(([row, col]) => frontMask.has(`${row}:${col}`));
}

function printHelp(): void {
  const themeList = THEMES.map((theme) => `- ${theme.name}`).join('\n');
  console.log(`Usage:
  pnpm logo:preview
  pnpm logo:preview -- --theme <name>

Available themes:
${themeList}`);
}

function parseRequestedTheme(argv: string[]): ThemeName | null {
  const themeIndex = argv.findIndex((arg) => arg === '--theme');

  if (themeIndex === -1) {
    return null;
  }

  const candidate = argv[themeIndex + 1];
  if (!candidate) {
    throw new Error('Missing value for --theme');
  }

  if (!THEMES.some((theme) => theme.name === candidate)) {
    throw new Error(`Unknown theme: ${candidate}`);
  }

  return candidate as ThemeName;
}

function main(): void {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const requestedTheme = parseRequestedTheme(process.argv.slice(2));
  const themes = requestedTheme
    ? THEMES.filter((theme) => theme.name === requestedTheme)
    : THEMES;

  console.log(chalk.bold('Agora Logo Preview'));
  console.log(chalk.dim('Frozen glyph layout with smoother glyph-only gradient and shadow.'));
  console.log('');

  for (const [index, theme] of themes.entries()) {
    console.log(renderTheme(theme));

    if (index < themes.length - 1) {
      console.log(`\n${chalk.dim('─'.repeat(72))}\n`);
    }
  }
}

main();
