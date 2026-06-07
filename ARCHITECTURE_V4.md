# ESS-Agent V4 架构技术文档

## 1. 系统概述

ESS-Agent是一个储能系统电气原理图自动生成器，部署在Vercel上，单文件SPA架构（index.html ~9300行）。
核心目标：LLM只输出拓扑JSON，经语义引擎→拓扑修复→模板匹配→电气域→布局→布线→符号渲染，最终生成专业电气CAD级别（EPLAN/ETAP）的SVG图纸。

## 2. 整体架构（V4处理管线）

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户输入 (自然语言)                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LLM (仅做意图提取)                                                │
│  输出: Raw JSON { nodes: [{id,type,label,sub}], links: [{from,to}] }│
│  ★ LLM不做画图/排布/布线，只输出拓扑结构                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ESS_V3.process(rawData)  — 语义引擎 (唯一真相源)                   │
│                                                                     │
│  Step1: SemanticEngine — 同义词归一化 + 本体映射                    │
│    SYNONYMS[rawType] → stdType                                     │
│    ONTOLOGY[stdType] → {cls, chain, netDomain}                     │
│    PORT_MODEL[stdType] → [{id, side, voltage, domain, direction}]  │
│                                                                     │
│  Step2: TopologyValidator — 拓扑校验                               │
│    PCC唯一性 + 母线完整度 + 孤岛检测 + 12条CONNECTION_RULES双向阻断 │
│                                                                     │
│  Step3: TopologyRepairEngine — 拓扑修复                            │
│    对有repair字段的错误，自动补插中间节点(如battery↔ac_bus插入PCS)  │
│                                                                     │
│  Step4: TemplateMatcher — 模板匹配+纠偏                            │
│    3种行业模板评分 → 最佳匹配 → 补插缺失节点+边                    │
│                                                                     │
│  Step5: VoltageDomainEngine — 电气域引擎                            │
│    7域(AC_HV/AC_LV/DC/CONTROL/COMM/PROTECTION/NEUTRAL)            │
│    → 每条edge计算 {wireColor, wireDash, wireWidth}                 │
│                                                                     │
│  输出: {nodes, edges, warnings, errors, repairs, templateName}      │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  renderDiagramFromJSON_SVG()  — 渲染引擎                           │
│                                                                     │
│  Step6: LayoutEngine (dagre真实调用 / fallback手动分区)             │
│  Step7: ObstacleBuilder (设备框+文字区域, pad=30)                  │
│  Step8: PortRouter (电气方向约束 + 曼哈顿最短)                     │
│  Step9: A*Router (包围盒豁免 + 转弯惩罚+15)                       │
│  Step10: orthoRoute fallback (V-H-V + 通道避让12px间距)            │
│  Step11: CrosspointEngine (T字=实心圆点, 十字=半圆弧跳线)          │
│  Step12: IECSymbolRenderer (stdType→DIAGRAM_ICONS / iecImg)        │
│  Step13: LegendRenderer (从VOLTAGE_DOMAINS自动生成)                 │
│  Step14: WarningRenderer (错误/修复信息渲染到SVG)                  │
│                                                                     │
│  输出: SVG字符串 → innerHTML                                        │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. 核心数据结构

### 3.1 节点 (Node)

每个节点经过语义引擎处理后包含以下字段：

```javascript
{
  id: 'battery_1',           // 唯一标识
  type: '储能电池',          // 原始LLM输出类型(中文)
  label: '储能电池组',       // 显示标签
  sub: '100kWh',            // 副标签(参数)

  // === V3语义引擎增强字段 ===
  stdType: 'battery_rack',   // 标准化类型(唯一真相源)
  deviceClass: 'storage',    // 设备分类: source/conversion/storage/switchgear/bus/load/control
  networkDomain: ['DC_BUS'], // 电气域归属(可多个,如transformer跨AC_HV+AC_LV)
  finalSymbol: 'battery_rack',// 最终渲染符号(从chain中选取)
  iecSymbol: null,           // IEC SVG路径(如果有IEC_REGISTRY映射)

  // 端口模型
  ports: [{id:'dc', side:'top', voltage:750, domain:'dc', direction:'bidir'}],

  // 布局信息
  layoutLayer: 'storage',    // 布局层名称
  layoutYIdx: 4,             // 布局层Y索引
  layoutXPos: 'center',      // X位置策略: center/right
  dagreRank: 4,              // dagre层级

  // 运行时坐标(由LayoutEngine填充)
  x: 550, y: 420,
  _zone: {name:'变流/储能', ...},
  _cardW: 180,

  // 自动补插标记
  _autoInserted: true        // 由TopologyRepairEngine或TemplateMatcher插入
}
```

### 3.2 边 (Edge)

```javascript
{
  from: 'battery_1',         // 源节点ID
  to: 'ac_bus_1',            // 目标节点ID
  label: '',                 // 边标签

  // === V3语义引擎增强字段 ===
  sourcePort: 'dc',          // 源端口ID
  targetPort: 'ac',          // 目标端口ID

  // === VoltageDomainEngine字段 ===
  voltageDomain: 'POWER_DC', // 电气域
  wireColor: '#afa9ec',      // 走线颜色(硬编码,不依赖CSS变量)
  wireDash: '',              // 虚线样式: ''=实线, '4,3'=控制, '6,2'=保护
  wireWidth: 1.5,            // 线宽

  // 运行时
  _toType: 'ac_bus'          // 缓存的目标stdType(用于箭头选择)
}
```

## 4. 各引擎详细说明

### 4.1 SemanticEngine (Step1)

**位置**: `ESS_V3.process()` 内的 `rawNodes.map(...)` 逻辑

**处理流程**:
```
rawType = (n.type || n.name || '').toLowerCase()   // "储能电池"
stdType = SYNONYMS[rawType] || rawType              // "battery_rack"
onto = ONTOLOGY[stdType]                            // {cls:'storage', chain:[...], netDomain:['DC_BUS']}
ports = PORT_MODEL[stdType]                         // [{id:'dc', side:'top', voltage:750, ...}]
layerName = DEVICE_LAYER[stdType]                   // "storage"
layerCfg = LAYOUT_LAYERS[layerName]                 // {yIdx:4}
finalSymbol = chain中第一个在supportedSymbols中的    // "battery_rack"
iecSymbol = IEC_REGISTRY[finalSymbol] || null       // null(battery_rack无IEC映射)
```

**SYNONYMS词库** (35+词条):
| 中文别名 | 标准类型 |
|---------|---------|
| 电网/市电 | pcc |
| 并网柜/储能并网柜/高压开关柜/进线柜 | grid_cabinet |
| 储能电池/电池簇/电池柜 | battery_rack |
| 电池舱 | battery_container |
| 储能变流器/变流器/逆变器 | pcs |
| 变压器/主变/箱变 | transformer |
| 交流母线 | ac_bus |
| 直流母线 | dc_bus |
| 能量管理系统 | ems |
| bms/电池管理系统 | controller |
| 光伏阵列/光伏 | pv |
| 光伏逆变器 | pcs |
| 充电桩/充电机 | ev |
| 隔离开关/断路器/接触器 | breaker |
| 熔断器 | fuse |
| 电流互感器/互感器 | ct |
| 电压互感器 | pt |
| 防雷/避雷器 | surge |
| 接地 | earth |
| 继电保护/综保 | relay |
| 负荷/负载/消防/空调/ups | load |

**ONTOLOGY本体表** (16种设备):
| stdType | cls | chain | netDomain |
|---------|-----|-------|-----------|
| pcc | source | pcc→grid_source→generic_box | AC_HV |
| transformer | conversion | transformer→generic_box | AC_HV,AC_LV |
| pcs | conversion | pcs→generic_box | AC_LV,DC_BUS |
| battery | storage | battery→battery_rack→generic_cabinet→generic_box | DC_BUS |
| battery_rack | storage | battery_rack→generic_cabinet→generic_box | DC_BUS |
| battery_container | storage | battery_container→generic_cabinet→generic_box | DC_BUS |
| grid_cabinet | switchgear | grid_cabinet→generic_cabinet→generic_box | AC_HV |
| breaker | switchgear | breaker→generic_box | AC_HV,AC_LV |
| busbar | bus | busbar_ac→generic_box | AC_HV |
| ac_bus | bus | busbar_ac→generic_box | AC_LV |
| dc_bus | bus | busbar_dc→generic_box | DC_BUS |
| load | load | load→generic_box | AC_LV |
| pv | source | pv→generic_box | DC_BUS |
| ev | load | ev→generic_box | AC_LV |
| controller | control | ems_controller→generic_box | CONTROL |
| ems | control | ems_controller→generic_box | CONTROL |

**PORT_MODEL端口模型**:
| stdType | 端口 | side | voltage | domain | direction |
|---------|------|------|---------|--------|-----------|
| pcc | out | bottom | 10000 | ac | out |
| transformer | hv | top | 10000 | ac | in |
| transformer | lv | bottom | 400 | ac | out |
| pcs | ac | left | 400 | ac | in |
| pcs | dc | right | 750 | dc | out |
| battery | pos | top | 750 | dc | bidir |
| battery | neg | bottom | 0 | dc | bidir |
| battery_rack | dc | top | 750 | dc | bidir |
| ac_bus | line | center | 400 | ac | isBus |
| dc_bus | line | center | 750 | dc | isBus |
| controller | comm | right | 0 | comm | bidir |
| ems | comm | right | 0 | comm | bidir |

**端口兼容性判断** `isPortCompatible(sp, tp)`:
1. comm域端口与任何端口兼容（通信线可连任何设备）
2. domain必须相同（ac↔ac, dc↔dc）
3. 电压容差20%: `|sp.voltage - tp.voltage| <= max(sp, tp) * 0.2`

**finalSymbol解析** (符号链继承):
```
supportedSymbols = IEC_REGISTRY.keys() ∪ ['pcc','grid_source','pcs','battery_rack',
  'generic_cabinet','ems_controller','busbar_ac','busbar_dc','load','ev','pv','generic_box']

for sym in onto.chain:
    if sym in supportedSymbols:
        finalSymbol = sym
        break
```
例: battery的chain=[battery,battery_rack,generic_cabinet,generic_box]
→ battery不在supportedSymbols → battery_rack在 → finalSymbol='battery_rack'

### 4.2 TopologyValidator (Step2)

**位置**: `ESS_V3.validateTopology(edges, nodes)`

**校验规则**:

1. **PCC唯一性**: 必须有且仅有1个PCC/Source节点
2. **母线完整度**: 每条母线至少连接2个设备，否则warning
3. **孤岛检测**: degree=0的设备标记为warning
4. **CONNECTION_RULES双向阻断** (12条规则):

| from | to | repair | reason |
|------|----|--------|--------|
| battery | ac_bus | pcs | 储能电池不能直连交流母线 |
| battery | busbar | pcs | 储能电池不能直连交流母线 |
| battery_rack | ac_bus | pcs | 电池簇不能直连交流母线 |
| battery_rack | transformer | pcs | 电池簇不能直连变压器 |
| battery_container | ac_bus | pcs | 电池舱不能直连交流母线 |
| pv | battery | pcs | 光伏不能直连电池 |
| pv | ac_bus | pcs | 光伏不能直连交流母线 |
| battery | pcc | pcs | 储能电池不能直连电网 |
| battery | source | pcs | 储能电池不能直连电源 |
| dc_bus | ac_bus | pcs | DC母线不能直连AC母线 |
| controller | busbar | — | 控制器不能直连功率母线 |
| ems | busbar | — | EMS不能直连功率母线 |

**双向匹配**: `(sType===r.from && tType===r.to) || (sType===r.to && tType===r.from)`
→ battery↔ac_bus 和 ac_bus↔battery 都会被阻断

### 4.3 TopologyRepairEngine (Step3)

**位置**: `ESS_V3.repairTopology(edges, nodes, errors)`

**修复逻辑**:
```
对于每个error:
  if error.repair存在:
    1. 创建中间节点: id = repairType + '_' + fromId + '_' + toId
       例: pcs_battery1_acbus1
    2. 设置节点属性:
       - type/stdType = repairType (如'pcs')
       - label = 'PCS', sub = '自动补插'
       - networkDomain = ['AC_LV','DC_BUS'] (PCS跨AC和DC)
       - _autoInserted = true
    3. 删除原边: battery1 → acbus1
    4. 插入两条新边: battery1 → pcs_battery1_acbus1 → acbus1
    5. 记录修复: {inserted:'pcs', between:'battery1↔acbus1', reason:'...'}
```

**修复示例**:
```
修复前: Battery ──[非法]──→ AC Bus
修复后: Battery ──→ PCS(自动补插) ──→ AC Bus
```

### 4.4 TemplateMatcher (Step4)

**位置**: `ESS_V3.matchTemplate(nodes, edges)` + `applyTemplateCorrection(nodes, edges, template)`

**3种行业模板**:

#### ESS_SLD (储能系统一次接线图)
- 必需节点: pcc, transformer, ac_bus, pcs, dc_bus, battery
- 可选节点: breaker, meter, grid_cabinet, battery_rack, controller, ems
- 必需边: pcc→transformer, transformer→ac_bus, ac_bus→pcs, pcs→dc_bus, dc_bus→battery
- 布局层: grid→hv_distribution→conversion→storage→control

#### MICROGRID (微网系统架构图)
- 必需节点: pcc, transformer, ac_bus, pcs, dc_bus, battery, pv
- 可选节点: breaker, meter, load, controller, ems
- 必需边: (同ESS_SLD) + dc_bus→pv
- 布局层: grid→conversion→lv_distribution→storage→control

#### EV_STATION (充电站配电图)
- 必需节点: pcc, transformer, ac_bus, ev
- 可选节点: breaker, meter, load, pcs, battery
- 必需边: pcc→transformer, transformer→ac_bus, ac_bus→ev
- 布局层: grid→hv_distribution→lv_distribution→load

**评分算法**:
```
对于每个模板:
  必需节点存在: +2, 缺失: -3
  可选节点存在: +1
  必需边存在: +2, 缺失: -1
→ 选得分最高的模板
```

**纠偏逻辑**:
1. 补插缺失的必需节点（标记_autoInserted=true, sub='模板补插'）
2. 补插缺失的必需边

### 4.5 VoltageDomainEngine (Step5)

**位置**: `ESS_V3.resolveVoltageDomain(srcNode, tgtNode)` + VOLTAGE_DOMAINS表

**7个电气域**:

| 域 | 颜色 | 线型 | 线宽 | 含义 |
|----|------|------|------|------|
| POWER_AC_HV | #4a9ee8(蓝) | 实线 | 2 | AC高压(10kV+) |
| POWER_AC_LV | #4a90d9(浅蓝) | 实线 | 1.5 | AC低压(0.4kV) |
| POWER_DC | #afa9ec(紫) | 实线 | 1.5 | DC回路(750V) |
| CONTROL | #d4a030(棕) | 长虚线4,3 | 1 | 控制信号 |
| COMMUNICATION | #d4a030(棕) | 短虚线2,2 | 1 | 通信线 |
| PROTECTION | #e06070(红) | 点划线6,2 | 1 | 保护回路 |
| NEUTRAL | #50c878(绿) | 实线 | 1.5 | 中性/接地 |

**域解析优先级** (从高到低):
```
1. CONTROL (任一端属于CONTROL域)
2. COMMUNICATION (任一端属于COMM域)
3. POWER_AC_HV (任一端属于AC_HV域)
4. POWER_AC_LV (任一端属于AC_LV域)
5. POWER_DC (任一端属于DC_BUS域)
6. 默认: POWER_AC_LV
```

**渲染层消费**:
```javascript
// renderDiagramFromJSON_SVG中:
if (l.wireColor) {
  color = l.wireColor;        // 来自VoltageDomainEngine
  dashAttr = l.wireDash ? ' stroke-dasharray="' + l.wireDash + '"' : '';
  sw = l.wireWidth || 1.5;
}
```

## 5. 渲染引擎详细说明

### 5.1 LayoutEngine (Step6)

**位置**: `dagreLayout(nodes, links, svgW, svgH)`

**dagre真实调用流程**:
1. 检查`typeof dagre !== 'undefined'`，未加载则fallback
2. 创建`new dagre.graphlib.Graph()`
3. 设置图属性: `{width:1100, height:800, rankdir:'TB', nodesep:50, ranksep:80}`
4. 添加节点: `g.setNode(id, {width:dim.w+20, height:dim.h+20})`
5. 添加边: `g.setEdge(from, to, {weight:1})`
6. **同层弱边约束**: 同rank的相邻节点间添加`{weight:0, minLen:0}`的边，确保同层排列
7. 调用`dagre.layout(g)`
8. 读取坐标: `n.x = Math.round(dn.x); n.y = Math.round(dn.y)`

**Fallback手动分区布局** (dagre不可用时):
```
5个Zone按Y分层:
  电源侧:      y=55,  h=100  types=[source,meter,pcc]
  配电母线:    y=165, h=55   types=[busbar,ac_bus,dc_bus]
  开关/变压:   y=230, h=130  types=[breaker,switch,transformer,grid_cabinet]
  变流/储能:   y=370, h=130  types=[pcs,battery,battery_rack,battery_container,pv,ev]
  负荷/控制:   y=510, h=130  types=[load,controller,ems]
```

**类型解析**: `resolveType(n) = n.stdType || TYPE_ALIAS[n.type] || n.type`
→ V3的stdType优先，TYPE_ALIAS作为fallback

### 5.2 ObstacleBuilder (Step7)

为每个节点生成障碍物矩形:
```javascript
obstacles = nodes.map(n => ({
  x: n.x - dim.w/2,
  y: n.y - dim.h/2,
  w: dim.w,
  h: dim.h,
  pad: 30,          // 安全间距
  nodeId: n.id      // 用于包围盒豁免
}));
```

**文字障碍物**: label和sub文本区域也加入obstacles:
```javascript
// label: {x:n.x-textW/2, y:n.y-8, w:textW, h:16, pad:5}
// sub:   {x:n.x-subW/2,  y:n.y+8, w:subW,  h:12, pad:3}
```

### 5.3 PortRouter (Step8)

**位置**: `getBestPorts(fromNode, toNode, fromDim, toDim)`

**电气方向约束表** `DIR_CONSTRAINTS`:
| 设备类型 | 允许出线方向 | 电气含义 |
|---------|-------------|---------|
| busbar/ac_bus/dc_bus | bottom | 母线只从底部出线 |
| battery/battery_rack/battery_container | top, bottom | 电池上下出线 |
| controller/ems | right | 控制器只从右侧出通信线 |
| pcs | left, right | PCS左侧AC进、右侧DC出 |
| pv | bottom | 光伏从底部出线 |
| ev/load | top | 负荷从顶部进线 |
| breaker/switch/transformer/grid_cabinet | top, bottom | 开关设备上下出线 |
| pcc/meter/source | bottom | 电源从底部出线 |

**选端口算法**:
1. 枚举4种port组合: bottom→top, top→bottom, right→left, left→right
2. 过滤: fromEdge必须在fromAllowed中, toEdge必须在toAllowed中
3. 选曼哈顿距离最短的: `d = |fromX-toX| + |fromY-toY|`
4. 无合规组合时fallback到bottom→top

### 5.4 A*Router (Step9)

**位置**: `astarRoute(fromX, fromY, toX, toY, obstacles, gridW, gridH, cellSize=10)`

**关键参数**:
- cellSize=10 (网格精度10px)
- TURN_PENALTY=15 (转弯额外代价)
- maxIter=cols*rows*3 (最大迭代次数)

**包围盒豁免** `unblockBBox(px, py)`:
```
对于起终点(px,py):
  遍历所有obstacles:
    if (px,py)在obstacle的(pad扩展)包围盒内:
      删除该obstacle覆盖的所有blocked格子
→ 确保A*能从设备边框出发，不会因自身障碍物被困
```

**A*搜索**:
- 启发函数: `h(x,y) = |x-ex| + |y-ey|` (曼哈顿距离)
- 方向: 上下左右4方向
- 转弯检测: `prevDir !== null && d.dir !== prevDir → ng += TURN_PENALTY`
- 路径回溯: parent链 → 坐标乘以cellSize

**Fallback**: A*失败时返回直连两点

### 5.5 orthoRoute (Step10)

**位置**: `orthoRoute(from, to, ...)` — V-H-V正交布线fallback

**通道避让** (12px间距):
```javascript
CHANNEL_SPACING = 12;
// 查找已有通道中与midY间距<12的:
for (key of channels) {
  if (Math.abs(parseFloat(key) - midY) < CHANNEL_SPACING) {
    chKey = key;  // 复用该通道
    break;
  }
}
// 同通道内X重叠的边: chOffset += 8 (错位8px)
```

**水平通道避让**: 检测midY是否穿过obstacle框体，步长10px搜索空闲通道

### 5.6 CrosspointEngine (Step11)

**位置**: `detectCrosspoints(allLinks)`

**路径标准化**: 将A*路径点序列转为线段序列 `{x1,y1,x2,y2}`

**交叉检测**:
- 精确H-V交叉: 水平段与垂直段的交点
- T字连接 → 实心圆点 `<circle r="3" fill="..."/>`
- 十字交叉 → 半圆弧跳线 `<path d="M... A5,5 0 0,sweep ..."/>`

**智能跳线方向**: 根据交叉点附近路径走向决定弧线方向(up/down/left/right)

### 5.7 IECSymbolRenderer (Step12)

**位置**: `renderDiagramFromJSON_SVG` 中节点渲染循环

**渲染决策逻辑**:
```javascript
const resolvedType = resolveType(n);  // n.stdType优先
let iconFn = DIAGRAM_ICONS[resolvedType] || DIAGRAM_ICONS.cabinet || DIAGRAM_ICONS.source;

// 如果V3算出了iecSymbol路径，优先用IEC符号:
if (n.iecSymbol && typeof iecImg === 'function') {
  iconFn = (x,y,label,sub) => iecImg(x, y, n.iecSymbol, label, sub);
}
```

**IEC符号渲染** `iecImg(type, x, y, w, h, label)`:
```svg
<rect x="{x-w/2-6}" y="{y-h/2-6}" width="{w+12}" height="{h+12}" rx="4"
      fill="var(--icon-bg)" stroke="var(--icon-border)" stroke-width="1"/>
<image href="{IEC_SYM[type]}" x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}"/>
<text ...>{label}</text>
```

**DIAGRAM_ICONS渲染函数表** (28种):

| 类型 | 渲染方式 | 尺寸(w×h) |
|------|---------|-----------|
| source/pcc | 渐变矩形框+文字 | 220×44 |
| pcs | 渐变矩形框(紫色)+文字 | 180×44 |
| battery | iecImg('battery')+IEC符号 | 50×36 |
| battery_rack | 绿色矩形框+DC标记 | 180×44 |
| battery_container | 双层矩形框(虚线内框)+DC标记 | 180×44 |
| transformer/breaker/fuse/ct/pt | iecImg() IEC符号 | 各异 |
| controller/ems | 虚线矩形框+文字 | 130×120 |
| busbar/ac_bus | 蓝色粗线段 | 340×8 |
| dc_bus | 绿色粗线段 | 180×8 |
| grid_cabinet | 橙色矩形框+文字 | 180×44 |
| pv | 橙色半透明框+文字 | 180×44 |
| ev | 绿色半透明框+文字 | 180×44 |
| load | 灰色渐变框+文字 | 180×44 |

### 5.8 LegendRenderer (Step13)

**位置**: SVG右下角

从`ESS_V3.VOLTAGE_DOMAINS`自动生成图例:
```
┌──────────────┐
│ 图例          │
│ ━━ AC高压    │
│ ━━ AC低压    │
│ ━━ DC        │
│ ┅┅ 控制      │
│ ┄┄ 通信      │
│ ┊┊ 保护      │
│ ━━ 中性      │
└──────────────┘
```

### 5.9 WarningRenderer (Step14)

SVG底部渲染3种信息条:
- **红色**: 拓扑错误(未修复) — `v3Result.errors`
- **绿色**: 拓扑修复 — `v3Result.repairs` (如"插入PCS于battery1↔acbus1")
- **黄色**: 拓扑警告 — `v3Result.warnings` (如"孤岛设备:xxx")

## 6. IEC 60617元器件符号库

### 6.1 符号库结构

```
iec_symbols_svg/                    # 373个IEC 60617 SVG文件
├── iec_0041_Earth,...svg           # 接地符号
├── iec_0052_Circuit_breaker...svg  # 断路器
├── iec_0083_Disconnector...svg     # 隔离开关
├── iec_0105_Fuse...svg             # 熔断器
├── iec_0264_Transformer...svg      # 变压器
├── iec_0273_Current_transformer...svg  # 电流互感器
├── iec_0301_Voltage_transformer...svg  # 电压互感器
├── iec_0353_Battery...svg          # 电池
└── ... (共373个)
```

### 6.2 IEC_REGISTRY (8种有IEC SVG映射的符号)

| 键 | SVG文件路径 |
|----|-----------|
| transformer | iec_symbols_svg/iec_0264_Transformer_with_two_windings,_general_symbol_(form_1).svg |
| breaker | iec_symbols_svg/iec_0052_Circuit_breaker_function.svg |
| disconnector | iec_symbols_svg/iec_0083_Disconnector,_Isolator.svg |
| fuse | iec_symbols_svg/iec_0105_Fuse,_general_symbol.svg |
| battery | iec_symbols_svg/iec_0353_Battery_of_primary_or_secondary_cells.svg |
| ct | iec_symbols_svg/iec_0273_Current_transformer,_general_symbol_(form_1).svg |
| pt | iec_symbols_svg/iec_0301_Voltage_transformer_Measuring_transformer_(form_1).svg |
| earth | iec_symbols_svg/iec_0041_Earth,..._Ground_(US),...svg |

### 6.3 IEC_SYM (21种内联base64符号)

用于`iecImg()`函数的IEC符号，以base64 data URI内嵌在`IEC_SYM`常量中:
transformer, breaker, disconnector, fuse, battery, ct, pt, earth, relay, contactor, surge, diode, resistor, capacitor, inductor, motor, lamp, terminal, contact, plug_socket, meter

### 6.4 符号解析优先级

```
1. n.iecSymbol存在 → iecImg(x, y, n.iecSymbol, label, sub)
   (V3语义引擎从ONTOLOGY.chain + IEC_REGISTRY算出)

2. DIAGRAM_ICONS[resolvedType]存在 → 调用对应渲染函数
   (resolvedType = n.stdType || TYPE_ALIAS[n.type] || n.type)

3. DIAGRAM_ICONS.cabinet → 通用柜体渲染
   (最终fallback)
```

### 6.5 符号链继承示例

```
battery的ONTOLOGY.chain = ['battery','battery_rack','generic_cabinet','generic_box']

supportedSymbols = IEC_REGISTRY.keys() ∪ ['pcc','grid_source','pcs','battery_rack',
  'generic_cabinet','ems_controller','busbar_ac','busbar_dc','load','ev','pv','generic_box']

遍历chain:
  'battery'         → 不在supportedSymbols(IEC_REGISTRY有battery但supportedSymbols不含) → 跳过
  'battery_rack'    → 在supportedSymbols → finalSymbol='battery_rack' → 停止

iecSymbol = IEC_REGISTRY['battery_rack'] → undefined → null
→ 最终用DIAGRAM_ICONS['battery_rack']渲染(绿色矩形框+DC标记)
```

注: IEC_REGISTRY有'battery'键但supportedSymbols列表中不含'battery'，
所以battery类型会跳过IEC符号、用DIAGRAM_ICONS['battery']渲染(iecImg内联base64)。

## 7. 完整调用关系图

```
用户输入自然语言
    │
    ▼
LLM (外部API调用)
    │ 输出: {nodes: [{id,type,label,sub}], links: [{from,to}]}
    ▼
renderDiagramFromJSON_SVG(containerId, diagramData, title)
    │
    ├─→ ESS_V3.process(diagramData)  ← 唯一真相源
    │     │
    │     ├─→ Step1: SemanticEngine
    │     │     SYNONYMS → stdType
    │     │     ONTOLOGY → {cls, chain, netDomain}
    │     │     PORT_MODEL → ports
    │     │     DEVICE_LAYER → layoutLayer
    │     │     chain → finalSymbol
    │     │     IEC_REGISTRY → iecSymbol
    │     │
    │     ├─→ PortCompatibility
    │     │     isPortCompatible(sp, tp) → sourcePort, targetPort
    │     │
    │     ├─→ Step2: TopologyValidator
    │     │     validateTopology(edges, nodes)
    │     │     → PCC唯一性 + 母线完整度 + 孤岛检测 + CONNECTION_RULES双向阻断
    │     │     → {errors[], warnings[]}
    │     │
    │     ├─→ Step3: TopologyRepairEngine
    │     │     repairTopology(edges, nodes, errors)
    │     │     → 对有repair字段的error自动补插中间节点
    │     │     → {newNodes[], newEdges[], repairs[]}
    │     │
    │     ├─→ Step4: TemplateMatcher
    │     │     matchTemplate(nodes, edges) → 最佳模板
    │     │     applyTemplateCorrection(nodes, edges, template)
    │     │     → 补插缺失节点+边
    │     │     → {corrections[]}
    │     │
    │     └─→ Step5: VoltageDomainEngine
    │           resolveVoltageDomain(src, tgt) → 域名
    │           VOLTAGE_DOMAINS[域名] → {wireColor, wireDash, wireWidth}
    │
    │   返回: {nodes, edges, warnings, errors, repairs, templateName, templateCorrections}
    │
    ├─→ Step6: dagreLayout(nodes, links, svgW, svgH)
    │     dagre.graphlib.Graph() → dagre.layout(g) → 坐标
    │     失败时 → fallback手动分区布局
    │
    ├─→ Step7: ObstacleBuilder
    │     nodes → obstacles[] (设备框+文字区域, pad=30)
    │
    ├─→ Step8-9: 逐条edge布线
    │     │
    │     ├─→ getBestPorts(from, to, fromD, toD)
    │     │     DIR_CONSTRAINTS → 过滤合规port → 选曼哈顿最短
    │     │
    │     ├─→ astarRoute(fromX, fromY, toX, toY, obstacles, ...)
    │     │     unblockBBox() → A*搜索 → pathPoints[]
    │     │     失败时 → orthoRoute() V-H-V fallback
    │     │
    │     ├─→ pathToSvgD(pathPoints) → SVG path d属性
    │     │
    │     └─→ SVG <path> 渲染 (wireColor/wireDash/wireWidth来自VoltageDomainEngine)
    │
    ├─→ Step11: detectCrosspoints(allLinks)
    │     → T字=实心圆点, 十字=半圆弧跳线
    │
    ├─→ Step12: 节点渲染
    │     resolveType(n) → DIAGRAM_ICONS[resolvedType] / iecImg(n.iecSymbol)
    │
    ├─→ Step13: LegendRenderer (从VOLTAGE_DOMAINS自动生成)
    │
    └─→ Step14: WarningRenderer (errors/warnings/repairs → SVG信息条)
```

## 8. TYPE_ALIAS映射表 (fallback，仅当stdType不存在时使用)

| 原始type | 映射到 |
|---------|--------|
| grid | source |
| bus | busbar |
| inverter | pcs |
| bess | battery |
| ems | controller |
| solar | pv |
| charger | ev |
| grid_cabinet | grid_cabinet (自身) |
| cabinet | cabinet |
| battery_rack | battery_rack |
| battery_container | battery_container |
| ac_bus | ac_bus |
| dc_bus | dc_bus |
| pcc | pcc |

## 9. NODE_DIM尺寸表

| 类型 | 宽×高 | 说明 |
|------|-------|------|
| source/pcc | 220×44 | 电源大框 |
| meter | 60×60 | 电表方形 |
| busbar | 340×8 | 高压母线粗线 |
| ac_bus | 340×8 | 低压AC母线 |
| dc_bus | 180×8 | DC母线 |
| transformer | 44×50 | 变压器IEC符号 |
| breaker | 28×36 | 断路器IEC符号 |
| switch | 28×36 | 隔离开关IEC符号 |
| pcs | 180×44 | PCS框 |
| battery | 50×36 | 电池IEC符号 |
| battery_rack | 180×44 | 电池簇框 |
| battery_container | 180×44 | 电池舱框 |
| controller/ems | 130×120 | 控制器大框 |
| load/pv/ev | 180×44 | 负荷框 |
| grid_cabinet | 180×44 | 并网柜框 |
| cabinet | 180×44 | 通用柜体 |
| fuse | 24×30 | 熔断器 |
| ct | 30×40 | 电流互感器 |
| pt | 30×40 | 电压互感器 |

## 10. 已知限制与待改进

1. **IEC符号库不足**: PCS/BMS/EMS/STS等储能核心设备无专用IEC符号，fallback到generic_box或DIAGRAM_ICONS自定义渲染
2. **SYNONYMS仍不够**: 实际工程中出现的英文别名(BESS/Battery Container等)未覆盖
3. **电压写死**: PORT_MODEL中voltage为固定值(10000/400/750)，不支持35kV/1500V等非标项目
4. **TemplateMatcher评分简单**: 仅基于节点/边存在性加权，未考虑拓扑相似度
5. **TopologyRepairEngine只补插单层**: battery→ac_bus只插1个PCS，不会生成完整链路(battery→PCS→dc_bus→PCS→ac_bus)
6. **A*性能**: 大规模图(>50节点)时A*可能超时，需考虑分层路由
7. **renderWiringDiagramFromJSON代码重复**: 接线图渲染器与renderDiagramFromJSON_SVG有大量重复逻辑

## 11. 文件结构

```
ess-platform/
├── index.html                    # 主入口(~9300行)，所有逻辑
│   ├── ESS_V3 (行4456)          # V4语义引擎(9子模块)
│   ├── IEC_SYM (行4016)         # 21种内联base64 IEC符号
│   ├── iecImg() (行4039)        # IEC符号渲染函数
│   ├── DIAGRAM_ICONS (行4045)   # 28种渲染函数
│   ├── TYPE_ALIAS (行4084)      # fallback类型映射
│   ├── NODE_DIM (行4097)        # 尺寸表
│   ├── resolveType()            # 类型解析(n.stdType优先)
│   ├── getBestPorts() (行4781)  # 端口路由(电气方向约束)
│   ├── dagreLayout() (行4805)   # dagre真实调用
│   ├── astarRoute() (行4854)    # A*寻路(包围盒豁免)
│   ├── pathToSvgD() (行4906)    # 路径→SVG path
│   ├── orthoRoute() (行4184)    # V-H-V fallback(12px通道间距)
│   ├── detectCrosspoints() (行4259) # 交叉检测+跳线
│   ├── renderDiagramFromJSON_SVG() (行4910) # 主渲染入口
│   └── THEME_PALETTE (行4370)   # 暗/亮主题变量
├── lib/
│   ├── dagre.min.js (284KB)     # dagre布局库(本地化)
│   └── graphlib.min.js (173KB)  # graphlib图结构库
├── iec_symbols_svg/             # 373个IEC 60617 SVG符号文件
├── dist/index.html              # Vercel部署文件(与index.html同步)
└── vercel.json                  # Vercel配置
```