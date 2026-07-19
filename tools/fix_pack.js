import { readFileSync, writeFileSync } from 'fs';
let html = readFileSync('E:\\project\\储能\\ess-platform\\index.html', 'utf8');

// Find the exact text around overview tab
const idx = html.indexOf("bsPackSwitchTab('overview')");
if (idx === -1) { console.log('ERROR: overview not found'); process.exit(1); }
const chunk = html.substring(idx - 80, idx + 300);
console.log('Context:', JSON.stringify(chunk.substring(0, 200)));

// Check if cell tab already exists
if (html.includes("bsPackSwitchTab('cell')")) {
  console.log('Cell tab already exists');
} else {
  // Insert cell tab after overview tab line
  const overviewEnd = html.indexOf('</div>', idx) + 6;
  const cellTab = '\n<div class="bs-elec-tab" onclick="bsPackSwitchTab(\'cell\')">🔋 Cell设计</div>';
  html = html.substring(0, overviewEnd) + cellTab + html.substring(overviewEnd);
  console.log('Cell tab inserted');
}

// Insert bpCell div before bpModule
if (html.includes('id="bpCell"')) {
  console.log('bpCell already exists');
} else {
  const cellHtml = `
<!-- ② Cell设计 -->
<div id="bpCell" style="display:none">
<div class="mg-card" style="margin-bottom:20px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<h3 style="margin:0;color:var(--text1);font-size:15px">🔋 电芯设计 Cell Engineering</h3>
<span style="font-size:11px;color:var(--text2)">方形铝壳 LFP</span>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
<div>
<div style="font-size:13px;font-weight:700;color:var(--text1);margin-bottom:8px">电芯参数</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">化学体系</span><br><b style="color:var(--text1)">LiFePO₄</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">标称容量</span><br><b style="color:var(--text1)">280Ah</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">标称电压</span><br><b style="color:var(--text1)">3.2V</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">内阻</span><br><b style="color:var(--text1)">≤0.4mΩ</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">重量</span><br><b style="color:var(--text1)">5.4kg</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">尺寸</span><br><b style="color:var(--text1)">174×72×207mm</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">充电截止</span><br><b style="color:#50c878">3.65V</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">放电截止</span><br><b style="color:#ef4444">2.5V</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">循环寿命</span><br><b style="color:var(--text1)">≥6000次</b></div>
<div style="padding:10px;background:var(--bg3);border-radius:6px"><span style="font-size:11px;color:var(--text2)">充电倍率</span><br><b style="color:var(--text1)">1C (持续)</b></div>
</div>
</div>
<div>
<div style="font-size:13px;font-weight:700;color:var(--text1);margin-bottom:8px">电芯内部结构</div>
<div style="padding:12px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text2);line-height:1.8">
<div>📌 <b style="color:var(--text1)">极片叠层</b>：正极(LFP) → 隔膜(PP/PE) → 负极(石墨)</div>
<div>📌 <b style="color:var(--text1)">极耳设计</b>：铝极耳(正极) + 铜极耳(负极)</div>
<div>📌 <b style="color:var(--text1)">电解液</b>：LiPF₆/EC+DMC+EMC</div>
<div>📌 <b style="color:var(--text1)">安全阀</b>：顶部泄压阀 ≥0.8MPa开启</div>
<div>📌 <b style="color:var(--text1)">密封</b>：激光焊接铝壳 + 密封圈</div>
<div>📌 <b style="color:var(--text1)">集流体</b>：正极铝箔16μm / 负极铜箔8μm</div>
</div>
</div>
</div>
</div>
</div>`;

  const moduleIdx = html.indexOf('id="bpModule"');
  if (moduleIdx === -1) { console.log('ERROR: bpModule not found'); process.exit(1); }
  // Find the comment before bpModule
  const commentIdx = html.lastIndexOf('<!-- ', moduleIdx);
  html = html.substring(0, commentIdx) + cellHtml + '\n' + html.substring(commentIdx);
  console.log('bpCell inserted before bpModule');
}

// Fix Module subtitle
html = html.replace('Cell设计与模块规格', '4模组并联 × 16串');

// Update bsPackSwitchTab tabs mapping
const oldTabs = "var tabs={overview:0,module:1,packlayout:2,electrical:3,bms:4,cooling:5,hvbox:6,bom:7};";
const newTabs = "var tabs={overview:0,cell:1,module:2,packlayout:3,electrical:4,bms:5,cooling:6,hvbox:7,bom:8};";
if (html.includes(oldTabs)) {
  html = html.replace(oldTabs, newTabs);
  console.log('Tabs mapping updated');
} else if (html.includes(newTabs)) {
  console.log('Tabs mapping already updated');
} else {
  console.log('WARNING: Could not find tabs mapping');
}

writeFileSync('E:\\project\\储能\\ess-platform\\index.html', html);
console.log('All changes applied');
