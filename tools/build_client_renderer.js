// tools/build_client_renderer.js
// Plan B: extract a self-contained browser-side SLD renderer from api/render_svg.js
//   - pulls constants, IEC inline data, and core render functions
//   - drops server-only bits (fs, path, fileURLToPath, resolveIecDir, loadIecIndex, handler, CLI block)
//   - exposes window.EssAgentRenderSld(uem, type) for the front-end
//
// Output: dist/client-render-svg.js (~2.7 MB)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC = path.join(__dirname, '..', 'api', 'render_svg.js');
const OUT = path.join(__dirname, '..', 'dist', 'client-render-svg.js');

const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');

// === slice ranges (1-indexed inclusive) ===
//   - Constants: 30..119 (CATEGORY_TO_LAYER, CATEGORY_TO_IEC, NODE_WIDTH, ...)
//   - IEC data:  120..36631 (IEC_SYMBOLS_INDEX + IEC_SYMBOLS_FILES)
//   - Core fns:  36725..37380 (findIecIdByCategory, loadIecSymbol, compileUem, compile*,
//                                 isBusCategory, assignLayers, computeLayout, escapeXml,
//                                 getPort, slotIndexOf, renderSldSvg)
//   - renderE01/E02/E03 + wrapBssDrawing: 37382..37442 (optional, included for completeness)
const RANGES = [
  [36, 119],          // CONFIG constants only (skip ESM imports + __dirname at lines 30..35)
  [120, 36631],       // IEC_SYMBOLS_INDEX + IEC_SYMBOLS_FILES
  [36725, 37380],     // findIecIdByCategory, loadIecSymbol, compile*, isBusCategory,
                      // assignLayers, computeLayout, escapeXml, getPort, slotIndexOf, renderSldSvg
  [37382, 37443],     // renderE01/E02/E03 + wrapBssDrawing (line 37443 = closing `}` of renderE03)
];

function sliceLines(lines, from, toIncl) {
  return lines.slice(from - 1, toIncl).join('\n');
}

let body = '';
for (const [a, b] of RANGES) {
  body += '\n// ===== extracted lines ' + a + '..' + b + ' =====\n';
  body += sliceLines(lines, a, b);
  body += '\n';
}

// Header + trailer
const header = `// client-render-svg.js
// Plan B: 客户端 SLD renderer,前端 inline 版本,绕开 Vercel 函数 hang
// 由 tools/build_client_renderer.js 从 api/render_svg.js 自动生成
// ==========================================================================
(function(){
"use strict";
// Note: IEC_INDEX, INLINE_FILES, IEC_CACHE are initialized at the bottom of
// this IIFE (after IEC_SYMBOLS_INDEX + IEC_SYMBOLS_FILES are declared as const).
var IEC_DIR = null;
`;

const trailer = `

// ====================== LATE INIT (must come after const declarations) ======================
var IEC_INDEX = { symbols: IEC_SYMBOLS_INDEX };
var IEC_CACHE = new Map();
var INLINE_FILES = IEC_SYMBOLS_FILES;

// ====================== CLIENT EXPORT ======================
// uem: UEM JSON object
// type: 'sld' | 'e01' | 'e02' | 'e03'
// returns: { ok, svg, size_kb, components, connections, latency_ms, error? }
window.EssAgentRenderSld = function(uem, type) {
  type = type || 'sld';
  var t0 = Date.now();
  try {
    if (!uem || typeof uem !== 'object') {
      return { ok: false, error: 'invalid UEM body' };
    }
    if (!uem.project || !uem.electrical) {
      return { ok: false, error: 'UEM missing project/electrical section' };
    }
    // Patch: 'industrial' reuses 'ess' compileEss logic (not in source compileUem switch)
    var ptype = (uem.project && uem.project.type) || 'ess';
    var compiled;
    if (ptype === 'industrial' || ptype === 'ess') {
      compiled = compileEss(uem);
    } else {
      compiled = compileUem(uem);
    }
    if (!compiled.components.length) {
      return { ok: false, error: 'compileUem returned no components' };
    }
    var components = compiled.components;
    var connections = compiled.connections || [];
    if (type === 'e01') {
      var keep = { GRID:1, MV_SWGR:1, MV_PT:1, TR:1 };
      components = components.filter(function(c){ return !!keep[c.id]; });
      connections = connections.filter(function(c){ return !!keep[c.from] && !!keep[c.to]; });
    } else if (type === 'e02') {
      var keep2 = { TR:1, LV_SWGR:1, AC_BUS:1, CHG_CTRL:1 };
      components = components.filter(function(c){ return !!keep2[c.id]; });
      connections = connections.filter(function(c){ return !!keep2[c.from] && !!keep2[c.to]; });
    } else if (type === 'e03') {
      components = components.filter(function(c){ return (c.zone && c.zone.split(',').indexOf('dc') >= 0) || c.id === 'BAT_CAB'; });
      var dcIds = {};
      for (var i = 0; i < components.length; i++) dcIds[components[i].id] = 1;
      connections = connections.filter(function(c){ return !!dcIds[c.from] && !!dcIds[c.to]; });
    }
    if (!components.length) {
      return { ok: false, error: 'no components after type=' + type + ' filter' };
    }
    var layers = assignLayers(components);
    var layout = computeLayout(layers);
    var svg, drawingTitle;
    if (type === 'e01')      { svg = renderE01MvOneLine(uem, layers, layout.positions, layout.totalW, layout.totalH); drawingTitle = 'E-01 10kV 一次接线图'; }
    else if (type === 'e02') { svg = renderE02LvOneLine(uem, layers, layout.positions, layout.totalW, layout.totalH); drawingTitle = 'E-02 低压 AC 配电单线图'; }
    else if (type === 'e03') { svg = renderE03DcSystem(uem, layers, layout.positions, layout.totalW, layout.totalH); drawingTitle = 'E-03 充电模块-DC 系统图'; }
    else                     { svg = renderSldSvg(uem, layers, layout.positions, layout.totalW, layout.totalH); drawingTitle = 'SLD 单线图'; }
    return {
      ok: true,
      svg: svg,
      type: type,
      drawing_title: drawingTitle,
      size_kb: Math.round(svg.length / 102.4) / 10,
      layers: layers.length,
      components: compiled.components.length,
      connections: (compiled.connections || []).length,
      symbols_loaded: IEC_CACHE.size,
      total_w: layout.totalW,
      total_h: layout.totalH,
      latency_ms: Date.now() - t0,
      iec_index_loaded: !!IEC_INDEX && (IEC_INDEX.symbols || []).length > 0,
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e), stack: e && e.stack };
  }
};

// Debug: log when client renderer loads
if (typeof console !== 'undefined' && console.log) {
  console.log('[client-render-svg.js] loaded; IEC_SYMBOLS_FILES count = ' + Object.keys(IEC_SYMBOLS_FILES || {}).length);
}

})();
`;

const out = header + body + trailer;
fs.writeFileSync(OUT, out, 'utf8');
console.log('OK: ' + OUT + ' (' + Math.round(out.length/1024) + ' KB, ' + out.length + ' bytes)');
console.log('   IEC symbols: ' + Object.keys.length);