# Skill ID: ess_agent_3d_twin_viewer_vr
# Name: ESS Agent - 3D微电网数字孪生与VR沉浸式交付交付智能体
# Description: 驱动 www.ess-agent.com 平台从微网方案自动生成、3D PBR实物渲染、协议数据绑定到EMS全场景自动化调试交付的核心智能体技能。

## 1. 视觉与空间设计规范 (UI/UX Visual Specifications)

### 1.1 环境与渲染基调
- **风格定位**：工业写实暗黑科技风（HUD全息平视显示风格）。
- **空间背景**：采用深色调（#0a0f1d）三维网格地面（Grid Floor），引入线性环境雾效（Fog Density: 0.015）以增强透视景深，杜绝传统二维组态的扁平感。
- **材质标准**：所有微电网单元均采用 PBR（基于物理的渲染）材质。金属外壳具备逼真的反射率（Roughness: 0.3, Metalness: 0.8），烤漆表面高光分明，支持半透明（Opacity: 0.4）全息剖切视角。

### 1.2 能量流向动效语义 (Energy Flow Dynamics)
- **技术实现**：禁止采用高能耗的真实3D物理粒子粒子群，统一采用【UV贴图滚动技术】（Texture Offset Animation），确保弱网环境流畅度。
- **色彩与速度语义**：
  - **充电/流入能流（市电/光伏 → 储能/负载）**：高亮科技蓝粒子流（#00f0ff）。
  - **放电/流出能流（储能/柴发 → 负载/电网）**：高亮琥珀橙粒子流（#ff6c00）。
  - **动态映射**：能流滚动速度与实际采集或模拟的实时功率（kW）成正比。功率为0时，能流静止。

### 1.3 场景设备空间布局 (3D Topology & Devices)
- **中心枢纽**：Deye 125kW 混合逆变器 / 1.25MW 集中式 PCS 实物模型。
- **左侧矩阵**：PV光伏阵列（带倾角实物）、BOS-A 21 (261kWh) 或 GOTION GRID (5MWh) 电池舱（支持外壳半透明化，可见内部 336 电芯拓扑）。
- **右侧与下侧**：Diesel Generator（柴油发电机）、Industrial Load（工业负载工厂）、Car Load（充电桩与EV车）、House Load（家庭/建筑负载）。
- **顶层云端**：Deye Cloud 图标，通过发光虚线（WiFi/4G/LAN）与中心逆变器级联。

---

## 2. 全栈技术架构与数据工作流 (Technical Architecture)