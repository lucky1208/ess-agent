# ARCHITECTURE V5 — V4→V5 完整对比

## 1. 版本概览

| 维度 | V4.0 | V5 (当前) |
|------|------|-----------|
| 代码行数 | 7,460 | 16,298 |
| 核心架构 | 单层渲染 (LLM→SVG) | 三层分离 (LLM→语义引擎→布局引擎→渲染) |
| 布局算法 | autoLayoutNodes (简单y分层) | dagre图布局 + A*正交布线 |
| 语义引擎 | 无 | ESS_V3 (9子模块) |
| 符号系统 | DIAGRAM_ICONS (28种文字框) | DIAGRAM_ICONS + IEC_SYM(21种base64) + IEC_REGISTRY(8种) + 373个SVG文件 |
| 电压域 | 无 | 7域 (AC_HV/AC_LV/DC/CONTROL/COMM/PROTECTION/NEUTRAL) |
| 拓扑校验 | 无 | validateTopology + repairTopology + matchTemplate |
| 走线避障 | 无 | A* domain-aware routing (跨域惩罚+5000) |
| 主题适配 | 硬编码深色 | CSS变量 + 暗亮主题切换 |

---

## 2. 架构对比：调用关系

### V4.0 调用链

```
generateSolution()
  → callLLM(messages)                    // LLM直接输出
  → parseJSON(response)
  → renderLLMResult(R)
      → renderArchDiagramFromJSON(R.archDiagram)
          → renderDiagramFromJSON('archSvg', d, title)
              → autoLayoutNodes(nodes, svgW, svgH)   // 简单y分层
              → nodes.forEach:                        // 直接渲染
                  resolvedType = TYPE_ALIAS[n.type] || n.type
                  iconFn = DIAGRAM_ICONS[resolvedType]
                  svg += iconFn(n.x, n.y, n.label)
              → links.forEach:                        // 直线连接
                  svg += <line from→to>
      → renderWiringDiagramFromJSON(R.wiringDiagram)  // 独立硬编码渲染器
      → renderTopoDiagramFromJSON(R.wiringDiagram2)   // 复用renderDiagramFromJSON
```

**V4.0 特征**：
- LLM输出 → 直接渲染，无中间语义层
- TYPE_ALIAS做类型映射（双真相模型根源）
- autoLayoutNodes只按type分层，无图布局算法
- 连线是直线，无避障
- 接线图是独立硬编码SVG模板

### V5 调用链

```
generateSolution()
  → callLLM(messages)                    // LLM只输出拓扑JSON
  → parseJSON(response)
  → renderLLMResult(R)
      → renderArchDiagramFromJSON(R.archDiagram)
          → ESS_V3.process(archDiagram)              // ★ 语义引擎主管线
              ├─ SYNONYMS匹配 (精确+模糊)            //   A0: 词义归一化
              ├─ ONTOLOGY查表                        //   A0: 设备本体
              ├─ PORT_MODEL端口分配                   //   A0: 端口模型
              ├─ classifyVoltage/resolveNodeVoltage   //   A1: 电压分类V2
              ├─ validateTopology(edges,nodes)        //   A2: 拓扑校验
              ├─ repairTopology(edges,nodes,errors)   //   A2: 拓扑修复
              │   ├─ missing_pcc → 自动补插PCC节点    //   V5新增
              │   ├─ REPAIR_CHAINS → 链式补插         //   V4.1引入
              │   └─ 单点修复 fallback
              ├─ remainingErrors过滤                  //   V5: 兼容missing_pcc
              ├─ matchTemplate(nodes,edges)           //   A2: 模板匹配
              │   └─ Jaccard(节点40%+边40%+主链20%)
              ├─ applyTemplateCorrection()            //   A2: 模板纠偏 (阈值>15)
              ├─ resolveVoltageDomain()               //   A3: 电压域解析
              ├─ upgradeBuses()                       //   A3: 母线升级V2
              └─ buildLayoutContract()                //   A3: 布局约束协议
          → renderDiagramFromJSON_SVG('archSvg', processed, title)
              ├─ dagreLayout(nodes, links, svgW, svgH)  // ★ dagre图布局
              │   ├─ rank = n.layoutYIdx (ESS_V3唯一来源)
              │   ├─ minLen = |toRank-fromRank|
              │   └─ nodesep=120, ranksep=180
              ├─ getBestPorts(from, to)               // ★ 电气方向约束
              │   └─ DIR_CONSTRAINTS表
              ├─ links.forEach:
              │   ├─ astarRoute(from, to, obstacles)  // ★ A*正交布线
              │   │   ├─ domain-aware (跨域+5000惩罚)
              │   │   ├─ unblockBBox (只豁免最近障碍)
              │   │   └─ TURN_PENALTY=15
              │   └─ orthoRoute fallback (V-H-V, 12px通道间距)
              ├─ detectCrosspoints()                  // ★ 交叉检测+跳线
              ├─ nodes.forEach:                       // ★ 节点渲染
              │   ├─ type = n.stdType (不用TYPE_ALIAS)
              │   ├─ symbol = n.finalSymbol
              │   ├─ IEC符号: iecImg(n.iecSymbol,...)
              │   ├─ 母线: busWidthMap动态宽度
              │   │   └─ isDC = type==='dc_bus' (V5修复: 原为resolvedType)
              │   ├─ _autoInserted: 虚线框+AUTO标识
              │   └─ 工程属性: tag/deviceNo/rating/manufacturer/model
              └─ LegendRenderer (从VOLTAGE_DOMAINS自动生成)
      → renderWiringDiagramFromJSON(R.wiringDiagram)
          ├─ 优先V4管线: renderDiagramFromJSON_SVG('mgWiringSvg', d)
          └─ fallback: 硬编码专用渲染器
      → mgRenderAllDrawings()                         // 微网模式渲染调度
```

---

## 3. 逐模块代码级对比

### 3.1 类型解析 (最关键差异)

**V4.0** — 双真相模型：
```js
// index.html ~行7800
const TYPE_ALIAS = {grid:'source', bus:'busbar', inverter:'pcs', bess:'battery', ems:'controller', solar:'pv', charger:'ev'};
// 渲染时:
const resolvedType = TYPE_ALIAS[n.type] || n.type;  // 渲染层二次解释
const iconFn = DIAGRAM_ICONS[resolvedType];
```

**V5** — 单真相源：
```js
// TYPE_ALIAS 已删除 (死代码清除)
// ESS_V3.process()中:
let stdType = this.SYNONYMS[rawType] || null;       // A0: 语义引擎统一解析
if(!stdType){                                        // 模糊匹配
  const sortedKeys = Object.keys(this.SYNONYMS).sort((a,b)=>b.length-a.length);
  for(const key of sortedKeys){
    if(searchStr.includes(key)){stdType=this.SYNONYMS[key];break;}
  }
}
// 渲染时:
const type = n.stdType || n.type;                    // 只消费不解释
const symbol = n.finalSymbol || type;
let iconFn = DIAGRAM_ICONS[symbol] || DIAGRAM_ICONS[type];
```

**差异本质**：V4.0渲染层用TYPE_ALIAS重新解释类型→两套映射冲突→符号/尺寸/端口不一致。V5渲染层只读stdType/finalSymbol→单一真相源。

---

### 3.2 布局算法

**V4.0** — autoLayoutNodes：
```js
function autoLayoutNodes(nodes, svgW, svgH) {
  const layerOrder = ['source','meter','busbar','transformer','breaker','switch',
                       'pcs','dcBus','battery','battery_rack','load','pv','ev','controller'];
  nodes.forEach(n => {
    const lt = TYPE_ALIAS[n.type] || n.type;
    const li = getLayerIndex(lt, layerOrder);
    n.x = svgW/2;                    // 全部居中！
    n.y = 80 + li * 80;              // 等间距80px
  });
}
```
- 所有节点x居中，y等间距80px
- 无图布局，无避障，节点严重重叠

**V5** — dagreLayout：
```js
function dagreLayout(nodes, links, svgW, svgH) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({rankdir:'TB', nodesep:120, ranksep:180, marginx:60, marginy:60});
  nodes.forEach(n => {
    const rank = n.layoutYIdx !== undefined ? n.layoutYIdx : 3;  // ESS_V3决定层级
    nodeRankMap[n.id] = rank;
    g.setNode(n.id, {width:dynamicW, height:dynamicH});
  });
  links.forEach(l => {
    const minLen = Math.abs(toRank - fromRank);  // 强制层级间距
    g.setEdge(l.from, l.to, {minLen});
  });
  dagre.layout(g);
  // dagre结果写回nodes
}
```
- dagre真实图布局，考虑边约束
- rank由ESS_V3的layoutYIdx唯一决定（不重排）
- minLen强制层级间距
- nodesep=120, ranksep=180 (V5从V4.1的100/140增大)

---

### 3.3 走线算法

**V4.0** — 直线连接：
```js
links.forEach(l => {
  svg += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${color}"/>`;
});
```
- 纯直线，穿越节点，无避障

**V5** — A* domain-aware正交布线：
```js
// astarRoute核心参数:
const CROSS_DOMAIN_PENALTY = 5000;    // 跨域惩罚
const TURN_PENALTY = 15;              // 转弯惩罚
const cellSize = 10;                  // 栅格精度10px

// unblockBBox: 只豁免最近的node_box障碍
const unblockBBox = (px,py) => {
  let closest=null, closestDist=Infinity;
  for(const o of obstacles){
    if(o.type!=='node_box') continue;
    // 找最近的1个
    const dist = Math.hypot(px-cx, py-cy);
    if(dist<closestDist){closestDist=dist;closest=o;}
  }
  // 只unblock这1个
};

// 通道避让: Math.abs(candidate-existing)<12px
// 交叉检测: detectCrosspoints() → 非连接画半圆弧跳线, 连接画实心圆点
```

---

### 3.4 语义引擎 ESS_V3 (V5新增，V4.0无)

```js
const ESS_V3 = {
  // A0: 词义归一化
  SYNONYMS: {'电网':'pcc','国网':'pcc','PG&E':'pcc','储能变流器':'pcs',...},  // 50+词条

  // A0: 设备本体
  ONTOLOGY: {
    pcc:     {cls:'source',     chain:['pcc','grid_source'],    netDomain:['AC_HV']},
    pcs:     {cls:'conversion',  chain:['pcs'],                  netDomain:['AC_LV','DC_BUS']},
    battery: {cls:'storage',     chain:['battery'],              netDomain:['DC_BUS']},
    // ...16种
  },

  // A0: 端口模型
  PORT_MODEL: {
    pcc:        [{id:'out',side:'bottom',voltage:10000,domain:'ac',direction:'out'}],
    pcs:        [{id:'ac',side:'left',voltage:400,domain:'ac',direction:'in'},
                 {id:'dc',side:'right',voltage:750,domain:'dc',direction:'out'}],
    // ...16种, 支持params.voltage动态覆盖
  },

  // A2: 拓扑校验规则 (12条双向阻断)
  CONNECTION_RULES: [
    {from:'battery',to:'ac_bus',action:'reject',repair:'pcs',reason:'储能电池不能直连交流母线'},
    {from:'dc_bus',to:'ac_bus',action:'reject',repair:'pcs',reason:'DC母线不能直连AC母线'},
    // ...12条
  ],

  // A2: 修复链
  REPAIR_CHAINS: {
    'battery→ac_bus':   {via:['pcs']},
    'battery→busbar':   {via:['pcs','ac_bus']},
    'pv→ac_bus':        {via:['pv_inverter']},
    // ...
  },

  // A2: 行业模板
  TEMPLATES: {
    ESS_SLD:     {requiredTypes:['pcc','transformer','ac_bus','pcs','dc_bus','battery'],...},
    MICROGRID:   {requiredTypes:['pcc','transformer','ac_bus','pcs','dc_bus','battery','pv'],...},
    EV_STATION:  {requiredTypes:['pcc','transformer','ac_bus','ev'],...},
    CONTROL_DIAGRAM: {...},
    COMM_DIAGRAM: {...},
  },

  // A3: 电压域 (V5颜色区分度提升)
  VOLTAGE_DOMAINS: {
    POWER_AC_HV:      {color:'#3b8beb',dash:'',width:2.5,label:'AC高压'},    // 蓝
    POWER_AC_LV:      {color:'#e8a838',dash:'',width:2,  label:'AC低压'},    // 橙 (V4: #4a90d9与HV同色)
    POWER_DC:         {color:'#50c878',dash:'',width:2,  label:'DC'},        // 绿 (V4: #afa9ec紫太接近)
    CONTROL:          {color:'#d4a030',dash:'4,3',width:1,label:'控制'},
    COMMUNICATION:    {color:'#a070d0',dash:'2,2',width:1,label:'通信'},
    PROTECTION:       {color:'#e06070',dash:'6,2',width:1,label:'保护'},
    NEUTRAL:          {color:'#70b0d0',dash:'',width:1.5,label:'中性'},
  },

  // A1: 电压分类V2
  classifyVoltage(voltage, unit, isDC) {...},     // 支持35kV/1500V等
  resolveNodeVoltage(n) {...},                     // params.voltage优先,ONTOLOGY兜底
  resolveVoltageDomain(src, tgt) {...},            // 域解析

  // A2: 拓扑校验
  validateTopology(edges, nodes) {
    // error统一对象格式: {msg, type, repair} (V5修复: V4是纯字符串)
    if(pccNodes.length===0) errors.push({msg:'缺少PCC/电源节点',type:'missing_pcc',repair:'pcc'});
  },

  // A2: 拓扑修复
  repairTopology(edges, nodes, errors) {
    // V5新增: missing_pcc处理
    if(err.type==='missing_pcc'){
      // 自动补插PCC节点 + 连到第一个母线
    }
    // REPAIR_CHAINS链式修复
    // 单点修复fallback
  },

  // A2: 模板匹配
  matchTemplate(nodes, edges) {
    // Jaccard评分: 节点40% + 边40% + 主链20%
    // 返回最佳匹配模板+分数
  },

  // A2: 模板纠偏
  applyTemplateCorrection(nodes, edges, template) {
    // 补缺失的requiredTypes节点
    // 补缺失的requiredEdges边
    // autoIdx递增ID (V5修复: V4用Date.now()同毫秒冲突)
  },

  // A3: 布局约束协议
  buildLayoutContract(node) {...},

  // 主管线
  process(rawData) {
    // Semantic → Validate → Repair → Template → VoltageDomain → LayoutContract
    // 模板纠偏阈值: >15 (V5修复: V4.1为>-5,几乎总触发)
  }
};
```

---

### 3.5 渲染层关键差异

| 功能 | V4.0 | V5 |
|------|------|-----|
| 类型解析 | `TYPE_ALIAS[n.type]` | `n.stdType` (单真相源) |
| 节点渲染 | `DIAGRAM_ICONS[resolvedType]` | `DIAGRAM_ICONS[finalSymbol]` → IEC符号fallback |
| 母线渲染 | 固定宽度矩形 | `busWidthMap[n.id]`动态宽度 + isDC颜色区分 |
| 母线DC判断 | 无 | `type==='dc_bus'` (V5修复: 原为`resolvedType`未定义) |
| 连线渲染 | `<line>`直线 | A*正交路径 + 交叉跳线 |
| 连线颜色 | 单色 | VOLTAGE_DOMAINS驱动 (7色+线型+线宽) |
| 自动补插标识 | 无 | 虚线框 + "AUTO"标签 |
| 工程属性 | 无 | tag/deviceNo/rating/manufacturer/model |
| 图例 | 无 | LegendRenderer (从VOLTAGE_DOMAINS自动生成) |
| 拓扑信息条 | 无 | errors/repairs/warnings渲染到SVG |
| 接线图 | 独立硬编码渲染器 | 优先V4管线, fallback硬编码 |
| 主题 | 硬编码深色 | CSS变量 + 暗亮切换 |

---

### 3.6 V5相对V4.1的增量修复

| # | 修复项 | V4.1 | V5 | 代码位置 |
|---|--------|------|-----|---------|
| 1 | resolvedType未定义 | `resolvedType === 'dc_bus'` (崩溃) | `type === 'dc_bus'` | 行11908 |
| 2 | TYPE_ALIAS死代码 | 定义存在但无引用 | 已删除 | 原行10461 |
| 3 | repairTopology missing_pcc | 跳过(无fromId/toId) | 自动补插PCC+连母线 | 行11303-11316 |
| 4 | remainingErrors过滤 | `r.between===fromId+'↔'+toId` | +missing_pcc用`r.inserted==='pcc'` | 行11486 |
| 5 | 模板纠偏阈值 | `>-5` (几乎总触发) | `>15` (需15%匹配) | 行11492 |
| 6 | VOLTAGE_DOMAINS颜色 | AC_HV/AC_LV同色(#4a9ee8/#4a90d9) | 蓝/橙/绿三色区分 | 行11169-11176 |
| 7 | dagre间距 | nodesep=100,ranksep=140 | nodesep=120,ranksep=180 | 行11544 |
| 8 | 自动补插节点渲染 | 纯文字"自动补插" | 虚线框+AUTO标签 | 行11929-11931 |

---

## 4. 数据流对比

### V4.0 数据流
```
LLM JSON → {nodes[{type,label,x,y}], links[{from,to}]}
  → TYPE_ALIAS映射 → 直线SVG
```
- LLM负责布局(x,y坐标)
- 渲染层用TYPE_ALIAS二次解释
- 无校验无修复

### V5 数据流
```
LLM JSON → {nodes[{type,label}], links[{from,to}]}
  → ESS_V3.process():
      SYNONYMS → stdType          (词义归一)
      ONTOLOGY → deviceClass      (设备分类)
      PORT_MODEL → ports          (端口分配)
      validateTopology → errors   (拓朴校验)
      repairTopology → repairs    (拓朴修复)
      matchTemplate → template    (模板匹配)
      applyTemplateCorrection     (模板纠偏)
      resolveVoltageDomain → domain (域解析)
      buildLayoutContract → contract (布局约束)
  → dagreLayout → {x,y,width,height}  (图布局)
  → getBestPorts → {fromEdge,toEdge}  (端口选择)
  → astarRoute → [{x,y}...]           (正交路径)
  → detectCrosspoints → jumps         (交叉跳线)
  → SVG渲染
```
- LLM只输出拓扑(类型+连接)，不负责布局
- ESS_V3是唯一真相源
- 渲染层只消费不解释

---

## 5. 关键Bug修复链

```
Bug: 整图只渲染1个节点
  根因: validateTopology返回字符串error → repairTopology跳过 → 剩余节点消失
  V4.1修复: error改对象格式{msg,type,repair}
  V5修复: +missing_pcc处理 + remainingErrors过滤兼容

Bug: resolvedType is not defined (整图崩溃)
  根因: 行11908引用未定义变量resolvedType
  V5修复: 改为type

Bug: 模板纠偏乱补节点 (图越画越差)
  根因: 阈值>-5太宽松, 几乎所有场景都触发纠偏
  V5修复: 阈值改为>15

Bug: AC_HV/AC_LV/DC走线同色
  根因: VOLTAGE_DOMAINS颜色值太接近
  V5修复: 蓝/橙/绿三色区分

Bug: 走线穿越元器件
  根因: dagre间距太小 + A*无通道避让
  V5修复: nodesep 100→120, ranksep 140→180

Bug: 双真相模型 (符号/尺寸/端口不一致)
  根因: TYPE_ALIAS让渲染层二次解释类型
  V4.1修复: resolveType改为n.stdType||n.type
  V5修复: 删除TYPE_ALIAS死代码
```