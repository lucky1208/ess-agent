// Vercel Serverless Handler
// 修复要点：
// 1) minimax 改用 MiniMax Anthropic 兼容端点（MiniMax M3 的 thinking 仅在该模式支持）
// 2) 去掉 max_completion_tokens / reasoning_split 等 MiniMax 不识别的字段
// 3) 新增 handleAnthropicProvider 处理 Anthropic Messages 协议
// 4) Anthropic 响应统一转成 OpenAI 风格返回前端，最小化前端改动

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { provider, messages, stream } = req.body;

  const configs = {
    deepseek: {
      url: 'https://api.deepseek.com/v1/chat/completions',
      key: process.env.DEEPSEEK_API_KEY,
      model: 'deepseek-v4-pro',
      max_tokens: 65536,
      reasoning_effort: 'high',
      thinking: { type: 'enabled' }
    },
    glm: {
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      key: process.env.GLM_API_KEY,
      model: 'glm-5.1',
      thinking: { type: 'enabled' },
      max_tokens: 65536,
      temperature: 1.0
    },
    bailian: {
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      key: process.env.BAILIAN_API_KEY || 'sk-5b4e6608364b48259187f6d4b121f38a',
      model: 'qwen3-235b-a22b',
      max_tokens: 16384,
      enable_thinking: true
    },
    minimax: {
      // ✅ 切到 Anthropic 兼容端点（MiniMax M3 的 thinking/reasoning 仅在该模式支持）
      url: 'https://api.minimaxi.com/anthropic/v1/messages',
      key: process.env.MINIMAX_API_KEY || 'sk-api-RVlZpTmcDXW6gDYDWjEQrwHE9HMordfj-b98N8q_j95jt-0OMjvAJpHBgWDBOaiQh4DSEAQbq9QGZcrVABNh1UwCZfrxyVQ3pWJXvuP6_OR08pD04y0o1JI',
      model: 'MiniMax-M3',
      // ✅ Anthropic 协议：max_tokens 必需，thinking 可选
      max_tokens: 65536,
      thinking: { type: 'enabled', budget_tokens: 32768 },
      // ✅ 用 anthropic-version 头标识协议版本
      anthropic_version: '2023-06-01',
      // 标记走 Anthropic 协议，handler 分发用
      protocol: 'anthropic',
      // 是否把响应转 OpenAI 风格（前端不用改）
      adapt_to_openai: true
    }
  };

  const cfg = configs[provider || 'deepseek'];
  if (!cfg || !cfg.key) {
    return res.status(400).json({ error: `Provider "${provider}" not configured. Set API key in Vercel env vars.` });
  }

  try {
    if (cfg.protocol === 'anthropic') {
      return await handleAnthropicProvider(req, res, cfg, messages, stream);
    }
    return await handleOpenAIProvider(req, res, cfg, messages, stream);
  } catch (e) {
    return res.status(500).json({ error: `Proxy error: ${e.message}` });
  }
}


// ============================================================
// OpenAI 兼容协议（deepseek / glm / bailian）
// ============================================================
async function handleOpenAIProvider(req, res, cfg, messages, stream) {
  const body = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature !== undefined ? cfg.temperature : 0.3,
    stream: !!stream
  };
  if (cfg.max_completion_tokens) body.max_completion_tokens = cfg.max_completion_tokens;
  else body.max_tokens = cfg.max_tokens || 16384;
  if (cfg.reasoning_effort) body.reasoning_effort = cfg.reasoning_effort;
  if (cfg.thinking) body.thinking = cfg.thinking;
  if (cfg.enable_thinking) body.enable_thinking = true;
  if (cfg.reasoning_split) body.reasoning_split = true;

  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.key}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(280000)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return res.status(resp.status).json({ error: `LLM API error: ${errText}` });
  }

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      res.write(`data: {"error":"stream read error: ${e.message}"}\n\n`);
    }
    return res.end();
  }

  const data = await resp.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const msg = data.choices[0].message;
    if (!msg.content && msg.reasoning_content) {
      const rc = msg.reasoning_content;
      const jsonMatch = rc.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { JSON.parse(jsonMatch[0]); msg.content = jsonMatch[0]; } catch(e) {}
      }
      if (!msg.content) {
        const jsonBlocks = rc.match(/```json\s*([\s\S]*?)```/g);
        if (jsonBlocks) {
          for (const block of jsonBlocks) {
            const cleaned = block.replace(/```json\n?/g,'').replace(/```/g,'').trim();
            try { JSON.parse(cleaned); msg.content = cleaned; break; } catch(e2) {}
          }
        }
      }
      if (!msg.content) {
        msg.content = rc;
      }
    }
    if (msg.content) {
      let c = msg.content.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      if (!c.startsWith('{')) {
        const jsonMatch = c.match(/\{[\s\S]*\}/);
        if (jsonMatch) c = jsonMatch[0];
      }
      try {
        JSON.parse(c);
        msg.content = c;
      } catch (e) {
        const allJsons = [];
        const re = /\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}/g;
        let m;
        while ((m = re.exec(c)) !== null) {
          try { allJsons.push({json: JSON.parse(m[0]), len: m[0].length}); } catch(e2) {}
        }
        if (allJsons.length > 0) {
          allJsons.sort((a,b) => b.len - a.len);
          msg.content = JSON.stringify(allJsons[0].json);
        }
      }
    }
  }
  return res.status(200).json(data);
}


// ============================================================
// Anthropic 兼容协议（minimax / MiniMax M3）
// ============================================================
async function handleAnthropicProvider(req, res, cfg, messages, stream) {
  // 1) 构造 Anthropic Messages 请求体
  //    Anthropic 要求 system 消息独立放在顶层 system 字段，messages 里只放 user/assistant
  let systemText = '';
  const anthMessages = [];
  for (const m of (messages || [])) {
    if (m.role === 'system') {
      systemText += (systemText ? '\n\n' : '') + (typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || ''));
    } else {
      anthMessages.push({ role: m.role, content: m.content });
    }
  }

  const body = {
    model: cfg.model,
    messages: anthMessages,
    max_tokens: cfg.max_tokens || 16384,
    stream: !!stream
  };
  if (systemText) body.system = systemText;
  if (cfg.thinking) body.thinking = cfg.thinking;       // { type: 'enabled', budget_tokens: N }
  if (cfg.temperature !== undefined) body.temperature = cfg.temperature;

  // 2) 发请求
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.key}`,
    'anthropic-version': cfg.anthropic_version || '2023-06-01'
  };

  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(280000)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return res.status(resp.status).json({ error: `LLM API error: ${errText}` });
  }

  // 3) 流式：把 Anthropic SSE 转 OpenAI 风格 SSE，前端解析逻辑零改动
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // 用于按 content_block 路由：可能是 thinking 或 text
    const blockTypes = {}; // index -> 'thinking' | 'text'

    const send = (obj) => {
      if (typeof obj === 'string') {
        // OpenAI SSE 约定: [DONE] 不加 JSON 引号
        res.write(`data: ${obj}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Anthropic SSE 事件以 \n\n 分隔
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          // 解析 event: + data: 行
          let eventName = '';
          let dataLine = '';
          for (const line of evt.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          let payload;
          try { payload = JSON.parse(dataLine); } catch (e) { continue; }

          switch (eventName) {
            case 'content_block_start': {
              const cb = payload.content_block || {};
              blockTypes[payload.index] = cb.type;  // 'thinking' or 'text'
              // 通知前端"开始一个块"
              send({
                choices: [{
                  index: 0,
                  delta: cb.type === 'thinking'
                    ? { reasoning_content: '' }   // 标记开始思考
                    : { role: 'assistant', content: '' }
                }]
              });
              break;
            }
            case 'content_block_delta': {
              const d = payload.delta || {};
              const idx = payload.index;
              const type = blockTypes[idx];
              if (type === 'thinking' && typeof d.thinking === 'string') {
                send({ choices: [{ index: 0, delta: { reasoning_content: d.thinking } }] });
              } else if (type === 'text' && typeof d.text === 'string') {
                send({ choices: [{ index: 0, delta: { content: d.text } }] });
              }
              break;
            }
            case 'content_block_stop': {
              delete blockTypes[payload.index];
              break;
            }
            case 'message_delta': {
              // 包含 stop_reason / stop_sequence，转换成 finish_reason
              if (payload.delta && payload.delta.stop_reason) {
                send({ choices: [{ index: 0, delta: {}, finish_reason: payload.delta.stop_reason }] });
              }
              if (payload.usage) {
                send({ usage: payload.usage });
              }
              break;
            }
            case 'message_stop': {
              send('[DONE]');
              break;
            }
            case 'ping':
            case 'message_start':
            default:
              // 忽略
              break;
          }
        }
      }
    } catch (e) {
      res.write(`data: {"error":"stream read error: ${e.message}"}\n\n`);
    }
    return res.end();
  }

  // 4) 非流式：Anthropic 响应 → OpenAI 风格
  //    content: [
  //      { type: 'thinking', thinking: '...' },
  //      { type: 'text', text: '...' }
  //    ]
  //    → choices[0].message = { content, reasoning_content }
  const data = await resp.json();
  const blocks = Array.isArray(data.content) ? data.content : [];
  let reasoning = '';
  let text = '';
  for (const b of blocks) {
    if (b.type === 'thinking') reasoning += b.thinking || '';
    else if (b.type === 'text') text += b.text || '';
  }

  const openaiStyle = {
    id: data.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: data.model || cfg.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text, reasoning_content: reasoning },
      finish_reason: data.stop_reason || 'stop'
    }],
    usage: data.usage || {}
  };
  return res.status(200).json(openaiStyle);
}
