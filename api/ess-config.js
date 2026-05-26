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
      model: 'qwen-max'
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
      max_tokens: cfg.max_tokens || 8192,
      stream: !!stream
    };
    if (cfg.reasoning_effort) body.reasoning_effort = cfg.reasoning_effort;
    if (cfg.thinking) body.thinking = cfg.thinking;

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
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (e) {
      }
      return res.end();
    }

    const data = await resp.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const msg = data.choices[0].message;
      if (msg.reasoning_content && !msg.content) {
        msg.content = msg.reasoning_content;
      }
      if (msg.content && msg.reasoning_content) {
        const jsonMatch = msg.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          msg.content = jsonMatch[0];
        }
      }
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: `Proxy error: ${e.message}` });
  }
}
