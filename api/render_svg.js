// api/render_svg.js
// ESS Agent — L5 SVG Renderer (Node.js port of AI auto-schematic render_svg.py)
// =========================================================================
// Endpoint: POST /api/render-svg
// Body:     { uem: <UEM JSON>, type: "sld" }
// Returns:  { ok, svg, size_kb, layers, components, symbols_loaded, latency_ms }
//
// Design:
//   1. Inline a minimal UEM compiler (no cross-file imports -> fast cold start)
//   2. Lazy-load IEC 60617 SVG symbols from the source repo (NEVER copy the
//      1.5MB / 373-file library into ess-platform; resolve via env var or
//      sibling-directory walk).
//   3. 7-layer vertical Sugiyama-style SLD layout:
//        PV(100) → BAT(200) → DC_BUS(300) → PCS(400) → AC_BUS(500) → XF(600) → GRID(700)
//      The numeric tag is the LAYER slot (higher = top in SVG y-axis = source side).
//   4. Each node is rendered as:
//        <svg viewBox=...>   <- inner IEC symbol (PNG base64 inline)
//        <rect>              <- node bounding box
//        <text>              <- ref code (top, bold)
//        <text>              <- model / label (bottom)
//   5. Connections: simple vertical lines between adjacent layers (or polyline
//      when src/dst are not vertically aligned).
//
// IEC_SYMBOLS_DIR resolution (in order):
//   a) process.env.IEC_SYMBOLS_DIR
//   b) <repo-root>/iec_symbols_svg
//   c) walk up from __dirname looking for AI auto-schematic/iec_symbols_svg
// =========================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====================== CONFIG ======================
// HORIZONTAL layered layout: 6 layers, left -> right
//   0 source      : PV / WT / GEN / GRID / MAINS
//   1 battery     : BAT (battery_rack)
//   2 dc_bus      : DC_BUS / bus_dc
//   3 pcs         : PCS
//   4 ac_bus      : AC_BUS / bus_ac / bus
//   5 xf_load     : XF (transformer), LOAD, QF, protection, switching, controller
const NODE_WIDTH = 110;
const NODE_HEIGHT = 60;
const BUS_WIDTH = 160;          // bus horizontal bar length
const BUS_THICKNESS = 4;        // bus bar stroke
const LAYER_GAP_X = 200;        // horizontal gap between layers
const NODE_GAP_Y = 24;          // vertical gap between nodes in same layer
const PAGE_PADDING_X = 40;
const PAGE_PADDING_TOP = 60;    // extra space for title
const PAGE_PADDING_BOTTOM = 50;
// Canvas: 6 layer slots.  slot width = NODE_WIDTH; gap = LAYER_GAP_X.
// 6*NODE_WIDTH + 5*LAYER_GAP_X + 2*PAGE_PADDING_X = 660 + 1000 + 80 = 1740 → round to 1800
const CANVAS_W = 1800;
const CANVAS_H = 700;

// Category -> horizontal layer index (0..5)
const CATEGORY_TO_LAYER = {
  // source side (left)
  pv: 0,
  wind: 0,
  diesel: 0,
  source: 0,
  grid: 0,
  // battery (left-center)
  battery: 1,
  battery_rack: 1,
  // dc bus
  dc_bus: 2,
  bus_dc: 2,
  // pcs
  pcs: 3,
  ups: 3,
  controller: 3,
  // ac bus
  ac_bus: 4,
  bus_ac: 4,
  bus: 4,
  // right side: transformer + load + protection
  transformer: 5,
  protection: 5,
  switching: 5,
  load: 5,
};

// IEC symbol id picked per category (id matches docs/iec_symbols_index.json)
const CATEGORY_TO_IEC = [
  // [category, candidates...]
  ['source',         ['iec_0123', 'iec_0122']],                      // Substation in service
  ['grid',           ['iec_0123']],
  ['transformer',    ['iec_0264', 'iec_0265', 'iec_0281']],         // Two-winding / 3-phase star-delta
  ['bus',            ['iec_0013', 'iec_0014']],                      // T-Connection
  ['ac_bus',         ['iec_0013']],
  ['bus_ac',         ['iec_0013']],
  ['dc_bus',         ['iec_0013']],
  ['bus_dc',         ['iec_0013']],
  ['pcs',            ['iec_0050', 'iec_0313']],                      // Converter / DC-DC
  ['battery',        ['iec_0353']],                                  // Battery of primary/secondary cells
  ['battery_rack',   ['iec_0353']],
  ['ups',            ['iec_0050']],
  ['switching',      ['iec_0082', 'iec_0052']],                      // Circuit breaker / function
  ['protection',     ['iec_0082', 'iec_0052']],
  ['controller',     ['iec_0050']],                                  // generic converter as proxy
  ['load',           ['iec_0050']],                                  // generic
  ['pv',             ['iec_0353']],                                  // reuse battery cell icon
];

// ====================== IEC SYMBOL LIBRARY ======================
let IEC_INDEX = null;        // { symbols: [{id, filename, width, height, name, name_cn}] }
let IEC_DIR = null;          // resolved filesystem path
let IEC_CACHE = new Map();   // id -> { viewBox, innerSvg, w, h, name }
let INDEX_LOAD_ATTEMPTED = false;

function resolveIecDir() {
  // (a) env override
  if (process.env.IEC_SYMBOLS_DIR && fs.existsSync(process.env.IEC_SYMBOLS_DIR)) {
    return process.env.IEC_SYMBOLS_DIR;
  }
  // (b) sibling at repo root:  ../../../AI auto-schematic/iec_symbols_svg
  // (ess-platform layout: api/render_svg.js -> ess-platform/, then up to project root)
  const candidates = [];
  // Walk up to 6 levels
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    dir = path.dirname(dir);
    candidates.push(path.join(dir, 'iec_symbols_svg'));
    candidates.push(path.join(dir, 'AI auto-schematic', 'iec_symbols_svg'));
    candidates.push(path.join(dir, 'AI-auto-schematic', 'iec_symbols_svg'));
  }
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'iec_0013_T-Connection_(form_1).svg'))) {
      return c;
    }
  }
  // (c) Fallback: just return the first plausible path so error message is helpful
  return candidates[1] || candidates[0];
}

function loadIecIndex() {
  if (INDEX_LOAD_ATTEMPTED) return IEC_INDEX;
  INDEX_LOAD_ATTEMPTED = true;
  if (!IEC_DIR) IEC_DIR = resolveIecDir();
  // Try docs/iec_symbols_index.json first (the canonical curated index),
  // then fall back to iec_symbols_svg/iec_symbols_index.json.
  const idxCandidates = [
    path.join(IEC_DIR, '..', 'docs', 'iec_symbols_index.json'),
    path.join(IEC_DIR, '..', '..', 'docs', 'iec_symbols_index.json'),
    path.join(IEC_DIR, 'iec_symbols_index.json'),
  ];
  for (const p of idxCandidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        IEC_INDEX = JSON.parse(raw);
        return IEC_INDEX;
      } catch (e) {
        // keep trying
      }
    }
  }
  // Last resort: scan directory and build a minimal index from filenames.
  if (fs.existsSync(IEC_DIR)) {
    try {
      const files = fs.readdirSync(IEC_DIR).filter(f => f.endsWith('.svg'));
      IEC_INDEX = {
        symbols: files.map(f => {
          const base = f.replace(/^iec_(\d+)_(.+)\.svg$/, '$1_$2');
          const m = f.match(/^iec_(\d+)_(.+)\.svg$/);
          const id = m ? `iec_${m[1]}` : f;
          const name = m ? m[2].replace(/_/g, ' ') : f;
          return { id, name, filename: f, width: 100, height: 60, name_cn: name };
        }),
      };
      return IEC_INDEX;
    } catch (e) {
      IEC_INDEX = { symbols: [] };
    }
  }
  IEC_INDEX = { symbols: [] };
  return IEC_INDEX;
}

function findIecIdByCategory(category) {
  const cat = (category || '').toLowerCase();
  for (const [c, candidates] of CATEGORY_TO_IEC) {
    if (c === cat) {
      if (!IEC_INDEX) loadIecIndex();
      for (const id of candidates) {
        if (IEC_INDEX.symbols.find(s => s.id === id)) return id;
      }
      // Fall back: first symbol of any
      if (IEC_INDEX.symbols.length) return IEC_INDEX.symbols[0].id;
    }
  }
  return null;
}

function loadIecSymbol(symbolId) {
  if (IEC_CACHE.has(symbolId)) return IEC_CACHE.get(symbolId);
  if (!IEC_INDEX) loadIecIndex();
  const sym = IEC_INDEX.symbols.find(s => s.id === symbolId);
  if (!sym || !IEC_DIR) {
    const placeholder = { w: 40, h: 40, viewBox: '0 0 40 40', innerSvg: '<rect x="0" y="0" width="40" height="40" fill="none" stroke="black" stroke-width="0.5"/><text x="20" y="20" text-anchor="middle" font-size="6">[?]</text>', name: 'Unknown' };
    IEC_CACHE.set(symbolId, placeholder);
    return placeholder;
  }
  const fp = path.join(IEC_DIR, sym.filename);
  if (!fs.existsSync(fp)) {
    const placeholder = { w: sym.width || 40, h: sym.height || 40, viewBox: `0 0 ${sym.width || 40} ${sym.height || 40}`, innerSvg: '<rect x="0" y="0" width="40" height="40" fill="none" stroke="black" stroke-width="0.5"/><text x="20" y="20" text-anchor="middle" font-size="6">[!]</text>', name: sym.name };
    IEC_CACHE.set(symbolId, placeholder);
    return placeholder;
  }
  try {
    const svg = fs.readFileSync(fp, 'utf8');
    // Extract viewBox
    let vb = `0 0 ${sym.width || 100} ${sym.height || 60}`;
    const m = svg.match(/viewBox="([\d.\s\-]+)"/);
    if (m) vb = m[1];
    const parts = vb.split(/\s+/).map(Number);
    const w = parts[2] || sym.width || 100;
    const h = parts[3] || sym.height || 60;
    // Extract inner content (everything between <svg ...> and </svg>)
    const inner = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    let innerSvg = inner ? inner[1] : svg;
    // Make sure xlink:href is preserved (image uses it). Also add xmlns:xlink if missing.
    if (!innerSvg.includes('xmlns:xlink')) {
      innerSvg = innerSvg.replace(/<image /, '<image xmlns:xlink="http://www.w3.org/1999/xlink" ');
    }
    const result = { w, h, viewBox: vb, innerSvg, name: sym.name_cn || sym.name };
    IEC_CACHE.set(symbolId, result);
    return result;
  } catch (e) {
    const placeholder = { w: sym.width || 40, h: sym.height || 40, viewBox: `0 0 ${sym.width || 40} ${sym.height || 40}`, innerSvg: '', name: sym.name };
    IEC_CACHE.set(symbolId, placeholder);
    return placeholder;
  }
}

// ====================== UEM COMPILER (minimal port) ======================
// Mirrors compliance.js compileUem but kept self-contained for speed.
const CELL_VOLTAGE = 3.2;
const CELL_CAPACITY_AH = 280;
const DC_BUS_VOLTAGE = 768;
const PCS_UNIT_KW = 125;
const REDUNDANCY_PCS = 1;

function voltageToLevelV(s) {
  if (!s) return 0;
  const x = String(s).toUpperCase().replace(/\s+/g, '');
  if (x.endsWith('KV')) return parseFloat(x.slice(0, -2)) * 1000;
  if (x.endsWith('V')) return parseFloat(x.slice(0, -1));
  return 0;
}

function compileEss(uem) {
  const components = [];
  const connections = [];
  const elec = uem.electrical || {};
  if (!elec.capacity_kwh || !elec.power_kw) return { components, connections };
  const cap = elec.capacity_kwh;
  const power = elec.power_kw;
  const voltage = elec.voltage_level || '380V';
  const durationH = elec.duration_h || (cap / power);

  const stringsSeries = Math.ceil(DC_BUS_VOLTAGE / CELL_VOLTAGE);
  const perPackKwh = (stringsSeries * CELL_VOLTAGE * CELL_CAPACITY_AH) / 1000;
  const packsParallel = Math.ceil(cap / perPackKwh);

  components.push({ id: 'BAT', category: 'battery_rack', ref: `BAT-${packsParallel}P`, model: `LFP-${Math.floor(perPackKwh)}kWh-${Math.floor(DC_BUS_VOLTAGE)}V`, qty: packsParallel, params: { total_kwh: Math.round(packsParallel * perPackKwh * 10) / 10, per_pack_kwh: perPackKwh, packs_parallel: packsParallel, strings_series: stringsSeries, duration_h: Math.round(durationH * 10) / 10 } });

  const pcsCount = Math.ceil(power / PCS_UNIT_KW) + REDUNDANCY_PCS;
  components.push({ id: 'PCS', category: 'pcs', ref: 'PCS', model: `PCS-${PCS_UNIT_KW}kW`, qty: pcsCount, params: { unit_kw: PCS_UNIT_KW, total_kw: pcsCount * PCS_UNIT_KW, redundancy: 'N+1' } });

  components.push({ id: 'DC_BUS', category: 'dc_bus', ref: 'DC+', model: `DC-${DC_BUS_VOLTAGE}V-${Math.floor(power)}kW`, qty: 1, params: { voltage_v: DC_BUS_VOLTAGE, type: 'dc' } });

  const lvSideV = 380;
  components.push({ id: 'AC_BUS', category: 'ac_bus', ref: 'AC-LV', model: `AC-${lvSideV}V-${Math.floor(power)}kW`, qty: 1, params: { voltage_v: lvSideV } });

  if (String(voltage).toUpperCase().includes('KV') && voltage !== '380V') {
    let xfKva = Math.floor(power * 1.1);
    const xfStd = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500];
    for (const s of xfStd) { if (s >= xfKva) { xfKva = s; break; } }
    components.push({ id: 'XF', category: 'transformer', ref: 'T1', model: `${xfKva}kVA-${lvSideV}V/${voltage}`, qty: 1, params: { rating_kva: xfKva, lv_voltage_v: lvSideV, hv_voltage_v: voltageToLevelV(voltage) } });
  }

  components.push({ id: 'QF', category: 'protection', ref: 'QF1', model: `ACB-${Math.round(power * 1000 / (lvSideV * Math.sqrt(3) * 0.85) * 1.25)}A`, qty: 1, params: { type: 'ACB' } });

  components.push({ id: 'GRID', category: 'source', ref: 'GRID', model: voltage, qty: 1, params: { voltage_level: voltage } });

  // Connections (topological order for line drawing).
  // Layout convention: source layer is on the LEFT, transformer/load on the RIGHT.
  // Power flows left -> right. The grid mains connection (GRID -> XF) is drawn
  // left-to-right to keep the wire short and avoid a backtrack across the page.
  connections.push({ from: 'BAT', to: 'DC_BUS' });
  connections.push({ from: 'DC_BUS', to: 'PCS' });
  connections.push({ from: 'PCS', to: 'AC_BUS' });
  connections.push({ from: 'AC_BUS', to: 'QF' });
  if (components.find(c => c.id === 'XF')) {
    connections.push({ from: 'QF', to: 'XF' });
    connections.push({ from: 'GRID', to: 'XF' });
  } else {
    connections.push({ from: 'GRID', to: 'QF' });
  }

  return { components, connections };
}

function compileMicrogrid(uem) {
  const components = [];
  const connections = [];
  const elec = uem.electrical || {};
  const cap = elec.capacity_kwh || 0;
  const power = elec.power_kw || 0;
  const pvKw = elec.pv_kw || 0;
  const windKw = elec.wind_kw || 0;
  const dieselKw = elec.diesel_kw || 0;
  const loadKw = elec.load_kw || 0;

  if (pvKw > 0) components.push({ id: 'PV', category: 'pv', ref: 'PV', model: `PV-${Math.floor(pvKw)}kWp`, qty: 1, params: { capacity_kw: pvKw } });
  if (windKw > 0) components.push({ id: 'WT', category: 'source', ref: 'WT', model: `WT-${Math.floor(windKw)}kW`, qty: 1, params: { capacity_kw: windKw } });
  if (dieselKw > 0) components.push({ id: 'GEN', category: 'source', ref: 'G1', model: `Genset-${Math.floor(dieselKw)}kW`, qty: 1, params: { rating_kw: dieselKw } });

  if (cap > 0 && power > 0) {
    const stringsSeries = Math.ceil(DC_BUS_VOLTAGE / CELL_VOLTAGE);
    const perPackKwh = (stringsSeries * CELL_VOLTAGE * CELL_CAPACITY_AH) / 1000;
    const packsParallel = Math.ceil(cap / perPackKwh);
    components.push({ id: 'BAT', category: 'battery_rack', ref: `BAT-${packsParallel}P`, model: `LFP-${Math.floor(perPackKwh)}kWh`, qty: packsParallel, params: { total_kwh: Math.round(packsParallel * perPackKwh * 10) / 10 } });
    const pcsCount = Math.ceil(power / PCS_UNIT_KW);
    components.push({ id: 'PCS', category: 'pcs', ref: 'PCS', model: `PCS-${PCS_UNIT_KW}kW`, qty: pcsCount, params: { unit_kw: PCS_UNIT_KW, total_kw: pcsCount * PCS_UNIT_KW } });
  }
  components.push({ id: 'AC_BUS', category: 'bus', ref: 'AC', model: `AC-${elec.voltage_level || '380V'}-${Math.floor(power + pvKw + dieselKw + windKw)}kW`, qty: 1, params: { voltage_v: voltageToLevelV(elec.voltage_level || '380V') } });
  if (loadKw > 0) components.push({ id: 'LOAD', category: 'load', ref: 'LOAD', model: `Load-${Math.floor(loadKw)}kW`, qty: 1, params: { load_kw: loadKw } });

  for (const src of ['PV', 'WT', 'GEN']) {
    if (components.find(c => c.id === src)) connections.push({ from: src, to: 'AC_BUS' });
  }
  if (components.find(c => c.id === 'PCS')) {
    connections.push({ from: 'BAT', to: 'PCS' });
    connections.push({ from: 'PCS', to: 'AC_BUS' });
  }
  if (components.find(c => c.id === 'LOAD')) connections.push({ from: 'AC_BUS', to: 'LOAD' });
  return { components, connections };
}

function compileAidc(uem) {
  const components = [];
  const elec = uem.electrical || {};
  const tier = uem.tier || {};
  const loadKw = elec.load_kw || 0;
  const voltage = elec.voltage_level || '10kV';
  const redundancy = tier.redundancy || 'N+1';
  const mainsCount = (redundancy === 'N+1' || redundancy === '2N+1') ? 2 : (redundancy === '2N' ? 4 : 1);
  for (let i = 0; i < mainsCount; i++) {
    components.push({ id: `MAINS-${i+1}`, category: 'source', ref: `QS${i+1}`, model: `市电进线-${i+1}-${voltage}`, qty: 1, params: { voltage } });
  }
  components.push({ id: 'AC_BUS', category: 'bus', ref: 'AC-IT', model: `AC-380V-${Math.floor(loadKw)}kW`, qty: 1, params: { voltage_v: 380 } });
  components.push({ id: 'PDU', category: 'load', ref: 'PDU', model: `列头柜-${Math.floor(loadKw)}kW`, qty: 1, params: { load_kw: loadKw } });
  // Connections: chain each MAINS to AC_BUS (a single AC_BUS line per mains feed).
  const connections = [];
  for (let i = 0; i < mainsCount; i++) connections.push({ from: `MAINS-${i+1}`, to: 'AC_BUS' });
  connections.push({ from: 'AC_BUS', to: 'PDU' });
  return { components, connections };
}

function compileUem(uem) {
  const ptype = (uem.project && uem.project.type) || 'ess';
  if (ptype === 'ess') return compileEss(uem);
  if (ptype === 'microgrid') return compileMicrogrid(uem);
  if (ptype === 'aidc') return compileAidc(uem);
  // hybrid: union of ess + microgrid
  if (ptype === 'hybrid') {
    const ess = compileEss(uem);
    const mg = compileMicrogrid(uem);
    const seen = new Set(ess.components.map(c => c.id));
    for (const c of mg.components) if (!seen.has(c.id)) { ess.components.push(c); seen.add(c.id); }
    return ess;
  }
  return { components: [], connections: [], note: `unknown type ${ptype}` };
}

// ====================== LAYOUT ======================
function isBusCategory(cat) {
  if (!cat) return false;
  const c = String(cat).toLowerCase();
  return c === 'dc_bus' || c === 'bus_dc' || c === 'ac_bus' || c === 'bus_ac' || c === 'bus';
}

function assignLayers(components) {
  // Group components by horizontal-layer index 0..5. Preserve order within each layer.
  const buckets = [[], [], [], [], [], []];
  for (const c of components) {
    let slot = CATEGORY_TO_LAYER[c.category];
    if (slot == null) {
      // id-based fallback
      const idLower = (c.id || '').toLowerCase();
      if (idLower.startsWith('pv') || idLower.startsWith('wt') || idLower.startsWith('gen') || idLower.startsWith('grid') || idLower.startsWith('mains')) slot = 0;
      else if (idLower.startsWith('bat')) slot = 1;
      else if (idLower.startsWith('dc')) slot = 2;
      else if (idLower.startsWith('pcs')) slot = 3;
      else if (idLower.startsWith('ac')) slot = 4;
      else if (idLower.startsWith('xf') || idLower.startsWith('t') || idLower.startsWith('load') || idLower.startsWith('qf') || idLower.startsWith('pdu')) slot = 5;
      else slot = 5;
    }
    if (slot < 0 || slot > 5) slot = 5;
    buckets[slot].push(c);
  }
  // Return as array of layers in left-to-right order; drop empty layers.
  return buckets.filter(b => b.length > 0);
}

function computeLayout(layers) {
  // Each layer is a vertical column at fixed X. Within a column, nodes stack Y-down.
  // For bus categories we render a horizontal bar (w=BUS_WIDTH) instead of a regular block.
  const positions = {};
  // Compute Y stack: pick the layer with most nodes, that drives total height.
  const maxCount = Math.max(1, ...layers.map(l => l.length));
  const totalStackH = maxCount * NODE_HEIGHT + Math.max(0, maxCount - 1) * NODE_GAP_Y;
  const centerY = PAGE_PADDING_TOP + (CANVAS_H - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM - totalStackH) / 2;
  // Place each layer
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    // Column X: each layer gets its own slot; non-bus nodes are NODE_WIDTH wide,
    // bus nodes are BUS_WIDTH wide (longer horizontal bar). Use NODE_WIDTH as the
    // base slot width so gaps remain predictable, and let bus extend rightward.
    const slotLeft = PAGE_PADDING_X + li * (LAYER_GAP_X + NODE_WIDTH);
    // center the layer column vertically
    const layerStackH = layer.length * NODE_HEIGHT + Math.max(0, layer.length - 1) * NODE_GAP_Y;
    const yStart = centerY + (totalStackH - layerStackH) / 2;
    for (let i = 0; i < layer.length; i++) {
      const c = layer[i];
      const isBus = isBusCategory(c.category);
      const w = isBus ? BUS_WIDTH : NODE_WIDTH;
      // Bus extends rightward from the column left edge (so its right end reaches
      // further into the next column's gap, signalling "this is a bus bar").
      // Non-bus nodes are centered on the column center.
      let x;
      if (isBus) {
        x = slotLeft;
      } else {
        x = slotLeft + (NODE_WIDTH - w) / 2;
      }
      const y = yStart + i * (NODE_HEIGHT + NODE_GAP_Y);
      positions[c.id] = { x, y, w, h: NODE_HEIGHT, component: c, isBus };
    }
  }
  return { positions, totalW: CANVAS_W, totalH: CANVAS_H };
}

// ====================== SVG RENDERING ======================
function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Port (edge) anchor for a node on the horizontal SLD.
//   bus:  endpoint on the bus bar (left or right end) when connecting to/from a bus
//   side: 'right' means the right side of the node, 'left' means the left side
function getPort(p, side) {
  if (p.isBus) {
    if (side === 'right') return { x: p.x + p.w, y: p.y + p.h / 2 };
    return { x: p.x, y: p.y + p.h / 2 };
  }
  if (side === 'right') return { x: p.x + p.w, y: p.y + p.h / 2 };
  return { x: p.x, y: p.y + p.h / 2 };
}

// Resolve the slot index of a node from the positions table.
function slotIndexOf(p, positions) {
  if (!p) return 0;
  // The slot is determined by the layer it belongs to; we encoded it indirectly
  // via the component's id and the assignLayers result.  Re-derive from the
  // assigned positions by looking at which column-slot (PAGE_PADDING_X + li*(LAYER_GAP_X+NODE_WIDTH))
  // the node's left edge lies in.
  const x = p.x;
  for (let li = 0; li < 6; li++) {
    const slotLeft = PAGE_PADDING_X + li * (LAYER_GAP_X + NODE_WIDTH);
    if (x >= slotLeft - 0.5 && x < slotLeft + LAYER_GAP_X + NODE_WIDTH) return li;
  }
  return 0;
}

function renderSldSvg(uem, layers, positions, totalW, totalH) {
  const project = uem.project || {};
  const elec = uem.electrical || {};
  const title = `${project.name || project.id || 'PRJ'} - ${(project.type || 'ess').toUpperCase()} - ${project.scenario || ''}`;

  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`);
  out.push(`<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="white"/>`);
  // Title: smaller font, top-left aligned, no truncation
  out.push(`<text x="${PAGE_PADDING_X}" y="28" text-anchor="start" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#222">${escapeXml(title)}</text>`);
  // Optional: project meta line right under title
  const meta = `UEM v${uem.schema_version || '1.0'} | ${elec.capacity_kwh || '-'} kWh | ${elec.power_kw || '-'} kW | ${elec.voltage_level || '-'}`;
  out.push(`<text x="${PAGE_PADDING_X}" y="44" text-anchor="start" font-family="Arial, sans-serif" font-size="9" fill="#666">${escapeXml(meta)}</text>`);

  // Draw nodes
  for (const layer of layers) {
    for (const c of layer) {
      const p = positions[c.id];
      if (!p) continue;
      if (p.isBus) {
        // Bus bar: thick horizontal line + end caps + label above + voltage below
        const yMid = p.y + p.h / 2;
        out.push(`<line x1="${p.x.toFixed(1)}" y1="${yMid.toFixed(1)}" x2="${(p.x + p.w).toFixed(1)}" y2="${yMid.toFixed(1)}" stroke="#1a3a6e" stroke-width="${BUS_THICKNESS}" stroke-linecap="round"/>`);
        // end caps (small filled circles)
        out.push(`<circle cx="${p.x.toFixed(1)}" cy="${yMid.toFixed(1)}" r="5" fill="#1a3a6e"/>`);
        out.push(`<circle cx="${(p.x + p.w).toFixed(1)}" cy="${yMid.toFixed(1)}" r="5" fill="#1a3a6e"/>`);
        // ref label above
        out.push(`<text x="${(p.x + p.w / 2).toFixed(1)}" y="${(p.y - 6).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#1a3a6e">${escapeXml(c.ref || c.id)}</text>`);
        // model label below
        out.push(`<text x="${(p.x + p.w / 2).toFixed(1)}" y="${(p.y + p.h + 14).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#333">${escapeXml(c.model || '')}</text>`);
        continue;
      }
      // Regular node: IEC symbol inside a box, ref above, model below
      const symId = findIecIdByCategory(c.category);
      if (symId) {
        const sym = loadIecSymbol(symId);
        const scale = Math.min(p.w / sym.w, p.h / sym.h);
        const sw = sym.w * scale;
        const sh = sym.h * scale;
        const sx = p.x + (p.w - sw) / 2;
        const sy = p.y + (p.h - sh) / 2;
        out.push(`<svg x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" width="${sw.toFixed(1)}" height="${sh.toFixed(1)}" viewBox="${sym.viewBox}">${sym.innerSvg}</svg>`);
      }
out.push(`<rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w}" height="${p.h}" fill="white" stroke="#333" stroke-width="1"/>`);
        out.push(`<text x="${(p.x + p.w / 2).toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#222">${escapeXml(c.ref || c.id)}</text>`);
        out.push(`<text x="${(p.x + p.w / 2).toFixed(1)}" y="${(p.y + p.h + 14).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#333">${escapeXml(c.model || '')}</text>`);
    }
  }

  // Draw connections (orthogonal: src-right -> midX -> dst-left).  When the
  // horizontal span is more than 1.5 layer slots, route the trunk along a
  // dedicated channel below the components row to avoid crossing them.
  const compiled = compileUem(uem);
  // Compute the components-row baseline: bottom of the lowest placed node.
  let rowBottom = 0;
  for (const k in positions) { if (positions[k].y + positions[k].h > rowBottom) rowBottom = positions[k].y + positions[k].h; }
  const trunkY = rowBottom + 30;          // 30px below the row
  const layerWidth = LAYER_GAP_X + NODE_WIDTH;

  // 收集所有已渲染的线段 (用于后面跳线检测 + AABB 避障)
  // 每条连线存储: id, segments[{x1,y1,x2,y2}], endpoint {x,y} (dst 端)
  const allSegments = [];
  // 收集所有非端点 node bbox (用作避障参考)
  const nodeBoxes = [];
  for (const k in positions) {
    const pp = positions[k];
    // Bus 节点扩展 padding 用于避障
    const pad = 6;
    nodeBoxes.push({ x1: pp.x - pad, y1: pp.y - pad, x2: pp.x + pp.w + pad, y2: pp.y + pp.h + pad, id: k });
  }

  function segmentsCrossH(s, y) {
    // 线段 s 与水平线 y 是否相交 (返回交点 x,否则 null)
    const minY = Math.min(s.y1, s.y2), maxY = Math.max(s.y1, s.y2);
    if (y < minY - 0.5 || y > maxY + 0.5) return null;
    if (Math.abs(s.y1 - s.y2) < 0.5) return null; // 本身就是水平线
    const t = (y - s.y1) / (s.y2 - s.y1);
    return s.x1 + t * (s.x2 - s.x1);
  }
  function segmentsCrossV(x, s) {
    const minX = Math.min(s.x1, s.x2), maxX = Math.max(s.x1, s.x2);
    if (x < minX - 0.5 || x > maxX + 0.5) return null;
    if (Math.abs(s.x1 - s.x2) < 0.5) return null;
    const t = (x - s.x1) / (s.x2 - s.x1);
    return s.y1 + t * (s.y2 - s.y1);
  }
  // AABB 检查: 线段 s 是否穿过 node box (除自身端点 node)
  function segmentCrossesNodeBox(s, excludeNodeId) {
    for (const b of nodeBoxes) {
      if (excludeNodeId && (b.id === excludeNodeId)) continue;
      // 端点 node 不算穿过 (端点本来就要连)
      // 判断线段 (x1,y1)-(x2,y2) 与矩形 (x1,y1,x2,y2) 是否相交
      // 用 Liang-Barsky 简化: 检测线段两端点是否在矩形内 + 矩形 4 边是否穿过线段
      const inBox = (px, py) => px > b.x1 && px < b.x2 && py > b.y1 && py < b.y2;
      if (inBox(s.x1, s.y1) && inBox(s.x2, s.y2)) return b; // 全在矩形内
      // 简化: 仅检测线段是否水平或垂直穿过矩形的内部
      if (Math.abs(s.y1 - s.y2) < 0.5) {
        // 水平线: 检查 y 在矩形内 + x 范围重叠
        if (s.y1 > b.y1 && s.y1 < b.y2 && Math.max(s.x1, s.x2) > b.x1 && Math.min(s.x1, s.x2) < b.x2) return b;
      } else if (Math.abs(s.x1 - s.x2) < 0.5) {
        // 垂直线: 检查 x 在矩形内 + y 范围重叠
        if (s.x1 > b.x1 && s.x1 < b.x2 && Math.max(s.y1, s.y2) > b.y1 && Math.min(s.y1, s.y2) < b.y2) return b;
      }
    }
    return null;
  }

  for (const conn of (compiled.connections || [])) {
    const a = positions[conn.from];
    const b = positions[conn.to];
    if (!a || !b) continue;
    const pa = getPort(a, 'right');
    const pb = getPort(b, 'left');
    const spanSlots = Math.abs(slotIndexOf(b, positions) - slotIndexOf(a, positions));
    let d, segs = [];
    if (Math.abs(pa.y - pb.y) < 0.5 && spanSlots <= 1) {
      // Aligned ports and adjacent columns: a single straight line is fine
      const lineEndX = pb.x;
      d = `M ${pa.x.toFixed(1)} ${pa.y.toFixed(1)} L ${lineEndX.toFixed(1)} ${pb.y.toFixed(1)}`;
      segs = [{ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }];
      out.push(`<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" stroke="black" stroke-width="2"/>`);
    } else if (spanSlots > 1) {
      // Long connection: drop to the trunk channel, run, then climb to the dst.
      const dropX1 = pa.x + 20;
      const dropX2 = pb.x - 20;
      d = `M ${pa.x.toFixed(1)} ${pa.y.toFixed(1)} L ${dropX1.toFixed(1)} ${pa.y.toFixed(1)} L ${dropX1.toFixed(1)} ${trunkY.toFixed(1)} L ${dropX2.toFixed(1)} ${trunkY.toFixed(1)} L ${dropX2.toFixed(1)} ${pb.y.toFixed(1)} L ${pb.x.toFixed(1)} ${pb.y.toFixed(1)}`;
      segs = [
        { x1: pa.x, y1: pa.y, x2: dropX1, y2: pa.y },
        { x1: dropX1, y1: pa.y, x2: dropX1, y2: trunkY },
        { x1: dropX1, y1: trunkY, x2: dropX2, y2: trunkY },
        { x1: dropX2, y1: trunkY, x2: dropX2, y2: pb.y },
        { x1: dropX2, y1: pb.y, x2: pb.x, y2: pb.y }
      ];
      out.push(`<path d="${d}" fill="none" stroke="black" stroke-width="2" stroke-linejoin="miter"/>`);
    } else {
      // Adjacent column but ports at different Y: simple 4-vertex ortho at src-Y
      const midX = (pa.x + pb.x) / 2;
      // 检查 midX 处的竖直段是否穿过任何节点 (除 a, b)
      const vSeg = { x1: midX, y1: pa.y, x2: midX, y2: pb.y };
      const conflict = segmentCrossesNodeBox(vSeg, conn.from) && segmentCrossesNodeBox(vSeg, conn.to);
      if (conflict && conflict.id !== conn.from && conflict.id !== conn.to) {
        // 改走 trunk 通道绕行
        const dropX1 = pa.x + 20;
        const dropX2 = pb.x - 20;
        d = `M ${pa.x.toFixed(1)} ${pa.y.toFixed(1)} L ${dropX1.toFixed(1)} ${pa.y.toFixed(1)} L ${dropX1.toFixed(1)} ${trunkY.toFixed(1)} L ${dropX2.toFixed(1)} ${trunkY.toFixed(1)} L ${dropX2.toFixed(1)} ${pb.y.toFixed(1)} L ${pb.x.toFixed(1)} ${pb.y.toFixed(1)}`;
        segs = [
          { x1: pa.x, y1: pa.y, x2: dropX1, y2: pa.y },
          { x1: dropX1, y1: pa.y, x2: dropX1, y2: trunkY },
          { x1: dropX1, y1: trunkY, x2: dropX2, y2: trunkY },
          { x1: dropX2, y1: trunkY, x2: dropX2, y2: pb.y },
          { x1: dropX2, y1: pb.y, x2: pb.x, y2: pb.y }
        ];
      } else {
        d = `M ${pa.x.toFixed(1)} ${pa.y.toFixed(1)} L ${midX.toFixed(1)} ${pa.y.toFixed(1)} L ${midX.toFixed(1)} ${pb.y.toFixed(1)} L ${pb.x.toFixed(1)} ${pb.y.toFixed(1)}`;
        segs = [
          { x1: pa.x, y1: pa.y, x2: midX, y2: pa.y },
          { x1: midX, y1: pa.y, x2: midX, y2: pb.y },
          { x1: midX, y1: pb.y, x2: pb.x, y2: pb.y }
        ];
      }
      out.push(`<path d="${d}" fill="none" stroke="black" stroke-width="2" stroke-linejoin="miter"/>`);
    }
    // arrow head at the dst end
    out.push(`<circle cx="${pb.x.toFixed(1)}" cy="${pb.y.toFixed(1)}" r="3" fill="black"/>`);
    allSegments.push({ conn, segs, endpoint: { x: pb.x, y: pb.y } });
  }

  // ====================== 跳线半圆 (jump/hop) 检测 ======================
  // 对于每对连线,检测水平段是否与垂直段相交,如果是 T 形交叉,给"先画的"
  // (allSegments 中排在前面的) 画一个 5px 半径的半圆弧,白色背景覆盖 + 黑色跳线
  const JUMP_R = 6;
  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const A = allSegments[i].segs;
      const B = allSegments[j].segs;
      for (const a of A) {
        if (Math.abs(a.y1 - a.y2) > 0.5) continue; // 只检测水平线
        for (const b of B) {
          if (Math.abs(b.x1 - b.x2) > 0.5) continue; // 只检测垂直线
          // 水平段 a, 垂直段 b, 求交点
          const x = b.x1;
          const y = a.y1;
          // 检查交点是否在两条线段内
          if (x < Math.min(a.x1, a.x2) - 0.5 || x > Math.max(a.x1, a.x2) + 0.5) continue;
          if (y < Math.min(b.y1, b.y2) - 0.5 || y > Math.max(b.y1, b.y2) + 0.5) continue;
          // 跳过端点附近 (避免跳线画在节点端口上)
          const endA = allSegments[i].endpoint;
          const endB = allSegments[j].endpoint;
          const distToEndA = Math.hypot(x - endA.x, y - endA.y);
          const distToEndB = Math.hypot(x - endB.x, y - endB.y);
          if (distToEndA < 8 || distToEndB < 8) continue;
          // A 是先画的, 给 A 加跳线半圆
          // 半圆弧画法: 白色背景弧盖住 + 黑色跳线弧 (从 A 垂直方向凸出)
          // 用 path 半圆: M (x-JUMP_R) y A JUMP_R JUMP_R 0 0 0 (x+JUMP_R) y
          // 加上: M (x-JUMP_R) y L (x+JUMP_R) y (白底线)
          const arcPath = `M ${(x - JUMP_R).toFixed(1)} ${y.toFixed(1)} A ${JUMP_R} ${JUMP_R} 0 0 0 ${(x + JUMP_R).toFixed(1)} ${y.toFixed(1)}`;
          // 先画白底弧盖住底下的水平线
          out.push(`<path d="${arcPath}" fill="white" stroke="white" stroke-width="2"/>`);
          // 再画黑色跳线弧
          out.push(`<path d="${arcPath}" fill="none" stroke="black" stroke-width="2"/>`);
          // 跳过 A 的这条 segment 后续,避免重复画 (但我们没法改 out[] 序列)
          break;
        }
      }
    }
  }

  // Layer labels at the bottom of the canvas
  const layerNames = ['源 (Source)', '电池 (Battery)', '直流母线 (DC Bus)', 'PCS', '交流母线 (AC Bus)', '升压/负载 (XF / Load)'];
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    if (!layer.length) continue;
    const slotLeft = PAGE_PADDING_X + li * (LAYER_GAP_X + NODE_WIDTH);
    const xCenter = slotLeft + NODE_WIDTH / 2;
    out.push(`<text x="${xCenter.toFixed(1)}" y="${(totalH - 18).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#888">${escapeXml(layerNames[li] || ('L' + li))}</text>`);
  }

  // Legend
  const legendY = totalH - 6;
  out.push(`<text x="${PAGE_PADDING_X}" y="${legendY}" font-family="Arial, sans-serif" font-size="8" fill="#999">ess-platform L5 SVG Renderer | ${escapeXml(project.id || '')}</text>`);
  out.push(`<text x="${(totalW - PAGE_PADDING_X).toFixed(1)}" y="${legendY}" text-anchor="end" font-family="Arial, sans-serif" font-size="8" fill="#999">ess-agent.com (Vercel)</text>`);

  out.push('</svg>');
  return out.join('\n');
}

// ====================== HTTP HANDLER ======================
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

  const t0 = Date.now();
  try {
    // Body can be {uem, type} OR just the UEM directly
    const body = req.body || {};
    const uem = body.uem || body;
    const type = body.type || 'sld';

    if (!uem || typeof uem !== 'object') {
      return res.status(400).json({ ok: false, error: 'invalid UEM body' });
    }
    if (!uem.project || !uem.electrical) {
      return res.status(400).json({ ok: false, error: 'UEM missing project/electrical section' });
    }
    if (type !== 'sld') {
      return res.status(400).json({ ok: false, error: `unsupported type: ${type} (only sld supported in v1)` });
    }

    // Lazy-init IEC index
    if (!IEC_INDEX) loadIecIndex();

    // Compile + layout
    const compiled = compileUem(uem);
    if (!compiled.components.length) {
      return res.status(400).json({ ok: false, error: 'compileUem returned no components' });
    }
    const layers = assignLayers(compiled.components);
    const { positions, totalW, totalH } = computeLayout(layers);

    // Render
    const svg = renderSldSvg(uem, layers, positions, totalW, totalH);
    const sizeKb = Math.round(svg.length / 102.4) / 10;

    const latency = Date.now() - t0;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      ok: true,
      svg,
      size_kb: sizeKb,
      layers: layers.length,
      components: compiled.components.length,
      connections: (compiled.connections || []).length,
      symbols_loaded: IEC_CACHE.size,
      total_w: totalW,
      total_h: totalH,
      latency_ms: latency,
      iec_dir: IEC_DIR,
      iec_index_loaded: !!IEC_INDEX && (IEC_INDEX.symbols || []).length > 0,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err && err.message || err), stack: err && err.stack });
  }
}

// ====================== CLI TEST (for local dev) ======================
// node api/render_svg.js <uem.json> [out.svg]
// Use a sentinel env var so the CLI block only runs when explicitly invoked.
// Vercel functions never set RENDER_SVG_CLI=1, so the block is dead in production.
if (process.env.RENDER_SVG_CLI === '1') {
  const uemPath = process.argv[2];
  const outPath = process.argv[3];
  if (!uemPath) {
    console.error('Usage: RENDER_SVG_CLI=1 node api/render_svg.js <uem.json> [out.svg]');
    process.exit(1);
  }
  const uem = JSON.parse(fs.readFileSync(uemPath, 'utf8'));
  loadIecIndex();
  const compiled = compileUem(uem);
  const layers = assignLayers(compiled.components);
  const { positions, totalW, totalH } = computeLayout(layers);
  const svg = renderSldSvg(uem, layers, positions, totalW, totalH);
  if (outPath) fs.writeFileSync(outPath, svg, 'utf8');
  console.log(`OK: ${outPath || '(stdout)'} (${totalW}x${totalH}, ${layers.length} layers, ${compiled.components.length} components, ${svg.length} chars)`);
}

// Also export the internals for unit testing.
export { compileUem, assignLayers, computeLayout, renderSldSvg, loadIecSymbol, findIecIdByCategory };
