// api/render_arch.js
// =========================================================================
// ESS Agent — System Architecture Diagram Renderer (Vercel Serverless)
// =========================================================================
// Endpoint: POST /api/render-arch
// Body:     { uem: <UEM JSON> }
// Returns:  { ok, svg, width, height, blocks, arrows, project_id }
//
// 输出 SVG 风格: 大色块 (PV=橙, Battery=绿, Grid=蓝, Load=灰, Controller=紫)
// 适合客户一眼看懂项目分几块, 每块多大, 能量怎么流。
//
// 与 Track B 的 render_svg.js (SLD 一次接线图) 不同:
//   - SLD: 用 IEC 符号 + 细线连接, 工程师看
//   - Arch: 大色块 + 粗箭头, 客户看
// =========================================================================

// ====================== 颜色方案 ======================
const COLOR_PV        = '#F5A623';  // 橙 — 光伏
const COLOR_BATTERY   = '#4CAF50';  // 绿 — 储能
const COLOR_PCS       = '#9C27B0';  // 紫 — 变流器/控制器
const COLOR_GRID      = '#2196F3';  // 蓝 — 电网
const COLOR_LOAD      = '#607D8B';  // 灰 — 负载
const COLOR_DIESEL    = '#795548';  // 棕 — 柴油机
const COLOR_WIND      = '#00BCD4';  // 青 — 风电
const COLOR_TEXT_DARK = '#1a1a1a';
const COLOR_TEXT_LIGHT = '#ffffff';
const COLOR_BG        = '#fafafa';
const COLOR_BORDER    = '#333';
const COLOR_ARROW     = '#444';

const FONT_TITLE  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="16" font-weight="bold"';
const FONT_BODY   = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="12"';
const FONT_SMALL  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="10"';
const FONT_ARROW  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="11" font-weight="bold"';

const WIDTH = 600;
const HEIGHT = 400;

// ====================== 工具函数 ======================
function safeNum(v, dflt = 0) {
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function pickColor(category) {
  return {
    pv:      COLOR_PV,
    battery: COLOR_BATTERY,
    pcs:     COLOR_PCS,
    grid:    COLOR_GRID,
    load:    COLOR_LOAD,
    diesel:  COLOR_DIESEL,
    wind:    COLOR_WIND,
  }[category] || COLOR_LOAD;
}

function escapeXml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ====================== 从 UEM 推断块 ======================
// 输出块数组: 每块 { id, category, title, subtitle, items[], color, x, y, w, h }
// items 是块内的多行文字 (key equipment)
function inferBlocks(uem) {
  const blocks = [];
  const elec = uem.electrical || {};
  const pv_kw      = safeNum(elec.pv_kw, 0);
  const diesel_kw  = safeNum(elec.diesel_kw, 0);
  const wind_kw    = safeNum(elec.wind_kw, 0);
  const load_kw    = safeNum(elec.load_kw, 0);
  const power_kw   = safeNum(elec.power_kw, 0);
  const cap_kwh    = safeNum(elec.capacity_kwh, 0);
  const voltage    = elec.voltage_level || '380V';
  const grid_mode  = elec.grid_mode || 'grid_tied';

  // 1) PV 源
  if (pv_kw > 0) {
    const inverterCount = Math.ceil(pv_kw / 50);  // 50kW 串逆变器 (与 compile.py 一致)
    blocks.push({
      id: 'PV', category: 'pv', color: COLOR_PV,
      title: '光伏阵列 PV',
      subtitle: `${pv_kw} kWp`,
      items: [
        `${inverterCount} 台串逆变器`,
        `${Math.ceil(pv_kw / 8)} 路组串汇流`,
        'MPPT 优化器',
      ],
    });
  }

  // 2) 风电
  if (wind_kw > 0) {
    blocks.push({
      id: 'WIND', category: 'wind', color: COLOR_WIND,
      title: '风电 Wind',
      subtitle: `${wind_kw} kW`,
      items: [
        `${Math.ceil(wind_kw / 100)} 台风机`,
        '变流器机舱',
        '并网保护',
      ],
    });
  }

  // 3) 柴油机 (备用)
  if (diesel_kw > 0) {
    blocks.push({
      id: 'DIESEL', category: 'diesel', color: COLOR_DIESEL,
      title: '柴油机 Diesel',
      subtitle: `${diesel_kw} kW`,
      items: [
        `${Math.ceil(diesel_kw / 200)} 台柴发`,
        'ATS 自动切换',
        '日用油箱',
      ],
    });
  }

  // 4) Battery 储能
  if (cap_kwh > 0) {
    const dcBus = 768;
    const cellV = 3.2;
    const cellAh = 280;
    const perPackKwh = (Math.ceil(dcBus / cellV) * cellV * cellAh) / 1000;
    const packsP = Math.ceil(cap_kwh / perPackKwh);
    const stringsS = Math.ceil(dcBus / cellV);
    blocks.push({
      id: 'BAT', category: 'battery', color: COLOR_BATTERY,
      title: '储能 Battery',
      subtitle: `${cap_kwh} kWh`,
      items: [
        `${packsP}P${stringsS}S 拓扑`,
        `LFP ${Math.floor(perPackKwh)} kWh/簇`,
        `${Math.floor(power_kw / cap_kwh * 60) || 30} min 备电`,
      ],
    });
  }

  // 5) PCS / Controller (变流器 — 永远有,作为能量调度核心)
  if (power_kw > 0 || cap_kwh > 0) {
    const pcsUnit = 125;
    const pcsCount = Math.ceil((power_kw || load_kw) / pcsUnit) + 1;  // N+1
    blocks.push({
      id: 'PCS', category: 'pcs', color: COLOR_PCS,
      title: 'PCS 变流器',
      subtitle: `${(power_kw || load_kw)} kW`,
      items: [
        `${pcsCount} 台 (N+1)`,
        `${pcsUnit} kW/台`,
        'DC-AC 双向',
      ],
    });
  }

  // 6) Grid 电网
  if (grid_mode === 'grid_tied' || grid_mode === 'grid_connected') {
    blocks.push({
      id: 'GRID', category: 'grid', color: COLOR_GRID,
      title: '电网 Grid',
      subtitle: grid_mode === 'grid_tied' ? '10 kV 并网' : voltage,
      items: [
        '双向电能表',
        '并网保护装置',
        '防孤岛保护',
      ],
    });
  }

  // 7) Load 负载
  if (load_kw > 0) {
    blocks.push({
      id: 'LOAD', category: 'load', color: COLOR_LOAD,
      title: '负载 Load',
      subtitle: `${load_kw} kW`,
      items: [
        `${voltage} 配电`,
        '智能电表',
        '需量管理',
      ],
    });
  }

  return blocks;
}

// ====================== 布局: 给每块分配坐标 ======================
// 5 大常见布局模式, 根据块类型自动选
// 默认采用上中下三段式: 源 (上) -> PCS/Controller (中) -> 荷/网 (下)
function layoutBlocks(blocks) {
  const sources = blocks.filter(b => ['pv', 'wind', 'diesel'].includes(b.category));
  const middle = blocks.filter(b => ['battery', 'pcs'].includes(b.category));
  const tails = blocks.filter(b => ['grid', 'load'].includes(b.category));

  const margin = 20;
  const blockW = 160;
  const blockH = 100;
  const gap = 20;

  // 用 Grid 布局简单放置
  // 顶行: sources (左对齐,横向)
  // 中行: middle (居中)
  // 底行: tails (横向)
  const colW = blockW + gap;
  const centerX = (WIDTH - blockW) / 2;

  // Sources (顶)
  const sourceStartX = (WIDTH - sources.length * colW + gap) / 2;
  sources.forEach((b, i) => {
    b.x = sourceStartX + i * colW;
    b.y = margin + 10;
    b.w = blockW;
    b.h = blockH;
  });

  // Middle (中)
  const midStartX = (WIDTH - middle.length * colW + gap) / 2;
  middle.forEach((b, i) => {
    b.x = midStartX + i * colW;
    b.y = (HEIGHT - blockH) / 2 - 10;
    b.w = blockW;
    b.h = blockH;
  });

  // Tails (底)
  const tailStartX = (WIDTH - tails.length * colW + gap) / 2;
  tails.forEach((b, i) => {
    b.x = tailStartX + i * colW;
    b.y = HEIGHT - blockH - margin - 10;
    b.w = blockW;
    b.h = blockH;
  });

  return { sources, middle, tails };
}

// ====================== 箭头路径 ======================
function makeArrow(fromBlock, toBlock, label = '', color = COLOR_ARROW) {
  const fx = fromBlock.x + fromBlock.w / 2;
  const fy = fromBlock.y + fromBlock.h;
  const tx = toBlock.x + toBlock.w / 2;
  const ty = toBlock.y;

  // 折线: 从 from 底部 -> 中间 y -> to 顶部
  const midY = (fy + ty) / 2;
  const path = `M ${fx} ${fy} L ${fx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;

  // 箭头头部 (在终点)
  const arrowHead = `M ${tx - 5} ${ty - 8} L ${tx} ${ty} L ${tx + 5} ${ty - 8}`;

  // 标签位置: 中间水平段上方
  const labelX = (fx + tx) / 2;
  const labelY = midY - 5;

  return {
    path,
    arrowHead,
    label,
    color,
    labelX,
    labelY,
  };
}

// ====================== 渲染块 ======================
function renderBlock(b) {
  const lines = [];
  // 背景矩形 (圆角)
  lines.push(`  <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" ry="8" fill="${b.color}" stroke="${COLOR_BORDER}" stroke-width="2" opacity="0.95"/>`);

  // 顶部色条 (略深)
  const headerH = 22;
  const headerColor = b.color;  // 同色
  lines.push(`  <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${headerH}" rx="8" ry="8" fill="${b.color}" opacity="0.6"/>`);

  // 标题 (居中)
  const titleY = b.y + headerH - 6;
  lines.push(`  <text x="${b.x + b.w / 2}" y="${titleY}" text-anchor="middle" fill="${COLOR_TEXT_LIGHT}" ${FONT_TITLE}>${escapeXml(b.title)}</text>`);

  // 副标题 (capacity)
  const subY = b.y + headerH + 18;
  lines.push(`  <text x="${b.x + b.w / 2}" y="${subY}" text-anchor="middle" fill="${COLOR_TEXT_LIGHT}" ${FONT_BODY}>${escapeXml(b.subtitle)}</text>`);

  // 内部 items
  const itemStartY = subY + 16;
  b.items.forEach((item, i) => {
    lines.push(`  <text x="${b.x + 10}" y="${itemStartY + i * 14}" fill="${COLOR_TEXT_LIGHT}" ${FONT_SMALL}>• ${escapeXml(item)}</text>`);
  });

  return lines.join('\n');
}

// ====================== 渲染箭头 ======================
function renderArrow(a) {
  const lines = [];
  lines.push(`  <path d="${a.path}" fill="none" stroke="${a.color}" stroke-width="2.5" stroke-linecap="round"/>`);
  lines.push(`  <path d="${a.arrowHead}" fill="none" stroke="${a.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (a.label) {
    // 标签背景 (避免压在箭头上看不清)
    const labelW = a.label.length * 11 + 8;
    lines.push(`  <rect x="${a.labelX - labelW / 2}" y="${a.labelY - 12}" width="${labelW}" height="16" rx="3" ry="3" fill="${COLOR_BG}" stroke="${COLOR_BORDER}" stroke-width="0.5" opacity="0.9"/>`);
    lines.push(`  <text x="${a.labelX}" y="${a.labelY}" text-anchor="middle" fill="${a.color}" ${FONT_ARROW}>${escapeXml(a.label)}</text>`);
  }
  return lines.join('\n');
}

// ====================== 主渲染函数 ======================
function renderArchitectureSvg(uem) {
  const project = uem.project || {};
  const projectName = project.name || project.project_id || '储能项目';
  const projectType = (project.type || 'ess').toUpperCase();

  const blocks = inferBlocks(uem);
  if (blocks.length === 0) {
    return minimalSvg('No data — UEM missing electrical params');
  }

  const { sources, middle, tails } = layoutBlocks(blocks);

  // 推断箭头
  const arrows = [];
  const has = (id) => blocks.find(b => b.id === id);

  // Sources -> PCS (如果有 PCS)
  const pcs = has('PCS');
  if (pcs) {
    sources.forEach(src => {
      let label = '';
      if (src.category === 'pv') label = 'DC 1500V';
      else if (src.category === 'wind') label = 'AC 690V';
      else if (src.category === 'diesel') label = 'AC 400V';
      arrows.push(makeArrow(src, pcs, label));
    });
  }

  // Battery <-> PCS
  const bat = has('BAT');
  if (bat && pcs) {
    arrows.push(makeArrow(bat, pcs, 'DC 768V'));
  } else if (pcs && !bat) {
    // PCS -> 负载直接
  }

  // PCS -> Load
  const load = has('LOAD');
  if (pcs && load) {
    arrows.push(makeArrow(pcs, load, 'AC 380V'));
  }

  // PCS <-> Grid (双向)
  const grid = has('GRID');
  if (pcs && grid) {
    arrows.push(makeArrow(pcs, grid, 'AC 并网'));
    // 第二条反向箭头 (从 PCS 到 Grid 也画一条,标签 "电能回馈")
    const gridToPcs = makeArrow(grid, pcs, '馈 电');
    gridToPcs.path = `M ${grid.x + grid.w / 2 - 30} ${grid.y} L ${grid.x + grid.w / 2 - 30} ${(grid.y + pcs.y + pcs.h) / 2} L ${pcs.x + pcs.w / 2} ${(grid.y + pcs.y + pcs.h) / 2} L ${pcs.x + pcs.w / 2} ${pcs.y + pcs.h}`;
    gridToPcs.arrowHead = `M ${pcs.x + pcs.w / 2 - 5} ${pcs.y + pcs.h + 8} L ${pcs.x + pcs.w / 2} ${pcs.y + pcs.h} L ${pcs.x + pcs.w / 2 + 5} ${pcs.y + pcs.h + 8}`;
    gridToPcs.labelX = (grid.x + grid.w / 2 - 30 + pcs.x + pcs.w / 2) / 2;
    gridToPcs.labelY = (grid.y + pcs.y + pcs.h) / 2 - 5;
    arrows.push(gridToPcs);
  }

  // === 组装 SVG ===
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="Microsoft YaHei, Arial, sans-serif">`);
  out.push(`  <defs>`);
  out.push(`    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">`);
  out.push(`      <stop offset="0%" stop-color="${COLOR_BG}"/>`);
  out.push(`      <stop offset="100%" stop-color="#eaeaea"/>`);
  out.push(`    </linearGradient>`);
  out.push(`    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">`);
  out.push(`      <polygon points="0 0, 10 5, 0 10" fill="${COLOR_ARROW}"/>`);
  out.push(`    </marker>`);
  out.push(`  </defs>`);

  // 背景
  out.push(`  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)"/>`);

  // 标题栏
  out.push(`  <rect x="0" y="0" width="${WIDTH}" height="32" fill="${COLOR_BORDER}" opacity="0.85"/>`);
  out.push(`  <text x="15" y="22" fill="#fff" ${FONT_TITLE}>系统架构图 — ${escapeXml(projectName)}</text>`);
  out.push(`  <text x="${WIDTH - 15}" y="22" text-anchor="end" fill="#fff" ${FONT_BODY}>类型: ${escapeXml(projectType)}</text>`);

  // 先画箭头 (在块下面), 让块覆盖箭头端点
  arrows.forEach(a => {
    out.push(renderArrow(a));
  });

  // 画块
  blocks.forEach(b => {
    out.push(renderBlock(b));
  });

  // 图例 (底部)
  const legendY = HEIGHT - 12;
  out.push(`  <text x="10" y="${legendY}" fill="#555" ${FONT_SMALL}>色块含义: `);
  out.push(`<tspan fill="${COLOR_PV}">■</tspan> PV  `);
  out.push(`<tspan fill="${COLOR_BATTERY}">■</tspan> Battery  `);
  out.push(`<tspan fill="${COLOR_PCS}">■</tspan> PCS/Controller  `);
  out.push(`<tspan fill="${COLOR_GRID}">■</tspan> Grid  `);
  out.push(`<tspan fill="${COLOR_LOAD}">■</tspan> Load`);
  out.push(`  </text>`);

  out.push(`</svg>`);
  return out.join('\n');
}

function minimalSvg(msg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#f5f5f5"/>
  <text x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="14" fill="#888">${escapeXml(msg)}</text>
</svg>`;
}

// ====================== Vercel Handler ======================
export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Parse body — accept both {uem: {...}} and bare UEM
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body: ' + e.message });
    }
  }
  const uem = (body && body.uem) ? body.uem : body;
  if (!uem || typeof uem !== 'object') {
    return res.status(400).json({ error: 'Missing UEM JSON in body' });
  }

  try {
    const svg = renderArchitectureSvg(uem);
    const blocks = inferBlocks(uem);
    const projectId = (uem.project && (uem.project.project_id || uem.project.name)) || 'unknown';
    return res.status(200).json({
      ok: true,
      project_id: projectId,
      svg,
      width: WIDTH,
      height: HEIGHT,
      blocks: blocks.map(b => ({ id: b.id, title: b.title, subtitle: b.subtitle })),
      block_count: blocks.length,
    });
  } catch (e) {
    return res.status(500).json({ error: `Render architecture error: ${e.name}: ${e.message}` });
  }
}

// ====================== 导出供测试使用 ======================
export {
  renderArchitectureSvg,
  inferBlocks,
  layoutBlocks,
  makeArrow,
  renderBlock,
  renderArrow,
};