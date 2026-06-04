# 前端 patch（应用于 425accf6__50a0c564-5d94-4498-8c6e-895d796df4f2.html）

## 改动说明

后端已经把 MiniMax（M3）的 Anthropic SSE 事件**统一转成了 OpenAI 风格**
（`content_block_delta.delta.thinking` → `delta.reasoning_content`，
`delta.text` → `delta.content`），所以前端 SSE 解析代码不用改。

**前端只需要改 3 处**，都是把 minimax 从"非流式"切到"流式 + 思考过程实时显示"。

---

## 改动 1：callLLM 函数里的 forceNonStream 标志（line 3243）

**改前**：
```js
async function callLLM(messages, useStream, providerOverride) {
  const provider = providerOverride || document.getElementById('llmProvider').value;
  const forceNonStream = (provider === 'minimax');
  if (useStream && !forceNonStream) {
```

**改后**：
```js
async function callLLM(messages, useStream, providerOverride) {
  const provider = providerOverride || document.getElementById('llmProvider').value;
  // minimax 现在也走流式（后端已把 Anthropic SSE 转成 OpenAI 风格 delta，思考过程实时显示）
  const forceNonStream = false;
  if (useStream && !forceNonStream) {
```

---

## 改动 2：generateSolution 里的提示文案（line 3476）

**改前**：
```js
addLog(`调用${provider.toUpperCase()} API${provider==='minimax'?' (非流式,思考时间较长请耐心等待)':' (SSE流式)'}...`, 'step');
```

**改后**：
```js
addLog(`调用${provider.toUpperCase()} API (SSE流式,思考过程实时显示)...`, 'step');
```

---

## 改动 3：mgGenerateSolution 里的提示文案（line 6116）

**改前**：
```js
mgAddLog(`调用${provider.toUpperCase()} API${provider==='minimax'?' (非流式,思考时间较长请耐心等待)':''}...`,'step');
```

**改后**：
```js
mgAddLog(`调用${provider.toUpperCase()} API (SSE流式,思考过程实时显示)...`,'step');
```

---

## 不需要改的地方（保持原样即可）

- `delta.reasoning_content` / `delta.content` 的解析逻辑（line 3273-3281）
- `addLog` 里读 `msg.reasoning_content`（line 3486）
- `mgGenerateSolution` 里读 `data.choices?.[0]?.message?.reasoning_content`（line 6143）
- `updateStreamLog` 函数（line 3389+）

因为后端把 Anthropic 的 `content[].type==='thinking'` 提取出来放进了
`message.reasoning_content`，`content[].type==='text'` 放进了 `message.content`，
跟其他 provider 的字段名一致，前端无需感知协议差异。
