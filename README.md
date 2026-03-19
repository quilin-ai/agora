# Agora

<p align="center">
  <a href="https://github.com/raysonmeng/agora"><img src="https://img.shields.io/badge/repository-Agora-111827" alt="Agora Repository" /></a>
  <img src="https://img.shields.io/badge/node-24.14_LTS-339933?logo=node.js&logoColor=white" alt="Node.js 24.14 LTS" />
  <img src="https://img.shields.io/badge/pnpm-10.32.1-F69220?logo=pnpm&logoColor=white" alt="pnpm 10.32.1" />
  <img src="https://img.shields.io/badge/runtime-CLI--first-0f766e" alt="CLI first" />
  <img src="https://img.shields.io/badge/status-Phase_A2_in_progress-2563eb" alt="Phase A2 in progress" />
  <img src="https://img.shields.io/badge/license-source--available_noncommercial-7c3aed" alt="Source-available noncommercial" />
</p>

<p align="center">
  <img src="./agora_logo_pixel.png" alt="Agora pixel logo" width="780" />
</p>

面向多模型协作推理的 CLI-first 讨论引擎。  
A CLI-first discussion engine for multi-model collaborative reasoning.

Agora 不把“问一个模型拿一个答案”当作默认交互，而是让多个模型围绕同一议题进行三轮讨论、匿名互评，并由书记员模型输出结构化总结。  
Agora does not treat "ask one model, get one answer" as the default interaction; it runs a three-round council with anonymous peer review and a structured secretary summary.

长期规划中，核心引擎、CLI 和 TUI 会以源码可见、禁止商用、修改版需公开源码的方式发布；产品化 Web UI 会保持闭源。  
In the long-term plan, the core engine, CLI, and TUI will be released as source-available, noncommercial, and reciprocal software, while the product Web UI will remain closed source.

## 目录 / Table Of Contents

- [项目简介 / Overview](#项目简介--overview)
- [为什么是 Agora / Why Agora](#为什么是-agora--why-agora)
- [当前许可边界 / Licensing Boundary](#当前许可边界--licensing-boundary)
- [先试这 3 条 / Start With These 3](#先试这-3-条--start-with-these-3)
- [核心特性 / Key Features](#核心特性--key-features)
- [架构概览 / Architecture](#架构概览--architecture)
- [截图占位 / Screenshot Placeholders](#截图占位--screenshot-placeholders)
- [安装方式 / Installation](#安装方式--installation)
- [快速开始 / Quick Start](#快速开始--quick-start)
- [CLI 入口 / CLI Entrypoints](#cli-入口--cli-entrypoints)
- [命令说明 / Commands](#命令说明--commands)
- [许可说明 / Licensing](#许可说明--licensing)
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

当前已落地的真实命令入口是 `agora t`、`agora a` 与 `agora c`，同时兼容 `agora council run`、`agora ask` 与 `agora chat`。  
The current production entrypoints are `agora t`, `agora a`, and `agora c`, while `agora council run`, `agora ask`, and `agora chat` remain available for compatibility.

当你直接运行 `agora` 且不带参数时，CLI 会清屏并展示一个置顶欢迎页，优先引导你从 `t`、`a`、`c` 三条主入口开始。  
When you run `agora` with no arguments, the CLI clears the screen and shows a pinned welcome view that leads with the three primary entrypoints: `t`, `a`, and `c`.

构建顺序和任务图以 [技术文档.md](./技术文档.md) 为唯一源头，以 [docs/spec/BUILD_ORDER.md](./docs/spec/BUILD_ORDER.md) 为摘要入口。  
The single source of truth for scope is [技术文档.md](./技术文档.md), while [docs/spec/BUILD_ORDER.md](./docs/spec/BUILD_ORDER.md) provides the execution-order summary.

## 先试这 3 条 / Start With These 3

如果你已经完成本地安装，最值得先试的是下面三条命令。  
If you already have the CLI installed locally, these are the three commands worth trying first.

### 1. 用 council 讨论一个真正有争议的问题 / Use A Council For A Real Debate

这是 Agora 最核心的入口。  
This is the core Agora experience.

```bash
agora t "Should a small AI startup win with a CLI first, or launch a polished web app first?"
```

适合：产品方向、定价取舍、组织决策、上线节奏、强时效判断。  
Best for: product direction, pricing tradeoffs, organizational decisions, launch sequencing, and time-sensitive judgment.

### 2. 先快速问一个问题 / Ask One Question Fast

当你想先确认环境、模型和基本回答质量时，用 `a` 最直接。  
When you want to verify the environment, the model, and baseline answer quality, `a` is the fastest path.

```bash
agora a "Will AI coding agents replace most junior developer work in the next three years?"
```

适合：快速试跑、单问单答、先验证模型再进入更重的工作流。  
Best for: quick smoke runs, single-shot questions, and validating the setup before moving into a heavier workflow.

### 3. 进入持续对话 / Start A Persistent Chat

当你已经有一个方向，想在单模型上下文中持续迭代、追问和收敛时，用 `c`。  
When you already have a direction and want to iterate, challenge, and refine it inside one model context, use `c`.

```bash
agora c "Help me stress-test a product plan before I commit to it."
```

适合：计划打磨、长一点的来回讨论、围绕同一上下文持续推进。  
Best for: plan refinement, longer back-and-forth conversations, and sustained progress within one context.

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

## 当前许可边界 / Licensing Boundary

当前规划中，核心引擎、CLI 和未来的 TUI 以源码可见方式发布，但不允许商用，并要求修改版在对外分发或对外提供服务时继续公开对应源码。  
The core engine, CLI, and future TUI are planned to be released as source-available software: commercial use is prohibited, and modified versions must continue to publish corresponding source code when distributed or offered to external users.

当前规划中的闭源部分是产品化 Web UI 以及围绕它构建的私有产品层。  
The planned closed-source surface is the product Web UI and the private product layer built around it.

这个边界是有意设计的：核心推理与讨论编排应该可检查、可学习、可修改，但不应被直接闭源商用；而产品化 Web 呈现不必绑定同样的发布策略。  
This boundary is intentional: the reasoning core and orchestration should be inspectable, learnable, and modifiable, but not directly turned into closed commercial products; the product Web presentation does not need to follow the same release policy.

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

当前已经附上一张 CLI 首页实拍图，以及 logo 图资源。  
The repository now includes a real CLI home screenshot and a dedicated logo asset.

### CLI 首页 / CLI Home

![Agora CLI home](./agora_readme.png)

### Logo / Logo

![Agora pixel logo](./agora_logo_pixel.png)

下面表格保留为后续补充更多公开素材的规划位。  
The table below remains as a planning surface for adding more public assets later.

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

### 0. 先看 CLI 首页 / See The CLI Home First

如果你已经完成安装并链接了本地命令，先直接运行一次 `agora`。  
If you have already installed and linked the local command, start by running `agora` once.

```bash
agora
```

无参数启动时会清屏并展示彩色 logo、推荐工作流和最常用命令入口。  
Launching with no arguments clears the screen and shows the colored logo, suggested workflows, and the most important command entrypoints.

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

### 3. 运行多模型讨论 / Run A Council Discussion

```bash
./run.sh test agora t "Should a small AI product start with CLI-first instead of Web-first?"
```

如果需要显式指定参与模型：  
If you want to choose participant models explicitly:

```bash
./run.sh test agora t \
  -t "Should a small AI product start with CLI-first instead of Web-first?" \
  -m openai/gpt-oss-120b:free qwen/qwen3-next-80b-a3b-instruct:free meta-llama/llama-3.3-70b-instruct:free
```

如果需要附着到已有 discussion：  
If you want to attach to an existing discussion:

```bash
./run.sh test agora t -d <discussion-id>
```

### 4. 运行单模型提问 / Ask A Single Model

推荐先使用 `run.sh` 让环境变量注入方式和仓库默认约定保持一致。  
It is recommended to start with `run.sh` so environment loading matches the repository convention.

```bash
./run.sh test agora a "What are the main trade-offs of PostgreSQL transaction pooling?"
```

如果需要手动指定模型：  
If you want to override the model explicitly:

```bash
./run.sh test agora a "Summarize the current AI inference market" -m openai/gpt-oss-120b:free
```

### 5. 进入多轮聊天 / Start A Chat Session

```bash
./run.sh test agora c "Help me stress-test a product plan before I commit to it."
```

如果你已经把 `agora` 全局链接到了 shell，也可以手动加载环境后直接运行：  
If you already linked `agora` globally, you can also run it directly after loading the environment:

```bash
set -a
source .env.test
export AGORA_RUNTIME_ENV=test
set +a
agora a "Hello from Agora"
```

## CLI 入口 / CLI Entrypoints

当前文档、帮助页和欢迎页都按照同一优先级展示命令。  
The README, help output, and welcome screen now present the commands in the same priority order.

1. `agora t`  
   主入口，用于发起或附着到一场多模型 council 讨论。  
   Primary entrypoint for starting or attaching to a multi-model council discussion.
2. `agora a`  
   最低摩擦入口，用于快速问一个问题并验证模型与环境是否正常。  
   Lowest-friction entrypoint for asking one question and verifying that models and environment are working.
3. `agora c`  
   单模型多轮对话入口，支持空启动进入交互模式，也支持直接带第一句 prompt 启动。  
   Single-model multi-turn chat entrypoint. It supports both an empty interactive start and an initial prompt passed directly on launch.

兼容长命令仍然保留，但不再是首页主展示。  
The long-form commands are still supported, but they are no longer the primary surface shown first.

- `agora council run ...` → `agora t ...`  
  `agora council run ...` → `agora t ...`
- `agora ask ...` → `agora a ...`  
  `agora ask ...` → `agora a ...`
- `agora chat ...` → `agora c ...`  
  `agora chat ...` → `agora c ...`

## 许可说明 / Licensing

本仓库采用自定义的 [Agora Community License 1.0](./LICENSE)。  
This repository is licensed under the custom [Agora Community License 1.0](./LICENSE).

它不是 OSI 定义下的开源许可证。  
It is not an OSI-approved open-source license.

这个许可证的核心规则是：  
The core rules of the license are:

- 可以查看源码。  
  You may view the source code.
- 可以在非商用前提下修改源码。  
  You may modify the source code for noncommercial purposes.
- 可以在非商用前提下分发原版或修改版。  
  You may redistribute the original or modified versions for noncommercial purposes.
- 不得将本项目或衍生版本用于商业用途。  
  You may not use the project or derivative works for commercial purposes.
- 修改版如果对外分发，必须提供对应源码。  
  If you distribute a modified version, you must provide the corresponding source code.
- 修改版如果以服务形式对外提供给用户，也必须向这些用户提供对应源码。  
  If you provide a modified version as a service to external users, you must also provide corresponding source code to those users.
- 不得把原项目或修改版变成闭源发布。  
  You may not turn the original project or a derivative work into a closed-source release.

更易读的解释见 [LICENSING.md](./LICENSING.md)。  
See [LICENSING.md](./LICENSING.md) for a plain-language explanation.

## 命令说明 / Commands

### `agora t`

用于创建或附着到一个多模型 council discussion。  
Use this command to create or attach to a multi-model council discussion.

```bash
agora t "..."
agora t --topic "..." --models <model-a> <model-b> <model-c>
agora t --discussion-id <discussion-id>
```

参数说明：  
Options:

- `-t, --topic <topic>`：讨论主题。  
  `-t, --topic <topic>`: discussion topic.
- `-m, --models <models...>`：参与模型 ID 列表。  
  `-m, --models <models...>`: participant model IDs.
- `-d, --discussion-id <discussionId>`：附着到已有 discussion。  
  `-d, --discussion-id <discussionId>`: attach to an existing discussion.

兼容长命令：`agora council run`。  
Compatible long form: `agora council run`.

### `agora a`

用于向单个模型发起一次提问。  
Use this command to ask a single model one question.

```bash
agora a "..."
agora a "..." --model <model-id>
```

参数说明：  
Options:

- `-q, --question <question>`：必填问题文本。  
  `-q, --question <question>`: required question text.
- `-m, --model <model>`：可选模型覆盖。  
  `-m, --model <model>`: optional model override.

兼容长命令：`agora ask --question "..."`。  
Compatible long form: `agora ask --question "..."`

### `agora c`

用于启动或恢复单模型多轮对话。  
Use this command to start or resume a single-model multi-turn chat session.

```bash
agora c
agora c "Help me stress-test a product plan before I commit to it."
agora c --model <model-id>
agora c --conversation-id <conversation-id>
agora c --conversation-id <conversation-id> "Continue from the strongest objection."
```

参数说明：  
Options:

- `-m, --model <model>`：指定会话模型。  
  `-m, --model <model>`: choose the model for the chat session.
- `-c, --conversation-id <conversationId>`：恢复已有 chat 会话。  
  `-c, --conversation-id <conversationId>`: resume an existing chat conversation.

补充说明：位置参数 prompt 是可选的。  
Additional note: the positional prompt is optional.

- `agora c` 会进入空的交互式会话。  
  `agora c` enters an empty interactive session.
- `agora c "..."` 会在启动后立即发送第一条消息。  
  `agora c "..."` sends the first message immediately after startup.
- `agora c -c <conversation-id> "..."` 会恢复旧会话并立刻继续。  
  `agora c -c <conversation-id> "..."` resumes an existing session and continues immediately.

兼容长命令：`agora chat`。  
Compatible long form: `agora chat`.

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

目前已打通的真实主入口是 `agora t`、`agora a` 和 `agora c`。  
The currently working primary entrypoints are `agora t`, `agora a`, and `agora c`.

围绕完整 CLI 的工程化加固仍在 Phase A2 中继续推进。  
Engineering hardening for the full CLI is still being advanced in Phase A2.

### 直接运行 `agora` 会发生什么？ / What happens if I run `agora` directly?

无参数运行时，CLI 会清空当前终端显示，并在顶部展示 logo、推荐工作流和快捷入口。  
When run without arguments, the CLI clears the terminal and shows the logo, suggested workflows, and shortcut entrypoints at the top.

非 TTY 场景下会回退到普通帮助输出。  
In non-TTY environments it falls back to standard help output.

### 我应该先用 `t`、`a` 还是 `c`？ / Should I start with `t`, `a`, or `c`?

推荐顺序是 `t`、`a`、`c`。  
The recommended order is `t`, then `a`, then `c`.

`t` 代表 Agora 的核心差异化能力，`a` 最适合做快速试跑，`c` 更适合在单模型上下文中持续深入。  
`t` represents Agora's core differentiator, `a` is best for a quick smoke run, and `c` is better for sustained iteration inside a single-model context.

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

TUI 会和 CLI 一样复用同一套 core 层，并计划按相同的源码可见非商用互惠许可发布。  
The TUI will reuse the same core layer as the CLI and is planned to ship under the same source-available, noncommercial, reciprocal license.

Web UI 会继续复用 core 层，但产品化实现保持闭源。  
The Web UI will also reuse the core layer, but the productized implementation will remain closed source.

### 当前支持联网背景拉齐吗？ / Does Agora support web grounding today?

当前已存在 grounding 配置与实现入口，用于在强时效问题上先补齐背景。  
There is already a grounding configuration and implementation entrypoint for injecting current context on time-sensitive questions.

当前默认 provider 是 `duckduckgo`，后续能力仍会继续加固。  
The current default provider is `duckduckgo`, and the grounding layer will continue to be hardened.

### 这个仓库的许可证是什么？ / What license does this repository use?

本仓库使用自定义的 [Agora Community License 1.0](./LICENSE)。  
This repository uses the custom [Agora Community License 1.0](./LICENSE).

它允许查看、修改和非商用分发源码，但禁止商业使用，并要求修改版在对外分发或对外提供服务时继续公开对应源码。  
It allows viewing, modifying, and noncommercial redistribution of the source code, but prohibits commercial use and requires modified versions to continue publishing corresponding source code when distributed or offered as a service.

## 路线图 / Roadmap

| 阶段 / Phase | 状态 / Status | 目标 / Goals | 公开边界 / Release Boundary |
| --- | --- | --- | --- |
| Phase A1 | 已完成。<br>Completed. | 最小引擎闭环：`a`、`t`、3 轮讨论、匿名化、书记员总结、JSONL。<br>Minimum engine loop: `a`, `t`, three rounds, anonymization, secretary summary, and JSONL logs. | 源码可见、禁止商用、修改版需公开源码。<br>Source-available, noncommercial, reciprocal. |
| Phase A2 | 进行中。<br>In progress. | 计费、完整 CLI、事件契约一致性、测试矩阵、grounding 工程化。<br>Billing, full CLI, event-contract alignment, test matrix, and grounding hardening. | 源码可见、禁止商用、修改版需公开源码。<br>Source-available, noncommercial, reciprocal. |
| Phase B | 未开始。<br>Not started. | Web 最小壳接入，同一套 core 驱动 Web renderer。<br>Minimal Web shell on top of the same core renderer boundary. | Core 源码可见，Web 产品层私有。<br>Core source-available, product Web layer private. |
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
