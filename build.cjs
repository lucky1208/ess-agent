const fs = require('fs');
const path = require('path');

const src = path.join(__dirname);
const dist = path.join(__dirname, 'dist');

if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });

fs.cpSync(path.join(src, 'index.html'), path.join(dist, 'index.html'), { force: true });
// Copy flash images
const imgs = ['闪充 系统架构图.png', '闪充主功率原理图.png', '闪充站冷却系统图.png', '闪充.png', 'yelengxitong.png'];
imgs.forEach(f => {
  if (fs.existsSync(path.join(src, f)))
    fs.cpSync(path.join(src, f), path.join(dist, f), { force: true });
});
const imgDir = path.join(dist, 'images');
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
const farch = '闪充 系统架构图.png';
if (fs.existsSync(path.join(src, farch)))
  fs.cpSync(path.join(src, farch), path.join(imgDir, 'flash-arch.png'), { force: true });
const fpwr = '闪充主功率原理图.png';
if (fs.existsSync(path.join(src, fpwr)))
  fs.cpSync(path.join(src, fpwr), path.join(imgDir, 'flash-power.png'), { force: true });
const fcool = '闪充站冷却系统图.png';
if (fs.existsSync(path.join(src, fcool)))
  fs.cpSync(path.join(src, fcool), path.join(imgDir, 'flash-cooling.png'), { force: true });
// Copy yelengxitong.png as c.png (used by flash cooling tab)
if (fs.existsSync(path.join(src, 'yelengxitong.png')))
  fs.cpSync(path.join(src, 'yelengxitong.png'), path.join(dist, 'c.png'), { force: true });
// Copy battery design.png as battery-design.png (used by flash battery tab)
if (fs.existsSync(path.join(src, 'battery design.png')))
  fs.cpSync(path.join(src, 'battery design.png'), path.join(dist, 'battery-design.png'), { force: true });
// Copy gaoyapeidian.png (used by flash HV tab)
if (fs.existsSync(path.join(src, 'gaoyapeidian.png')))
  fs.cpSync(path.join(src, 'gaoyapeidian.png'), path.join(dist, 'gaoyapeidian.png'), { force: true });
// Copy gonglvdiaodu.png (used by flash dispatch tab)
if (fs.existsSync(path.join(src, 'gonglvdiaodu.png')))
  fs.cpSync(path.join(src, 'gonglvdiaodu.png'), path.join(dist, 'gonglvdiaodu.png'), { force: true });
// Copy BMS&protocol.png as bms-protocol.png (used by flash BMS tab)
if (fs.existsSync(path.join(src, 'BMS&protocol.png')))
  fs.cpSync(path.join(src, 'BMS&protocol.png'), path.join(dist, 'bms-protocol.png'), { force: true });
// Copy reguanli.png as reguanli.png (used by flash thermal tab)
if (fs.existsSync(path.join(src, 'reguanli.png')))
  fs.cpSync(path.join(src, 'reguanli.png'), path.join(dist, 'reguanli.png'), { force: true });
// Copy yelengsanre.png as yelengsanre.png (used by 算电协同 liquid cooling step)
if (fs.existsSync(path.join(src, 'yelengsanre.png')))
  fs.cpSync(path.join(src, 'yelengsanre.png'), path.join(dist, 'yelengsanre.png'), { force: true });
// Copy Battery Pack Engineering images
const packImgs = {
  '电池包结构布局图.png': 'pack-layout.png',
  '电池包电气连接.png': 'pack-electrical.png',
  'BMS采样电路设计图.png': 'bms-sampling.png',
  '换电站电池包设计图.png': 'bs-pack-design.png'
};
Object.entries(packImgs).forEach(([srcName, dstName]) => {
  if (fs.existsSync(path.join(src, srcName)))
    fs.cpSync(path.join(src, srcName), path.join(dist, dstName), { force: true });
});
// Copy Module design image
if (fs.existsSync(path.join(src, '电池设计与模块规格图.png')))
  fs.cpSync(path.join(src, '电池设计与模块规格图.png'), path.join(dist, 'pack-module.png'), { force: true });
// Copy flash SVG wrappers
const svgWrappers = ['flash-arch.svg', 'flash-power.svg', 'flash-cooling.svg', 'gaoyapeidian.svg', 'gonglvdiaodu.svg', 'bms-protocol.svg', 'battery-design.svg', 'thermal.svg'];
svgWrappers.forEach(f => {
  if (fs.existsSync(path.join(src, f)))
    fs.cpSync(path.join(src, f), path.join(dist, f), { force: true });
});
// Copy images
const imgSrc = path.join(src, 'images');
if (fs.existsSync(imgSrc))
  fs.cpSync(imgSrc, imgDir, { recursive: true, force: true });
// Copy assets
const assetsSrc = path.join(src, 'assets');
const assetsDst = path.join(dist, 'assets');
if (fs.existsSync(assetsSrc))
  fs.cpSync(assetsSrc, assetsDst, { recursive: true, force: true });
// Copy other static assets
const extras = ['charging_eu_demo.svg', 'client-render-svg.js', 'ems_arch_4layers_mm7.svg',
  'ems_comms_protocols_mm8.svg', 'ems_dispatch_layers_mm10.svg', 'ems_eblock_internal_mm9.svg',
  'ems_module_design_overview.svg', 'ems_network_topology_mm11.svg', 'ems_operation_timeline.svg',
  'ess_agent_3d_twin_viewer.html', 'gb60kw_schematic.svg', 'lc_electrical_diagram.svg',
  'lc_explosion_view.svg', 'microgrid_arch_4types_3.svg', 'microgrid_arch_acdc_2.svg',
  'microgrid_arch_topology_1.svg', 'microgrid_comms_network_6.svg',
  'microgrid_grid_off_logic.svg', 'microgrid_mode_switch_4.svg',
  'microgrid_protection_config.svg', 'microgrid_secondary_diagram.svg',
  'yeleng.svg', 'yeleng.png'];
extras.forEach(f => {
  if (fs.existsSync(path.join(src, f)))
    fs.cpSync(path.join(src, f), path.join(dist, f), { force: true });
});
const iec = path.join(src, 'iec_symbols_svg');
const iecDst = path.join(dist, 'iec_symbols_svg');
if (fs.existsSync(iec))
  fs.cpSync(iec, iecDst, { recursive: true, force: true });
console.log('Build complete: copied to dist/');
