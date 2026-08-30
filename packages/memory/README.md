# @ciels/memory

`@ciels/memory` 为 Ciel 提供按天记忆、长期记忆、搜索和语义召回。它以 Corex Plugin 接入，
自动贡献四个 Memory Tools 和一个只读 Projector。

## 快速使用

```ts
import { memoryPlugin } from '@ciels/memory';
import { defineCiel } from 'corex';

const memory = memoryPlugin({
  name: 'memory',

  // 当前业务场景，例如直播间、项目或人物。
  scope: () => ({
    id: `room:${currentRoom.id}`,
    label: currentRoom.name,
  }),

  // 这是 PGlite 数据目录，不是 Markdown 文件或单个数据库文件。
  store: { path: '.ciel-data/memory' },
  embedder,

  // Memory Agent 默认继承主 Ciel 的 model、stream 等配置。
  agent: { maxTurns: 4 },
  instructions: '只记录可以确认的事实。',

  projector: {
    recentDays: 3,
    maxEntriesPerDay: 20,
  },
});

const ciel = defineCiel({
  id: 'blive-main',
  instructions,
  model,
  plugins: [memory],
});

await ciel.start();
await ciel.stop();
```

`memoryPlugin()` 使用当前 Ciel 的 `id` 作为默认 Namespace，并复用主 Agent 的模型配置，但不会继承
主 Ciel 的 instructions、会话历史、Tools 或 prompt。Memory Agent 拥有独立提示词和任务队列。

## 数据如何保存

PGlite 是唯一事实库，正文和向量分开保存：

```text
PGlite
├── daily_memory_entries         每日记忆正文
├── long_term_memory_revisions   长期记忆正文及 revision
├── memory_namespaces            Namespace
├── memory_scopes                Scope
├── memory_consolidated_dates    已结算日期
└── memory_embeddings            pgvector 语义索引
```

- 每日记忆和长期记忆都以完整文本保存在关系表中，并非只保存向量。
- `memory_embeddings` 只用于语义召回，通过记录 ID 关联正文。
- `memory_search` 查询正文和结构化字段；`memory_recall` 使用 pgvector 找候选，再由 Memory Agent 整理。
- Projector 读取正文后临时生成 Markdown 格式的 Agent 上下文。
- 当前不会写出 `MEMORY.md` 或 `YYYY-MM-DD.md` 文件。

`store.path` 是 PGlite 数据目录；测试可使用 `{ path: ':memory:' }` 创建纯内存数据库。

## 记忆层级

### 每日记忆

每日记忆记录实际发生的经历，按 `Namespace + Scope + YYYY-MM-DD` 隔离。Memory Agent 会先清理
推测和重复表达，再写入正文与向量。可通过 `idempotencyKey` 避免重复提交。

### 长期记忆

长期记忆保存跨日期仍然有效的事实、偏好和关系。日期结束后，Memory Agent 根据每日记忆生成
新的完整 revision；旧 revision 保留用于追溯。

跨天结算是惰性的：新日期首次写入、`flush()` 或 `close()` 时处理已经结束的日期，不需要常驻
定时器。

## 隔离

- Namespace 是硬隔离边界，默认使用 `ciel.id`，也可通过 `MemoryOptions.id` 覆盖。
- Scope 是同一 Namespace 内的业务场景，由 `scope()` 动态返回。
- `current` 只访问当前 Scope，`global` 访问全局记忆。
- 跨 Scope 查询必须显式使用 `all`，结果始终携带来源 Scope。

## Tools

| Tool              | 作用                                                       |
| ----------------- | ---------------------------------------------------------- |
| `memory_remember` | 提交值得记住的经历，由 Memory Agent 总结后写入每日记忆。   |
| `memory_update`   | 根据更正说明生成新的长期记忆 revision。                    |
| `memory_recall`   | 使用向量召回相关记忆，并由 Memory Agent 去重、保留来源。   |
| `memory_search`   | 确定性搜索原始记录，支持 Scope、日期、种类和游标分页过滤。 |

Projector 默认向主 Agent 提供：

1. 全局长期记忆。
2. 当前 Scope 的长期记忆。
3. 当前 Scope 最近若干天的每日记忆。

Projector 只读取已提交数据，不执行模型调用，也不会隐式写入记忆。

## 主要配置

```ts
interface MemoryOptions {
  readonly name: string;
  readonly description?: string;
  readonly id?: string;
  readonly scope?: () => MemoryScope | undefined;
  readonly store: MemoryStoreOptions | MemoryStore;
  readonly embedder: EmbeddingModel;
  readonly instructions?: string;
  readonly prompts?: Partial<MemoryPrompts>;
  readonly agent?: Partial<AgentConfig>;
  readonly projector?: MemoryProjectorOptions;
  readonly tools?: MemoryToolOptions;
  readonly now?: () => number;
}
```

- `instructions` 在内置事实性约束后追加业务规则。
- `prompts` 可分别覆盖每日总结、长期整合、长期修订和召回整理提示词。
- `projector` 控制最近天数、每日数量及是否包含全局或当前长期记忆。
- `tools` 控制默认召回范围和查询数量。

底层使用场景可以调用 `createMemory()`，它返回 `tools`、`projector`、`start()`、`flush()` 和
`close()`；通常直接使用 `memoryPlugin()` 即可。
