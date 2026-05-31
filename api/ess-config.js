export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
      key: process.env.BAILIAN_API_KEY,
      model: 'qwen3-235b-a22b',
      max_tokens: 65536,
      enable_thinking: true
    }
  };

  const cfg = configs[provider || 'deepseek'];
  if (!cfg || !cfg.key) {
    return res.status(400).json({ error: `Provider "${provider}" not configured. Set API key in Vercel env vars.` });
  }

  try {
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
      body: JSON.stringify(body)
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
      if (msg.reasoning_content && !msg.content) {
        msg.content = msg.reasoning_content;
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
  } catch (e) {
    return res.status(500).json({ error: `Proxy error: ${e.message}` });
  }
}
