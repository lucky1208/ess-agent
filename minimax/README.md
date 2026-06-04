# MiniMax-M3 调用失败 — 完整修复方案

## 根因

你的后端 `ess-config.js` 里 minimax 配置有 3 个 MiniMax API 不认的字段：

| 字段 | 状态 | 说明 |
|------|------|------|
| `max_completion_tokens: 131072` | ❌ 错的字段名 + 过大 | MiniMax 用 `max_tokens`；131072 可能超 MiniMax 限制 |
| `thinking: { type: 'adaptive' }` | ❌ 协议不支持 | MiniMax thinking 仅在 Anthropic 兼容模式支持 |
| `reasoning_split: true` | ❌ 不存在的参数 | 任何 API 都不认 |

而且你前端 `callLLM` 依赖的 `delta.reasoning_content` 字段，在 MiniMax OpenAI 兼容端点根本不返回——要拿 M3 的思考过程，必须切到 Anthropic 兼容端点。

## 修复方案

切到 MiniMax **Anthropic 兼容端点**（`https://api.minimaxi.com/anthropic/v1/messages`），
后端把 Anthropic SSE / 响应统一转成 OpenAI 风格返回，**前端解析代码零改动**。

## 改动清单

### 后端
- `/workspace/fix/ess-config.js` — 完整重写后的版本，直接覆盖
- 改动要点：
  - minimax URL 改 Anthropic 兼容端点
  - 去掉 `max_completion_tokens` / `reasoning_split`，改用 `max_tokens: 16384`
  - 用 Anthropic 格式 `thinking: { type: 'enabled', budget_tokens: 8192 }`
  - 新增 `handleAnthropicProvider` 函数
  - Anthropic SSE events → OpenAI-style SSE（前端零改动）
  - Anthropic JSON → OpenAI `chat.completion` JSON
  - `content[].type==='thinking'` → `message.reasoning_content`
  - `content[].type==='text'` → `message.content`

### 前端
- `/workspace/fix/callLLM-frontend-patch.md` — 3 处小改
  - 去掉 `forceNonStream = (provider === 'minimax')`，minimax 也走流式
  - 改 2 处提示文案：`(非流式,思考时间较长请耐心等待)` → `(SSE流式,思考过程实时显示)`

### 验证
- `smoke-test.js` — 流式响应转换测试（5/5 通过）
- `smoke-test-nonstream.js` — 非流式响应转换测试（7/7 通过）

## 部署步骤

```bash
# 1. 备份旧后端
cp api/ess-config.js api/ess-config.js.bak

# 2. 部署新后端
cp /workspace/fix/ess-config.js api/ess-config.js

# 3. 前端按 patch 文档改 3 处
#    （位置都在用户给的 425accf6_...html 里，对应行号 3243 / 3476 / 6116）

# 4. 本地验证后端（不需要真实 API key）
node /workspace/fix/smoke-test.js
node /workspace/fix/smoke-test-nonstream.js
```

## 兼容性

- 其他 provider（deepseek / glm / bailian）完全不动
- 前端 SSE 解析逻辑（`delta.reasoning_content` / `delta.content`）不动
- 前端 `addLog` 读 `msg.reasoning_content` 不动
- 前端 `mgGenerateSolution` 读 `reasoning_content` 不动

## 已知限制

1. `budget_tokens: 8192` 是 M3 思考链的最大 token 预算。如果思考过程特别长，会被截断
2. 单次响应 `max_tokens: 16384`（输出上限），超出部分会被截断
3. MiniMax M3 走 Anthropic 协议时**只支持文本输入**（图片/视频多模态输入当前不在这个端点上暴露）
