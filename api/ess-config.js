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
      url: 'https://platform.minimaxi.com/v1/responses',
      key: process.env.MINIMAX_API_KEY || 'sk-api-RVlZpTmcDXW6gDYDWjEQrwHE9HMordfj-b98N8q_j95jt-0OMjvAJpHBgWDBOaiQh4DSEAQbq9QGZcrVABNh1UwCZfrxyVQ3pWJXvuP6_OR08pD04y0o1JI',
      model: 'MiniMax-M3',
      max_tokens: 65536,
      apiType: 'minimax_responses'
    }
  };

  const cfg = configs[provider || 'deepseek'];
  if (!cfg || !cfg.key) {
    return res.status(400).json({ error: `Provider "${provider}" not configured. Set API key in Vercel env vars.` });
  }

  try {
    if (cfg.apiType === 'minimax_responses') {
      return await handleMiniMaxResponses(req, res, cfg, messages);
    }
    return await handleOpenAIProvider(req, res, cfg, messages, stream);
  } catch (e) {
    return res.status(500).json({ error: `Proxy error: ${e.message}` });
  }
}

async function handleMiniMaxResponses(req, res, cfg, messages) {
  let systemPrompt = '';
  const conversationParts = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n' : '') + msg.content;
    } else if (msg.role === 'user') {
      conversationParts.push(msg.content);
    } else if (msg.role === 'assistant') {
      conversationParts.push(msg.content);
    }
  }

  let inputText = '';
  if (systemPrompt) {
    inputText = systemPrompt + '\n\n';
  }
  inputText += conversationParts.join('\n');

  const body = {
    model: cfg.model,
    input: inputText
  };

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
    return res.status(resp.status).json({ error: `MiniMax API error (${resp.status}): ${errText.substring(0, 500)}` });
  }

  const data = await resp.json();

  let reasoningText = '';
  let contentText = '';

  if (data.output && Array.isArray(data.output)) {
    for (const block of data.output) {
      if (block.type === 'reasoning' && block.content && Array.isArray(block.content)) {
        for (const c of block.content) {
          if (c.type === 'reasoning_text') {
            reasoningText += c.text || '';
          }
        }
      } else if (block.type === 'message' && block.content && Array.isArray(block.content)) {
        for (const c of block.content) {
          if (c.type === 'output_text') {
            contentText += c.text || '';
          }
        }
      }
    }
  }

  if (!contentText && reasoningText) {
    const jsonMatch = reasoningText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { JSON.parse(jsonMatch[0]); contentText = jsonMatch[0]; } catch(e) {}
    }
    if (!contentText) {
      const jsonBlocks = reasoningText.match(/```json\s*([\s\S]*?)```/g);
      if (jsonBlocks) {
        for (const block of jsonBlocks) {
          const cleaned = block.replace(/```json\n?/g,'').replace(/```/g,'').trim();
          try { JSON.parse(cleaned); contentText = cleaned; break; } catch(e2) {}
        }
      }
    }
  }

  if (contentText) {
    let c = contentText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    if (!c.startsWith('{')) {
      const jsonMatch = c.match(/\{[\s\S]*\}/);
      if (jsonMatch) c = jsonMatch[0];
    }
    try {
      JSON.parse(c);
      contentText = c;
    } catch (e) {
      const allJsons = [];
      const re = /\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}/g;
      let m;
      while ((m = re.exec(c)) !== null) {
        try { allJsons.push({json: JSON.parse(m[0]), len: m[0].length}); } catch(e2) {}
      }
      if (allJsons.length > 0) {
        allJsons.sort((a,b) => b.len - a.len);
        contentText = JSON.stringify(allJsons[0].json);
      }
    }
  }

  const openaiFormat = {
    choices: [{
      message: {
        content: contentText,
        reasoning_content: reasoningText
      }
    }],
    usage: {
      total_tokens: data.usage?.total_tokens || 0
    }
  };

  return res.status(200).json(openaiFormat);
}

async function handleOpenAIProvider(req, res, cfg, messages, stream) {
  const body = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature !== undefined ? cfg.temperature : 0.3,
    max_tokens: cfg.max_tokens || 16384,
    stream: !!stream
  };
  if (cfg.reasoning_effort) body.reasoning_effort = cfg.reasoning_effort;
  if (cfg.thinking) body.thinking = cfg.thinking;
  if (cfg.enable_thinking) body.enable_thinking = true;

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
    let lastWrite = Date.now();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        lastWrite = Date.now();
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
