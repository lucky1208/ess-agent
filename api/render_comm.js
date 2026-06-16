// api/render_comm.js
// =========================================================================
// ESS Agent — Communication Topology Diagram Renderer (Vercel Serverless)
// =========================================================================
// Endpoint: POST /api/render-comm
// Body:     { uem: <UEM JSON> }
// Returns:  { ok, svg, width, height, nodes, links, project_id }
//
// 输出 SVG 风格: 网络拓扑图 (节点 + 链路)
//   - 节点: Cloud / EMS / PCS / BMS / FAS / Meter / Switch
//   - 链路:
//       IEC 61850    → 粗实线 (高速, 红色)
//       Modbus RTU   → 细实线 (中速, 蓝色)
//       4G / Wifi    → 虚线   (无线, 绿色)
//
// 与 render_svg.js (SLD) 和 render_arch.js (架构色块) 都不一样:
//   - SLD: 电气接线, 给工程师
//   - Arch: 系统架构色块, 给客户
//   - Comm: 通信网络拓扑, 给运维/调试
// =========================================================================

// ====================== 颜色方案 ======================
const COLOR_NODE_FILL   = '#ffffff';
const COLOR_NODE_BORDER = '#222';
const COLOR_NODE_TEXT   = '#1a1a1a';
const COLOR_TITLE_BG    = '#37474F';   // 深灰 — 标题栏
const COLOR_TITLE_FG    = '#ffffff';
const COLOR_BG          = '#fafafa';

const COLOR_IEC_61850   = '#D32F2F';   // 红 — 高速工业以太网
const COLOR_MODBUS      = '#1976D2';   // 蓝 — Modbus RTU/TCP
const COLOR_4G_WIFI     = '#388E3C';   // 绿 — 无线
const COLOR_ETHERNET    = '#7B1FA2';   // 紫 — 普通以太网
const COLOR_FIBER       = '#F57C00';   // 橙 — 光纤

const FONT_TITLE  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="16" font-weight="bold"';
const FONT_NODE   = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="12" font-weight="bold"';
const FONT_LABEL  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="10"';
const FONT_LINK   = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold"';
const FONT_LEGEND = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="10"';

const WIDTH = 700;
const HEIGHT = 500;

// ====================== 工具函数 ======================
function safeNum(v, dflt = 0) {
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
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

// 协议识别: 返回 {type, color, dasharray, bandwidth, label}
function protocolInfo(name) {
  const n = String(name || '').toUpperCase();
  if (n.includes('IEC') && n.includes('61850')) {
    return { type: 'iec61850', color: COLOR_IEC_61850, dasharray: '', bandwidth: '100 Mbps', label: 'IEC 61850' };
  }
  if (n.includes('MODBUS')) {
    if (n.includes('TCP')) return { type: 'modbus_tcp', color: COLOR_MODBUS, dasharray: '', bandwidth: '10 Mbps', label: 'Modbus TCP' };
    return { type: 'modbus_rtu', color: COLOR_MODBUS, dasharray: '6,3', bandwidth: '115 kbps', label: 'Modbus RTU' };
  }
  if (n.includes('4G') || n.includes('LTE') || n.includes('5G')) {
    return { type: '4g', color: COLOR_4G_WIFI, dasharray: '4,4', bandwidth: '100 Mbps', label: '4G/LTE' };
  }
  if (n.includes('WIFI') || n.includes('WI-FI')) {
    return { type: 'wifi', color: COLOR_4G_WIFI, dasharray: '4,4', bandwidth: '54 Mbps', label: 'WiFi' };
  }
  if (n.includes('FIBER') || n.includes('光') || n.includes('OLT')) {
    return { type: 'fiber', color: COLOR_FIBER, dasharray: '', bandwidth: '1 Gbps', label: '光纤' };
  }
  if (n.includes('ETHERNET') || n.includes('以太网')) {
    return { type: 'ethernet', color: COLOR_ETHERNET, dasharray: '', bandwidth: '100 Mbps', label: 'Ethernet' };
  }
  // 默认 Modbus RTU
  return { type: 'modbus_rtu', color: COLOR_MODBUS, dasharray: '6,3', bandwidth: '115 kbps', label: name || 'Modbus RTU' };
}

// ====================== 从 UEM 推断节点/链路 ======================
function inferTopology(uem) {
  const elec = uem.electrical || {};
  const special = uem.special_requirements || [];
  const specialArr = Array.isArray(special) ? special : [String(special || '')];

  // 协议列表 (含必选 IEC 61850)
  const protocols = ['IEC 61850'];
  specialArr.forEach(s => {
    if (s) protocols.push(String(s));
  });
  // 去重
  const uniqProtocols = [...new Set(protocols.map(p => p.trim()).filter(Boolean))];

  // 节点清单 (层级)
  // Level 0: Cloud (云端监控)
  // Level 1: EMS (能源管理主控)
  // Level 2: 工业环网 (Switch)
  // Level 3: PCS / BMS / Meter / FAS (设备层)

  const cap = safeNum(elec.capacity_kwh, 0);
  const power = safeNum(elec.power_kw, 0);
  const pcsCount = power > 0 ? Math.min(Math.max(2, Math.ceil(power / 250)), 4) : 2;  // 2-4 台

  const nodes = [
    { id: 'CLOUD', name: '云端监控',    type: 'cloud',   level: 0, x: 350, y: 50,  w: 110, h: 40 },
    { id: 'EMS',   name: 'EMS 总控',    type: 'ems',     level: 1, x: 350, y: 130, w: 110, h: 40 },
    { id: 'SW',    name: '核心交换机',   type: 'switch',  level: 2, x: 350, y: 220, w: 110, h: 40 },
  ];

  // 设备层 (Level 3) — 按 PCS 数量画 2-3 个 PCS + 必备 BMS/FAS/Meter
  const deviceY = 320;
  const pcsWidth = 80;
  const spacing = 100;

  // PCS 节点 (2-3 台)
  const pcsIds = [];
  for (let i = 0; i < pcsCount; i++) {
    const id = `PCS${i + 1}`;
    pcsIds.push(id);
    const x = 130 + i * spacing;
    nodes.push({ id, name: `PCS ${i + 1}`, type: 'pcs', level: 3, x, y: deviceY, w: pcsWidth, h: 40 });
  }

  // BMS (电池管理系统 — 有 cap 才需要)
  if (cap > 0) {
    const x = 130 + pcsCount * spacing;
    nodes.push({ id: 'BMS', name: 'BMS', type: 'bms', level: 3, x, y: deviceY, w: pcsWidth, h: 40 });
  }

  // FAS (消防报警 — 大项目必有)
  if (cap > 200 || power > 200) {
    nodes.push({ id: 'FAS', name: 'FAS 消防', type: 'fas', level: 3, x: 130 + (pcsCount + 1) * spacing, y: deviceY, w: pcsWidth, h: 40 });
  }

  // Meter (双向电能表)
  nodes.push({ id: 'METER', name: '智能电表', type: 'meter', level: 3, x: 130 + (pcsCount + 2) * spacing, y: deviceY, w: pcsWidth, h: 40 });

  // 链路
  const links = [];

  // Cloud <-> EMS — 4G/WiFi (无线上行)
  const uplink = specialArr.some(s => String(s).toUpperCase().includes('4G')) ? '4G' : 'WiFi';
  links.push({
    from: 'CLOUD', to: 'EMS',
    protocol: protocolInfo(uplink),
    label: protocolInfo(uplink).bandwidth,
  });

  // EMS <-> Switch — IEC 61850 (必选)
  links.push({
    from: 'EMS', to: 'SW',
    protocol: protocolInfo('IEC 61850'),
    label: '100 Mbps',
  });

  // Switch <-> PCS (每个 PCS 一条, IEC 61850)
  pcsIds.forEach(pid => {
    links.push({
      from: 'SW', to: pid,
      protocol: protocolInfo('IEC 61850'),
      label: '100 Mbps',
    });
  });

  // Switch <-> BMS (Modbus TCP)
  if (nodes.find(n => n.id === 'BMS')) {
    links.push({
      from: 'SW', to: 'BMS',
      protocol: protocolInfo('Modbus TCP'),
      label: '10 Mbps',
    });
  }

  // Switch <-> FAS (Modbus RTU)
  if (nodes.find(n => n.id === 'FAS')) {
    links.push({
      from: 'SW', to: 'FAS',
      protocol: protocolInfo('Modbus RTU'),
      label: '115 kbps',
    });
  }

  // Switch <-> Meter (Modbus RTU)
  if (nodes.find(n => n.id === 'METER')) {
    links.push({
      from: 'SW', to: 'METER',
      protocol: protocolInfo('Modbus RTU'),
      label: '115 kbps',
    });
  }

  // 添加用户 special_requirements 中显式声明的协议 (如果不是已用的)
  const usedTypes = new Set(links.map(l => l.protocol.type));
  uniqProtocols.forEach(p => {
    const info = protocolInfo(p);
    if (!usedTypes.has(info.type) && info.type !== 'modbus_rtu') {  // 不重复加默认 Modbus
      // 插一条从 EMS 到 CLOUD 的"特殊链路"提示
      if (info.type === 'fiber') {
        links.push({
          from: 'EMS', to: 'CLOUD',
          protocol: info,
          label: info.bandwidth + ' (备用)',
          isAux: true,
        });
      }
    }
  });

  return { nodes, links, protocols: uniqProtocols };
}

// ====================== 节点绘制 ======================
function renderNode(n) {
  const lines = [];

  // 不同类型用不同形状: cloud (椭圆), ems/switch (方), pcs/bms/meter (圆角方)
  if (n.type === 'cloud') {
    // Cloud 用椭圆
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;
    const rx = n.w / 2;
    const ry = n.h / 2;
    lines.push(`  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${COLOR_NODE_FILL}" stroke="${COLOR_NODE_BORDER}" stroke-width="2"/>`);
    // Cloud 文字用云图标替代 (简单文字)
    lines.push(`  <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="${COLOR_NODE_TEXT}" ${FONT_NODE}>${escapeXml(n.name)}</text>`);
    return lines.join('\n');
  }

  // EMS — 突出 (主控), 加粗边框
  if (n.type === 'ems') {
    lines.push(`  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" ry="6" fill="#FFF8E1" stroke="#F57C00" stroke-width="3"/>`);
    lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 5}" text-anchor="middle" fill="${COLOR_NODE_TEXT}" ${FONT_NODE}>${escapeXml(n.name)}</text>`);
    return lines.join('\n');
  }

  // Switch — 普通方
  if (n.type === 'switch') {
    lines.push(`  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4" ry="4" fill="${COLOR_NODE_FILL}" stroke="${COLOR_NODE_BORDER}" stroke-width="2"/>`);
    // 加端口指示 (左右两个小方块)
    lines.push(`  <rect x="${n.x + 8}" y="${n.y + n.h / 2 - 3}" width="6" height="6" fill="#4CAF50"/>`);
    lines.push(`  <rect x="${n.x + n.w - 14}" y="${n.y + n.h / 2 - 3}" width="6" height="6" fill="#4CAF50"/>`);
    lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 5}" text-anchor="middle" fill="${COLOR_NODE_TEXT}" ${FONT_NODE}>${escapeXml(n.name)}</text>`);
    return lines.join('\n');
  }

  // 设备层 (pcs/bms/fas/meter) — 圆角方
  const deviceColors = {
    pcs: '#E3F2FD',
    bms: '#E8F5E9',
    fas: '#FFEBEE',
    meter: '#F3E5F5',
  };
  const bg = deviceColors[n.type] || COLOR_NODE_FILL;
  lines.push(`  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4" ry="4" fill="${bg}" stroke="${COLOR_NODE_BORDER}" stroke-width="1.5"/>`);

  // 类型图标 (左上角小色块)
  const iconColors = {
    pcs: '#1976D2',
    bms: '#388E3C',
    fas: '#D32F2F',
    meter: '#7B1FA2',
  };
  lines.push(`  <circle cx="${n.x + 12}" cy="${n.y + 12}" r="4" fill="${iconColors[n.type] || '#666'}"/>`);

  lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 5}" text-anchor="middle" fill="${COLOR_NODE_TEXT}" ${FONT_NODE}>${escapeXml(n.name)}</text>`);

  return lines.join('\n');
}

// ====================== 链路绘制 ======================
function renderLink(l, nodeMap) {
  const fromNode = nodeMap[l.from];
  const toNode = nodeMap[l.to];
  if (!fromNode || !toNode) return '';

  // 计算连接点 (从 from 的底部到 to 的顶部, 或左到右)
  let x1, y1, x2, y2;
  const fx = fromNode.x + fromNode.w / 2;
  const fy = fromNode.y + fromNode.h / 2;
  const tx = toNode.x + toNode.w / 2;
  const ty = toNode.y + toNode.h / 2;

  // 上下连接 (常见)
  if (ty > fy) {
    x1 = fx; y1 = fromNode.y + fromNode.h;
    x2 = tx; y2 = toNode.y;
  } else {
    x1 = fx; y1 = fromNode.y;
    x2 = tx; y2 = toNode.y + toNode.h;
  }

  // 折线 (L 形, 通过中间 y)
  const midY = (y1 + y2) / 2;
  const path = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

  const proto = l.protocol;
  const lines = [];
  const dashAttr = proto.dasharray ? ` stroke-dasharray="${proto.dasharray}"` : '';
  const opacityAttr = l.isAux ? ' opacity="0.6"' : '';
  const strokeWidth = proto.type === 'iec61850' ? 3 : (proto.type === 'modbus_rtu' ? 1.5 : 2);

  lines.push(`  <path d="${path}" fill="none" stroke="${proto.color}" stroke-width="${strokeWidth}"${dashAttr}${opacityAttr} stroke-linecap="round"/>`);

  // 带宽标签 (链路中间)
  const labelX = (x1 + x2) / 2;
  const labelY = midY - 5;
  const labelText = l.label || proto.bandwidth;
  const labelW = labelText.length * 9 + 8;
  lines.push(`  <rect x="${labelX - labelW / 2}" y="${labelY - 10}" width="${labelW}" height="14" rx="2" ry="2" fill="${COLOR_BG}" stroke="${proto.color}" stroke-width="0.5" opacity="0.95"/>`);
  lines.push(`  <text x="${labelX}" y="${labelY}" text-anchor="middle" fill="${proto.color}" ${FONT_LINK}>${escapeXml(labelText)}</text>`);

  return lines.join('\n');
}

// ====================== 主渲染 ======================
function renderCommSvg(uem) {
  const project = uem.project || {};
  const projectName = project.name || project.project_id || '储能项目';

  const { nodes, links, protocols } = inferTopology(uem);

  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="Microsoft YaHei, Arial, sans-serif">`);
  out.push(`  <defs>`);
  out.push(`    <linearGradient id="commBg" x1="0%" y1="0%" x2="0%" y2="100%">`);
  out.push(`      <stop offset="0%" stop-color="${COLOR_BG}"/>`);
  out.push(`      <stop offset="100%" stop-color="#e8eef3"/>`);
  out.push(`    </linearGradient>`);
  out.push(`    <marker id="arrowComm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">`);
  out.push(`      <polygon points="0 0, 8 4, 0 8" fill="#444"/>`);
  out.push(`    </marker>`);
  out.push(`  </defs>`);

  // 背景
  out.push(`  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#commBg)"/>`);

  // 标题栏
  out.push(`  <rect x="0" y="0" width="${WIDTH}" height="32" fill="${COLOR_TITLE_BG}"/>`);
  out.push(`  <text x="15" y="22" fill="${COLOR_TITLE_FG}" ${FONT_TITLE}>通信拓扑图 — ${escapeXml(projectName)}</text>`);
  out.push(`  <text x="${WIDTH - 15}" y="22" text-anchor="end" fill="${COLOR_TITLE_FG}" font-family="Microsoft YaHei, Arial, sans-serif" font-size="11">节点: ${nodes.length} | 链路: ${links.length}</text>`);

  // 层级带 (淡色背景)
  // Cloud zone
  out.push(`  <rect x="20" y="40" width="${WIDTH - 40}" height="60" rx="6" ry="6" fill="#E1F5FE" opacity="0.4"/>`);
  out.push(`  <text x="30" y="55" fill="#0277BD" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">云端层</text>`);

  // EMS zone
  out.push(`  <rect x="20" y="115" width="${WIDTH - 40}" height="60" rx="6" ry="6" fill="#FFF3E0" opacity="0.4"/>`);
  out.push(`  <text x="30" y="130" fill="#E65100" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">主控层</text>`);

  // Switch zone
  out.push(`  <rect x="20" y="200" width="${WIDTH - 40}" height="70" rx="6" ry="6" fill="#F3E5F5" opacity="0.4"/>`);
  out.push(`  <text x="30" y="215" fill="#6A1B9A" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">网络层</text>`);

  // Device zone
  out.push(`  <rect x="20" y="295" width="${WIDTH - 40}" height="90" rx="6" ry="6" fill="#E8F5E9" opacity="0.4"/>`);
  out.push(`  <text x="30" y="310" fill="#2E7D32" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">设备层</text>`);

  // 链路 (在节点下面)
  links.forEach(l => {
    const svg = renderLink(l, nodeMap);
    if (svg) out.push(svg);
  });

  // 节点
  nodes.forEach(n => {
    out.push(renderNode(n));
  });

  // 图例 (右下角)
  const legendX = WIDTH - 180;
  const legendY = HEIGHT - 70;
  out.push(`  <rect x="${legendX}" y="${legendY}" width="170" height="60" rx="4" ry="4" fill="#ffffff" stroke="${COLOR_NODE_BORDER}" stroke-width="1" opacity="0.95"/>`);
  out.push(`  <text x="${legendX + 8}" y="${legendY + 14}" fill="${COLOR_NODE_TEXT}" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">链路协议:</text>`);

  // IEC 61850
  out.push(`  <line x1="${legendX + 10}" y1="${legendY + 26}" x2="${legendX + 30}" y2="${legendY + 26}" stroke="${COLOR_IEC_61850}" stroke-width="3"/>`);
  out.push(`  <text x="${legendX + 35}" y="${legendY + 29}" fill="${COLOR_NODE_TEXT}" ${FONT_LEGEND}>IEC 61850</text>`);

  // Modbus
  out.push(`  <line x1="${legendX + 10}" y1="${legendY + 40}" x2="${legendX + 30}" y2="${legendY + 40}" stroke="${COLOR_MODBUS}" stroke-width="1.5" stroke-dasharray="6,3"/>`);
  out.push(`  <text x="${legendX + 35}" y="${legendY + 43}" fill="${COLOR_NODE_TEXT}" ${FONT_LEGEND}>Modbus RTU/TCP</text>`);

  // 4G/WiFi
  out.push(`  <line x1="${legendX + 10}" y1="${legendY + 54}" x2="${legendX + 30}" y2="${legendY + 54}" stroke="${COLOR_4G_WIFI}" stroke-width="2" stroke-dasharray="4,4"/>`);
  out.push(`  <text x="${legendX + 35}" y="${legendY + 57}" fill="${COLOR_NODE_TEXT}" ${FONT_LEGEND}>4G / WiFi</text>`);

  // 协议列表 (左侧底部)
  const protoY = HEIGHT - 30;
  out.push(`  <text x="10" y="${protoY}" fill="#555" ${FONT_LEGEND}>协议清单: ${protocols.map(escapeXml).join(' | ')}</text>`);

  out.push(`</svg>`);
  return out.join('\n');
}

// ====================== Vercel Handler ======================
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

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
    const svg = renderCommSvg(uem);
    const { nodes, links, protocols } = inferTopology(uem);
    const projectId = (uem.project && (uem.project.project_id || uem.project.name)) || 'unknown';
    return res.status(200).json({
      ok: true,
      project_id: projectId,
      svg,
      width: WIDTH,
      height: HEIGHT,
      nodes: nodes.map(n => ({ id: n.id, name: n.name, type: n.type, level: n.level })),
      links: links.map(l => ({ from: l.from, to: l.to, protocol: l.protocol.label, bandwidth: l.label })),
      protocols,
      node_count: nodes.length,
      link_count: links.length,
    });
  } catch (e) {
    return res.status(500).json({ error: `Render comm error: ${e.name}: ${e.message}` });
  }
}

// ====================== 导出供测试使用 ======================
export {
  renderCommSvg,
  inferTopology,
  protocolInfo,
  renderNode,
  renderLink,
};