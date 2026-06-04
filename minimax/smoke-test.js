// 模拟测试：把 Anthropic SSE 输入，跑我的转换逻辑，检查 OpenAI 风格输出
// 用法: node /workspace/fix/smoke-test.js

// 读 ess-config.js 里的 handleAnthropicProvider
const fs = require('fs');
const src = fs.readFileSync('/workspace/fix/ess-config.js', 'utf8');

// 提取 handleAnthropicProvider 函数（用 eval 模拟，简单粗暴）
// 因为有 ESM 语法，去掉 export 头
const stripped = src.replace(/^export\s+default\s+async\s+function\s+handler[\s\S]*?try\s*\{[\s\S]*?return\s+await\s+handleAnthropicProvider[\s\S]*?\}\s*catch[\s\S]*?\n\}/m, '');

// 简单粗暴：直接 import
(async () => {
  // 把 export default 转成可被 require 的形式
  const modSrc = src
    .replace(/^export\s+default\s+async\s+function\s+handler/m, 'async function handler')
    .replace(/^async\s+function\s+(handleAnthropicProvider|handleOpenAIProvider)/gm, 'async function $1');

  // 把文件写到临时位置
  const tmpPath = '/tmp/ess-config-test.cjs';
  fs.writeFileSync(tmpPath, modSrc + '\nmodule.exports = { handleAnthropicProvider };');

  const { handleAnthropicProvider } = require(tmpPath);

  // 伪造的 Anthropic SSE 输入
  const fakeSSE = [
    'event: message_start',
    'data: {"type":"message_start","message":{"id":"msg_01","role":"assistant","model":"MiniMax-M3"}}',
    '',
    'event: content_block_start',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"让我想想"}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"这个项目需要光伏+储能"}}',
    '',
    'event: content_block_stop',
    'data: {"type":"content_block_stop","index":0}',
    '',
    'event: content_block_start',
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"{\\"topology\\":\\"AC\\"}"}}',
    '',
    'event: content_block_stop',
    'data: {"type":"content_block_stop","index":1}',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}',
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    '',
    ''
  ].join('\n');

  // 编码成字节流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(fakeSSE));
      controller.close();
    }
  });

  // 伪造 fetch 响应
  const fakeResp = new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  });

  global.fetch = async () => fakeResp;

  // 伪造 req/res
  const cfg = {
    url: 'https://api.minimaxi.com/anthropic/v1/messages',
    key: 'fake-key',
    model: 'MiniMax-M3',
    max_tokens: 16384,
    thinking: { type: 'enabled', budget_tokens: 8192 },
    anthropic_version: '2023-06-01',
    protocol: 'anthropic',
    adapt_to_openai: true
  };

  let captured = '';
  const fakeRes = {
    setHeader: () => {},
    write: (s) => { captured += s; },
    end: () => {},
    status: () => ({ json: () => {} })
  };

  const messages = [
    { role: 'system', content: '你是助手' },
    { role: 'user', content: '你好' }
  ];

  await handleAnthropicProvider({ method: 'POST' }, fakeRes, cfg, messages, true);

  console.log('=== STREAM OUTPUT ===');
  console.log(captured);
  console.log('=== END ===\n');

  // 校验
  const lines = captured.split('\n\n').filter(Boolean);
  const parsed = lines.map(l => {
    const m = l.match(/^data: (.+)$/m);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return m[1] === '[DONE]' ? '[DONE]' : null; }
  }).filter(Boolean);

  console.log('=== PARSED EVENTS ===');
  parsed.forEach((p, i) => console.log(i, JSON.stringify(p)));

  // 断言
  const assertions = [
    [parsed[0]?.choices?.[0]?.delta?.reasoning_content === '', '第一个事件应该是空 thinking 标记'],
    [parsed.find(p => p.choices?.[0]?.delta?.reasoning_content === '让我想想'), '应该包含 "让我想想" reasoning'],
    [parsed.find(p => p.choices?.[0]?.delta?.reasoning_content === '这个项目需要光伏+储能'), '应该包含 "这个项目需要光伏+储能" reasoning'],
    [parsed.find(p => p.choices?.[0]?.delta?.content === '{"topology":"AC"}'), '应该包含 text 内容'],
    [parsed[parsed.length - 1] === '[DONE]', '最后应该是 [DONE]'],
  ];

  console.log('\n=== ASSERTIONS ===');
  let allPass = true;
  assertions.forEach(([cond, msg]) => {
    console.log((cond ? '✅' : '❌') + ' ' + msg);
    if (!cond) allPass = false;
  });

  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
