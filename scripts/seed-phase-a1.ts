import { and, eq, isNull } from 'drizzle-orm';

import {
  db,
  dbClient,
  ensureDatabaseReady,
  getDatabaseConnectionDiagnostics,
} from '@/lib/db/index';
import * as schema from '@/lib/db/schema';

const BILLING_SNAPSHOT_ID = '20260101-0000-4000-8000-000000000001';
const BILLING_SNAPSHOT_VERSION = '2026-Q1-v1';
const PROMPT_VERSION = '1.0.0';

const pricingData = {
  'anthropic/claude-opus-4.6': { input: 5.0, output: 25.0 },
  'anthropic/claude-sonnet-4.6': { input: 3.0, output: 15.0 },
  'anthropic/claude-haiku-4.5': { input: 1.0, output: 5.0 },
  'openai/gpt-5.4': { input: 2.5, output: 15.0 },
  'openai/gpt-5.2': { input: 1.75, output: 14.0 },
  'openai/gpt-5-mini': { input: 0.25, output: 2.0 },
  'google/gemini-3.1-pro': { input: 2.0, output: 12.0 },
  'google/gemini-3-flash': { input: 0.5, output: 3.0 },
  'deepseek/deepseek-chat': { input: 0.28, output: 0.42 },
  'x-ai/grok-4.1': { input: 0.2, output: 0.5 },
} as const;

const promptTemplates = [
  {
    model: 'all',
    mode: 'consensus',
    role: 'participant',
    roundType: 'independent',
    content: [
      '你是一位讨论参与者。{{role_description}}',
      '',
      '你正在参与一场关于以下话题的讨论：',
      '{{topic}}',
      '',
      '请给出你的独立观点和分析。要求：',
      '1. 明确表达你的核心立场',
      '2. 给出支撑你立场的关键证据或论据（如有数据请引用来源）',
      '3. 主动指出你看到的风险或不确定性',
      '4. 回答长度 200-400 字',
      '5. 不要试图讨好或迎合任何人，说出你真正的判断',
      '6. 必须找出至少一个可能的反对观点并说明为什么你不同意',
      '',
      '禁止：',
      '- 使用"我作为AI/语言模型/Claude/GPT/..."等自我身份表述',
      '- 使用"当然/没问题/很高兴帮助"等客套开头',
    ].join('\n'),
  },
  {
    model: 'all',
    mode: 'consensus',
    role: 'participant',
    roundType: 'review',
    content: [
      '你是一位讨论参与者。{{role_description}}',
      '',
      '讨论话题：{{topic}}',
      '',
      '以下是各位匿名参与者在上一轮的观点：',
      '{{anonymized_round1_texts}}',
      '',
      '请对以上各位的观点进行评价。要求：',
      '1. 必须找出其他参与者观点中至少一个你不同意的地方，并给出具体理由',
      '2. 如果某个观点改变了你的想法，诚实承认并说明原因',
      '3. 指出你认为最薄弱的论证，解释为什么',
      '4. 如果某个参与者引用了数据或证据，评估其可靠性',
      '5. 回答长度 150-300 字',
      '6. 不要泛泛而谈"很有道理"，必须具体到某个观点或论据',
      '',
      '禁止：',
      '- 使用"我作为AI/语言模型"等自我身份表述',
      '- 无差别赞美所有观点',
      '- 猜测参与者的真实身份',
    ].join('\n'),
  },
  {
    model: 'all',
    mode: 'consensus',
    role: 'participant',
    roundType: 'rebuttal',
    content: [
      '你是一位讨论参与者。{{role_description}}',
      '',
      '讨论话题：{{topic}}',
      '',
      '前两轮讨论摘要：',
      '{{compressed_context}}',
      '',
      '基于前两轮的讨论，请给出你的最终立场。要求：',
      '1. 明确说明你的立场是否有所改变，如果是，具体是什么改变了你的想法',
      '2. 对之前被他人质疑的观点进行回应',
      '3. 如果你发现自己之前的论证有薄弱之处，诚实承认',
      '4. 给出你的最终建议',
      '5. 回答长度 150-300 字',
      '',
      '禁止：',
      '- 使用"我作为AI/语言模型"等自我身份表述',
      '- 简单重复第一轮的观点而不回应质疑',
    ].join('\n'),
  },
  {
    model: 'all',
    mode: 'consensus',
    role: 'secretary',
    roundType: 'summary',
    content: [
      '你是一场多方讨论的书记员。你的职责是忠实、准确地总结讨论结果。',
      '',
      '讨论话题：{{topic}}',
      '',
      '讨论参与者：{{participating_models}}',
      '',
      '讨论内容摘要：',
      '{{compressed_rounds}}',
      '',
      '请输出一份结构化 JSON 总结。要求严格按照以下 schema，不要添加任何 markdown 标记或额外文字：',
      '',
      '{',
      '  "consensus": [',
      '    { "content": "共识内容", "supporting_models": ["model_id", ...], "evidence_refs": ["证据引用"] }',
      '  ],',
      '  "disagreements": [',
      '    {',
      '      "topic": "分歧议题",',
      '      "type": "fact_conflict|context_gap|logic_divergence|preference_difference",',
      '      "positions": [',
      '        { "model_id": "model_id", "stance": "for|against|neutral", "summary": "立场摘要" }',
      '      ],',
      '      "severity": "high|medium|low"',
      '    }',
      '  ],',
      '  "recommendation": "方向性建议（至少10字）",',
      '  "confidence": "high|medium|low",',
      '  "open_questions": ["未解决的问题"],',
      '  "decision_boundary": "决策边界条件（可选）",',
      '  "evidence_refs": ["全局证据引用"]',
      '}',
      '',
      '铁律：',
      '- supporting_models 和 positions 中的 model_id 只能使用以下模型 ID：{{participating_models}}',
      '- 不得编造未在讨论中出现的模型立场',
      '- 不得伪造 evidence_refs',
      '- consensus 和 disagreements 不能同时为空',
      '- 只输出 JSON，不要任何其他文字',
    ].join('\n'),
  },
] as const;

async function main(): Promise<void> {
  const cliUserId = process.env.CLI_TEST_USER_ID?.trim();

  if (!cliUserId) {
    throw new Error('CLI_TEST_USER_ID is required to seed Phase A1 data');
  }

  await ensureDatabaseReady({
    label: 'phase-a1 seed',
  });

  const diagnostics = getDatabaseConnectionDiagnostics();
  console.log(
    `[seed-phase-a1] Database connection source: ${diagnostics.active.source} (${diagnostics.active.label})`
  );

  await seedCliUser(cliUserId);
  await seedBillingSnapshot();
  await seedPromptTemplates();

  console.log(
    JSON.stringify(
      {
        seeded: {
          cliUserId,
          billingSnapshotVersion: BILLING_SNAPSHOT_VERSION,
          promptTemplates: promptTemplates.length,
        },
      },
      null,
      2
    )
  );

  await dbClient.end();
}

async function seedCliUser(cliUserId: string): Promise<void> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, cliUserId))
    .limit(1);

  const values = {
    email: 'cli-test@local.agora',
    name: 'Agora CLI Test User',
    authProvider: 'cli',
    plan: 'pro',
  } as const;

  if (rows.length > 0) {
    await db
      .update(schema.users)
      .set(values)
      .where(eq(schema.users.id, cliUserId));
    return;
  }

  await db.insert(schema.users).values({
    id: cliUserId,
    ...values,
  });
}

async function seedBillingSnapshot(): Promise<void> {
  const rows = await db
    .select({ id: schema.billingSnapshots.id })
    .from(schema.billingSnapshots)
    .where(eq(schema.billingSnapshots.version, BILLING_SNAPSHOT_VERSION))
    .limit(1);

  if (rows.length > 0) {
    await db
      .update(schema.billingSnapshots)
      .set({
        pricingData,
        openrouterFee: '1.0550',
        platformMargin: '1.1500',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      })
      .where(eq(schema.billingSnapshots.version, BILLING_SNAPSHOT_VERSION));
    return;
  }

  await db.insert(schema.billingSnapshots).values({
    id: BILLING_SNAPSHOT_ID,
    version: BILLING_SNAPSHOT_VERSION,
    pricingData,
    openrouterFee: '1.0550',
    platformMargin: '1.1500',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  });
}

async function seedPromptTemplates(): Promise<void> {
  for (const template of promptTemplates) {
    const rows = await db
      .select({ id: schema.promptTemplates.id })
      .from(schema.promptTemplates)
      .where(
        and(
          eq(schema.promptTemplates.model, template.model),
          eq(schema.promptTemplates.mode, template.mode),
          eq(schema.promptTemplates.role, template.role),
          eq(schema.promptTemplates.roundType, template.roundType),
          eq(schema.promptTemplates.isActive, true),
          isNull(schema.promptTemplates.abGroup)
        )
      )
      .limit(1);

    if (rows.length > 0) {
      await db
        .update(schema.promptTemplates)
        .set({
          version: PROMPT_VERSION,
          content: template.content,
          createdBy: 'system',
          notes: 'MVP 冻结版 v1.0.0',
        })
        .where(eq(schema.promptTemplates.id, rows[0].id));
      continue;
    }

    await db.insert(schema.promptTemplates).values({
      version: PROMPT_VERSION,
      model: template.model,
      mode: template.mode,
      role: template.role,
      roundType: template.roundType,
      content: template.content,
      isActive: true,
      createdBy: 'system',
      notes: 'MVP 冻结版 v1.0.0',
    });
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[seed-phase-a1] ${message}`);
    void dbClient.end().finally(() => {
      process.exit(1);
    });
  });
