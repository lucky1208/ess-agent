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
const NODE_WIDTH = 100;
const NODE_HEIGHT = 60;
const LAYER_GAP_Y = 100;
const NODE_GAP_X = 30;
const PAGE_PADDING_X = 30;
const PAGE_PADDING_TOP = 30;
const PAGE_PADDING_BOTTOM = 30;

const CATEGORY_TO_LAYER = {
  // Layer numbers in the task spec: 100/200/300/400/500/600/700
  // These map to the vertical slot in the SVG.  Higher = drawn higher (smaller y).
  pv: 100,
  battery: 200,
  battery_rack: 200,
  dc_bus: 300,
  bus_dc: 300,
  pcs: 400,
  ac_bus: 500,
  bus: 500,
  bus_ac: 500,
  transformer: 600,
  protection: 650,
  switching: 660,
  controller: 670,
  ups: 480,
  load: 750,
  source: 700,
  grid: 700,
  wind: 80,
  diesel: 90,
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

  // Connections (topological order for line drawing)
  connections.push({ from: 'BAT', to: 'DC_BUS' });
  connections.push({ from: 'DC_BUS', to: 'PCS' });
  connections.push({ from: 'PCS', to: 'AC_BUS' });
  connections.push({ from: 'AC_BUS', to: 'QF' });
  if (components.find(c => c.id === 'XF')) {
    connections.push({ from: 'QF', to: 'XF' });
    connections.push({ from: 'XF', to: 'GRID' });
  } else {
    connections.push({ from: 'QF', to: 'GRID' });
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
  // Simplified: just chain MAINS -> AC_BUS -> PDU
  for (let i = 0; i < mainsCount; i++) connections.push({ from: `MAINS-${i+1}`, to: 'AC_BUS' });
  return { components, connections: [] };
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
function assignLayers(components) {
  // Group components by their layer slot.  Use a Map to preserve insertion order.
  const layers = new Map();
  for (const c of components) {
    const layer = CATEGORY_TO_LAYER[c.category] != null
      ? CATEGORY_TO_LAYER[c.category]
      : CATEGORY_TO_LAYER[CATEGORY_TO_LAYER[c.id.split('-')[0].toLowerCase()] != null ? c.id.split('-')[0].toLowerCase() : 'bus'] || 500;
    // Layer by id fallback (for cases where category is missing)
    let slot = CATEGORY_TO_LAYER[c.category];
    if (slot == null) {
      const idLower = c.id.toLowerCase();
      if (idLower.startsWith('bat')) slot = 200;
      else if (idLower.startsWith('dc')) slot = 300;
      else if (idLower.startsWith('pcs')) slot = 400;
      else if (idLower.startsWith('ac')) slot = 500;
      else if (idLower.startsWith('xf') || idLower.startsWith('t')) slot = 600;
      else if (idLower.startsWith('qf') || idLower.startsWith('qs')) slot = 650;
      else if (idLower.startsWith('grid') || idLower.startsWith('mains')) slot = 700;
      else if (idLower.startsWith('pdu') || idLower.startsWith('load')) slot = 750;
      else slot = 500;
    }
    if (!layers.has(slot)) layers.set(slot, []);
    layers.get(slot).push(c);
  }
  // Sort by layer slot DESCENDING: higher slot = drawn at TOP (source side).
  // Python's reference implementation draws GRID (slot 700) at y=30 (top) and
  // BAT (slot 200) at y=530 (bottom) — a typical SLD convention with source on top.
  return [...layers.entries()].sort((a, b) => b[0] - a[0]).map(([_, list]) => list);
}

function computeLayout(layers) {
  // y for each layer: layer 1 (lowest slot number) starts at PAGE_PADDING_TOP, then +LAYER_GAP_Y each.
  // To keep y increasing downward, layers with smaller slot value (e.g. pv=100, battery=200) come first.
  const positions = {};
  let layerWidths = layers.map(layer => layer.length * NODE_WIDTH + Math.max(0, layer.length - 1) * NODE_GAP_X);
  const maxLayerW = Math.max(0, ...layerWidths);
  let y = PAGE_PADDING_TOP;
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    if (layer.length === 0) continue;
    const lw = layerWidths[li];
    const xStart = (maxLayerW - lw) / 2 + PAGE_PADDING_X;
    for (let i = 0; i < layer.length; i++) {
      const c = layer[i];
      const x = xStart + i * (NODE_WIDTH + NODE_GAP_X);
      positions[c.id] = { x, y, w: NODE_WIDTH, h: NODE_HEIGHT, component: c };
    }
    y += LAYER_GAP_Y;
  }
  const totalW = maxLayerW + 2 * PAGE_PADDING_X;
  const totalH = y + PAGE_PADDING_BOTTOM;
  return { positions, totalW: Math.ceil(totalW), totalH: Math.ceil(totalH) };
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

function renderSldSvg(uem, layers, positions, totalW, totalH) {
  const project = uem.project || {};
  const elec = uem.electrical || {};
  const title = `${project.name || project.id || 'PRJ'} - ${(project.type || 'ess').toUpperCase()} - ${project.scenario || ''}`;

  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`);
  out.push(`<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="white"/>`);
  out.push(`<text x="${(totalW / 2).toFixed(1)}" y="20" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold">${escapeXml(title)}</text>`);

  // Draw nodes
  for (const layer of layers) {
    for (const c of layer) {
      const p = positions[c.id];
      if (!p) continue;
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
      out.push(`<rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w}" height="${p.h}" fill="none" stroke="#999" stroke-width="0.5"/>`);
      out.push(`<text x="${(p.x + p.w / 2).toFixed(1)}" y="${(p.y - 4).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold">${escapeXml(c.ref || c.id)}</text>`);
      out.push(`<text x="${(p.x + p.w / 2).toFixed(1)}" y="${(p.y + p.h + 12).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="9">${escapeXml(c.model || '')}</text>`);
    }
  }

  // Draw connections
  const compiled = compileUem(uem);
  for (const conn of (compiled.connections || [])) {
    const a = positions[conn.from];
    const b = positions[conn.to];
    if (!a || !b) continue;
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h;
    const x2 = b.x + b.w / 2;
    const y2 = b.y;
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="black" stroke-width="1"/>`);
  }

  // Legend
  const legendY = totalH - 12;
  out.push(`<text x="20" y="${legendY}" font-family="Arial" font-size="8" fill="#666">ess-platform L5 SVG Renderer | UEM v${uem.schema_version || '1.0'}</text>`);
  out.push(`<text x="${totalW - 20}" y="${legendY}" text-anchor="end" font-family="Arial" font-size="8" fill="#666">PRJ: ${escapeXml(project.id || '')} | 容量: ${elec.capacity_kwh || '-'} kWh | 功率: ${elec.power_kw || '-'} kW</text>`);

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
