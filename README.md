# Agora

<p align="center">
  <a href="https://github.com/raysonmeng/agora"><img src="https://img.shields.io/badge/repository-Agora-111827" alt="Agora Repository" /></a>
  <img src="https://img.shields.io/badge/node-24.14_LTS-339933?logo=node.js&logoColor=white" alt="Node.js 24.14 LTS" />
  <img src="https://img.shields.io/badge/pnpm-10.32.1-F69220?logo=pnpm&logoColor=white" alt="pnpm 10.32.1" />
  <img src="https://img.shields.io/badge/runtime-CLI--first-0f766e" alt="CLI first" />
  <img src="https://img.shields.io/badge/status-Phase_A2_in_progress-2563eb" alt="Phase A2 in progress" />
  <img src="https://img.shields.io/badge/release_model-open_core-7c3aed" alt="Open core" />
</p>

面向多模型协作推理的 CLI-first 讨论引擎。  
A CLI-first discussion engine for multi-model collaborative reasoning.

Agora 不把“问一个模型拿一个答案”当作默认交互，而是让多个模型围绕同一议题进行三轮讨论、匿名互评，并由书记员模型输出结构化总结。  
Agora does not treat "ask one model, get one answer" as the default interaction; it runs a three-round council with anonymous peer review and a structured secretary summary.

长期规划中，核心引擎、CLI 和 TUI 会开源；产品化 Web UI 会保持闭源。  
In the long-term plan, the core engine, CLI, and TUI will be open source, while the product Web UI will remain closed source.

## 目录 / Table Of Contents

- [项目简介 / Overview](#项目简介--overview)
- [为什么是 Agora / Why Agora](#为什么是-agora--why-agora)
- [当前开源边界 / Open Source Boundary](#当前开源边界--open-source-boundary)
- [核心特性 / Key Features](#核心特性--key-features)
- [架构概览 / Architecture](#架构概览--architecture)
- [截图占位 / Screenshot Placeholders](#截图占位--screenshot-placeholders)
- [安装方式 / Installation](#安装方式--installation)
- [快速开始 / Quick Start](#快速开始--quick-start)
- [命令说明 / Commands](#命令说明--commands)
- [常见问题 / FAQ](#常见问题--faq)
- [路线图 / Roadmap](#路线图--roadmap)
- [项目状态 / Project Status](#项目状态--project-status)
- [参与贡献 / Contributing](#参与贡献--contributing)
- [参考文档 / References](#参考文档--references)

## 项目简介 / Overview

Agora 是一个建立在 OpenRouter 与 PostgreSQL 之上的多模型讨论引擎。  
Agora is a multi-model discussion engine built on top of OpenRouter and PostgreSQL.

它的目标不是简单堆叠更多模型，而是把“独立观点、匿名批评、最终反驳、结构化总结”变成可复用的标准讨论流程。  
Its goal is not to stack more models for the sake of it, but to turn "independent positions, anonymous critique, final rebuttal, and structured summary" into a reusable discussion workflow.

当前仓库主要包含两部分：共享核心引擎，以及面向本地运行和验证的 CLI。  
This repository currently contains two major parts: the shared core engine and a CLI for local runs and validation.

当前已落地的真实命令是 `agora ask` 与 `agora council run`。  
The currently implemented production-path commands are `agora ask` and `agora council run`.

构建顺序和任务图以 [技术文档.md](./技术文档.md) 为唯一源头，以 [docs/spec/BUILD_ORDER.md](./docs/spec/BUILD_ORDER.md) 为摘要入口。  
The single source of truth for scope is [技术文档.md](./技术文档.md), while [docs/spec/BUILD_ORDER.md](./docs/spec/BUILD_ORDER.md) provides the execution-order summary.

## 为什么是 Agora / Why Agora

单模型回答足够快，但它也经常过早收敛、隐藏分歧、弱化不确定性，尤其在复杂判断和强时效问题上更明显。  
Single-model answers are fast, but they often converge too early, hide disagreement, and downplay uncertainty, especially on complex or time-sensitive questions.

Agora 选择把“争论过程”变成一等公民，而不是只看最后一句结论。  
Agora makes the deliberation process a first-class artifact instead of focusing only on the final sentence.

标准 council 流程如下：  
The standard council flow is:

1. 让多个模型先给出各自独立判断。  
   Ask several models for independent first-round judgments.
2. 把首轮回答匿名化后交叉互评。  
   Anonymize first-round answers and run cross-review.
3. 让每个模型在吸收批评后给出最终立场。  
   Let each model produce a final position after reading critique.
4. 由书记员模型输出共识、分歧、建议与未决问题。  
   Use a secretary model to output consensus, disagreements, recommendations, and open questions.

这样得到的结果更容易审查，更容易回放，也更适合作为真实产品交互的基础能力。  
The result is easier to inspect, easier to replay, and better suited as a foundation for real product interactions.

## 当前开源边界 / Open Source Boundary

当前规划中的开源部分包括核心引擎、CLI 和未来的 TUI。  
The planned open-source surface includes the core engine, the CLI, and the future TUI.

当前规划中的闭源部分是产品化 Web UI 以及围绕它构建的私有产品层。  
The planned closed-source surface is the product Web UI and the private product layer built around it.

这个边界是有意设计的：核心推理与讨论编排应该可复用、可检查、可被本地工具消费；而产品化 Web 呈现不必绑定同样的发布策略。  
This boundary is intentional: the reasoning core and discussion orchestration should be reusable, inspectable, and consumable by local tools, while the product Web presentation does not need to follow the same release policy.

## 核心特性 / Key Features

- CLI-first 工作流，优先验证引擎而不是先做 UI。  
  CLI-first workflow that validates the engine before expanding UI work.
- 共享 core 层，未来 CLI、TUI 和 Web renderer 复用同一套讨论引擎。  
  Shared core layer so future CLI, TUI, and Web renderers use the same discussion engine.
- 三轮 council 讨论机制：独立回答、匿名互评、最终反驳。  
  Three-round council flow: independent answer, anonymous critique, final rebuttal.
- 书记员总结输出结构化 JSON 结果。  
  Secretary summaries produce structured JSON output.
- PostgreSQL 持久化 discussions、rounds、events、prompt templates 与 billing snapshots。  
  PostgreSQL persistence stores discussions, rounds, events, prompt templates, and billing snapshots.
- JSONL 事件日志用于 CLI replay/debug，但不是 canonical state。  
  JSONL event logs support CLI replay/debug but are not the canonical state.
- 风控层覆盖 topic 规范化、重复检测和 plan 限额。  
  Risk control covers topic normalization, duplicate detection, and plan limits.
- 针对强时效问题可插入 grounding 步骤，先拉齐背景再回答。  
  A grounding step can be inserted for time-sensitive topics before answering.

## 架构概览 / Architecture

Agora 明确区分 core 层与 renderer 层。  
Agora explicitly separates the core layer from renderer layers.

```text
src/lib/   -> orchestration, persistence, prompts, security, event schemas
src/cli/   -> terminal rendering and local command surface
future TUI -> terminal app on the same core
private Web UI -> separate renderer on the same core
```

核心约束如下：  
The key constraints are:

- `src/lib/` 不应依赖 CLI 或 Web 专属模块。  
  `src/lib/` should not depend on CLI-specific or Web-specific modules.
- renderer 只消费事件流，不重写编排逻辑。  
  Renderers consume the event stream instead of reimplementing orchestration.
- JSONL 只用于 debug artifact，不作为生产真相源。  
  JSONL is only a debug artifact and not a production source of truth.
- canonical state 始终在 PostgreSQL。  
  Canonical state always lives in PostgreSQL.

## 截图占位 / Screenshot Placeholders

当前仓库先公开核心引擎与 CLI，因此视觉素材会比典型 Web 项目更少。  
This repository is publishing the core engine and CLI first, so visual assets are naturally lighter than in a typical Web project.

下面是预留给公开仓库首页的截图占位区域。  
Below is a reserved screenshot placeholder section for the public repository homepage.

| 模块 / Surface | 说明 / Description | 状态 / Status |
| --- | --- | --- |
| CLI Ask | 单模型提问的终端输出截图占位。<br>Placeholder for a terminal screenshot of single-model ask output. | 待补充 / Pending |
| CLI Council | 多模型 council 讨论与流式事件展示截图占位。<br>Placeholder for a screenshot of multi-model council output and streamed events. | 待补充 / Pending |
| TUI App | 未来 TUI 版本的界面预览占位。<br>Placeholder for the future TUI interface preview. | 规划中 / Planned |
| Web UI | 闭源产品化界面，不在本仓库展示完整实现。<br>Closed-source product interface, not fully published in this repository. | 闭源 / Private |

如果你准备把仓库公开，可以后续把实际终端截图放进 `docs/assets/` 或仓库根目录的图片目录。  
If you plan to publish the repository, you can later place real terminal screenshots in `docs/assets/` or another image directory at the repo root.

## 安装方式 / Installation

当前 CLI 还没有发布到 npm registry，推荐先从源码安装。  
The CLI is not published to the npm registry yet, so the recommended path is to install it from source.

推荐环境如下：  
The recommended environment is:

- Node.js `24.14.0` LTS  
  Node.js `24.14.0` LTS
- pnpm `10.32.1`  
  pnpm `10.32.1`
- PostgreSQL  
  PostgreSQL
- OpenRouter API Key  
  An OpenRouter API key

仓库中的运行时声明见 [package.json](./package.json) 与 [.nvmrc](./.nvmrc)。  
The runtime declarations in the repository live in [package.json](./package.json) and [.nvmrc](./.nvmrc).

使用 HTTPS 克隆并安装依赖：  
Clone with HTTPS and install dependencies:

```bash
git clone https://github.com/raysonmeng/agora.git
cd agora
pnpm install
```

如果你希望把 `agora` 链接成全局命令：  
If you want to link `agora` as a global command:

```bash
pnpm link --global
agora --help
```

如果你不想做全局链接，也可以直接用 `pnpm agora`。  
If you do not want a global link, you can use `pnpm agora` directly.

## 快速开始 / Quick Start

### 1. 准备环境变量 / Prepare Environment Variables

本仓库推荐使用 `run.sh` 来加载 `.env.test` 或 `.env.prod`。  
This repository recommends using `run.sh` to load `.env.test` or `.env.prod`.

本地开发建议先复制测试环境模板：  
For local development, start by copying the test template:

```bash
cp .env.test.example .env.test
```

如果你需要更接近生产的本地运行方式：  
If you need a more production-like local setup:

```bash
cp .env.prod.example .env.prod
```

最小必填变量示例：  
Minimal required variables:

```dotenv
DATABASE_URL=postgresql://user:password@localhost:5432/agora
OPENROUTER_API_KEY=your-openrouter-api-key
CLI_TEST_USER_ID=00000000-0000-4000-8000-000000000001

AGORA_MODEL_SOURCE=openrouter
AGORA_ALLOWED_MODELS=openai/gpt-oss-120b:free,qwen/qwen3-next-80b-a3b-instruct:free,meta-llama/llama-3.3-70b-instruct:free
AGORA_DEFAULT_COUNCIL_MODELS=openai/gpt-oss-120b:free,qwen/qwen3-next-80b-a3b-instruct:free,meta-llama/llama-3.3-70b-instruct:free
AGORA_SECRETARY_MODEL=openai/gpt-oss-120b:free
```

推荐可选变量包括：  
Useful optional variables include:

- `DATABASE_SESSION_POOLER_URL`，如果你使用 Supabase，推荐优先提供它。  
  `DATABASE_SESSION_POOLER_URL`, recommended when you use Supabase.
- `DATABASE_TRANSACTION_POOLER_URL`，用于显式 transaction pooler。  
  `DATABASE_TRANSACTION_POOLER_URL`, for an explicit transaction pooler.
- `AGORA_ROUND_SUMMARY_MODEL`，把 round checkpoint 书记员从参赛模型中拆开。  
  `AGORA_ROUND_SUMMARY_MODEL`, to separate round checkpoint summaries from participant models.
- `AGORA_GROUNDING_MODE`，可选 `off`、`auto`、`always`。  
  `AGORA_GROUNDING_MODE`, which supports `off`, `auto`, and `always`.
- `AGORA_GROUNDING_PROVIDER`，当前支持 `duckduckgo`。  
  `AGORA_GROUNDING_PROVIDER`, currently supporting `duckduckgo`.

参考模板文件：  
Reference template files:

- [.env.example](./.env.example)  
  [.env.example](./.env.example)
- [.env.test.example](./.env.test.example)  
  [.env.test.example](./.env.test.example)
- [.env.prod.example](./.env.prod.example)  
  [.env.prod.example](./.env.prod.example)

注意：CLI 进程本身不会自动读取 `.env` 文件。  
Important: the CLI process does not auto-load `.env` files by itself.

如果你不通过 `run.sh` 运行，就需要先手动把环境变量 export 到 shell。  
If you do not run through `run.sh`, you need to export environment variables into your shell first.

### 2. 初始化数据库 / Prepare The Database

先应用 schema，再写入当前 Phase A 所需的最小 seed 数据。  
Apply the schema first, then seed the minimum Phase A data required by the current flow.

```bash
./run.sh test pnpm drizzle-kit push
./run.sh test pnpm seed
```

seed 脚本当前会创建：  
The current seed script creates:

- `CLI_TEST_USER_ID` 对应的 CLI 测试用户。  
  The CLI test user referenced by `CLI_TEST_USER_ID`.
- 一条 billing snapshot。  
  A billing snapshot.
- 当前 council 流程需要的冻结 prompt templates。  
  The frozen prompt templates required by the current council flow.

你可以这样检查数据库连通性：  
You can verify database connectivity with:

```bash
./run.sh test pnpm db:check
```

### 3. 运行单模型提问 / Ask A Single Model

推荐先使用 `run.sh` 让环境变量注入方式和仓库默认约定保持一致。  
It is recommended to start with `run.sh` so environment loading matches the repository convention.

```bash
./run.sh test agora ask -q "What are the main trade-offs of PostgreSQL transaction pooling?"
```

如果需要手动指定模型：  
If you want to override the model explicitly:

```bash
./run.sh test agora ask -q "Summarize the current AI inference market" -m openai/gpt-oss-120b:free
```

### 4. 运行多模型讨论 / Run A Council Discussion

```bash
./run.sh test agora council run -t "Should a small AI product start with CLI-first instead of Web-first?"
```

如果需要显式指定参与模型：  
If you want to choose participant models explicitly:

```bash
./run.sh test agora council run \
  -t "Should a small AI product start with CLI-first instead of Web-first?" \
  -m openai/gpt-oss-120b:free qwen/qwen3-next-80b-a3b-instruct:free meta-llama/llama-3.3-70b-instruct:free
```

如果需要附着到已有 discussion：  
If you want to attach to an existing discussion:

```bash
./run.sh test agora council run -d <discussion-id>
```

如果你已经把 `agora` 全局链接到了 shell，也可以手动加载环境后直接运行：  
If you already linked `agora` globally, you can also run it directly after loading the environment:

```bash
set -a
source .env.test
export AGORA_RUNTIME_ENV=test
set +a
agora ask -q "Hello from Agora"
```

## 命令说明 / Commands

### `agora ask`

用于向单个模型发起一次提问。  
Use this command to ask a single model one question.

```bash
agora ask --question "..."
agora ask --question "..." --model <model-id>
```

参数说明：  
Options:

- `-q, --question <question>`：必填问题文本。  
  `-q, --question <question>`: required question text.
- `-m, --model <model>`：可选模型覆盖。  
  `-m, --model <model>`: optional model override.

### `agora council run`

用于创建或附着到一个多模型 council discussion。  
Use this command to create or attach to a multi-model council discussion.

```bash
agora council run --topic "..."
agora council run --topic "..." --models <model-a> <model-b> <model-c>
agora council run --discussion-id <discussion-id>
```

参数说明：  
Options:

- `-t, --topic <topic>`：讨论主题。  
  `-t, --topic <topic>`: discussion topic.
- `-m, --models <models...>`：参与模型 ID 列表。  
  `-m, --models <models...>`: participant model IDs.
- `-d, --discussion-id <discussionId>`：附着到已有 discussion。  
  `-d, --discussion-id <discussionId>`: attach to an existing discussion.

## 讨论流程 / Discussion Flow

当前 consensus 主路径大致如下：  
The current consensus happy path works roughly like this:

1. 在 PostgreSQL 中创建或附着到一个 discussion record。  
   Create or attach to a discussion record in PostgreSQL.
2. Round 1 让每个参与模型输出独立观点。  
   Round 1 collects independent positions from each participant model.
3. 将 Round 1 输出匿名化后交给其他模型评审。  
   Round 1 outputs are anonymized before cross-review.
4. Round 2 生成匿名批评。  
   Round 2 produces anonymous critique.
5. 构建压缩后的 round state。  
   A compressed round state is built.
6. Round 3 让每个模型给出最终立场。  
   Round 3 produces final positions.
7. 书记员模型生成结构化总结。  
   A secretary model generates the structured summary.
8. 最终持久化结果并发出 terminal events。  
   Final outputs are persisted and terminal events are emitted.

CLI 运行期间还会把事件写到 JSONL 文件中：  
During CLI runs, events are also written to JSONL files:

```text
.agora/sessions/<discussion-id>.events.jsonl
```

这些文件主要用于 replay 和 debug，不是 canonical state。  
These files are primarily for replay and debug, not the canonical state.

## 常见问题 / FAQ

### 这个项目现在能做什么？ / What can the project do right now?

目前已打通的真实命令是 `agora ask` 和 `agora council run`。  
The currently working production-path commands are `agora ask` and `agora council run`.

围绕完整 CLI 的工程化加固仍在 Phase A2 中继续推进。  
Engineering hardening for the full CLI is still being advanced in Phase A2.

### 现在就能直接 `npm install -g` 吗？ / Can I `npm install -g` it today?

还不行，当前没有发布到公共 npm registry。  
Not yet, because it has not been published to the public npm registry.

当前推荐方式是从源码安装并使用 `pnpm link --global`。  
The current recommended approach is to install from source and use `pnpm link --global`.

### 为什么仓库里先做 CLI，而不是先做 Web？ / Why start with the CLI instead of the Web?

因为当前最高风险在引擎、事件协议、状态机和多模型编排，而不是 UI。  
Because the highest current risk is in the engine, event protocol, state machine, and multi-model orchestration rather than the UI.

先把 CLI 跑稳，可以更快发现 prompt、容错、恢复和总结质量的问题。  
Stabilizing the CLI first makes it much easier to iterate on prompts, fault tolerance, recovery, and summary quality.

### TUI 和 Web UI 的关系是什么？ / What is the relationship between the TUI and the Web UI?

TUI 会和 CLI 一样复用同一套 core 层，并计划开源。  
The TUI will reuse the same core layer as the CLI and is planned to be open source.

Web UI 会继续复用 core 层，但产品化实现保持闭源。  
The Web UI will also reuse the core layer, but the productized implementation will remain closed source.

### 当前支持联网背景拉齐吗？ / Does Agora support web grounding today?

当前已存在 grounding 配置与实现入口，用于在强时效问题上先补齐背景。  
There is already a grounding configuration and implementation entrypoint for injecting current context on time-sensitive questions.

当前默认 provider 是 `duckduckgo`，后续能力仍会继续加固。  
The current default provider is `duckduckgo`, and the grounding layer will continue to be hardened.

### 这个仓库已经定好最终开源许可证了吗？ / Is the final open-source license already decided?

截至当前仓库状态，还没有看到最终公开的许可证文件。  
As of the current repository state, there is no finalized public license file yet.

如果你准备正式公开仓库，建议在发布前补齐许可证与发布说明。  
If you plan to publish the repository publicly, you should add the license and release notes before launch.

## 路线图 / Roadmap

| 阶段 / Phase | 状态 / Status | 目标 / Goals | 公开边界 / Release Boundary |
| --- | --- | --- | --- |
| Phase A1 | 已完成。<br>Completed. | 最小引擎闭环：`ask`、`council run`、3 轮讨论、匿名化、书记员总结、JSONL。<br>Minimum engine loop: `ask`, `council run`, three rounds, anonymization, secretary summary, and JSONL logs. | 开源。<br>Open. |
| Phase A2 | 进行中。<br>In progress. | 计费、完整 CLI、事件契约一致性、测试矩阵、grounding 工程化。<br>Billing, full CLI, event-contract alignment, test matrix, and grounding hardening. | 开源。<br>Open. |
| Phase B | 未开始。<br>Not started. | Web 最小壳接入，同一套 core 驱动 Web renderer。<br>Minimal Web shell on top of the same core renderer boundary. | Core 开源，Web 产品层私有。<br>Core open, product Web layer private. |
| Phase C | 未开始。<br>Not started. | 产品化完善、页面、后台、国际化、分享、监控与部署验收。<br>Productization work including pages, back office, i18n, sharing, monitoring, and deployment acceptance. | 混合模式。<br>Mixed boundary. |

## 项目状态 / Project Status

当前仓库可以被理解为“核心引擎正在快速收敛，CLI 已可用于本地运行和验证”的阶段。  
The repository is currently best understood as "the core engine is converging quickly, and the CLI is already usable for local runs and validation."

近期重点包括：  
Near-term priorities include:

- 计费链路加固。  
  Billing hardening.
- chat / upgrade / replay / export / followup 命令补齐。  
  Completing chat / upgrade / replay / export / followup commands.
- 事件契约更严格的验证。  
  Stricter event-contract validation.
- 更完整的 CLI 测试矩阵。  
  A broader and more complete CLI test matrix.

## 参与贡献 / Contributing

在正式公开发布流程确定前，当前更适合围绕 core / CLI 层提交问题、设计讨论和聚焦 PR。  
Before the public release workflow is finalized, focused issues, design discussions, and PRs around the core / CLI layers are the best contribution path.

贡献时建议遵守以下原则：  
When contributing, it is recommended to follow these rules:

- 保持 `src/lib/` renderer-agnostic。  
  Keep `src/lib/` renderer-agnostic.
- 不要把 CLI 专属语义塞进 core 的事件协议或持久化模型。  
  Do not push CLI-only semantics into the core event protocol or persistence model.
- 任务命名和构建顺序与 [技术文档.md](./技术文档.md) 保持一致。  
  Keep task naming and execution order aligned with [技术文档.md](./技术文档.md).

## 参考文档 / References

- [技术文档.md](./技术文档.md)：产品与工程范围的唯一源头。  
  [技术文档.md](./技术文档.md): the single source of truth for product and engineering scope.
- [docs/spec/BUILD_ORDER.md](./docs/spec/BUILD_ORDER.md)：任务顺序摘要。  
  [docs/spec/BUILD_ORDER.md](./docs/spec/BUILD_ORDER.md): the build-order summary.
- [docs/spec/CORE_SPEC.md](./docs/spec/CORE_SPEC.md)：补充规格说明。  
  [docs/spec/CORE_SPEC.md](./docs/spec/CORE_SPEC.md): supporting specification material.
- [docs/tasks/phase-a1/PROGRESS.md](./docs/tasks/phase-a1/PROGRESS.md)：Phase A1 进度。  
  [docs/tasks/phase-a1/PROGRESS.md](./docs/tasks/phase-a1/PROGRESS.md): Phase A1 progress.
- [docs/tasks/phase-a2/PROGRESS.md](./docs/tasks/phase-a2/PROGRESS.md)：Phase A2 进度。  
  [docs/tasks/phase-a2/PROGRESS.md](./docs/tasks/phase-a2/PROGRESS.md): Phase A2 progress.
