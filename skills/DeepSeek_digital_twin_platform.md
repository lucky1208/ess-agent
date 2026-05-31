---
skill_name: 储能电站数字孪生VR平台
skill_id: DeepSeek_digital_twin_platform
version: 2.0
author: DeepSeek
created_date: 2026-05-31
target_audience: 数字孪生开发工程师 / 3D建模师 / VR交互设计师 / 储能系统集成商
tech_stack:
  web_3d: Three.js r160+
  vr_framework: A-Frame 1.5+ / Babylon.js WebXR
  native_vr: Unity 2023 + XR Interaction Toolkit
  industry_protocol: MQTT 5.0 + OPC-UA .NET SDK
  model_format: glTF 2.0 / GLB (Draco压缩)
  backend: Node.js 20 / .NET 8
  database: InfluxDB (时序) + Redis (缓存) + MongoDB (元数据)
---

# 储能电站数字孪生VR平台 Skill

> **定位**：储能电站数字孪生虚拟现实系统完整技术方案 —— 3D建模 → 数据绑定 → 动态动画 → VR漫游 → 多端交付
> **版本**：v2.0 (DeepSeek增强版)
> **适用**：Web端/PC端/VR头盔(Quest/Pico/HP Reverb)

---

## 目录

- [一、四层数字孪生架构](#一四层数字孪生架构)
  - [1.1 整体分层设计](#11-整体分层设计)
  - [1.2 数据流设计](#12-数据流设计)
- [二、14类设备3D模型清单](#二14类设备3d模型清单)
- [三、LOD管理策略](#三lod管理策略)
- [四、GIS→3D墨卡托坐标映射](#四gis3d墨卡托坐标映射)
- [五、功率流粒子动画 (Three.js)](#五功率流粒子动画-threejs)
- [六、历史回放控制器](#六历史回放控制器)
- [七、MQTT数据订阅类](#七mqtt数据订阅类)
- [八、OPC-UA工业数据接入 (C#)](#八opc-ua工业数据接入-c)
- [九、IndexedDB离线缓存](#九indexeddb离线缓存)
- [十、VR控制器交互](#十vr控制器交互)
- [十一、CrossSection剖面视图 (clipPlanes)](#十一crosssection剖面视图-clipplanes)
- [十二、35项交付检查表](#十二35项交付检查表)

---

## 一、四层数字孪生架构

### 1.1 整体分层设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    可视化展示层 (Presentation)                    │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────────────┐  │
│  │ Web大屏   │ │ PC客户端  │ │ VR头盔    │ │ 移动端H5      │  │
│  │ 1920×1080 │ │ Win/Mac   │ │ Quest/Pico│ │ 小程序/App     │  │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬─────────┘  │
└────────┼──────────────┼────────────┼──────────────┼────────────┘
         │              │            │              │
┌────────┴──────────────┴────────────┴──────────────┴────────────┐
│                    实时通信层 (Communication)                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  WebSocket (WSS) / MQTT 5.0 Broker / OPC-UA Gateway      │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │  │
│  │  │ 实时遥测 │ │ 告警推送 │ │ 控制命令 │ │ 心跳检测 │    │  │
│  │  │ P0/1s   │ │ P0/即时 │ │ P2/5s  │ │ P3/30s  │    │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────┬──────────────┬────────────┼──────────────┬────────────┘
         │              │            │              │
┌────────┴──────────────┴────────────┴──────────────┴────────────┐
│                    数据处理层 (Data Processing)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 数据采集 │ │ Redis缓存│ │ InfluxDB │ │ 告警规则引擎     │  │
│  │ (edge)  │ │ 热数据   │ │ 时序存储 │ │ (hysteresis)    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
└────────┬──────────────┬────────────┼──────────────┬────────────┘
         │              │            │              │
┌────────┴──────────────┴────────────┴──────────────┴────────────┐
│                    模型管理层 (Model Management)                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │      3D孪生模型 glTF/GLB + 设备元数据 device_metadata     │  │
│  │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐      │  │
│  │   │ PCS舱体 │ │ BMS电池 │ │ 变压器  │ │ 并网柜   │ ...  │  │
│  │   │ LOD0~2  │ │ LOD0~2 │ │ 单精度 │ │ LOD0~2  │      │  │
│  │   └─────────┘ └─────────┘ └─────────┘ └──────────┘      │  │
│  └───────────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────────┐
│                    物理设备层 (Physical)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ PCS变流器│ │ BMS管理  │ │ 变压器   │ │ 电表/断路器/消防│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 数据流设计

```
物理设备 ──MQTT/OPC-UA──► 采集网关 ──WebSocket──► 数据中台 ──MQTT──► 前端
                    │
                    ├──► Redis (热缓存, TTL=60s) ──► 前端即时查询
                    ├──► InfluxDB (时序, 1年+) ──► 历史数据回放
                    └──► MongoDB (元数据/模型/配置) ──► 场景初始化

关键数据流:
  1. 实时遥测: 设备→MQTT Broker→前端WebSocket→3D模型属性更新 (1s)
  2. 告警推送: 告警→MQTT→前端即时渲染高亮+震动 (无需轮询)
  3. 历史回放: 前端请求→API网关→InfluxDB查询→回放控制器→场景重放
  4. 控制指令: 前端→MQTT→采集网关→PCS/BMS (需权限验证)
```

---

## 二、14类设备3D模型清单

| 序号 | 设备类型 | 模型命名规范 | 关键可动元素 | LOD策略 | 三角面预算 |
|------|----------|-------------|-------------|---------|-----------|
| 1 | **PCS储能舱** | `PCS_{编号}_v{版本}` | 风扇旋转/状态LED/柜门 | LOD0动画/LOD2静态 | 30K/10K/2K |
| 2 | **电池舱(集装箱)** | `BATT_{编号}_v{版本}` | 液冷管路/舱门/电池架 | LOD0管路/LOD2外壳 | 50K/15K/3K |
| 3 | **电池模组** | `MODULE_{编号}_v{版本}` | 单体温度色变/SOC填充 | LOD0色变/LOD2固定色 | 8K/3K/0.5K |
| 4 | **主变压器** | `TRF_{编号}_v{版本}` | 油枕液位/套管 | 全LOD相同 | 10K |
| 5 | **并网柜** | `SWG_{编号}_v{版本}` | 断路器把手/手车 | LOD0可操作/LOD2静态 | 8K/2K/0.8K |
| 6 | **开关柜** | `SWGR_{编号}_v{版本}` | 手车/接地刀 | LOD0可操作/LOD2静态 | 8K/2K/0.8K |
| 7 | **汇流箱** | `COMB_{编号}_v{版本}` | 熔断器状态 | LOD0+LOD2相同 | 3K |
| 8 | **电缆沟及桥架** | `CABLE_{区域}_v{版本}` | 电缆温度色变 | 仅LOD2 | 2K |
| 9 | **光伏支架** | `PV_{区号}_v{版本}` | 组件倾角 | 按需LOD | 5K/2K |
| 10 | **消防设备** | `FIRE_{编号}_v{版本}` | 探测灯/LED/喷头 | LOD0指示灯/LOD2静态 | 3K/1K |
| 11 | **热管理机组** | `HVAC_{编号}_v{版本}` | 风扇/压缩机/管路 | LOD0动画/LOD2静态 | 5K/2K |
| 12 | **场站建筑** | `BLD_{名称}_v{版本}` | 门/窗 | 仅LOD2 | 15K |
| 13 | **道路/围栏** | `ROAD_{名称}_v{版本}` | — | 全LOD相同 | 5K |
| 14 | **绿化/景观** | `GREEN_{名称}_v{版本}` | 树木(广告牌) | 仅LOD2 | 3K |

---

## 三、LOD管理策略

```javascript
/**
 * Three.js LOD (Level of Detail) 管理器
 * 根据相机距离动态切换模型精度，优化Web端渲染性能
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class ESSLODManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.modelCache = new Map();    // { 'PCS_LOD0': gltfScene, ... }
    this.activeModels = new Map();  // { 'PCS_001': { lod, mesh, currentLevel } }
    this.lodDistances = {
      LOD0: 30,     // 近距离: ≤30m → 最高精度(VR)
      LOD1: 100,    // 中距离: 30~100m → 中等精度(Web详情)
      LOD2: 500     // 远距离: >100m → 低精度(GIS总览)
    };
    this.loader = new GLTFLoader();
  }

  /**
   * 加载设备模型到场景
   * @param {string} deviceId   - 设备ID, 如 'PCS_001'
   * @param {string} deviceType - 设备类型, 如 'PCS'
   * @param {THREE.Vector3} position - 3D世界坐标
   */
  async loadDevice(deviceId, deviceType, position) {
    // 初始加载LOD2 (远距离, 加载最快)
    const model = await this.getModel(deviceType, 'LOD2');
    const instance = model.clone();
    instance.position.copy(position);
    instance.name = deviceId;
    instance.userData = {
      deviceId, deviceType,
      currentLOD: 'LOD2',
      position: position.clone()
    };

    this.scene.add(instance);
    this.activeModels.set(deviceId, instance);
    return instance;
  }

  /**
   * 获取缓存/加载模型
   */
  async getModel(deviceType, lodLevel) {
    const key = `${deviceType}_${lodLevel}`;
    if (this.modelCache.has(key)) {
      return this.modelCache.get(key);
    }

    const path = `/models/${deviceType.toLowerCase()}_${lodLevel.toLowerCase()}.glb`;
    try {
      const gltf = await this.loader.loadAsync(path);
      const model = gltf.scene;
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.modelCache.set(key, model);
      return model;
    } catch (e) {
      console.warn(`[LOD] Failed to load ${path}, using fallback`);
      return this.modelCache.get(`${deviceType}_LOD2`);
    }
  }

  /**
   * 每帧更新LOD (根据相机距离)
   */
  update() {
    if (!this.camera) return;

    this.activeModels.forEach((model, deviceId) => {
      const distance = this.camera.position.distanceTo(model.position);
      const targetLOD = this.getLODLevel(distance);

      if (model.userData.currentLOD !== targetLOD) {
        this.switchLOD(model, deviceId, targetLOD);
      }
    });
  }

  getLODLevel(distance) {
    if (distance <= this.lodDistances.LOD0) return 'LOD0';
    if (distance <= this.lodDistances.LOD1) return 'LOD1';
    return 'LOD2';
  }

  async switchLOD(model, deviceId, targetLOD) {
    const deviceType = model.userData.deviceType;
    const newModel = await this.getModel(deviceType, targetLOD);
    const instance = newModel.clone();
    instance.position.copy(model.position);
    instance.rotation.copy(model.rotation);
    instance.name = deviceId;
    instance.userData = { ...model.userData, currentLOD: targetLOD };

    this.scene.remove(model);
    this.scene.add(instance);
    this.activeModels.set(deviceId, instance);
  }

  /** VR模式强制使用LOD0 */
  enableVRMode() {
    this.lodDistances = { LOD0: 500, LOD1: 1000, LOD2: 2000 };
    this.activeModels.forEach((model, id) => {
      this.switchLOD(model, id, 'LOD0');
    });
  }

  /** 性能不足时强制降级所有模型到LOD2 */
  forceDowngrade() {
    this.activeModels.forEach((model, id) => {
      this.switchLOD(model, id, 'LOD2');
    });
  }
}

export { ESSLODManager };
```

---

## 四、GIS→3D墨卡托坐标映射

```javascript
/**
 * 储能场站坐标系转换
 * WGS84(GIS经纬度) ←→ 3D世界坐标 (Three.js Y-up右手系)
 * 使用简单墨卡托投影 (场站级小范围, <100km精确)
 */

const COORDINATE = {
  // 场站中心点GIS坐标
  originLat: 31.2304,
  originLon: 121.4737,
  originElevation: 15.0,  // WGS84椭球高(m)

  // 1度纬度≈111320m (WGS84)
  meterPerLat: 111320.0,
  // 1度经度≈111320×cos(lat) (随纬度变化)
  get meterPerLon() {
    return 111320.0 * Math.cos(this.originLat * Math.PI / 180.0);
  },

  // 3D世界比例: 1m = 1.0 3D单位
  scale: 1.0,

  // 3D世界坐标系: Y轴向上, X轴东, Z轴北
  northDirection: new THREE.Vector3(0, 0, 1),
};

/**
 * WGS84经纬度 → 3D世界坐标
 * @param {number} lat - 纬度(度)
 * @param {number} lon - 经度(度)
 * @param {number} elevation - 海拔高程(m)
 * @returns {THREE.Vector3} 3D坐标
 */
function gisToWorld(lat, lon, elevation = 0) {
  const dLat = lat - COORDINATE.originLat;
  const dLon = lon - COORDINATE.originLon;

  const x = dLon * COORDINATE.meterPerLon * COORDINATE.scale;  // 东→X+
  const z = dLat * COORDINATE.meterPerLat * COORDINATE.scale;  // 北→Z+
  const y = (elevation - COORDINATE.originElevation) * COORDINATE.scale;

  return new THREE.Vector3(x, y, z);
}

/**
 * 3D世界坐标 → WGS84经纬度
 */
function worldToGis(x, y, z) {
  const lat = COORDINATE.originLat + z / (COORDINATE.meterPerLat * COORDINATE.scale);
  const lon = COORDINATE.originLon + x / (COORDINATE.meterPerLon * COORDINATE.scale);
  const elevation = y / COORDINATE.scale + COORDINATE.originElevation;

  return { lat, lon, elevation };
}

export { COORDINATE, gisToWorld, worldToGis };
```

---

## 五、功率流粒子动画 (Three.js)

```javascript
/**
 * 功率流动画系统
 * 在PCS、变压器、并网柜之间渲染带电粒子流
 * 方向/速度/颜色由实时功率数据驱动
 */
class PowerFlowAnimator {
  constructor(scene) {
    this.scene = scene;
    this.flows = new Map();  // { flowId: { group, config, state } }
  }

  /**
   * 创建功率流路径
   * @param {string} id - 路径ID, 如 'grid_to_pcs'
   * @param {THREE.Vector3} start - 起点
   * @param {THREE.Vector3} end - 终点
   * @param {object} options - { color, tubeRadius, particleCount }
   */
  createFlow(id, start, end, options = {}) {
    const {
      color = 0x00ff88,
      tubeRadius = 0.15,
      particleCount = 20,
      curve = null
    } = options;

    const group = new THREE.Group();
    group.name = `flow_${id}`;

    // 管道几何体
    const path = curve || new THREE.LineCurve3(start, end);
    const tubeGeo = new THREE.TubeGeometry(path, 64, tubeRadius, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.6,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    group.add(tube);

    // 流动粒子 (叠加混合)
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const offsets = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const t = i / particleCount;
      const point = path.getPointAt(t);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
      offsets[i] = t;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));

    const particleMat = new THREE.PointsMaterial({
      color, size: 0.4, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    group.add(particles);

    // 方向箭头 (可选)
    const midPoint = path.getPointAt(0.5);
    const tangent = path.getTangentAt(0.5).normalize();
    const arrow = new THREE.ArrowHelper(tangent, midPoint, 1.5, color, 0.8, 0.4);
    group.add(arrow);

    this.scene.add(group);
    this.flows.set(id, { group, path, particles, color, speed: 1.0, options });
    return group;
  }

  /**
   * 更新所有粒子动画 (在requestAnimationFrame中调用)
   * @param {number} deltaTime - 帧间隔(秒)
   */
  update(deltaTime) {
    this.flows.forEach((flow, id) => {
      const { particles, path, speed } = flow;
      const positionAttr = particles.geometry.attributes.position;
      const arr = positionAttr.array;

      for (let i = 0; i < arr.length / 3; i++) {
        // 计算当前粒子沿路径的位置
        let t = (flow._baseProgress || 0) + (i / (arr.length / 3)) * (1 / (arr.length / 15));
        t = (t + deltaTime * speed * 0.5) % 1.0;

        const point = path.getPointAt(t);
        arr[i * 3] = point.x;
        arr[i * 3 + 1] = point.y + Math.sin(t * Math.PI * 6) * 0.15; // Y轴波动
        arr[i * 3 + 2] = point.z;
      }
      flow._baseProgress = ((flow._baseProgress || 0) + deltaTime * speed * 0.5) % 1.0;
      positionAttr.needsUpdate = true;
    });
  }

  /**
   * 根据功率更新流速和颜色
   * @param {string} id - 流量ID
   * @param {number} powerKW - 功率(kW), 正值=放电, 负值=充电
   */
  updatePower(id, powerKW) {
    const flow = this.flows.get(id);
    if (!flow) return;

    const absKW = Math.abs(powerKW);
    // 速度: 功率越大流动越快
    flow.speed = Math.min(absKW / 500, 3.0) + 0.5;

    // 颜色: 充电蓝→放电绿, 阈值红色
    let color;
    if (powerKW >= 0) {
      color = new THREE.Color().setHSL(0.35, 1, 0.5); // 绿色
    } else {
      color = new THREE.Color().setHSL(0.58, 1, 0.5); // 蓝色
    }
    flow.group.children[0].material.color = color;
    flow.particles.material.color = color;
    // 无流量时降低透明度
    flow.group.visible = absKW > 1;
  }

  /** 温度热图: 根据温度更新路径颜色 */
  updateTemperature(id, tempC) {
    const flow = this.flows.get(id);
    if (!flow) return;
    const t = Math.max(0, Math.min(1, (tempC - 20) / 60)); // 20~80°C
    const color = new THREE.Color().setHSL((1 - t) * 0.65, 1, 0.5);
    flow.group.children[0].material.color = color;
  }
}

export { PowerFlowAnimator };
```

---

## 六、历史回放控制器

```javascript
/**
 * 历史数据回放控制器
 * 支持播放/暂停/倍速/跳转/循环
 */
class HistoryPlaybackController {
  constructor(scene, dataService, deviceController) {
    this.scene = scene;
    this.dataService = dataService;
    this.deviceController = deviceController;
    this.state = 'stopped'; // stopped | playing | paused
    this.speed = 1;           // 1x/2x/4x/8x/16x
    this.currentTime = null;
    this.startTime = null;
    this.endTime = null;
    this.timelineData = [];   // [{ timestamp, devices: [...]}, ...]
    this.animationId = null;
  }

  async loadRange(start, end) {
    this.startTime = start;
    this.endTime = end;
    this.timelineData = await this.dataService.fetchHistory(start, end);
    this.currentTime = start;
    this._emit('loaded', { points: this.timelineData.length });
  }

  play() {
    if (!this.timelineData.length) return;
    this.state = 'playing';
    this.lastFrameTime = performance.now();
    this._playbackLoop();
  }

  pause() {
    this.state = 'paused';
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  stop() {
    this.state = 'stopped';
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.currentTime = this.startTime;
    this._emit('stopped');
  }

  setSpeed(speed) { this.speed = speed; }

  seekTo(timestamp) {
    this.currentTime = new Date(timestamp);
    this._applySnapshot(this.currentTime);
    this._emit('seek', { time: this.currentTime });
  }

  _playbackLoop() {
    if (this.state !== 'playing') return;

    const now = performance.now();
    const frameDelta = (now - this.lastFrameTime) * this.speed;
    this.lastFrameTime = now;

    this.currentTime = new Date(this.currentTime.getTime() + frameDelta);

    if (this.currentTime >= this.endTime) {
      this.currentTime = this.endTime;
      this.pause();
      this._emit('finished');
      return;
    }

    this._applySnapshot(this.currentTime);
    this._emit('progress', {
      time: this.currentTime,
      progress: (this.currentTime - this.startTime) / (this.endTime - this.startTime)
    });

    this.animationId = requestAnimationFrame(() => this._playbackLoop());
  }

  _applySnapshot(timestamp) {
    const point = this.timelineData.find(d => {
      return Math.abs(d.timestamp - timestamp) < 1000;
    });
    if (!point) return;

    point.devices.forEach(device => {
      this.deviceController.applyState(device.deviceId, device);
    });
  }

  _emit(event, data) {
    if (this.onEvent) this.onEvent(event, data);
  }
}

export { HistoryPlaybackController };
```

---

## 七、MQTT数据订阅类

```javascript
/**
 * MQTT 5.0 数据订阅服务
 * 支持自动重连、订阅管理、QoS分级、遗嘱消息
 */
import mqtt from 'mqtt';

class MQTTDataService {
  constructor() {
    this.client = null;
    this.subscriptions = new Map(); // topic → [{callback, qos}]
    this.dataCache = new Map();     // deviceId → {data, ts}
    this.reconnectCount = 0;
    this.maxReconnect = 10;
  }

  connect(brokerUrl, options = {}) {
    const defaults = {
      clientId: `ess-twin-${Date.now()}`,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 3000,
      connectTimeout: 15000,
      will: {
        topic: 'ess/system/status',
        payload: JSON.stringify({ clientId: options.clientId, status: 'offline' }),
        qos: 1, retain: true,
      }
    };

    this.client = mqtt.connect(brokerUrl, { ...defaults, ...options });

    this.client.on('connect', () => {
      console.log('[MQTT] Connected');
      this.reconnectCount = 0;
      this.client.publish('ess/system/status', JSON.stringify({ status: 'online' }), { qos: 1, retain: true });
      this._resubscribeAll();
    });

    this.client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        const subs = this.subscriptions.get(topic) || [];
        subs.forEach(({ callback }) => callback(data, topic));
      } catch (e) {
        console.error('[MQTT] Parse:', e);
      }
    });

    this.client.on('error', (err) => console.error('[MQTT] Error:', err));

    this.client.on('reconnect', () => {
      this.reconnectCount++;
      if (this.reconnectCount >= this.maxReconnect) {
        console.error('[MQTT] Max reconnect reached, fallback...');
        this.client.end();
      }
    });

    this.client.on('offline', () => console.warn('[MQTT] Offline'));
  }

  subscribe(topic, callback, qos = 1) {
    if (this.client?.connected) {
      this.client.subscribe(topic, { qos }, (err) => {
        if (err) console.error(`[MQTT] Subscribe failed: ${topic}`, err);
      });
    }
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
    this.subscriptions.get(topic).push({ callback, qos });
  }

  subscribeDeviceTelemetry(deviceId, callback) {
    this.subscribe(`ess/${deviceId}/telemetry`, (data) => {
      this.dataCache.set(deviceId, { ...data, _ts: Date.now() });
      callback(data);
    }, 0); // QoS 0 for realtime
  }

  subscribeAllAlerts(callback) {
    this.subscribe('ess/+/alerts', callback, 1);
  }

  publishControl(deviceId, command, params) {
    const topic = `ess/${deviceId}/control`;
    const payload = JSON.stringify({ command, params, ts: Date.now() });
    this.client.publish(topic, payload, { qos: 2 });
  }

  getCached(deviceId) {
    return this.dataCache.get(deviceId);
  }

  _resubscribeAll() {
    this.subscriptions.forEach((callbacks, topic) => {
      this.client.subscribe(topic, { qos: 1 });
    });
  }

  disconnect() {
    if (this.client) this.client.end(true);
  }
}

export { MQTTDataService };
```

---

## 八、OPC-UA工业数据接入 (C#)

```csharp
using Opc.Ua;
using Opc.Ua.Client;
using System.Threading.Tasks;

/// <summary>
/// OPC-UA工业现场数据采集器
/// 用于从PCS/BMS等工业设备直接采集数据, 推送至MQTT Broker供数字孪生系统使用
/// </summary>
public class OPCUADataConnector
{
    private Session _session;
    private readonly string _endpointUrl;
    private readonly int _publishingIntervalMs;

    public OPCUADataConnector(string endpointUrl, int publishingIntervalMs = 1000)
    {
        _endpointUrl = endpointUrl;
        _publishingIntervalMs = publishingIntervalMs;
    }

    public async Task ConnectAsync()
    {
        var config = new ApplicationConfiguration()
        {
            ApplicationName = "ESS Digital Twin Collector",
            ApplicationUri = "urn:ess:twin:collector",
            ApplicationType = ApplicationType.Client,
            SecurityConfiguration = new SecurityConfiguration
            {
                ApplicationCertificate = new CertificateIdentifier(),
                AutoAcceptUntrustedCertificates = true
            }
        };
        await config.Validate(ApplicationType.Client);

        var endpoint = CoreClientUtils.SelectEndpoint(_endpointUrl, false, 15000);
        var configuredEndpoint = new ConfiguredEndpoint(null, endpoint, EndpointConfiguration.Create(config));

        _session = await Session.Create(
            config, configuredEndpoint, false, "ESS Digital Twin Collector",
            60000, new UserIdentity(new AnonymousIdentityToken()), null);
    }

    /// <summary>
    /// 订阅单个节点的数据变化
    /// </summary>
    public void SubscribeNode(string nodeId, Action<string, object> onDataChange)
    {
        var subscription = new Subscription(_session.DefaultSubscription)
        {
            PublishingInterval = _publishingIntervalMs
        };

        var monitoredItem = new MonitoredItem(subscription.DefaultItem)
        {
            StartNodeId = nodeId,
            MonitoringMode = MonitoringMode.Reporting,
            SamplingInterval = _publishingIntervalMs,
            QueueSize = 10,
            DiscardOldest = true
        };

        monitoredItem.Notification += (item, e) =>
        {
            foreach (var value in item.DequeueValues())
            {
                if (value.Value != null)
                {
                    onDataChange?.Invoke(nodeId, value.Value);
                }
            }
        };

        subscription.AddItem(monitoredItem);
        _session.AddSubscription(subscription);
        subscription.Create();
    }

    /// <summary>
    /// 批量订阅PCS遥测节点
    /// </summary>
    public void SubscribePCSNodes(string pcsId, Action<string, object> onDataChange)
    {
        var nodeMap = new Dictionary<string, string>
        {
            ["ActivePower"] = $"ns=2;s={pcsId}.Power.Active",
            ["ReactivePower"] = $"ns=2;s={pcsId}.Power.Reactive",
            ["DCVoltage"] = $"ns=2;s={pcsId}.DC.Voltage",
            ["DCCurrent"] = $"ns=2;s={pcsId}.DC.Current",
            ["State"] = $"ns=2;s={pcsId}.Status.State",
            ["Temperature"] = $"ns=2;s={pcsId}.Temp.Max",
        };

        foreach (var kvp in nodeMap)
        {
            SubscribeNode(kvp.Value, (node, value) =>
            {
                onDataChange?.Invoke($"{pcsId}.{kvp.Key}", value);
            });
        }
    }

    public void Disconnect()
    {
        _session?.Close();
        _session?.Dispose();
    }
}
```

---

## 九、IndexedDB离线缓存

```javascript
/**
 * IndexedDB本地缓存管理器
 * 支持: 设备状态/历史数据/模型元数据 离线访问
 */
class LocalDataCache {
  constructor(dbName = 'ess_digital_twin') {
    this.dbName = dbName;
    this.db = null;
    this.version = 2;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Store 1: 设备最新状态
        if (!db.objectStoreNames.contains('device_states')) {
          db.createObjectStore('device_states', { keyPath: 'deviceId' });
        }

        // Store 2: 遥测历史 (时间索引)
        if (!db.objectStoreNames.contains('telemetry_history')) {
          const store = db.createObjectStore('telemetry_history',
            { keyPath: 'id', autoIncrement: true });
          store.createIndex('device_time',
            ['deviceId', 'timestamp'], { unique: false });
        }

        // Store 3: 3D模型文件缓存 (Blob)
        if (!db.objectStoreNames.contains('model_cache')) {
          db.createObjectStore('model_cache', { keyPath: 'modelPath' });
        }

        // Store 4: 用户配置
        if (!db.objectStoreNames.contains('user_config')) {
          db.createObjectStore('user_config', { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        console.log('[Cache] IndexedDB ready');
        resolve();
      };

      req.onerror = (e) => {
        console.error('[Cache] IndexedDB failed:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /** 缓存设备最新状态 */
  async setDeviceState(deviceId, state) {
    const tx = this.db.transaction('device_states', 'readwrite');
    await tx.objectStore('device_states').put({
      deviceId, state, updatedAt: Date.now()
    });
  }

  /** 读取设备缓存状态 */
  async getDeviceState(deviceId) {
    const tx = this.db.transaction('device_states', 'readonly');
    return new Promise((resolve) => {
      const req = tx.objectStore('device_states').get(deviceId);
      req.onsuccess = () => resolve(req.result?.state || null);
    });
  }

  /** 追加遥测历史 */
  async appendTelemetry(deviceId, dataPoints) {
    const tx = this.db.transaction('telemetry_history', 'readwrite');
    const store = tx.objectStore('telemetry_history');
    for (const point of dataPoints) {
      await store.put({ deviceId, ...point });
    }
  }

  /** 查询时间范围遥测 */
  async queryTelemetry(deviceId, startTs, endTs) {
    const tx = this.db.transaction('telemetry_history', 'readonly');
    const store = tx.objectStore('telemetry_history');
    const index = store.index('device_time');
    const range = IDBKeyRange.bound(
      [deviceId, startTs], [deviceId, endTs]
    );
    return new Promise((resolve) => {
      const results = [];
      index.openCursor(range).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { results.push(cursor.value); cursor.continue(); }
        else resolve(results);
      };
    });
  }

  /** 缓存3D模型文件 (大的glb文件离线可用) */
  async cacheModelFile(modelPath, blob) {
    const tx = this.db.transaction('model_cache', 'readwrite');
    await tx.objectStore('model_cache').put({ modelPath, blob, cachedAt: Date.now() });
  }

  async getModelFile(modelPath) {
    const tx = this.db.transaction('model_cache', 'readonly');
    return new Promise((resolve) => {
      const req = tx.objectStore('model_cache').get(modelPath);
      req.onsuccess = () => resolve(req.result?.blob || null);
    });
  }

  /** 清理N天前的旧数据 */
  async cleanup(daysToKeep = 30) {
    const cutoff = Date.now() - daysToKeep * 86400000;
    const tx = this.db.transaction('telemetry_history', 'readwrite');
    const store = tx.objectStore('telemetry_history');
    const index = store.index('device_time');
    // 游标遍历删除旧数据
    index.openCursor(IDBKeyRange.upperBound(['', cutoff])).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
  }
}

export { LocalDataCache };
```

---

## 十、VR控制器交互

```javascript
/**
 * VR交互控制器
 * 支持: 手柄射线检测→设备悬停高亮→点击显示数据面板→手柄震动反馈
 */
class VRInteractionController {
  constructor(scene, cameraRig, dataService) {
    this.scene = scene;
    this.cameraRig = cameraRig;
    this.dataService = dataService;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 100;
    this.interactiveDevices = [];  // 可交互设备mesh列表
    this.infoPanels = new Map();   // 实时数据面板
    this.hoveredDevice = null;
  }

  /** 注册为可交互设备 */
  addDevice(deviceId, mesh, position) {
    mesh.userData = { deviceId, position: position.clone() };
    this.interactiveDevices.push(mesh);
  }

  /** 每帧更新 (在render loop中调用) */
  update(rightHandController) {
    if (!rightHandController) return;

    // 从手柄发射射线
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(rightHandController.quaternion);
    this.raycaster.set(rightHandController.position, direction);

    const hits = this.raycaster.intersectObjects(this.interactiveDevices, true);
    if (hits.length > 0) {
      const mesh = hits[0].object;
      const deviceId = this._findDeviceId(mesh);
      if (deviceId) {
        this.onHover(deviceId, hits[0].point);
      }
    } else {
      this.onHoverEnd();
    }
  }

  onHover(deviceId, point) {
    if (this.hoveredDevice === deviceId) return;
    this.onHoverEnd();
    this.hoveredDevice = deviceId;

    // 高亮设备 (外发光轮廓)
    const device = this._findDeviceMesh(deviceId);
    if (device) {
      const outline = device.clone();
      outline.material = new THREE.MeshBasicMaterial({
        color: 0x00ff88, side: THREE.BackSide,
        transparent: true, opacity: 0.5
      });
      outline.scale.multiplyScalar(1.05);
      device.add(outline);
      device.userData._outline = outline;
    }

    // 显示数据面板
    this.showDataPanel(deviceId, point);
  }

  onHoverEnd() {
    if (!this.hoveredDevice) return;

    // 移除高亮
    const device = this._findDeviceMesh(this.hoveredDevice);
    if (device?.userData._outline) {
      device.remove(device.userData._outline);
      device.userData._outline = null;
    }

    // 隐藏面板
    const panel = this.infoPanels.get(this.hoveredDevice);
    if (panel) panel.visible = false;

    this.hoveredDevice = null;
  }

  /** 手柄点击设备 (使用A-Frame或WebXR的selectstart事件) */
  onSelect(rightHandController) {
    if (!this.hoveredDevice) return;

    const deviceId = this.hoveredDevice;
    const device = this._findDeviceMesh(deviceId);

    // 聚焦到设备 (相机飞行动画)
    const box = new THREE.Box3().setFromObject(device);
    const center = box.getCenter(new THREE.Vector3());
    const camPos = center.clone().add(new THREE.Vector3(5, 3, 5));
    this._animateCameraTo(camPos, center, 1000);

    // 显示详情面板
    const detail = this.infoPanels.get(deviceId);
    if (detail) {
      detail.scale.set(1, 1, 1);
      detail.visible = true;
    }

    // 手柄震动反馈 (WebXR haptics)
    if (rightHandController.gamepad?.hapticActuators) {
      rightHandController.gamepad.hapticActuators[0]?.pulse(0.8, 100);
    }
  }

  /** 创建浮空数据面板 (Canvas纹理贴到Plane上) */
  showDataPanel(deviceId, atPosition) {
    let panel = this.infoPanels.get(deviceId);
    if (!panel) {
      panel = this._createDataPanel();
      this.scene.add(panel);
      this.infoPanels.set(deviceId, panel);
    }

    panel.position.copy(atPosition).add(new THREE.Vector3(0, 1.5, 0));
    // 面板始终面向相机 (billboard)
    if (this.cameraRig?.camera) {
      panel.lookAt(this.cameraRig.camera.position);
    }
    panel.visible = true;

    // 更新面板文本
    const data = this.dataService.getCached(deviceId);
    this._updatePanelTexture(panel, deviceId, data);
  }

  _createDataPanel() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.9 });
    const geo = new THREE.PlaneGeometry(2, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { canvas, texture };
    return mesh;
  }

  _updatePanelTexture(panel, deviceId, data) {
    const ctx = panel.userData.canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 256);
    ctx.fillStyle = '#0a1628'; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#00ff88'; ctx.strokeRect(5, 5, 502, 246);

    ctx.font = 'bold 20px Arial'; ctx.fillStyle = '#00ff88';
    ctx.fillText(deviceId, 20, 35);

    let y = 70;
    ctx.font = '16px Arial'; ctx.fillStyle = '#ffffff';
    for (const [key, val] of Object.entries(data || {}).slice(0, 6)) {
      ctx.fillText(`${key}: ${val}`, 20, y);
      y += 30;
    }
    panel.userData.texture.needsUpdate = true;
  }

  _findDeviceId(mesh) {
    while (mesh) {
      if (mesh.userData?.deviceId) return mesh.userData.deviceId;
      mesh = mesh.parent;
    }
    return null;
  }

  _findDeviceMesh(deviceId) {
    return this.interactiveDevices.find(d => d.userData.deviceId === deviceId);
  }

  _animateCameraTo(targetPos, targetLookAt, duration) {
    const startPos = this.cameraRig.position.clone();
    const startLookAt = this.scene.camera?.position?.clone() || startPos;
    const startTime = performance.now();

    const step = () => {
      const t = Math.min((performance.now() - startTime) / duration, 1);
      const ease = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      this.cameraRig.position.lerpVectors(startPos, targetPos, ease);
      this.scene.camera?.lookAt(startLookAt.clone().lerp(targetLookAt, ease));
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }
}

export { VRInteractionController };
```

---

## 十一、CrossSection剖面视图 (clipPlanes)

```javascript
/**
 * 3D场景剖面视图
 * 使用THREE.Plane裁剪平面显示设备内部结构
 */
class CrossSectionManager {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.clipPlanes = [];
    this.active = false;
    // 启用渲染器裁剪
    this.renderer.localClippingEnabled = true;
  }

  /**
   * 创建沿指定轴/位置的剖面
   * @param {string} axis - 'x' | 'y' | 'z'
   * @param {number} position - 剖面位置(世界坐标)
   * @param {boolean} invert - 是否反向裁剪
   */
  createSection(axis, position, invert = false) {
    this.clear();

    let normal;
    switch (axis) {
      case 'x': normal = new THREE.Vector3(invert ? 1 : -1, 0, 0); break;
      case 'y': normal = new THREE.Vector3(0, invert ? 1 : -1, 0); break;
      case 'z': default: normal = new THREE.Vector3(0, 0, invert ? 1 : -1);
    }

    const plane = new THREE.Plane(normal, position);
    this.clipPlanes = [plane];
    this._applyToAll();
    this.active = true;
  }

  /** 双剖面 (如查看中间段) */
  createDoubleSection(axis, pos1, pos2) {
    this.clear();

    const n1 = new THREE.Vector3();
    const n2 = new THREE.Vector3();
    switch (axis) {
      case 'x': n1.set(-1, 0, 0); n2.set(1, 0, 0); break;
      case 'y': n1.set(0, -1, 0); n2.set(0, 1, 0); break;
      case 'z': default: n1.set(0, 0, -1); n2.set(0, 0, 1);
    }

    this.clipPlanes = [
      new THREE.Plane(n1, pos1),
      new THREE.Plane(n2, -pos2)  // 反向
    ];
    this._applyToAll();
    this.active = true;
  }

  /** 盒子剖面 (六面裁剪) */
  createBoxSection(boxMin, boxMax) {
    this.clear();
    this.clipPlanes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), boxMin.x),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -boxMax.x),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), boxMin.y),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -boxMax.y),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), boxMin.z),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -boxMax.z),
    ];
    this._applyToAll();
    this.active = true;
  }

  /** 清除所有剖面 */
  clear() {
    this.clipPlanes = [];
    this.scene.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.clippingPlanes = [];
        child.material.clipShadows = false;
        child.material.needsUpdate = true;
      }
    });
    this.active = false;
  }

  /** 沿法线方向滑动剖面位置 */
  slideSection(axis, delta) {
    if (!this.active) return;
    this.clipPlanes.forEach(plane => {
      if ((axis === 'x' && plane.normal.x !== 0) ||
          (axis === 'y' && plane.normal.y !== 0) ||
          (axis === 'z' && plane.normal.z !== 0)) {
        plane.constant += delta;
      }
    });
  }

  _applyToAll() {
    this.scene.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.clippingPlanes = this.clipPlanes;
        child.material.clipShadows = true;
        child.material.needsUpdate = true;
      }
    });
  }
}

export { CrossSectionManager };
```

---

## 十二、35项交付检查表

| 序号 | 检查项 | 验收标准 | 状态 |
|------|--------|---------|------|
| 1 | 全站3D模型 | 所有14类设备模型完成, 格式glTF/GLB | ☐ |
| 2 | LOD分级 | 每种设备LOD0/LOD1/LOD2三精度 | ☐ |
| 3 | 模型命名 | deviceId/类型/版本号统一 | ☐ |
| 4 | GIS坐标转换 | 经纬度→3D世界坐标误差<0.5m | ☐ |
| 5 | 场景完整 | 建筑/道路/绿化/围栏完成 | ☐ |
| 6 | SV电气图 | 一次接线图SVG完整, 逐设备对应 | ☐ |
| 7 | 导线动画 | 实时功率→粒子流动方向/速度正确 | ☐ |
| 8 | 设备状态颜色 | PCS/BMS运行/待机/告警/离线颜色正确 | ☐ |
| 9 | SOC可视化 | 电池舱SOC 0~100%颜色梯度正确 | ☐ |
| 10 | 温度热图 | 电池模组温度→颜色映射正确 | ☐ |
| 11 | 告警闪烁 | 故障设备红色脉冲闪烁 | ☐ |
| 12 | MQTT连接 | 自动连接+订阅, 断线重连 | ☐ |
| 13 | 数据刷新率 | 遥测≥1Hz (1s刷新) | ☐ |
| 14 | 设备映射 | device_id ↔ 3D mesh绑定 | ☐ |
| 15 | IndexedDB缓存 | 离线状态下可查看最近数据 | ☐ |
| 16 | 历史回放 | 支持时间段选取+播放/暂停/倍速 | ☐ |
| 17 | 回放动画 | 回放时流动画/设备状态同步 | ☐ |
| 18 | Web首屏加载 | 首屏<5s (含Gzip+CDN) | ☐ |
| 19 | Web端帧率 | 正常视图≥30fps | ☐ |
| 20 | 电气图联动 | 点击SVG设备→3D视图跳转 | ☐ |
| 21 | 3D视角切换 | 预设视角(总览/正面/侧面/顶部)动画 | ☐ |
| 22 | 剖面视图 | 设备内部结构可见(clipPlanes) | ☐ |
| 23 | VR模式入口 | WebXR按钮可见, 可进入沉浸模式 | ☐ |
| 24 | VR帧率 | VR模式≥72fps (Quest2/PC VR) | ☐ |
| 25 | VR视角切换 | VR中预设视角切换流畅 | ☐ |
| 26 | VR设备交互 | 手柄指向→高亮+数据面板显示 | ☐ |
| 27 | VR告警反馈 | 告警设备红色高亮+手柄震动 | ☐ |
| 28 | VR移动控制 | 第一人称漫游(摇杆/传送)流畅 | ☐ |
| 29 | 数据面板 | 实时数据Canvas贴图正确 | ☐ |
| 30 | 功率流动画 | 动态粒子流方向/颜色/速度正确 | ☐ |
| 31 | 权限验证 | 远程控制指令需权限校验 | ☐ |
| 32 | 性能监控 | FPS/内存实时显示(调试工具) | ☐ |
| 33 | 操作日志 | 所有控制操作记录+审计 | ☐ |
| 34 | 技术文档 | 架构文档+API文档+运维手册 | ☐ |
| 35 | 培训交付 | 运维人员至少2人完成VR操作培训 | ☐ |

### 模型交付格式要求

```
/models
├── ess_scene_lod0.glb        # 场站总览(高精)
├── ess_scene_lod2.glb        # GIS地图用(低精)
├── pcs/
│   ├── PCS_lod0.glb          # PCS高精(含风扇动画)
│   ├── PCS_lod1.glb          # PCS中精
│   └── PCS_lod2.glb          # PCS低精
├── battery/
│   ├── BATT_lod0.glb         # 电池舱高精(含液冷管路)
│   ├── BATT_lod1.glb
│   └── BATT_lod2.glb
├── transformer/
│   └── TRF.glb               # 变压器(单精度)
├── switchgear/
│   ├── SWG_lod0.glb          # 并网柜
│   └── SWG_lod2.glb
├── building/
│   ├── BLD_POWER.glb         # 配电房
│   └── BLD_OFFICE.glb        # 综合楼
└── metadata/
    ├── device_metadata.json  # 设备ID/位置/属性
    └── scene_config.json     # 光照/雾效/阴影
```

**模型规范：**
- 格式: glTF 2.0 / GLB Binary (Draco压缩)
- 单位: 1 unit = 1 meter, Y轴向上
- 材质: PBR (metalness/roughness), 2048² max
- 三角面: LOD0<50K / LOD1<20K / LOD2<5K
- 单文件: <500KB (Draco), <5MB (未压缩)

---

> **文件版本**: v2.0 (DeepSeek增强版)
> **创建日期**: 2026-05-31
> **核心增强**:
> 1. 四层架构(展示→通信→数据→模型)完整设计
> 2. 14类设备3D模型清单含可动元素+LOD三角面预算
> 3. LOD管理JS类(完整实现) + GIS墨卡托映射代码
> 4. 功率流粒子动画系统 + 历史回放控制器
> 5. MQTT 5.0订阅类 + OPC-UA C#采集器
> 6. IndexedDB四Store离线缓存(状态/遥测/模型/配置)
> 7. VR交互(悬停高亮+数据面板+手柄震动+相机飞行)
> 8. CrossSection clipPlanes剖面(单面/双面/盒子)
> 9. 35项交付检查表+模型目录规范
