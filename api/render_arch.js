// api/render_arch.js
// =========================================================================
// ESS Agent — System Architecture Diagram Renderer (Vercel Serverless) V5
// =========================================================================
// Endpoint: POST /api/render-arch
// Body:     { uem: <UEM JSON> }
// Returns:  { ok, svg, width, height, blocks, arrows, project_id }
//
// V5 redesign — 5-layer 600x400 horizontal flow:
//   [源]  →  [储能/DC Bus]  →  [PCS]  →  [AC Bus ±升压]  →  [电网/负载]
//
// 与 V4 (上中下三段式) 不同:
//   - V4: 3 行堆叠 (源上, 中中, 网荷下) — 客户看不出能量怎么流
//   - V5: 5 列横向, 箭头从左到右 — 功率流向清晰
//
// 5 大坑严守:
//   1. 严禁在 template literal 嵌入反引号
//   2. SVG attribute 用 escapeXml
//   3. node --check 必过
//   4. PV/WIND/DIESEL 仅在对应 kW > 0 时显示
//   5. 升压变 XF 仅在 10kV/35kV 项目显示
// =========================================================================

// ====================== 颜色方案 ======================
const COLOR_PV        = '#F5A623';  // 橙 — 光伏
const COLOR_WIND      = '#00BCD4';  // 青 — 风电
const COLOR_DIESEL    = '#795548';  // 棕 — 柴油机
const COLOR_BATTERY   = '#4CAF50';  // 绿 — 储能
const COLOR_PCS       = '#9C27B0';  // 紫 — 变流器
const COLOR_GRID      = '#2196F3';  // 蓝 — 电网
const COLOR_LOAD      = '#607D8B';  // 灰 — 负载
const COLOR_XF        = '#FF7043';  // 深橙 — 升压变
const COLOR_BUS       = '#FFD54F';  // 黄 — 母线
const COLOR_TEXT_DARK = '#1a1a1a';
const COLOR_TEXT_LIGHT = '#ffffff';
const COLOR_BG        = '#fafafa';
const COLOR_BORDER    = '#333';
const COLOR_ARROW     = '#555';
const COLOR_VOLT      = '#888';

const FONT_TITLE  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="14" font-weight="bold"';
const FONT_SUB    = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="11" font-weight="bold"';
const FONT_BODY   = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="11"';
const FONT_SMALL  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="9"';
const FONT_VOLT   = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" fill="#666"';
const FONT_ARROW  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold"';
const FONT_LEGEND = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="9"';

const WIDTH = 600;
const HEIGHT = 400;

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

function isHighVoltage(v) {
  if (!v) return false;
  const s = String(v);
  return /10\s*kV|10kV|35\s*kV|35kV|110\s*kV|110kV/i.test(s);
}

function voltageOf(v) {
  if (!v) return '380V';
  return String(v);
}

// ====================== 从 UEM 推断节点 ======================
// 节点类别: source / dc_bus / pcs / ac_bus / tail
// 输出 [{ id, kind, category, title, subtitle, color, power_kw, voltage, items }]
function inferBlocks(uem) {
  const nodes = [];
  const proj = uem.project || {};
  const elec = uem.electrical || {};
  // 兼容两种 UEM 形态: 标准 (electrical.*) 与前端表单 (sources.* / loads.*)
  const sourcesTop = uem.sources || {};
  const loadsTop = uem.loads || {};

  const pv_kw      = safeNum(elec.pv_kw, 0) || safeNum(sourcesTop.pv_kw, 0);
  const wind_kw    = safeNum(elec.wind_kw, 0);
  const diesel_kw  = safeNum(elec.diesel_kw, 0) || safeNum(sourcesTop.diesel_kw, 0);
  const load_kw    = safeNum(elec.load_kw, 0) || safeNum(loadsTop.total_kw, 0);
  const power_kw   = safeNum(elec.power_kw, 0) || load_kw;
  const cap_kwh    = safeNum(elec.capacity_kwh, 0) || safeNum(elec.capacity, 0);
  const voltage    = voltageOf(elec.voltage_level);
  const grid_mode  = elec.grid_mode || 'grid_tied';
  const scenario   = (proj.scenario || uem.scenario || proj.type || 'commercial').toLowerCase();
  const isMicrogrid = scenario === 'microgrid' || grid_mode === 'off_grid' || grid_mode === 'hybrid';
  const isAIDC     = scenario === 'aidc_colocation' || scenario === 'aidc_selfbuilt' || scenario === 'aidc';

  // ----- 列 1: 源层 -----
  if (pv_kw > 0) {
    const inverterCount = Math.ceil(pv_kw / 50);
    nodes.push({
      id: 'PV', kind: 'source', category: 'pv', color: COLOR_PV,
      title: '光伏 PV',
      subtitle: `${pv_kw} kWp`,
      power: pv_kw,
      voltage: 'DC 1500V',
      items: [
        `${inverterCount} 台逆变器`,
        `${Math.ceil(pv_kw / 8)} 路汇流`,
      ],
    });
  }
  if (wind_kw > 0) {
    nodes.push({
      id: 'WIND', kind: 'source', category: 'wind', color: COLOR_WIND,
      title: '风电 Wind',
      subtitle: `${wind_kw} kW`,
      power: wind_kw,
      voltage: 'AC 690V',
      items: [`${Math.ceil(wind_kw / 100)} 台风机`],
    });
  }
  if (diesel_kw > 0) {
    nodes.push({
      id: 'DIESEL', kind: 'source', category: 'diesel', color: COLOR_DIESEL,
      title: '柴发 Diesel',
      subtitle: `${diesel_kw} kW`,
      power: diesel_kw,
      voltage: 'AC 400V',
      items: [`${Math.ceil(diesel_kw / 200)} 台机组`, 'ATS 切换'],
    });
  }
  // 如果完全没有源 (纯负载项目), 显示一个空源占位 (e.g. 电网供电示意)
  if (nodes.filter(n => n.kind === 'source').length === 0) {
    nodes.push({
      id: 'SRC_NULL', kind: 'source', category: 'grid', color: COLOR_GRID,
      title: '市电直接',
      subtitle: `${power_kw || load_kw} kW`,
      power: power_kw || load_kw,
      voltage: `AC ${voltage}`,
      items: ['无本地源'],
    });
  }

  // ----- 列 2: 储能 + DC Bus -----
  if (cap_kwh > 0) {
    const cellV = 3.2, cellAh = 280;
    const stringsS = Math.ceil(768 / cellV);
    const perPackKwh = (stringsS * cellV * cellAh) / 1000;
    const packsP = Math.max(1, Math.ceil(cap_kwh / perPackKwh));
    nodes.push({
      id: 'BAT', kind: 'storage', category: 'battery', color: COLOR_BATTERY,
      title: '储能 Battery',
      subtitle: `${cap_kwh} kWh`,
      power: power_kw,
      voltage: 'DC 768V',
      items: [
        `${packsP}P${stringsS}S`,
        `LFP ${Math.floor(perPackKwh)} kWh/簇`,
      ],
    });
    nodes.push({
      id: 'DC_BUS', kind: 'bus', category: 'bus', color: COLOR_BUS,
      title: 'DC 母线',
      subtitle: '768 V',
      power: power_kw,
      voltage: 'DC 768V',
      items: ['汇集储能与源端'],
    });
  } else {
    // 没电池时, DC Bus 仍存在 (源端直流汇总)
    nodes.push({
      id: 'DC_BUS', kind: 'bus', category: 'bus', color: COLOR_BUS,
      title: 'DC 母线',
      subtitle: `${voltage} 整流`,
      power: power_kw,
      voltage: 'DC',
      items: ['无储能'],
    });
  }

  // ----- 列 3: PCS 转换层 -----
  if (power_kw > 0) {
    const pcsUnit = 125;
    const pcsCount = Math.ceil(power_kw / pcsUnit) + 1;
    nodes.push({
      id: 'PCS', kind: 'convert', category: 'pcs', color: COLOR_PCS,
      title: 'PCS 变流器',
      subtitle: `${power_kw} kW`,
      power: power_kw,
      voltage: 'DC↔AC',
      items: [
        `${pcsCount} 台 (N+1)`,
        '双向四象限',
      ],
    });
  }

  // ----- 列 4: AC Bus (恒在) + 升压变 (高压项目) -----
  nodes.push({
    id: 'AC_BUS', kind: 'bus', category: 'bus', color: COLOR_BUS,
    title: 'AC 母线',
    subtitle: voltage,
    power: power_kw,
    voltage: `AC ${voltage}`,
    items: ['400V / 10kV 分段'],
  });
  if (isHighVoltage(voltage)) {
    nodes.push({
      id: 'XF', kind: 'transform', category: 'xf', color: COLOR_XF,
      title: '升压变 XF',
      subtitle: `${voltage} / 400V`,
      power: power_kw,
      voltage: voltage,
      items: [`${Math.ceil(power_kw / 800)} 台主变`, 'Dyn11 接线'],
    });
  }

  // ----- 列 5: 电网 / 负载 -----
  if (isAIDC) {
    // AIDC: 显示 IT Load + 列头柜
    nodes.push({
      id: 'IT_LOAD', kind: 'tail', category: 'load', color: COLOR_LOAD,
      title: 'IT 负载',
      subtitle: `${load_kw} kW`,
      power: load_kw,
      voltage: 'AC 400V',
      items: ['机柜 PDU', 'UPS 双路'],
    });
    nodes.push({
      id: 'RPDU', kind: 'tail', category: 'load', color: COLOR_LOAD,
      title: '列头柜',
      subtitle: `${Math.ceil(load_kw / 30)} 台`,
      power: load_kw,
      voltage: 'AC 400V',
      items: ['智能监测'],
    });
  } else {
    if (load_kw > 0) {
      nodes.push({
        id: 'LOAD', kind: 'tail', category: 'load', color: COLOR_LOAD,
        title: '负载 Load',
        subtitle: `${load_kw} kW`,
        power: load_kw,
        voltage: `AC ${voltage}`,
        items: ['配电柜', '智能电表'],
      });
    }
  }
  if (grid_mode === 'grid_tied' || grid_mode === 'grid_connected' || grid_mode === 'hybrid') {
    nodes.push({
      id: 'GRID', kind: 'tail', category: 'grid', color: COLOR_GRID,
      title: '电网 Grid',
      subtitle: voltage,
      power: power_kw,
      voltage: `AC ${voltage}`,
      items: [
        '双向电能表',
        '并网保护',
      ],
    });
  }
  // 离网微电网: 加离网开关
  if (isMicrogrid && !isAIDC) {
    nodes.push({
      id: 'OFFSW', kind: 'tail', category: 'switch', color: COLOR_XF,
      title: '并/离网开关',
      subtitle: isMicrogrid ? '并/离' : '纯并',
      power: 0,
      voltage: '',
      items: ['STS 静态切换'],
    });
  }

  return nodes;
}

// ====================== 5 列布局 ======================
// 列位置 (blockW=90):
//   col 1: x=25   源
//   col 2: x=145  储能 + DC Bus
//   col 3: x=265  PCS
//   col 4: x=385  AC Bus (+ XF)
//   col 5: x=505  电网/负载
// 纵向 3 个 slot: y=60, 165, 270 (slotH=80, gap=15)
const COLS = [
  { x: 25,  label: '源层' },
  { x: 145, label: '储能/DC' },
  { x: 265, label: '转换层' },
  { x: 385, label: 'AC 母线' },
  { x: 505, label: '电网/负载' },
];
const BLOCK_W = 90;
const BLOCK_H = 80;
const SLOT_Y = [60, 160, 260];
const LAYOUT_TOP = 35;   // 标题栏下方
const LAYOUT_BOTTOM = 360; // 图例上方

function colIndexOf(node) {
  if (node.kind === 'source') return 0;
  if (node.kind === 'storage') return 1;            // BAT
  if (node.kind === 'bus' && node.id === 'DC_BUS') return 1;  // DC 母线与 BAT 同列
  if (node.kind === 'bus' && node.id === 'AC_BUS') return 3;  // AC 母线在 col 3
  if (node.kind === 'convert') return 2;
  if (node.kind === 'transform') return 3;          // XF 与 AC_BUS 同列
  if (node.kind === 'tail') return 4;
  return 0;
}

function layoutBlocks(nodes) {
  // 按列分组
  const cols = COLS.map(() => []);
  nodes.forEach(n => {
    const ci = colIndexOf(n);
    cols[ci].push(n);
  });

  // 每列内节点在 slot 内垂直堆叠
  cols.forEach((col, ci) => {
    col.forEach((n, idx) => {
      const slotIdx = Math.min(idx, SLOT_Y.length - 1);
      n.x = COLS[ci].x;
      n.y = SLOT_Y[slotIdx];
      n.w = BLOCK_W;
      n.h = BLOCK_H;
      n.col = ci;
    });
  });
}

// ====================== 箭头: 横向 1 段直线 + 箭头 ======================
function makeHArrow(fromNode, toNode, label, sublabel) {
  // 横向: from 右边 → to 左边, 直线
  const fx = fromNode.x + fromNode.w;
  const fy = (fromNode.y + fromNode.h / 2);
  const tx = toNode.x;
  const ty = (toNode.y + toNode.h / 2);
  const path = `M ${fx} ${fy} L ${tx} ${ty}`;
  // 箭头头部
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // 端点回退 6px 让箭头清晰
  const tipX = tx - ux * 4;
  const tipY = ty - uy * 4;
  const baseX = tipX - ux * 8;
  const baseY = tipY - uy * 8;
  // 垂直方向的偏移
  const px = -uy, py = ux;
  const head1x = baseX + px * 4;
  const head1y = baseY + py * 4;
  const head2x = baseX - px * 4;
  const head2y = baseY - py * 4;
  const arrowHead = `M ${head1x} ${head1y} L ${tipX} ${tipY} L ${head2x} ${head2y}`;

  // 标签位置: 优先放线段中点上方 22px (脱离两节点 y 范围),如果仍落在某个节点 bbox 内
  // 就改成放到节点下方 22px
  const midX = (fx + tx) / 2;
  const midY = (fy + ty) / 2 - 22;
  // Note: caller will pass nodes to renderArrow() which clamps labelX/labelY outside nodes.
  return { path, arrowHead, label, sublabel, labelX: midX, labelY: midY };
}

// ====================== 箭头: 纵向 (同列) ======================
function makeVArrow(fromNode, toNode, label, sublabel) {
  // 纵向: from 底边 → to 顶边, 直线
  const fx = fromNode.x + fromNode.w / 2;
  const fy = fromNode.y + fromNode.h;
  const tx = toNode.x + toNode.w / 2;
  const ty = toNode.y;
  const path = `M ${fx} ${fy} L ${tx} ${ty}`;
  // 箭头: 向下 (tx, ty 是 to 顶边, 箭头从 fy 向下指向 ty)
  const tipY = ty - 3;
  const baseY = ty - 11;
  const head1x = tx - 4;
  const head2x = tx + 4;
  const arrowHead = `M ${head1x} ${baseY} L ${tx} ${tipY} L ${head2x} ${baseY}`;

  // 标签: 线段右侧 12px (脱离两节点 x 范围),caller 会再次 clamp
  const labelX = Math.max(fx, tx) + 14;
  const labelY = (fy + ty) / 2 + 4;
  return { path, arrowHead, label, sublabel, labelX, labelY };
}

function makeLArrow(fromNode, toNode, label, sublabel) {
  // 折线: from 右边 → 中间 x → to 左边
  const fx = fromNode.x + fromNode.w;
  const fy = (fromNode.y + fromNode.h / 2);
  const tx = toNode.x;
  const ty = (toNode.y + toNode.h / 2);
  const midX = (fx + tx) / 2;
  const path = `M ${fx} ${fy} L ${midX} ${fy} L ${midX} ${ty} L ${tx} ${ty}`;
  const dx = tx - midX, dy = 0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const tipX = tx - ux * 4;
  const tipY = ty;
  const baseX = tipX - ux * 8;
  const head1y = tipY - 4;
  const head2y = tipY + 4;
  const arrowHead = `M ${baseX} ${head1y} L ${tipX} ${tipY} L ${baseX} ${head2y}`;

  const labelX = (fx + tx) / 2;
  const labelY = Math.min(fy, ty) - 24;
  return { path, arrowHead, label, sublabel, labelX, labelY };
}

// ====================== 渲染块 ======================
function renderBlock(n) {
  const lines = [];
  // 背景圆角矩形
  lines.push(`  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" ry="6" fill="${n.color}" stroke="${COLOR_BORDER}" stroke-width="1.5" opacity="0.95"/>`);

  // 标题 (居中, 白色加粗)
  const titleY = n.y + 18;
  lines.push(`  <text x="${n.x + n.w / 2}" y="${titleY}" text-anchor="middle" fill="${COLOR_TEXT_LIGHT}" ${FONT_SUB}>${escapeXml(n.title)}</text>`);

  // 副标题 (灰白色, 容量)
  const subY = n.y + 36;
  lines.push(`  <text x="${n.x + n.w / 2}" y="${subY}" text-anchor="middle" fill="${COLOR_TEXT_LIGHT}" ${FONT_BODY}>${escapeXml(n.subtitle)}</text>`);

  // 电压/类型标签
  const tagY = n.y + 52;
  lines.push(`  <text x="${n.x + n.w / 2}" y="${tagY}" text-anchor="middle" fill="${COLOR_TEXT_LIGHT}" opacity="0.85" ${FONT_SMALL}>${escapeXml(n.voltage || '')}</text>`);

  // items (最后一行, 小字)
  if (n.items && n.items.length) {
    const itemY = n.y + 68;
    lines.push(`  <text x="${n.x + n.w / 2}" y="${itemY}" text-anchor="middle" fill="${COLOR_TEXT_LIGHT}" opacity="0.75" ${FONT_SMALL}>${escapeXml(n.items[0])}</text>`);
  }

  return lines.join('\n');
}

// ====================== 标签位置避让节点 bbox ======================
// 如果标签矩形 (labelX - labelW/2, labelY - 9, labelW, 14) 与任意 node bbox 重叠,
// 优先向上挪 (prefUp=true,默认),否则向下挪,确保标签完全脱离节点区域
function clampLabelOutsideNodes(labelX, labelY, labelW, nodes, prefUp) {
  const labelH = 14;
  let x = labelX;
  let y = labelY;
  for (let tries = 0; tries < 5; tries++) {
    const rect = { x1: x - labelW / 2, y1: y - 9, x2: x + labelW / 2, y2: y - 9 + labelH };
    let conflict = null;
    for (const n of nodes) {
      if (rect.x1 < n.x + n.w && rect.x2 > n.x && rect.y1 < n.y + n.h && rect.y2 > n.y) {
        conflict = n;
        break;
      }
    }
    if (!conflict) break;
    // 挪方向: 优先向上,落到节点 bbox 上方 18px;否则向下
    if (prefUp !== false && y - 9 - conflict.y >= 18) {
      // 已经在节点上方但仍冲突,说明离得太近,再向上 14px
      y = conflict.y - 18;
    } else {
      y = conflict.y + conflict.h + 18;
    }
  }
  return { x, y };
}

// ====================== 渲染箭头 ======================
function renderArrow(a, nodes) {
  const lines = [];
  // 路径
  lines.push(`  <path d="${a.path}" fill="none" stroke="${COLOR_ARROW}" stroke-width="1.8" stroke-linecap="round" marker-end="url(#arrowhead)"/>`);
  // 标签: 功率 + 电压
  if (a.label || a.sublabel) {
    const combined = [a.label, a.sublabel].filter(Boolean).join(' / ');
    const labelW = combined.length * 6 + 10;
    // 标签位置避让节点 bbox
    const clamped = clampLabelOutsideNodes(a.labelX, a.labelY, labelW, nodes || [], true);
    const lx = clamped.x;
    const ly = clamped.y;
    lines.push(`  <rect x="${lx - labelW / 2}" y="${ly - 9}" width="${labelW}" height="14" rx="3" ry="3" fill="#fff" stroke="${COLOR_ARROW}" stroke-width="0.6"/>`);
    lines.push(`  <text x="${lx}" y="${ly + 1}" text-anchor="middle" fill="${COLOR_ARROW}" ${FONT_ARROW}>${escapeXml(combined)}</text>`);
  }
  return lines.join('\n');
}

// ====================== 推断箭头 ======================
function inferArrows(nodes) {
  const arrows = [];
  const has = (id) => nodes.find(n => n.id === id);
  const sources = nodes.filter(n => n.kind === 'source');
  const bat = has('BAT');
  const dcBus = has('DC_BUS');
  const pcs = has('PCS');
  const acBus = has('AC_BUS');
  const xf = has('XF');
  const grid = has('GRID');
  const load = has('LOAD') || has('IT_LOAD');

  // 1) sources → DC Bus (如果有 BAT) 或 → PCS
  const collectNode = bat || dcBus;
  if (collectNode) {
    sources.forEach(src => {
      const power = src.power || 0;
      arrows.push(makeHArrow(src, collectNode, `${power} kW`, src.voltage));
    });
  }

  // 2) BAT ↔ DC Bus (同列, 纵向)
  if (bat && dcBus) {
    arrows.push(makeVArrow(bat, dcBus, `${bat.power || 0} kW`, 'DC 768V'));
  }
  // DC Bus → PCS (跨列, 横向)
  if (dcBus && pcs) {
    arrows.push(makeHArrow(dcBus, pcs, `${dcBus.power || 0} kW`, 'DC 768V'));
  }

  // 3) PCS → AC Bus
  if (pcs && acBus) {
    arrows.push(makeHArrow(pcs, acBus, `${pcs.power || 0} kW`, 'AC 380V'));
  }

  // 4) AC Bus → 升压变 (如有, 同列纵向)
  if (acBus && xf) {
    arrows.push(makeVArrow(acBus, xf, `${xf.power || 0} kW`, 'AC 380V'));
  }

  // 5) AC Bus → Load (跨列, 横向) — Load 在 col 4 slot 1 时才需要此箭头
  if (acBus && load && load.x > acBus.x + acBus.w) {
    // 同列时不画 (避免同点冲突)
    arrows.push(makeHArrow(acBus, load, `${load.power || 0} kW`, 'AC 380V'));
  }

  // 6) AC Bus ↔ Grid (双向, 跨列横向)
  if (acBus && grid && grid.x > acBus.x + acBus.w) {
    arrows.push(makeHArrow(acBus, grid, `${grid.power || 0} kW`, '并网'));
    // 反向: 馈电
    arrows.push(makeHArrow(grid, acBus, `${grid.power || 0} kW`, '馈电'));
  }

  return arrows;
}

// ====================== 渲染图例 ======================
function renderLegend() {
  const items = [
    { color: COLOR_PV, label: 'PV' },
    { color: COLOR_BATTERY, label: 'Battery' },
    { color: COLOR_PCS, label: 'PCS' },
    { color: COLOR_XF, label: '升压变' },
    { color: COLOR_GRID, label: 'Grid' },
    { color: COLOR_LOAD, label: 'Load' },
  ];
  const startX = 25;
  const y = 375;
  const out = [`  <text x="${startX}" y="${y + 3}" fill="#555" ${FONT_LEGEND}>色块含义:</text>`];
  let cx = startX + 60;
  items.forEach(it => {
    out.push(`  <rect x="${cx}" y="${y - 7}" width="10" height="10" rx="2" ry="2" fill="${it.color}" stroke="${COLOR_BORDER}" stroke-width="0.5"/>`);
    out.push(`  <text x="${cx + 14}" y="${y + 3}" fill="#333" ${FONT_LEGEND}>${escapeXml(it.label)}</text>`);
    cx += 14 + it.label.length * 6 + 14;
  });
  return out.join('\n');
}

// ====================== 渲染列标题 ======================
function renderColHeaders() {
  const y = 48;
  return COLS.map(c =>
    `  <text x="${c.x + BLOCK_W / 2}" y="${y}" text-anchor="middle" fill="#666" ${FONT_LEGEND}>[${escapeXml(c.label)}]</text>`
  ).join('\n');
}

// ====================== 主渲染函数 ======================
function renderArchitectureSvg(uem) {
  const project = uem.project || {};
  const projectName = project.name || project.project_id || '储能项目';
  const projectType = (project.type || 'ess').toUpperCase();
  const scenario = (project.scenario || uem.scenario || 'commercial').toString();

  const nodes = inferBlocks(uem);
  if (nodes.length === 0) {
    return minimalSvg('No data — UEM missing electrical params');
  }
  layoutBlocks(nodes);
  const arrows = inferArrows(nodes);

  // === 组装 SVG ===
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="Microsoft YaHei, Arial, sans-serif">`);

  out.push(`  <defs>`);
  out.push(`    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">`);
  out.push(`      <stop offset="0%" stop-color="${COLOR_BG}"/>`);
  out.push(`      <stop offset="100%" stop-color="#eef0f3"/>`);
  out.push(`    </linearGradient>`);
  out.push(`    <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">`);
  out.push(`      <polygon points="0 0, 8 4, 0 8" fill="${COLOR_ARROW}"/>`);
  out.push(`    </marker>`);
  out.push(`  </defs>`);

  // 背景
  out.push(`  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)"/>`);

  // 标题栏
  out.push(`  <rect x="0" y="0" width="${WIDTH}" height="32" fill="${COLOR_BORDER}" opacity="0.85"/>`);
  out.push(`  <text x="15" y="22" fill="#fff" ${FONT_TITLE}>系统架构图 — ${escapeXml(projectName)}</text>`);
  out.push(`  <text x="${WIDTH - 15}" y="22" text-anchor="end" fill="#fff" ${FONT_BODY}>类型: ${escapeXml(projectType)} / 场景: ${escapeXml(scenario)}</text>`);

  // 列标题
  out.push(renderColHeaders());

  // 先画箭头
  arrows.forEach(a => {
    out.push(renderArrow(a, nodes));
  });

  // 再画节点 (覆盖箭头端点)
  nodes.forEach(n => {
    out.push(renderBlock(n));
  });

  // 图例
  out.push(renderLegend());

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
    const nodes = inferBlocks(uem);
    const projectId = (uem.project && (uem.project.project_id || uem.project.name)) || 'unknown';
    return res.status(200).json({
      ok: true,
      project_id: projectId,
      svg,
      width: WIDTH,
      height: HEIGHT,
      blocks: nodes.map(b => ({ id: b.id, title: b.title, subtitle: b.subtitle, kind: b.kind })),
      block_count: nodes.length,
      arrows: inferArrows(nodes).length,
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
  makeHArrow,
  makeVArrow,
  makeLArrow,
  renderBlock,
  renderArrow,
  inferArrows,
  COLS,
  BLOCK_W,
  BLOCK_H,
};
