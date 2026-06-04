// 非流式响应转换测试
const fs = require('fs');
const src = fs.readFileSync('/workspace/fix/ess-config.js', 'utf8');

const tmpPath = '/tmp/ess-config-test2.cjs';
const modSrc = src
  .replace(/^export\s+default\s+async\s+function\s+handler/m, 'async function handler')
  .replace(/^async\s+function\s+(handleAnthropicProvider|handleOpenAIProvider)/gm, 'async function $1')
  + '\nmodule.exports = { handleAnthropicProvider };';
fs.writeFileSync(tmpPath, modSrc);

const { handleAnthropicProvider } = require(tmpPath);

// 模拟 Anthropic 非流式 JSON 响应
const fakeAnthropicResp = {
  id: 'msg_01XYZ',
  type: 'message',
  role: 'assistant',
  model: 'MiniMax-M3',
  content: [
    { type: 'thinking', thinking: '先分析负荷情况，再选型。' },
    { type: 'text', text: '{"topology":"AC耦合","sizing":{"bessKwh":2000}}' }
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 150, output_tokens: 80 }
};

global.fetch = async () => new Response(JSON.stringify(fakeAnthropicResp), {
  status: 200,
  headers: { 'content-type': 'application/json' }
});

const cfg = {
  url: 'https://api.minimaxi.com/anthropic/v1/messages',
  key: 'fake',
  model: 'MiniMax-M3',
  max_tokens: 16384,
  thinking: { type: 'enabled', budget_tokens: 8192 },
  anthropic_version: '2023-06-01',
  protocol: 'anthropic',
  adapt_to_openai: true
};

let capturedStatus, capturedJson;
const fakeRes = {
  setHeader: () => {},
  write: () => {},
  end: () => {},
  status: (code) => {
    capturedStatus = code;
    return { json: (j) => { capturedJson = j; } };
  }
};

(async () => {
  await handleAnthropicProvider({ method: 'POST' }, fakeRes, cfg,
    [{ role: 'user', content: 'hi' }], false);

  console.log('=== 转换结果 ===');
  console.log('status:', capturedStatus);
  console.log(JSON.stringify(capturedJson, null, 2));

  const m = capturedJson.choices?.[0]?.message || {};
  const assertions = [
    [capturedJson.object === 'chat.completion', 'object 字段是 chat.completion'],
    [capturedJson.model === 'MiniMax-M3', 'model 字段透传'],
    [m.role === 'assistant', 'role 是 assistant'],
    [m.reasoning_content === '先分析负荷情况，再选型。', 'reasoning_content 从 thinking 块提取'],
    [m.content === '{"topology":"AC耦合","sizing":{"bessKwh":2000}}', 'content 从 text 块提取'],
    [capturedJson.choices[0].finish_reason === 'end_turn', 'finish_reason 透传'],
    [capturedJson.usage.output_tokens === 80, 'usage 透传'],
  ];

  console.log('\n=== 断言 ===');
  let ok = true;
  assertions.forEach(([c, msg]) => { console.log((c ? '✅' : '❌') + ' ' + msg); if (!c) ok = false; });
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
