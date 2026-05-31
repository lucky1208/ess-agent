# Skill ID: minimax_net_digital_twin_vr
# Name: ESS Agent - 3D Twin Viewer (VR Immersive Edition)
# Version: v3.0
# Description: 面向储能电站、光储充微网、工商业储能、园区能源站、数据中心能源站及虚拟电厂(VPP)场景的工业级数字孪生与AI交付智能体。基于Three.js PBR物理渲染管线、自定义GLSL能量流动画与WebXR沉浸技术，实现从方案设计、工程建设、自动调试、EMS运行到VPP运营的全生命周期数字闭环。
# Status: Production-Ready
# Open Source: www.ess-agent.com

---

## 1. 产品定位：不是3D展示，是AI驱动的微电网数字孪生交付平台

传统数字孪生 = 3D模型 + 监控数据（只能看）
ESS Agent Twin Viewer = 真实设备 + 实时数据 + 动态能量流 + AI调试 + EMS控制 + VPP运营（能看、能管、能调、能交付）

实现全生命周期闭环：
需求分析 → 方案设计 → 电气设计 → BOM生成 → 协议配置 → 自动调试 → 数字孪生 → EMS运行 → AI运维 → VPP运营 → 电力交易

---

## 2. 视觉设计哲学：工业写实暗黑科技风

### 2.1 参考标杆
- NVIDIA Omniverse（物理级渲染质量）
- Tesla Energy Dashboard（极简数据密度）
- Unreal Engine Digital Twin（影视级光影）
- Siemens Xcelerator（工业语义清晰）

### 2.2 核心视觉关键词
Dark Industrial | Sci-Fi Energy | PBR Realistic | HUD Interface | Holographic

### 2.3 场景环境规范

| 元素 | 参数 | 效果 |
|------|------|------|
| **背景色** | #0a0f1d（深蓝黑） | 消除视觉疲劳，突出设备主体 |
| **环境光** | HDR环境贴图（工业厂房HDRI） | 金属外壳反射真实环境，拒绝纯色假反射 |
| **主光源** | DirectionalLight（模拟太阳，色温5500K，强度1.2） | 产生明确阴影，增强体积感 |
| **补光** | HemisphereLight（天空#4a6fa5，地面#1a1a2e，强度0.6） | 柔和填充暗部，避免死黑 |
| **轮廓光** | 设备底部RimLight（青色#00f0ff，强度0.3） | 工业设备悬浮感，科幻氛围 |
| **雾效** | LinearFog（Density: 0.015，Color: #0a0f1d） | 增强景深透视，远景自然过渡 |
| **阴影** | PCFSoftShadowMap（分辨率2048×2048，Bias: -0.001） | 柔和接触阴影，避免锯齿 |
| **地面** | 网格地面（GridHelper，颜色#1e3a5f，透明度0.3）+ 水泥纹理Plane | 既有工业参考感，又有真实质感 |
| **反射** | 关键设备下方放置反射Plane（反射率0.15，Blur: 0.3） | 设备底部微反射，增强落地感 |

### 2.4 PBR材质规范（基于物理的渲染）

所有设备必须使用MeshStandardMaterial，严禁使用BasicMaterial：

| 材质类型 | Metalness | Roughness | Normal贴图 | 备注 |
|----------|-----------|-----------|------------|------|
| **金属外壳**（储能柜/PCS） | 0.8 | 0.3 | 有 | 波纹钢板、散热格栅、品牌Logo凹凸 |
| **烤漆表面**（逆变器/电表） | 0.4 | 0.2 | 有 | 高光清晰，可看到环境反射 |
| **玻璃面板**（LCD屏/舱门观察窗） | 0.0 | 0.05 | 无 | 透明度0.3，带反射与折射 |
| **铜排/电缆** | 0.9 | 0.25 | 有 | 氧化铜绿色调，真实导电质感 |
| **水泥地面** | 0.0 | 0.9 | 有 | 粗糙颗粒感，吸收光线 |
| **警示标识** | 0.0 | 0.6 | 无 | 黄色#ffd200高饱和，安全视觉锚点 |
| **液冷管** | 0.1 | 0.1 | 无 | 半透明管壁，内部发光流体 |

### 2.5 后处理管线（Post-Processing Stack）

必须开启以下后处理效果，确保"漂亮"：

```javascript
const composer = new EffectComposer(renderer);

// 1. 辉光效果（Bloom）— 能量流发光核心
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,  // strength
  0.4,  // radius
  0.85  // threshold
);
composer.addPass(bloomPass);

// 2. 环境光遮蔽（SSAO）— 增强设备间遮挡关系
const ssaoPass = new SSAOPass(scene, camera);
composer.addPass(ssaoPass);

// 3. 色调映射（Tone Mapping）— 处理HDR高亮
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// 4. 抗锯齿（SMAA）
const smaaPass = new SMAAPass();
composer.addPass(smaaPass);
```

---

## 3. 设备真实感：1:1实物级建模规范

### 3.1 建模策略：真实照片贴图 + 精简单体几何

**拒绝纯3D高模**（10MB+加载慢），采用**照片级贴图+简单形体**策略：
- 设备主体：BoxGeometry/BoxBufferGeometry 贴6面真实产品照片
- 细节凹凸：Normal贴图模拟散热格栅、螺丝、波纹
- 动态部件：独立简单几何体（风扇叶片、断路器手柄、油温表指针）
- 总场景面数控制：≤50万面（确保Web端60fps、移动端30fps、VR 72fps）

### 3.2 各设备真实感细节清单

#### 储能集装箱（国轩GRID 5MWh / ESD1331-05P5015）
- **外观**：20尺标准集装箱比例（1:1），RAL 7035灰波纹钢板，角件带锈迹贴图
- **舱门**：双开门，门缝有黑色密封胶条，门锁为工业把手（可点击开合动画）
- **散热**：侧面散热格栅（Normal贴图凹凸），顶部排风扇（旋转动画，转速∝功率）
- **标识**：正面国轩Logo（凹凸贴图），侧面铭牌（白底黑字，显示型号、容量、电压）
- **状态灯**：顶部四角LED状态灯（绿=正常，黄=告警，红=故障，灰=离线）
- **消防**：顶部红色细水雾喷头阵列，正常灰色，触发时闪烁红光
- **SOC光环**：顶部环形Neo灯带（绿→黄→红对应100%→50%→20%，带呼吸动画）
- **液冷管**：侧面透明亚克力管，内部蓝色发光流体（温度越高越红，流速∝功率）

#### PCS功率变换系统（125kW-1.25MW）
- **外观**：标准柜体（600mm×800mm×2200mm），前门带LCD屏（显示实时功率数字，可动）
- **AC/DC铜排**：柜体内部可见黄色AC铜排（三相）与青色DC铜排（正负极），带氧化质感
- **功率模块**：IGBT模块带散热片，运行时有微光（充电蓝光/放电橙光）
- **散热风扇**：顶部风扇叶片旋转，转速∝功率，停机时缓慢惯性减速
- **断路器**：正面可见框架断路器手柄，合闸时绿色指示灯亮，分闸时红色
- **状态边框**：柜体边缘有细发光边框（正常=熄灭，告警=黄色脉冲，故障=红色脉冲）

#### 光伏阵列
- **组件**：单晶硅组件（1m×2m），蓝紫色反光，表面有细栅线纹理
- **支架**：铝合金支架带倾角（按项目地纬度计算），有阴影投射
- **追光动画**：组件角度随时间微调（或根据辐照度数据），正午时表面有强烈反光（Specular高光）
- **汇流箱**：阵列末端灰色防水箱，输入线束像辫子一样汇入，箱门带锁扣
- **逆变器**：华为/阳光电源机型，正面LCD屏显示MPPT效率，顶部绿色运行灯呼吸（功率越大呼吸越快）

#### 变压器
- **油变**：灰色圆柱罐体，带散热片阵列，顶部油温表（指针可动，随负载变化）
- **干变**：矩形外壳，带散热气道，有温度标签
- **声音可视化**：运行时周围有轻微"嗡鸣"粒子效果（半透明同心圆扩散）

#### 充电桩与负荷
- **直流快充**：120kW双枪，枪头为黑色橡胶材质，插入时线缆发光（绿色流动），拔出时灭
- **EV车辆**：简化SUV模型，充电口对接状态，车顶悬浮显示充电功率（kW）与SOC
- **工厂建筑**：半透明玻璃幕墙（Opacity 0.15），内部灯光∝负荷大小（负荷高=亮灯多）
- **高压铁塔**：电网侧红色铁塔，带绝缘子串细节，线缆有下垂弧度（CatmullRom曲线）

#### 柴油发电机/燃气轮机
- **机体**：橙色工业烤漆（Metalness 0.4, Roughness 0.2），带排气管
- **震动动画**：待机时轻微震动（位置微扰动±0.5mm，频率60Hz），运行时震动加剧
- **排烟**：启动时排气管有半透明灰色粒子（模拟尾气，风速影响扩散方向）
- **控制面板**：侧面有模拟仪表盘，指针可动

---

## 4. 能量流动画：从"连线"到"工业血管"

### 4.1 核心设计原则

**所有电能流动必须可视化**。能量不是静态连线，而是像液体在工业管道中流动的发光体。

技术选型：**多层复合Shader**（确保漂亮+性能平衡）：
- 第一层：基础光带（TubeGeometry + ShaderMaterial，UV滚动）
- 第二层：发光粒子（Points + 自定义Shader，沿管线流动）
- 第三层：辉光后处理（Bloom Pass，让能量流"发光"）
- 第四层：环境反射（能量流照亮周围地面/设备）

### 4.2 能量流色彩语义矩阵

| 能量类型 | 流向 | 基础色 | 发光色 | 粒子色 | 语义 |
|----------|------|--------|--------|--------|------|
| **光伏发电** | PV→逆变器→母线 | #8B7355（铜缆） | #FFD700（金黄辉光） | #FFF8DC（亮黄粒子） | 清洁能源 |
| **储能充电** | 电网/PV→PCS→电池 | #4A90E2（蓝缆） | #00F0FF（科技蓝辉光） | #E0FFFF（青白粒子） | 外部输入 |
| **储能放电** | 电池→PCS→负荷 | #2E8B57（绿缆） | #00FF88（翠绿辉光） | #98FB98（亮绿粒子） | 能量释放 |
| **逆流上网** | 电池/PV→电网 | #8B0000（红缆） | #FF003C（警示红辉光） | #FF6B6B（红粒子） | 异常/告警 |
| **通讯数据** | BMS↔PCS↔EMS | #9370DB（紫缆） | #DA70D6（淡紫辉光） | #DDA0DD（粉粒子） | 信息流 |
| **液冷循环** | 温控→电池→散热 | #4682B4（深蓝管） | #1E90FF（天蓝辉光） | #87CEEB（浅蓝粒子） | 热管理 |
| **故障状态** | — | #333333（灰缆） | #FF6C00（橙脉冲） | — | 故障告警 |
| **离线状态** | — | #555555（暗灰） | 无辉光 | 无粒子 | 通讯中断 |

### 4.3 能量流动态参数映射

```glsl
// 核心Shader Uniforms
uniform float uPower;        // 实时功率 0.0-1.0（归一化）
uniform float uTime;         // 时间
uniform vec3 uColor;         // 基础颜色
uniform float uDirection;    // 方向：1.0=正向，-1.0=反向

// 动态效果
float flowSpeed = 0.5 + uPower * 3.0;     // 功率越大流速越快
float particleDensity = 0.1 + uPower * 0.9; // 功率越大粒子越密集
float glowIntensity = 0.3 + uPower * 1.2;   // 功率越大辉光越强
float pulseFreq = 2.0 + uPower * 4.0;       // 功率越大脉动越快
```

### 4.4 管线物理建模

**拒绝细线，采用粗管线**：
- 高压电缆（10kV）：直径20mm，黑色绝缘层纹理，内部铜芯发光
- 低压电缆（AC 400V）：直径12mm，黄色绝缘层
- 直流母线（DC 1500V）：直径15mm，青色绝缘层
- 通讯线：直径3mm，紫色，带微弱脉冲光
- 液冷管：直径8mm，透明亚克力，内部流体可见

**管线布局**：
- 地面电缆沟：半透明盖板，内部可见管线排列
- 架空桥架：金属支架，管线整齐捆扎
- 设备连接：从设备接口处自然弯曲接入（CatmullRom曲线），拒绝直角硬连

### 4.5 并离网切换的能量流动画

**并网模式**：
- 电网侧：双向粒子流动（市电输入+余电上网），黄色+蓝色混合
- 储能侧：根据策略显示充电（蓝）或放电（绿）
- 光伏侧：单向金黄粒子流向母线

**离网切换动画（关键视觉效果）**：
1. 电网侧粒子逐渐减速→停止→变灰（0.5s过渡）
2. 储能侧粒子从青色变为亮绿色（VF建立）
3. 粒子从储能柜向负荷扩散，像"通电"一样逐节点点亮（1s完成）
4. 负荷端灯光恢复，微网建立完成

**黑启动动画**：
- 全场熄灭（仅储能柜有微弱呼吸灯）
- 点击"黑启动"→储能柜VF建立（爆发青色光环）
- 粒子像涟漪一样逐层扩散：储能→PCS→母线→负荷
- 每点亮一个节点，伴随轻微"嗡"声可视化（同心圆扩散）

---

## 5. 交互设计：从"看"到"沉浸式操控"

### 5.1 相机系统：五维预设 + 自由飞行

| 预设位 | 视角 | 用途 |
|--------|------|------|
| **鸟瞰位** | 45°俯视，距中心80m | 看全场能量总流向、拓扑关系 |
| **储能舱位** | 平视，距储能柜5m | 看液冷管、SOC光环、舱门开合 |
| **PCS位** | 45°侧视，距PCS 3m | 看交直流转换、功率数字、IGBT发光 |
| **光伏位** | 阵列前方，距组件2m | 看追光角度、反光、MPPT效率 |
| **电网位** | 并网点侧视，距PCC 5m | 看功率方向、电表数据、电压频率 |

**切换动画**：相机平滑飞行（CubicBezier缓动，耗时0.8s），路径可见（虚线轨迹）

### 5.2 鼠标/手势交互

| 交互 | 触发 | 效果 |
|------|------|------|
| **悬停设备** | 鼠标移入 | 设备边缘高亮（青色RimLight增强），周围粒子减速，全息数据卡预载 |
| **点击设备** | 左键单击 | 相机飞行聚焦（0.8s），设备轻微放大（1.05x），右侧HUD面板滑入 |
| **悬停能量流** | 鼠标移入管线 | 管线发光增强，显示悬浮标签"PV→PCS 1250kW" |
| **点击能量流** | 左键单击 | 展开该支路详情：实时功率、今日累计电量、效率、历史曲线 |
| **拖拽时间轴** | 底部时间轴 | 回放过去24h能量流动，像看录像一样拖动 |
| **滚轮缩放** | 鼠标滚轮 | 平滑缩放（0.5x-5x），缩放时自动调整LOD |
| **右键旋转** | 右键拖拽 | 自由环绕视角，释放后惯性减速 |

### 5.3 全息数据卡（HUD）设计

**拒绝悬浮面板，采用工业标签风**：
- 外观：半透明黑色背景（#0a0f1d，Opacity 0.85），带1px青色边框（#00f0ff）
- 入场动画：扫描线从上至下（0.3s），文字逐行打印效果
- 布局：
  ```
  ┌─────────────────────────┐
  │ [设备图标] 国轩5MWh储能柜 │ ← 标题栏，青色下划线
  ├─────────────────────────┤
  │ 电压: 1331.2V    电流: 375A │ ← 实时数据，等宽字体
  │ 功率: 500kW      SOC: 87%  │
  │ 温度: 28℃       SOH: 98%  │
  ├─────────────────────────┤
  │ [运行中] [正常] [液冷开启] │ ← 状态标签，绿/黄/红
  ├─────────────────────────┤
  │ [启停] [模式切换] [设定功率]│ ← 控制按钮（调试期可用）
  └─────────────────────────┘
  ```
- 引线：从数据卡到设备有一条虚线（#00f0ff，Opacity 0.6），带箭头

### 5.4 调试期专属交互（建设期核心）

| 调试阶段 | 3D场景反馈 | 交互操作 |
|----------|-----------|----------|
| **上电自检** | 点击"上电"→设备从灰→绿逐节点点亮（伴随电流声可视化） | 左侧导航树逐项打勾，异常设备红色闪烁 |
| **四遥验证** | 下发遥控→断路器手柄旋转动画（0.3s）→LED灯切换 | 右侧面板点击"合闸/分闸"，观察3D反馈 |
| **功率阶跃** | 拖拽功率滑块→线缆粒子流速实时变化→设备功率数字跳动 | 观察PCS跟踪曲线与超调量 |
| **并离网切换** | 点击"切换离网"→电网侧变灰→储能侧爆发青光→逐节点扩散 | 观察切换时序与冲击 |
| **故障模拟** | 点击"模拟过温"→储能柜变红→消防喷头闪烁→PCS停机→断路器分闸 | 一键触发完整故障链动画 |
| **黑启动** | 全场熄灭→点击"黑启动"→储能柜建立VF→粒子逐层扩散点亮 | 观察电压建立过程 |

---

## 6. 爆炸图模式：从外部到细胞的透视

### 6.1 触发方式
点击设备 → 选择"拆解视图" → 自动展开动画（弹簧物理缓动，耗时1.5s）

### 6.2 储能柜爆炸图层级

```
第1层：外壳（半透明Opacity 0.15，向两侧滑开）
  ↓
第2层：液冷管路（蓝色发光流体，温度可视化）
  ↓
第3层：消防系统（喷头、烟感、管道，正常灰色，触发红色）
  ↓
第4层：高压箱与铜排（黄色/青色铜排，带绝缘护套）
  ↓
第5层：电池簇（8簇并列，每簇显示平均电压/温度）
  ↓
第6层：电芯级（336电芯阵列，单体电压/温度显示，异常红色高亮）
  ↓
第7层：BMS从控板（绿色PCB，信号线发光）
```

**悬浮信息**：鼠标悬停任意层级，显示该部件实时数据（如悬停电芯→显示单体电压3.22V、温度28.5℃）

### 6.3 PCS爆炸图层级
```
外壳 → 散热风道 → IGBT模块（带温度色标） → 控制板（DSP芯片发光） → 功率单元 → 通讯模块
```

### 6.4 配电柜爆炸图层级
```
柜体 → 母排（三相黄绿红） → 断路器（触头分合状态） → CT/PT → 电表 → 保护继电器（指示灯状态）
```

---

## 7. 十大核心模块定义

### Module 1: Twin Builder — 数字孪生自动生成器
- 输入：微网方案、BOM、PCS/BMS/EMS配置、电气拓扑
- 输出：三维园区模型、设备布局、电气连接、能量流网络
- 技术：DeepSeek/Qwen大模型 + Blender Python API自动化建模
- 支持场景：工商业储能、光储充、柴发混合微网、数据中心、VPP聚合站

### Module 2: Real Equipment Library — 真实设备库
- 光伏：组件、汇流箱、逆变器（华为/阳光电源/德业）
- 储能：国轩GRID 5MWh/261kWh、液冷柜、集装箱、电池簇
- PCS：125kW-1.25MW，品牌适配（阳光/华为/科华/德业/上能）
- 配电：10kV开关柜、环网柜、PCC、变压器
- 发电：柴油发电机、燃气轮机、CCHP
- 负荷：充电桩、工厂、数据中心、家庭

### Module 3: Energy Flow Engine — 能量流粒子发光引擎
- 技术：UV贴图滚动 + 自定义GLSL Shader + Bloom后处理
- 色彩：光伏黄、充电蓝、放电绿、逆流红、故障橙、离线灰
- 动态：密度∝功率、流速∝负荷、方向实时变化
- 特效：并离网切换动画、黑启动扩散、故障脉冲

### Module 4: Exploded View Mode — 设备全息拆解模式
- 储能柜：7层爆炸至336电芯级，液冷/消防/BMS可见
- PCS：IGBT/控制板/功率单元/通讯模块
- 配电柜：断路器/CT/电表/保护继电器
- 交互：悬浮显示实时数据，异常部件红色高亮

### Module 5: Commissioning Hub — AI调试工程师（建设期能源管理）
- 5.1 设备上电自检：BOM核对、参数回读、通讯检测、绝缘测试
- 5.2 四遥闭环验证：遥测精度、遥信核对、遥控试探、遥调响应
- 5.3 策略闭环验证：阶跃响应、SOC校验、防逆流、并离网切换、VSG整定
- 5.4 保护联动演练：定值校验、级差配合、绝缘定位、消防时序、故障录波
- 5.5 性能标定测试：效率RTE、响应时间、电能质量、温控标定、噪声振动
- 5.6 并网前验收：自动Checklist、数据归档、验收报告PDF、运维基线、异常模式库

### Module 6: EMS Mode — 能源管理中心
- 实时显示：总负荷、光伏、储能、PCS、PCC、SOC、电价
- 控制模式：削峰填谷、需量控制、防逆流、自发自用、光储充协同、VSG
- 收益分析：当日/月/年收益、ROI预测、投资回收期
- 安全预演：双闭环保护（软件限功率+硬件逆功率继电器）模拟

### Module 7: AI EMS Agent — AI能源调度智能体
- 输入：电价、SOC、天气、负荷预测
- 输出：充放电计划、EMS策略代码、收益预测
- 示例："建议22:00充电，预计收益+128元"
- 增强：自然语言指令、策略风险预警

### Module 8: AI Copilot — AI智能运维专家
- 自然语言诊断："为什么PCS停机？"
- 根因分析：状态字+告警码+通讯+策略关联
- 输出：诊断报告+维修建议+工单生成
- 能力：故障诊断、根因分析、运维建议、寿命预测

### Module 9: VPP Mode — 虚拟电厂运营中心
- 显示：聚合容量、可调容量、响应能力、实时收益
- 业务：需求响应、调频辅助服务、现货市场、电力交易
- 交互：接收调度指令→自动分配→上报响应→收益统计

### Module 10: VR Walkthrough — VR沉浸式巡检
- 支持：WebXR、Meta Quest、Apple Vision Pro
- 场景：储能舱内漫游、配电室巡检、光伏区俯瞰
- 交互：手柄抓取→全息数据卡、语音指令→热力图、空间锚点→异常标记

---

## 8. 技术栈与性能规范

### 8.1 核心技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript | 组件化、类型安全 |
| 3D引擎 | Three.js (r160+) | WebGL、生态成熟 |
| 相机 | OrthographicCamera(等距) + PerspectiveCamera(自由) | 双模式切换 |
| 建模 | 真实产品PNG贴图 + 简单几何 | 500KB/设备，总场景<5MB |
| 材质 | PBR (MeshStandardMaterial) | Metalness/Roughness/Normal |
| 特效 | 自定义GLSL Shader | 粒子流、发光、扫描线 |
| 后处理 | EffectComposer | Bloom + SSAO + ToneMapping + SMAA |
| 数据 | WebSocket + MQTT | 实时推送 |
| VR | WebXR API | Quest/Vision Pro兼容 |
| 性能 | InstancedMesh + LOD | 60fps桌面/30fps移动/72fpsVR |

### 8.2 性能指标

- 首屏加载：≤3s（5MB场景包）
- 帧率：桌面60fps、移动30fps、VR 72fps
- 数据延迟：3D状态更新≤500ms
- 并发设备：单场景200+节点流畅
- 弱网适配：粒子流UV滚动，3G网络流畅
- 总面数：≤50万面

---

## 9. 与现有Skill生态集成

| Skill | 数字孪生调用关系 |
|-------|-----------------|
| minimax_net_capacity_sizing | 读取容量→匹配储能柜数量与3D模型 |
| minimax_net_pcs_specification | 读取PCS型号→匹配品牌外观贴图→生成功率节点 |
| minimax_net_battery_sizing_criteria | 读取电芯规格→爆炸图显示336电芯拓扑 |
| minimax_net_grid_connection_report | 读取拓扑→生成AC/DC管线连接与颜色编码 |
| minimax_net_ems_strategy | 读取策略→设定默认能量流方向与EMS模式 |
| minimax_net_commissioning_iocontrol | 读取IO点表→四遥验证自动核对 |
| minimax_net_relay_coordination | 读取保护定值→保护联动测试验证 |
| minimax_net_operation_dashboard | 运营数据→3D HUD面板实时显示 |
| minimax_net_oneclick_deploy | 部署完成→自动进入数字孪生上电自检向导 |
| minimax_net_digital_twin_vr | 本Skill，作为调试与运维的入口界面 |

---

## 10. 附录：核心GLSL Shader代码

### 10.1 能量流粒子管线Shader

```glsl
// Vertex Shader
attribute float progress;
attribute float speed;
attribute float size;

uniform float uTime;
uniform float uPower;
uniform vec3 uColor;
uniform vec3 startPoint;
uniform vec3 endPoint;

varying float vAlpha;
varying vec3 vColor;

void main() {
  float flow = fract(progress + uTime * speed * (0.5 + uPower * 2.0));
  vec3 newPosition = mix(startPoint, endPoint, flow);

  // 功率越大粒子越大
  float dynamicSize = size * (0.5 + uPower * 1.5);

  // 中间亮两头暗
  vAlpha = (1.0 - abs(flow - 0.5) * 2.0) * (0.3 + uPower * 0.7);
  vColor = uColor * (0.5 + uPower * 0.8);

  vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
  gl_PointSize = dynamicSize * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}

// Fragment Shader
uniform sampler2D particleTexture;
varying float vAlpha;
varying vec3 vColor;

void main() {
  vec4 texColor = texture2D(particleTexture, gl_PointCoord);
  gl_FragColor = vec4(vColor, vAlpha) * texColor;
}
```

### 10.2 管线光带Shader（UV滚动）

```glsl
uniform float uTime;
uniform float uPower;
uniform vec3 uColor;
uniform sampler2D flowTexture;

varying vec2 vUv;

void main() {
  // UV滚动速度∝功率
  float flowSpeed = 0.5 + uPower * 3.0;
  vec2 scrolledUV = vUv;
  scrolledUV.x += uTime * flowSpeed;

  // 采样流动纹理
  vec4 flowColor = texture2D(flowTexture, scrolledUV);

  // 基础颜色+功率增强
  vec3 finalColor = uColor * (0.3 + uPower * 1.2);

  // 叠加流动纹理
  finalColor += flowColor.rgb * uPower;

  // 脉冲效果
  float pulse = sin(uTime * (2.0 + uPower * 4.0)) * 0.1 + 0.9;
  finalColor *= pulse;

  gl_FragColor = vec4(finalColor, 0.6 + uPower * 0.4);
}
```

### 10.3 设备RimLight边缘光Shader

```glsl
uniform vec3 uRimColor;
uniform float uRimIntensity;

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);

  // Fresnel边缘光
  float rim = 1.0 - max(dot(normal, viewDir), 0.0);
  rim = pow(rim, 3.0);

  vec3 rimColor = uRimColor * rim * uRimIntensity;

  // 叠加到基础材质
  gl_FragColor = vec4(baseColor + rimColor, 1.0);
}
```

### 10.4 Three.js等距相机配置

```javascript
const aspect = window.innerWidth / window.innerHeight;
const d = 60;
const camera = new THREE.OrthographicCamera(
  -d * aspect, d * aspect, d, -d, 1, 1000
);
camera.position.set(30, 30, 30);
camera.lookAt(0, 0, 0);

// 平滑切换预设视角
function flyToPreset(position, target, duration = 800) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; // CubicBezier

    camera.position.lerpVectors(startPos, position, ease);
    controls.target.lerpVectors(startTarget, target, ease);
    controls.update();

    if (t < 1) requestAnimationFrame(animate);
  }
  animate();
}
```

---

*本Skill为Open ESS Agent开源生态核心组件，对所有人开放，访问 www.ess-agent.com 体验完整功能。*
*Version: v3.0 | Last Updated: 2026-05-31*
