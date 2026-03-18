import { loadGroundingConfig, shouldUseGrounding } from '@/lib/config/grounding';
import type { OpenRouterClient } from '@/lib/orchestrator/types';

type GroundingEnv = Readonly<Record<string, string | undefined>>;

export interface GroundingSource {
  title: string;
  url: string;
  snippet: string;
}

export interface GroundingSearchClient {
  search(params: {
    query: string;
    maxResults: number;
    timeoutMs: number;
  }): Promise<GroundingSource[]>;
}

export interface GroundingContextResult {
  used: boolean;
  skippedReason: 'disabled' | 'not_needed' | 'unavailable' | null;
  searchedAt: string | null;
  provider: string | null;
  summaryModel: string | null;
  sources: GroundingSource[];
  brief: string;
  errorMessage: string | null;
}

export function createGroundingContextResult(
  overrides: Partial<GroundingContextResult> = {}
): GroundingContextResult {
  return {
    used: false,
    skippedReason: 'not_needed',
    searchedAt: null,
    provider: null,
    summaryModel: null,
    sources: [],
    brief: '',
    errorMessage: null,
    ...overrides,
  };
}

export function createDefaultGroundingSearchClient(params?: {
  fetchImpl?: typeof globalThis.fetch;
}): GroundingSearchClient {
  const fetchImpl = params?.fetchImpl ?? globalThis.fetch;

  return {
    async search({ query, maxResults, timeoutMs }) {
      const controller = new globalThis.AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
          {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; AgoraBot/0.1; +https://github.com/raysonmeng/agora)',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`DuckDuckGo search failed with status ${response.status}`);
        }

        const html = await response.text();
        return parseDuckDuckGoHtmlResults(html).slice(0, maxResults);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`DuckDuckGo search timed out after ${timeoutMs}ms`, { cause: error });
        }

        throw error;
      } finally {
        clearTimeout(timeoutHandle);
      }
    },
  };
}

export async function prepareGroundingContext(params: {
  topic: string;
  scenario: 'ask' | 'council';
  defaultModel: string;
  client: OpenRouterClient;
  env?: GroundingEnv;
  searchClient?: GroundingSearchClient;
  now?: () => Date;
}): Promise<GroundingContextResult> {
  const config = loadGroundingConfig(params.env);

  if (!shouldUseGrounding({ topic: params.topic, scenario: params.scenario, config })) {
    return createGroundingContextResult({
      skippedReason: config.mode === 'off' ? 'disabled' : 'not_needed',
    });
  }

  const searchClient = params.searchClient ?? createDefaultGroundingSearchClient();
  const searchedAt = (params.now ?? (() => new Date()))().toISOString();
  const summaryModel = config.summaryModel ?? params.defaultModel;

  try {
    const sources = await searchClient.search({
      query: params.topic,
      maxResults: config.maxResults,
      timeoutMs: config.timeoutMs,
    });

    if (sources.length === 0) {
      return createGroundingContextResult({
        skippedReason: 'unavailable',
        searchedAt,
        provider: config.provider,
        summaryModel,
        errorMessage: 'No web search results were returned.',
      });
    }

    const brief = await summarizeGroundingSources({
      topic: params.topic,
      searchedAt,
      sources,
      model: summaryModel,
      client: params.client,
      timeoutMs: config.timeoutMs,
    });

    return {
      used: true,
      skippedReason: null,
      searchedAt,
      provider: config.provider,
      summaryModel,
      sources,
      brief,
      errorMessage: null,
    };
  } catch (error) {
    return createGroundingContextResult({
      skippedReason: 'unavailable',
      searchedAt,
      provider: config.provider,
      summaryModel,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export function buildAskGroundingMessages(params: {
  question: string;
  grounding: GroundingContextResult;
}): Array<{ role: 'system' | 'user'; content: string }> {
  if (!params.grounding.used) {
    return [
      {
        role: 'user',
        content: params.question.trim(),
      },
    ];
  }

  return [
    {
      role: 'system',
      content: [
        '你会先阅读一份联网检索背景简报，再回答用户问题。',
        '如果问题涉及最新事实、新闻、价格、战争、政策或其他时效性信息，优先使用简报中的信息。',
        '不要编造简报中不存在的事实；如果简报不足以支持强结论，明确说不确定。',
        '如果引用简报事实，尽量保留 [1] [2] 这样的来源标记。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `问题：${params.question.trim()}`,
        '',
        `联网背景简报（抓取时间 ${params.grounding.searchedAt ?? 'unknown'}）：`,
        params.grounding.brief,
      ].join('\n'),
    },
  ];
}

export function buildConsensusGroundingRoleDescription(
  grounding: GroundingContextResult
): string {
  if (!grounding.used) {
    return '';
  }

  return [
    '',
    '在开始回答前，请先阅读以下联网背景简报，用它来拉齐事实背景。',
    '如果简报与既有印象冲突，优先采用简报中带来源的事实；如果简报不充分，必须主动说明不确定性。',
    `联网背景简报（抓取时间 ${grounding.searchedAt ?? 'unknown'}）：`,
    grounding.brief,
  ].join('\n');
}

export function formatGroundingSourcesForCli(
  grounding: GroundingContextResult,
  limit = 3
): string[] {
  if (!grounding.used) {
    return [];
  }

  return grounding.sources.slice(0, limit).map((source, index) => {
    return `[grounding:${index + 1}] ${source.title} - ${source.url}`;
  });
}

export function parseDuckDuckGoHtmlResults(html: string): GroundingSource[] {
  const results: GroundingSource[] = [];
  const pattern =
    /<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?(?:<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>)?/g;

  for (const match of html.matchAll(pattern)) {
    const rawUrl = match[1];
    const title = normalizeHtmlText(match[2]);
    const snippet = normalizeHtmlText(match[3] ?? '');
    const url = decodeDuckDuckGoRedirectUrl(rawUrl);

    if (!title || !url) {
      continue;
    }

    results.push({
      title,
      url,
      snippet,
    });
  }

  return dedupeSources(results);
}

function dedupeSources(sources: GroundingSource[]): GroundingSource[] {
  const seen = new Set<string>();

  return sources.filter((source) => {
    if (seen.has(source.url)) {
      return false;
    }

    seen.add(source.url);
    return true;
  });
}

async function summarizeGroundingSources(params: {
  topic: string;
  searchedAt: string;
  sources: GroundingSource[];
  model: string;
  client: OpenRouterClient;
  timeoutMs: number;
}): Promise<string> {
  const fallback = buildFallbackGroundingBrief(params);

  try {
    const completion = await params.client.complete({
      model: params.model,
      temperature: 0,
      timeoutMs: params.timeoutMs,
      messages: [
        {
          role: 'system',
          content: [
            '你是一名事实背景研究助理。',
            '你会收到若干条联网搜索结果，请仅基于这些结果生成一份中文背景简报。',
            '不要添加任何搜索结果中没有出现的新事实。',
            '输出必须是纯文本，不要用 markdown 标题级别。',
            '请优先产出：',
            '1. 3 到 6 条事实背景要点，每条尽量带 [1] [2] 这样的来源编号。',
            '2. 1 条“不确定性/冲突点”说明。',
            '3. 末尾用“来源：”列出编号与链接。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `问题主题：${params.topic}`,
            `抓取时间：${params.searchedAt}`,
            '',
            '搜索结果：',
            ...params.sources.map((source, index) =>
              [
                `[${index + 1}] ${source.title}`,
                `URL: ${source.url}`,
                `摘要: ${source.snippet || '（无摘要）'}`,
              ].join('\n')
            ),
          ].join('\n\n'),
        },
      ],
    });

    const text = completion.text.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

function buildFallbackGroundingBrief(params: {
  searchedAt: string;
  sources: GroundingSource[];
}): string {
  const lines = [
    `事实背景（抓取时间 ${params.searchedAt}）：`,
    ...params.sources.map((source, index) => {
      return `- [${index + 1}] ${source.title}：${source.snippet || '搜索结果未提供摘要。'}`;
    }),
    '',
    '来源：',
    ...params.sources.map((source, index) => `[${index + 1}] ${source.url}`),
  ];

  return lines.join('\n');
}

function normalizeHtmlText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeDuckDuckGoRedirectUrl(rawUrl: string): string {
  const absoluteUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;

  try {
    const parsed = new URL(absoluteUrl);
    const redirected = parsed.searchParams.get('uddg');
    return redirected ? decodeURIComponent(redirected) : absoluteUrl;
  } catch {
    return absoluteUrl;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const codePoint = Number.parseInt(digits, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    });
}
