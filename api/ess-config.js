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
      model: 'deepseek-chat-v4-0324'
    },
    glm: {
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      key: process.env.GLM_API_KEY,
      model: 'glm-5.1'
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
    const resp = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.key}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
        stream: !!stream
      })
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
        // client disconnected
      }
      return res.end();
    }

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: `Proxy error: ${e.message}` });
  }
}
