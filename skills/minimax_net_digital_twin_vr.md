# 储能电站数字孪生VR虚拟现实系统Skill

## 概述与定位

本Skill指导储能电站数字孪生虚拟现实系统的设计与实现，涵盖从2D电气图到3D场景建模、实时数据绑定、动态信号流动画、VR漫游模式的全链路技术方案。系统支持Web端、PC端、VR头盔多端展示，实现物理场站与数字模型的实时同步。

**核心目标**：
- 构建与真实储能场站1:1对应的3D数字孪生模型
- 实现实时遥测数据与3D模型属性的动态绑定
- 提供沉浸式VR漫游体验，支持第一人称漫游和设备交互
- 构建多端可视化大屏，支持2D电气图与3D场景联动

---

## 一、数字孪生系统架构

### 1.1 整体架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                      可视化展示层                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Web大屏  │  │ PC客户端 │  │ VR头盔   │  │ 移动端H5    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
└───────┼────────────┼──────────────┼───────────────┼────────┘
        │            │              │               │
┌───────┴────────────┴──────────────┴───────────────┴────────┐
│                      实时通信层                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │        WebSocket / MQTT Broker / OPC-UA Gateway        ││
│  └─────────────────────────────────────────────────────────┘│
└───────┬────────────┬──────────────┬───────────────┬────────┘
        │            │              │               │
┌───────┴────────────┴──────────────┴───────────────┴────────┐
│                      数据处理层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ 数据采集 │  │ 数据缓存 │  │ 数据转发 │  │ 告警处理     │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
└───────┼────────────┼──────────────┼───────────────┼────────┘
        │            │              │               │
┌───────┴────────────┴──────────────┴───────────────┴────────┐
│                      模型管理层                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │    3D数字孪生模型（glTF/GLB格式）+ 设备元数据管理       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
        │
┌───────┴─────────────────────────────────────────────────────┐
│                      物理设备层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ PCS储能 │  │ BMS电池  │  │ 变压器   │  │ 电表/断路器 │ │
│  │ 变流器  │  │ 管理系统  │  │         │  │             │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈选型

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **3D建模** | Blender 3.6+ / 3ds Max 2024 | 设备模型创建，导出glTF格式 |
| **Web渲染** | Three.js r160+ / Babylon.js 6.0 | Web端3D渲染引擎 |
| **VR引擎** | A-Frame 1.5+ / Babylon.js WebXR | WebVR/WebXR支持 |
| **Native VR** | Unity 2023 + XR Interaction Toolkit | PC VR头盔（Quest/Pico/HP Reverb）|
| **实时通信** | MQTT.js / Socket.IO | 浏览器端实时数据订阅 |
| **工业协议** | OPC-UA .NET SDK | 工业现场数据采集 |
| **数据格式** | glTF 2.0 / GLB | 3D模型轻量化格式 |
| **状态管理** | Pinia（Vue3）/ Redux | 前端状态管理 |
| **构建工具** | Vite 5.0 | 前端构建与热更新 |

### 1.3 数据流向设计

```
物理设备 ──MQTT/OPC-UA──> 采集网关 ──WebSocket──> 数据中台 ──MQTT──> 前端
                                     │
                                     ▼
                              时序数据库（InfluxDB）
                                     │
                                     ▼
                              历史数据回放服务
```

**关键数据流**：
1. 实时遥测：设备 → 采集网关 → MQTT Broker → 前端WebSocket → 3D模型更新
2. 告警推送：设备告警 → 采集网关 → MQTT Broker → 前端即时渲染（无需轮询）
3. 历史回放：前端请求 → API网关 → InfluxDB查询 → 数据回放控制器 → 场景重放

---

## 二、场站3D场景建模

### 2.1 设备模型清单

| 设备类型 | 模型命名规范 | 关键元素 | LOD策略 |
|---------|------------|---------|--------|
| PCS舱体 | `PCS_[编号]_[版本]` | 舱体外壳、散热风扇组、功率模块、LED状态灯 | LOD0:风扇动画/LOD2:简化舱体 |
| 电池舱体 | `BATT_[编号]_[版本]` | 舱体、液冷管路（BMS管控）、电池架、舱门 | LOD0:管路可视化/LOD2:舱体 |
| 变压器 | `TRANS_[编号]_[版本]` | 本体、油枕、套管、接地标识 | 全LOD相同 |
| 并网柜 | `SWG_[编号]_[版本]` | 柜体、断路器把手、手车位置指示 | LOD0:可操作/LOD2:静态 |
| 电缆沟 | `CABLE_[区域]_[版本]` | 沟盖板、穿管、电缆标识 | 仅LOD2显示 |
| 光伏支架 | `PV_[区号]_[版本]` | 支架、组件、汇流箱 | 按需LOD |
| 场站建筑 | `BLD_[名称]_[版本]` | 配电房、综合楼、消防泵房 | 仅LOD2 |
| 围栏/围墙 | `FENCE_[段号]_[版本]` | 围栏、门禁、摄像头 | 全LOD相同 |

### 2.2 模型层级结构（LOD）

```javascript
// Three.js LOD实现示例
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class ESSLODManager {
  constructor(scene) {
    this.scene = scene;
    this.lodLevels = {
      LOD0_VR: 0,      // VR模式：高精度，≥90fps
      LOD1_DETAIL: 1,  // Web详细：中等精度
      LOD2_OVERVIEW: 2  // GIS总览：低精度，简化外形
    };
    this.modelCache = new Map();
  }

  async loadDeviceModel(deviceId, deviceType, targetLOD) {
    const cacheKey = `${deviceType}_${targetLOD}`;
    
    // 检查缓存
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey).clone();
    }

    // 根据LOD级别加载不同精度的模型
    const modelPath = this.getModelPath(deviceType, targetLOD);
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(modelPath);
    
    const model = gltf.scene;
    
    // 模型后处理
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // 启用实例化渲染优化
        if (child.material) {
          child.material.needsUpdate = true;
        }
      }
    });

    // 缓存模型
    this.modelCache.set(cacheKey, model);
    return model.clone();
  }

  getModelPath(deviceType, lodLevel) {
    const basePath = '/models/ess/';
    const lodSuffix = ['_lod0', '_lod1', '_lod2'][lodLevel];
    return `${basePath}${deviceType}${lodSuffix}.glb`;
  }

  // 动态切换LOD级别
  updateLODForCamera(camera) {
    // 根据相机距离动态调整可见模型的LOD级别
    this.scene.traverse((child) => {
      if (child.userData.deviceId && child.isLOD) {
        // 计算相机到对象的距离
        const distance = camera.position.distanceTo(child.position);
        const newLOD = this.calculateLODLevel(distance);
        child.setCurrentLevel(newLOD);
      }
    });
  }

  calculateLODLevel(distance) {
    if (distance < 50) return this.lodLevels.LOD0_VR;      // 近距离：VR精度
    if (distance < 200) return this.lodLevels.LOD1_DETAIL; // 中距离：Web详细
    return this.lodLevels.LOD2_OVERVIEW;                    // 远距离：总览
  }
}
```

### 2.3 坐标系规范

**场站GIS坐标 → 3D世界坐标映射**：

```javascript
// 坐标转换配置
const COORDINATE_CONFIG = {
  // 场站中心点GIS坐标（度）
  centerGis: { lat: 31.2304, lon: 121.4737 },
  
  // 3D世界原点对应GIS坐标
  originGis: { lat: 31.2304, lon: 121.4737 },
  
  // 比例尺：1米 = 多少3D单位
  scale: 1.0,
  
  // 朝向：正北为Y轴正方向
  northDirection: new THREE.Vector3(0, 0, 1),
  
  // 高度基准：WGS84椭球高 → 85高程
  elevationBase: 0.0
};

// GIS坐标转3D世界坐标
function gisToWorld(gisLat, gisLon, elevation = 0) {
  const latDiff = gisLat - COORDINATE_CONFIG.originGis.lat;
  const lonDiff = gisLon - COORDINATE_CONFIG.originGis.lon;
  
  // 简单墨卡托投影（适用于小范围）
  const meterPerLatDegree = 111320;  // 纬度每度米数
  const meterPerLonDegree = 111320 * Math.cos(COORDINATE_CONFIG.originGis.lat * Math.PI / 180);
  
  const x = lonDiff * meterPerLonDegree;
  const z = latDiff * meterPerLatDegree;
  const y = elevation - COORDINATE_CONFIG.elevationBase;
  
  return new THREE.Vector3(x * COORDINATE_CONFIG.scale, y * COORDINATE_CONFIG.scale, z * COORDINATE_CONFIG.scale);
}

// 3D世界坐标转GIS坐标
function worldToGis(x, y, z) {
  const meterPerLatDegree = 111320;
  const meterPerLonDegree = 111320 * Math.cos(COORDINATE_CONFIG.originGis.lat * Math.PI / 180);
  
  const lat = COORDINATE_CONFIG.originGis.lat + (z / meterPerLatDegree);
  const lon = COORDINATE_CONFIG.originGis.lon + (x / meterPerLonDegree);
  const elevation = y + COORDINATE_CONFIG.elevationBase;
  
  return { lat, lon, elevation };
}
```

### 2.4 模型命名与元数据规范

```json
// 设备模型元数据示例 (device_metadata.json)
{
  "devices": [
    {
      "deviceId": "PCS_001",
      "deviceType": "pcs",
      "modelPath": "/models/ess/PCS_001_lod0.glb",
      "gisLocation": { "lat": 31.2305, "lon": 121.4738, "elevation": 15.2 },
      "worldPosition": { "x": 50, "y": 0, "z": 100 },
      "rotation": { "y": 45 },
      "parentId": "AREA_A",
      "properties": {
        "ratedPower": 500000,
        "ratedVoltage": 1500,
        "manufacturer": "华为",
        "model": "PCS-5000"
      }
    }
  ]
}
```

---

## 三、动态信号流动画

### 3.1 电气接线动态显示

**功率箭头动画系统**：

```javascript
// 功率流动画控制器
class PowerFlowAnimator {
  constructor(scene) {
    this.scene = scene;
    this.flowArrows = new Map();
    this.animationQueue = [];
  }

  // 创建功率箭头
  createFlowArrow(startPoint, endPoint, powerKW, direction) {
    // 创建箭头几何体
    const arrowGroup = new THREE.Group();
    
    // 箭头主体（管状）
    const distance = startPoint.distanceTo(endPoint);
    const tubeGeometry = new THREE.TubeGeometry(
      new THREE.LineCurve3(startPoint, endPoint),
      32,
      0.15,  // 半径
      8,
      false
    );
    
    // 有功/无功颜色区分
    const color = direction === 'active' 
      ? new THREE.Color(0x00ff88)  // 绿色：有功
      : new THREE.Color(0x00aaff); // 蓝色：无功
    
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8
    });
    
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    arrowGroup.add(tube);
    
    // 流动粒子效果
    const particleCount = Math.floor(distance / 2);
    const particles = this.createFlowParticles(particleCount, color);
    arrowGroup.add(particles);
    
    // 设置动画
    this.setupFlowAnimation(arrowGroup, startPoint, endPoint, powerKW);
    
    this.scene.add(arrowGroup);
    this.flowArrows.set(`${startPoint.x}_${endPoint.x}`, arrowGroup);
    
    return arrowGroup;
  }

  createFlowParticles(count, color) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      sizes[i] = Math.random() * 0.5 + 0.5;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.3,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    
    return new THREE.Points(geometry, material);
  }

  setupFlowAnimation(arrowGroup, start, end, powerKW) {
    // 根据功率大小调整动画速度
    const speed = Math.abs(powerKW) / 1000;  // 功率越大，流动越快
    const particleSystem = arrowGroup.children[1];
    const positions = particleSystem.geometry.attributes.position.array;
    
    const animate = () => {
      const totalDistance = start.distanceTo(end);
      
      for (let i = 0; i < positions.length / 3; i++) {
        // 粒子沿路径移动
        const progress = (Date.now() * speed * 0.001 + i * 0.1) % 1.0;
        const point = start.clone().lerp(end, progress);
        
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y + Math.sin(progress * Math.PI) * 0.5;  // 3D波动
        positions[i * 3 + 2] = point.z;
      }
      
      particleSystem.geometry.attributes.position.needsUpdate = true;
      requestAnimationFrame(animate);
    };
    
    animate();
  }

  // 更新箭头颜色（温度热图）
  updateCableTemperature(arrowId, temperatureCelsius) {
    const arrow = this.flowArrows.get(arrowId);
    if (!arrow) return;
    
    // 温度 → 颜色映射
    const minTemp = 20;
    const maxTemp = 80;
    const t = Math.max(0, Math.min(1, (temperatureCelsius - minTemp) / (maxTemp - minTemp)));
    
    // 蓝(20°) → 绿(50°) → 红(80°)
    const color = new THREE.Color();
    if (t < 0.5) {
      color.setRGB(0, t * 2, 1);
    } else {
      color.setRGB((t - 0.5) * 2, 1 - (t - 0.5) * 2, 0);
    }
    
    arrow.children[0].material.color = color;
  }

  // 充放电状态箭头方向
  updatePowerFlow(deviceId, powerKW) {
    // 正值：放电（箭头指向电网）
    // 负值：充电（箭头指向电池）
    const direction = powerKW >= 0 ? 'discharge' : 'charge';
    // 更新对应箭头方向...
  }
}
```

### 3.2 数据驱动的状态渲染

```javascript
// 设备状态渲染控制器
class DeviceStateRenderer {
  constructor(scene) {
    this.scene = scene;
    this.deviceMeshes = new Map();
    this.alertTimers = new Map();
  }

  // 注册设备模型
  registerDevice(deviceId, mesh) {
    this.deviceMeshes.set(deviceId, mesh);
    mesh.userData.deviceId = deviceId;
  }

  // 更新PCS运行状态
  updatePCSState(deviceId, state) {
    const mesh = this.deviceMeshes.get(deviceId);
    if (!mesh) return;

    // 移除之前的状态
    this.clearStateHighlight(mesh);

    switch (state) {
      case 'standby':
        // 待机：灰色发光
        this.setEmissive(mesh, new THREE.Color(0x666666));
        break;
        
      case 'grid_connected':
        // 并网：绿色发光
        this.setEmissive(mesh, new THREE.Color(0x00ff00));
        // 启动风扇旋转动画
        this.startFanAnimation(mesh);
        break;
        
      case 'fault':
        // 故障：红色闪烁
        this.setEmissive(mesh, new THREE.Color(0xff0000));
        this.startAlertBlink(mesh, 'red');
        break;
    }
  }

  setEmissive(mesh, color) {
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.emissive = color;
        child.material.emissiveIntensity = 0.5;
      }
    });
  }

  startFanAnimation(mesh) {
    mesh.traverse((child) => {
      if (child.name && child.name.includes('fan')) {
        // 创建旋转动画
        const animate = () => {
          child.rotation.y += 0.1;
          requestAnimationFrame(animate);
        };
        animate();
      }
    });
  }

  startAlertBlink(mesh, color) {
    let visible = true;
    const timer = setInterval(() => {
      visible = !visible;
      mesh.visible = visible;
    }, 500);
    this.alertTimers.set(mesh.uuid, timer);
  }

  // 更新BMS SOC填充动画
  updateBatterySOC(deviceId, socPercent) {
    const mesh = this.deviceMeshes.get(deviceId);
    if (!mesh) return;

    // SOC 0-100% 对应 蓝→绿→黄→红 渐变
    let color;
    if (socPercent < 20) {
      color = new THREE.Color().setHSL(0.6, 1, 0.5);  // 蓝色
    } else if (socPercent < 50) {
      color = new THREE.Color().setHSL(0.4, 1, 0.5);  // 绿色
    } else if (socPercent < 80) {
      color = new THREE.Color().setHSL(0.2, 1, 0.5);  // 黄色
    } else {
      color = new THREE.Color().setHSL(0, 1, 0.5);    // 红色
    }

    // 更新电池外壳颜色（模拟SOC填充）
    mesh.traverse((child) => {
      if (child.name && child.name.includes('battery_cover')) {
        child.material.color = color;
        child.material.opacity = 0.3 + socPercent * 0.007;  // SOC越高越不透明
      }
    });
  }

  // 更新电池温度热图
  updateBatteryTemperature(deviceId, temperatures) {
    const mesh = this.deviceMeshes.get(deviceId);
    if (!mesh) return;

    // 每个电池模组的温度单独渲染
    const modules = mesh.children.filter(c => c.name.includes('module_'));
    modules.forEach((module, index) => {
      const temp = temperatures[index] || 25;
      
      // 温度 → 颜色映射
      const t = Math.max(0, Math.min(1, (temp - 15) / 35));  // 15°C~50°C
      const color = new THREE.Color().setHSL((1 - t) * 0.65, 1, 0.5);
      
      module.material.emissive = color;
      module.material.emissiveIntensity = t * 0.8;
    });
  }

  clearStateHighlight(mesh) {
    // 停止闪烁定时器
    const timer = this.alertTimers.get(mesh.uuid);
    if (timer) {
      clearInterval(timer);
      this.alertTimers.delete(mesh.uuid);
    }
    
    // 恢复默认材质
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.emissive = new THREE.Color(0x000000);
        child.material.emissiveIntensity = 0;
      }
    });
  }
}
```

### 3.3 时间回放功能

```javascript
// 历史数据回放控制器
class HistoryPlaybackController {
  constructor(scene, dataService) {
    this.scene = scene;
    this.dataService = dataService;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    this.currentTime = null;
    this.timelineData = [];
  }

  // 加载时间段数据
  async loadTimeRange(startTime, endTime) {
    const data = await this.dataService.fetchHistoryData(startTime, endTime);
    this.timelineData = this.parseData(data);
  }

  // 开始回放
  play() {
    this.isPlaying = true;
    this.playbackLoop();
  }

  pause() {
    this.isPlaying = false;
  }

  // 设置回放速度
  setSpeed(speed) {
    this.playbackSpeed = speed;
  }

  // 跳转到指定时间点
  seekTo(timestamp) {
    this.currentTime = timestamp;
    this.applyStateAtTime(timestamp);
  }

  playbackLoop() {
    if (!this.isPlaying) return;

    // 计算每帧推进的时间
    const deltaMs = 16 * this.playbackSpeed;  // 假设60fps，每帧16ms
    this.currentTime = new Date(this.currentTime.getTime() + deltaMs);

    // 更新场景状态
    this.applyStateAtTime(this.currentTime);

    requestAnimationFrame(() => this.playbackLoop());
  }

  applyStateAtTime(timestamp) {
    // 找到最接近的数据点
    const dataPoint = this.findClosestDataPoint(timestamp);
    if (!dataPoint) return;

    // 应用到各个设备
    dataPoint.devices.forEach(device => {
      // 更新功率箭头
      if (device.powerFlow !== undefined) {
        this.updatePowerArrow(device.deviceId, device.powerFlow);
      }
      
      // 更新设备状态
      if (device.state !== undefined) {
        this.updateDeviceState(device.deviceId, device.state);
      }
      
      // 更新SOC
      if (device.soc !== undefined) {
        this.updateBatterySOC(device.deviceId, device.soc);
      }
    });
  }

  findClosestDataPoint(timestamp) {
    return this.timelineData.find(d => {
      const diff = Math.abs(d.timestamp - timestamp);
      return diff < 1000;  // 1秒内
    });
  }
}
```

---

## 四、实时数据绑定

### 4.1 数据源接入

**MQTT订阅架构**：

```javascript
// MQTT数据订阅服务
import mqtt from 'mqtt';

class ESSDataService {
  constructor() {
    this.client = null;
    this.subscriptions = new Map();
    this.dataCache = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  // 连接MQTT Broker
  connect(brokerUrl, options = {}) {
    this.client = mqtt.connect(brokerUrl, {
      ...options,
      reconnectPeriod: 5000,
      connectTimeout: 30000
    });

    this.client.on('connect', () => {
      console.log('[MQTT] Connected to broker');
      this.reconnectAttempts = 0;
      
      // 恢复之前的订阅
      this.resubscribeAll();
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('error', (error) => {
      console.error('[MQTT] Error:', error);
    });

    this.client.on('reconnect', () => {
      this.reconnectAttempts++;
      console.log(`[MQTT] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.fallbackToWebSocket();
      }
    });
  }

  // 订阅主题
  subscribe(topic, callback, deviceId) {
    if (this.client && this.client.connected) {
      this.client.subscribe(topic, (err) => {
        if (!err) {
          console.log(`[MQTT] Subscribed: ${topic}`);
        }
      });
    }

    // 记录订阅
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
    this.subscriptions.get(topic).push({ callback, deviceId });
  }

  // 处理接收到的消息
  handleMessage(topic, message) {
    try {
      const data = JSON.parse(message.toString());
      const subscribers = this.subscriptions.get(topic) || [];
      
      subscribers.forEach(({ callback, deviceId }) => {
        callback(data, deviceId);
        
        // 缓存最新数据
        this.dataCache.set(deviceId, {
          ...data,
          timestamp: Date.now()
        });
      });
    } catch (e) {
      console.error('[MQTT] Parse error:', e);
    }
  }

  // 订阅设备遥测数据
  subscribeDeviceTelemetry(deviceId, callback) {
    // 场站设备遥测主题格式
    const topic = `ess/${deviceId}/telemetry`;
    this.subscribe(topic, callback, deviceId);
  }

  // 订阅告警数据
  subscribeAlerts(callback) {
    const topic = 'ess/+/alerts';
    this.subscribe(topic, callback, 'all_alerts');
  }

  // 获取设备最新数据（从缓存）
  getCachedData(deviceId) {
    return this.dataCache.get(deviceId);
  }

  // 回退到WebSocket
  fallbackToWebSocket() {
    console.log('[ESS] Falling back to WebSocket');
    // 实现WebSocket回退逻辑...
  }

  disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}
```

**OPC-UA数据接入**：

```csharp
// C# OPC-UA客户端（用于工业现场）
// using Opc.Ua;
// using Opc.Ua.Client;

public class OPCUADataConnector {
    private Session session;
    private string endpointUrl;

    public async Task Connect(string endpoint) {
        var config = new SessionConfiguration {
            EndpointConfiguration = EndpointConfiguration.Create(),
            CheckCertificate = false
        };

        var selectedEndpoint = CoreClientUtils.SelectEndpoint(endpoint, false);
        session = await Session.Create(
            config,
            new ConfiguredEndpoint(null, selectedEndpoint),
            false,
            "ESS Digital Twin",
            60000,
            new UserIdentity(new AnonymousIdentityToken()),
            null
        );
    }

    // 订阅数据变化
    public async Task SubscribeDataChange(string nodeId, Action<DataValue> callback) {
        var subscription = new Subscription(session.DefaultSubscription) {
            PublishingInterval = 1000
        };

        var monitoredItem = new MonitoredItem(subscription.DefaultItem) {
            StartNodeId = nodeId,
            MonitoringMode = MonitoringMode.Reporting,
            ReportingInterval = 1000
        };

        monitoredItem.DataChangeReceived += (item, e) => {
            callback(e.DataValue);
        };

        subscription.AddItem(monitoredItem);
        session.AddSubscription(subscription);
        subscription.Create();
    }

    // 读取历史数据
    public async Task<List<DataValue>> ReadHistory(
        string nodeId, 
        DateTime startTime, 
        DateTime endTime) {
        
        var results = new List<DataValue>();
        
        // 使用HistoryRead服务读取历史
        var historyRead = new HistoryRead();
        historyRead.NodesToRead = new ReadValueIdCollection {
            new ReadValueId { NodeId = nodeId }
        };
        
        // 设置时间范围
        historyRead.TimestampsToReturn = TimestampsToReturn.Both;
        
        var response = await session.HistoryReadAsync(
            null,
            new ExtensionObject(historyRead),
            TimestampsToReturn.Both
        );

        // 解析结果...
        return results;
    }
}
```

### 4.2 数据模型映射

```javascript
// 数据模型映射配置
const DATA_MODEL_MAPPING = {
  // PCS数据映射
  pcs: {
    topic: 'ess/PCS_+/telemetry',
    fields: {
      activePower: { path: 'power.active', unit: 'kW', color: '#00ff88' },
      reactivePower: { path: 'power.reactive', unit: 'kVar', color: '#00aaff' },
      dcVoltage: { path: 'dc.voltage', unit: 'V' },
      dcCurrent: { path: 'dc.current', unit: 'A' },
      temperature: { path: 'temp.moduleTemps', unit: '°C', isArray: true },
      state: { path: 'status.state', mapping: { 0: 'standby', 1: 'grid_connected', 2: 'fault' } }
    },
    alertTopic: 'ess/PCS_+/alerts'
  },

  // BMS数据映射
  bms: {
    topic: 'ess/BMS_+/telemetry',
    fields: {
      soc: { path: 'battery.soc', unit: '%', min: 0, max: 100 },
      soh: { path: 'battery.soh', unit: '%' },
      voltage: { path: 'battery.voltage', unit: 'V' },
      current: { path: 'battery.current', unit: 'A' },
      maxTemp: { path: 'temp.maxTemp', unit: '°C' },
      minTemp: { path: 'temp.minTemp', unit: '°C' },
      cellTemps: { path: 'temp.cellTemps', unit: '°C', isArray: true }
    },
    alertTopic: 'ess/BMS_+/alerts'
  },

  // 电表数据映射
  meter: {
    topic: 'ess/METER_+/telemetry',
    fields: {
      activeEnergy: { path: 'energy.active', unit: 'kWh' },
      reactiveEnergy: { path: 'energy.reactive', unit: 'kVarh' },
      powerFactor: { path: 'power.factor' }
    }
  }
};

// 设备ID → 3D模型ID映射表
const DEVICE_TO_MODEL_MAPPING = {
  'PCS_001': { modelId: 'pcs_001_mesh', labelOffset: new THREE.Vector3(0, 3, 0) },
  'PCS_002': { modelId: 'pcs_002_mesh', labelOffset: new THREE.Vector3(0, 3, 0) },
  'BATT_001': { modelId: 'batt_001_group', labelOffset: new THREE.Vector3(0, 4, 0) },
  // ...更多设备映射
};
```

### 4.3 数据刷新策略

```javascript
// 数据刷新管理器
class DataRefreshManager {
  constructor(dataService) {
    this.dataService = dataService;
    this.refreshRates = {
      realtime: 1000,    // 实时数据：1秒
      status: 2000,      // 状态数据：2秒
      history: 60000     // 历史数据：1分钟
    };
    this.activeTimers = new Map();
  }

  // 启动实时数据刷新
  startRealtimeRefresh(deviceId, callback) {
    this.dataService.subscribeDeviceTelemetry(deviceId, (data) => {
      callback(data);
    });

    // 定时轮询作为备份（MQTT可能丢失）
    const timer = setInterval(async () => {
      const cached = this.dataService.getCachedData(deviceId);
      if (cached) {
        // 检查数据是否过期（超过2个刷新周期）
        const age = Date.now() - cached.timestamp;
        if (age > this.refreshRates.realtime * 2) {
          console.warn(`[Data] ${deviceId} data stale: ${age}ms`);
        }
      }
    }, this.refreshRates.realtime);

    this.activeTimers.set(deviceId, timer);
  }

  // 停止刷新
  stopRefresh(deviceId) {
    const timer = this.activeTimers.get(deviceId);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(deviceId);
    }
  }

  // 批量启动所有设备刷新
  startAllDevicesRefresh(devices, onDataUpdate) {
    devices.forEach(device => {
      this.startRealtimeRefresh(device.deviceId, (data) => {
        onDataUpdate(device.deviceId, data);
      });
    });

    // 订阅告警
    this.dataService.subscribeAlerts((alert) => {
      this.handleAlert(alert, onDataUpdate);
    });
  }

  handleAlert(alert, callback) {
    // 即时更新告警状态，无需等待轮询
    callback(alert.deviceId, { alert: alert });
  }
}
```

### 4.4 本地缓存与离线支持

```javascript
// IndexedDB本地缓存
class LocalDataCache {
  constructor(dbName = 'ess_digital_twin') {
    this.dbName = dbName;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 存储设备最新状态
        if (!db.objectStoreNames.contains('device_states')) {
          db.createObjectStore('device_states', { keyPath: 'deviceId' });
        }
        
        // 存储历史数据
        if (!db.objectStoreNames.contains('history_data')) {
          const store = db.createObjectStore('history_data', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('deviceId', 'deviceId', { unique: false });
        }
      };
    });
  }

  // 缓存设备状态
  async cacheDeviceState(deviceId, state) {
    const tx = this.db.transaction('device_states', 'readwrite');
    const store = tx.objectStore('device_states');
    
    await store.put({
      deviceId,
      state,
      timestamp: Date.now()
    });
  }

  // 获取缓存状态（离线时使用）
  async getCachedState(deviceId) {
    const tx = this.db.transaction('device_states', 'readonly');
    const store = tx.objectStore('device_states');
    
    return new Promise((resolve, reject) => {
      const request = store.get(deviceId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 存储历史数据（用于回放）
  async appendHistoryData(deviceId, dataPoints) {
    const tx = this.db.transaction('history_data', 'readwrite');
    const store = tx.objectStore('history_data');
    
    for (const point of dataPoints) {
      await store.put({
        deviceId,
        ...point,
        timestamp: Date.now()
      });
    }
  }

  // 查询时间段历史数据
  async queryHistory(deviceId, startTime, endTime) {
    const tx = this.db.transaction('history_data', 'readonly');
    const store = tx.objectStore('history_data');
    const index = store.index('deviceId');
    
    return new Promise((resolve, reject) => {
      const results = [];
      const range = IDBKeyRange.bound([deviceId, startTime], [deviceId, endTime]);
      
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}
```

---

## 五、VR场站漫游模式

### 5.1 VR场景设计

**A-Frame VR场景配置**：

```html
<!-- VR场景基础配置 (vr-scene.html) -->
<a-scene
  vr-mode-ui="enabled: true"
  renderer="antialias: true; colorManagement: true; physicallyCorrectLights: true; maxCanvasWidth: 4096; maxCanvasHeight: 4096"
  loading-screen="enabled: true; dotsColor: #00ff88; backgroundColor: #0a1628">

  <!-- 资产预加载 -->
  <a-assets>
    <a-asset-item id="ess-model" src="/models/ess_scene_lod0.glb"></a-asset-item>
    <a-asset-item id="pcs-model" src="/models/ess/PCS_001_lod0.glb"></a-asset-item>
  </a-assets>

  <!-- 环境光照 -->
  <a-light type="ambient" color="#334466" intensity="0.4"></a-light>
  <a-light type="directional" color="#ffffff" intensity="0.8" position="1 1 0" castShadow="true"></a-light>

  <!-- 场站3D模型 -->
  <a-entity
    id="ess-scene"
    gltf-model="#ess-model"
    position="0 0 0"
    scale="1 1 1">
  </a-entity>

  <!-- 地面 -->
  <a-plane
    position="0 0 0"
    rotation="-90 0 0"
    width="500" height="500"
    color="#1a2638"
    material="roughness: 0.9; metalness: 0.1">
  </a-plane>

  <!-- VR相机 + 控制器 -->
  <a-entity id="rig" position="0 0 0">
    <!-- 相机 -->
    <a-camera
      id="camera"
      position="0 1.6 50"
      look-controls="pointerLockEnabled: false"
      wasd-controls="enabled: true; acceleration: 30">
      <!-- 激光指示器 -->
      <a-entity
        laser-controls="hand: left"
        raycaster="objects: .interactive; far: 100; showLine: true; lineColor: #00ff88">
      </a-entity>
    </a-camera>

    <!-- 手柄控制器 -->
    <a-entity
      id="leftHand"
      laser-controls="hand: left"
      raycaster="objects: .interactive; far: 50; showLine: true">
    </a-entity>
    <a-entity
      id="rightHand"
      laser-controls="hand: right"
      raycaster="objects: .interactive; far: 50; showLine: true"
      oculus-touch-controls="hand: right">
    </a-entity>
  </a-entity>

  <!-- 天空盒 -->
  <a-sky color="#0a1628"></a-sky>
</a-scene>
```

### 5.2 VR视角系统

```javascript
// VR视角管理器
class VRViewManager {
  constructor(scene) {
    this.scene = scene;
    this.cameraRig = null;
    this.currentView = 'overview';
    this.viewPoints = this.initViewPoints();
  }

  initViewPoints() {
    return {
      // 场站总览视角
      overview: {
        position: new THREE.Vector3(80, 60, 80),
        target: new THREE.Vector3(0, 0, 0),
        fov: 60
      },
      
      // PCS设备视角
      pcs_001: {
        position: new THREE.Vector3(50, 5, 100),
        target: new THREE.Vector3(50, 3, 100),
        fov: 45,
        deviceId: 'PCS_001'
      },
      
      // 电池舱视角
      batt_001: {
        position: new THREE.Vector3(0, 5, 0),
        target: new THREE.Vector3(0, 5, -20),
        fov: 45,
        deviceId: 'BATT_001'
      },
      
      // 主变压器视角
      transformer: {
        position: new THREE.Vector3(-30, 3, 50),
        target: new THREE.Vector3(-30, 3, 50),
        fov: 50
      }
    };
  }

  // 切换到指定视角
  transitionTo(viewName, duration = 1500) {
    const view = this.viewPoints[viewName];
    if (!view) {
      console.warn(`View ${viewName} not found`);
      return;
    }

    this.currentView = viewName;
    this.animateCamera(view.position, view.target, duration);

    // 切换模型LOD
    if (view.deviceId) {
      this.switchToDetailView(view.deviceId);
    }
  }

  animateCamera(targetPos, targetLookAt, duration) {
    const startPos = this.cameraRig.position.clone();
    const startLookAt = this.scene.camera.position.clone();
    
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      
      // 使用缓动函数
      const easeT = this.easeInOutCubic(t);
      
      // 插值位置
      this.cameraRig.position.lerpVectors(startPos, targetPos, easeT);
      
      // 插值朝向
      const currentLookAt = startLookAt.clone().lerp(targetLookAt, easeT);
      this.scene.camera.lookAt(currentLookAt);
      
      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  switchToDetailView(deviceId) {
    // 加载高精度模型
    const lodManager = new ESSLODManager(this.scene);
    lodManager.loadDeviceModel(deviceId, 'detail').then(model => {
      // 替换场景中的低精度模型
      const currentModel = this.scene.getObjectByName(deviceId);
      if (currentModel) {
        this.scene.remove(currentModel);
        this.scene.add(model);
      }
    });
  }

  // 靠近设备时自动切换视角
  setupProximityTrigger(deviceId, position, radius = 5) {
    const triggerZone = new THREE.Mesh(
      new THREE.SphereGeometry(radius),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    triggerZone.position.copy(position);
    triggerZone.userData.deviceId = deviceId;
    this.scene.add(triggerZone);
    
    // 检测碰撞
    return triggerZone;
  }
}
```

### 5.3 VR交互功能

```javascript
// VR交互控制器
class VRInteractionController {
  constructor(scene, cameraRig, dataService) {
    this.scene = scene;
    this.cameraRig = cameraRig;
    this.dataService = dataService;
    this.infoPanels = new Map();
    this.setupRaycaster();
  }

  setupRaycaster() {
    // 配置射线检测
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 100;
    
    // 收集可交互对象
    this.interactiveObjects = [];
  }

  // 注册可交互设备
  registerInteractiveDevice(deviceId, mesh) {
    mesh.classList.add('interactive');
    mesh.userData.deviceId = deviceId;
    this.interactiveObjects.push(mesh);
  }

  // 检测射线命中
  update() {
    // 获取手柄方向
    const controller = this.scene.querySelector('#rightHand');
    if (controller && controller.object3D) {
      const direction = new THREE.Vector3(0, 0, -1);
      direction.applyQuaternion(controller.object3D.quaternion);
      
      this.raycaster.set(controller.object3D.position, direction);
      
      const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);
      
      if (intersects.length > 0) {
        const hit = intersects[0];
        this.onDeviceHover(hit.object);
      }
    }
  }

  // 悬停设备
  onDeviceHover(mesh) {
    const deviceId = this.findDeviceId(mesh);
    if (!deviceId) return;

    // 显示高亮轮廓
    this.showHighlight(mesh);

    // 显示实时数据面板
    this.showDataPanel(deviceId);
  }

  // 点击设备
  onDeviceClick(mesh) {
    const deviceId = this.findDeviceId(mesh);
    if (!deviceId) return;

    // 切换到设备视角
    const viewManager = new VRViewManager(this.scene);
    viewManager.transitionTo(deviceId);

    // 显示详细信息面板
    this.showDetailPanel(deviceId);
  }

  showHighlight(mesh) {
    // 创建轮廓高亮效果
    if (!mesh.userData.highlightMesh) {
      const outlineGeometry = mesh.geometry.clone();
      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        side: THREE.BackSide
      });
      const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
      outlineMesh.scale.multiplyScalar(1.05);
      mesh.add(outlineMesh);
      mesh.userData.highlightMesh = outlineMesh;
    }
  }

  // 显示实时数据面板
  showDataPanel(deviceId) {
    let panel = this.infoPanels.get(deviceId);
    
    if (!panel) {
      // 创建面板（3D UI）
      panel = this.createDataPanel(deviceId);
      this.scene.add(panel);
      this.infoPanels.set(deviceId, panel);
    }

    // 更新面板数据
    const cachedData = this.dataService.getCachedData(deviceId);
    if (cachedData) {
      this.updatePanelContent(panel, deviceId, cachedData);
    }

    // 面板跟随设备
    const deviceMesh = this.scene.getObjectByName(deviceId);
    if (deviceMesh) {
      panel.position.copy(deviceMesh.position);
      panel.position.y += 4;  // 设备上方
    }

    // 显示面板
    panel.visible = true;
  }

  createDataPanel(deviceId) {
    const group = new THREE.Group();
    
    // 面板背景
    const bgGeometry = new THREE.PlaneGeometry(4, 3);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a1628,
      transparent: true,
      opacity: 0.9
    });
    const bg = new THREE.Mesh(bgGeometry, bgMaterial);
    group.add(bg);

    // 边框
    const borderGeometry = new THREE.PlaneGeometry(4.1, 3.1);
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide
    });
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    border.position.z = -0.01;
    group.add(border);

    // 标题文字（使用Canvas贴图）
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    // 绘制标题...
    
    const texture = new THREE.CanvasTexture(canvas);
    const titleMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const titlePlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), titleMaterial);
    titlePlane.position.z = 0.01;
    group.add(titlePlane);

    return group;
  }

  updatePanelContent(panel, deviceId, data) {
    // 更新Canvas贴图内容
    const texture = panel.children[2].material.map;
    const ctx = texture.image.getContext('2d');
    
    // 清空并重绘
    ctx.clearRect(0, 0, 512, 384);
    ctx.font = '24px Arial';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(deviceId, 20, 40);
    
    // 显示数据字段
    let y = 80;
    for (const [key, value] of Object.entries(data)) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${key}: ${value}`, 20, y);
      y += 40;
    }
    
    texture.needsUpdate = true;
  }

  // 告警响应
  handleAlert(deviceId, alertData) {
    const deviceMesh = this.scene.getObjectByName(deviceId);
    if (!deviceMesh) return;

    // 高亮告警设备
    deviceMesh.material.emissive = new THREE.Color(0xff0000);
    deviceMesh.material.emissiveIntensity = 0.8;

    // 显示告警弹窗
    this.showAlertPopup(deviceId, alertData);

    // 震动反馈（VR手柄）
    const controller = this.scene.querySelector('#rightHand');
    if (controller && controller.components['haptic-controls']) {
      controller.components['haptic-controls'].triggerHapticPulse(0.8, 100);
    }
  }

  showAlertPopup(deviceId, alertData) {
    // 创建告警浮窗
    const popup = document.createElement('a-entity');
    popup.setAttribute('position', '0 3 -5');
    popup.innerHTML = `
      <a-text value="${alertData.message}" color="#ff0000" align="center" width="8"></a-text>
      <a-text value="点击查看详情" color="#00ff88" position="0 -0.5 0" align="center"></a-text>
    `;
    popup.classList.add('interactive');
    popup.addEventListener('click', () => {
      this.showAlertDetail(deviceId, alertData);
    });
    
    this.scene.appendChild(popup);
  }

  // 远程控制（需要权限验证）
  async sendControlCommand(deviceId, command, params) {
    // 检查权限
    const hasPermission = await this.checkControlPermission();
    if (!hasPermission) {
      this.showPermissionDenied();
      return;
    }

    // 发送控制指令
    const response = await fetch(`/api/devices/${deviceId}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, params })
    });

    if (response.ok) {
      this.showControlSuccess();
    } else {
      this.showControlError();
    }
  }
}
```

### 5.4 VR性能优化

```javascript
// VR性能优化配置
const VR_PERFORMANCE_CONFIG = {
  // 目标帧率
  targetFPS: 90,
  
  // 模型面数限制
  maxTriangleCount: 500000,  // 所有模型总面数
  
  // LOD距离阈值
  lodDistances: {
    LOD0: 20,   // 近距离：最高精度
    LOD1: 50,   // 中距离：中等精度
    LOD2: 200   // 远距离：简化模型
  },
  
  // 纹理大小限制
  maxTextureSize: 2048,
  
  // 阴影配置
  shadows: {
    enabled: false  // VR中禁用实时阴影，使用烘焙阴影
  },
  
  // 后处理效果
  postProcessing: {
    enabled: false,  // 禁用后处理提升性能
    bloom: false,
    antiAliasing: 'MSAA'  // 简化的抗锯齿
  }
};

// 性能监控
class VRPerformanceMonitor {
  constructor() {
    this.frameTimes = [];
    this.lastTime = performance.now();
  }

  update() {
    const now = performance.now();
    const frameTime = now - this.lastTime;
    this.lastTime = now;
    
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
    }
    
    // 计算平均帧率
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
    const fps = 1000 / avgFrameTime;
    
    if (fps < VR_PERFORMANCE_CONFIG.targetFPS * 0.8) {
      console.warn(`[Performance] FPS low: ${fps.toFixed(1)}`);
      this.triggerLODDowngrade();
    }
  }

  triggerLODDowngrade() {
    // 降低所有模型的LOD级别
    const lodManager = new ESSLODManager(window.scene);
    lodManager.forceLODLevel(2);  // 强制使用最低精度
  }
}

// 手柄追踪优化
class HandTrackingOptimizer {
  constructor() {
    this.predictionTime = 0.05;  // 50ms预测
    this.smoothingFactor = 0.8;
  }

  // 预测手柄位置（减少延迟感）
  predictPosition(currentPos, velocity) {
    return currentPos.clone().add(velocity.clone().multiplyScalar(this.predictionTime));
  }

  // 平滑手柄移动
  smoothMovement(rawPosition) {
    if (!this.lastPosition) {
      this.lastPosition = rawPosition.clone();
      return rawPosition.clone();
    }
    
    const smoothed = rawPosition.clone().lerp(this.lastPosition, this.smoothingFactor);
    this.lastPosition = rawPosition.clone();
    return smoothed;
  }
}
```

---

## 六、Web端场站大屏

### 6.1 2D电气图总览

**SVG一次接线图**：

```javascript
// SVG电气图渲染
class ElectricalDiagramRenderer {
  constructor(container) {
    this.container = container;
    this.svg = null;
    this.deviceElements = new Map();
    this.init();
  }

  init() {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.setAttribute('viewBox', '0 0 2000 1500');
    
    // 添加背景网格
    this.addGrid();
    
    // 添加导线层
    this.wireLayer = this.createLayer('wires');
    this.svg.appendChild(this.wireLayer);
    
    // 添加设备层
    this.deviceLayer = this.createLayer('devices');
    this.svg.appendChild(this.deviceLayer);
    
    this.container.appendChild(this.svg);
  }

  createLayer(id) {
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('id', id);
    return layer;
  }

  addGrid() {
    const gridSize = 50;
    const grid = this.createLayer('grid');
    
    for (let x = 0; x <= 2000; x += gridSize) {
      const line = this.createLine(x, 0, x, 1500, '#1a2638');
      grid.appendChild(line);
    }
    for (let y = 0; y <= 1500; y += gridSize) {
      const line = this.createLine(0, y, 2000, y, '#1a2638');
      grid.appendChild(line);
    }
    
    this.svg.insertBefore(grid, this.svg.firstChild);
  }

  // 添加设备符号
  addDevice(deviceId, type, position, props = {}) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', `device-${deviceId}`);
    group.setAttribute('transform', `translate(${position.x}, ${position.y})`);
    group.classList.add('device-symbol', type);
    group.dataset.deviceId = deviceId;
    
    // 根据设备类型添加对应符号
    switch (type) {
      case 'pcs':
        this.addPCSSymbol(group, props);
        break;
      case 'battery':
        this.addBatterySymbol(group, props);
        break;
      case 'transformer':
        this.addTransformerSymbol(group, props);
        break;
      case 'meter':
        this.addMeterSymbol(group, props);
        break;
    }
    
    // 点击事件：跳转到3D对应设备
    group.addEventListener('click', () => {
      this.onDeviceClick(deviceId);
    });
    
    // 悬停高亮
    group.addEventListener('mouseenter', () => {
      this.highlightDevice(deviceId, true);
    });
    group.addEventListener('mouseleave', () => {
      this.highlightDevice(deviceId, false);
    });
    
    this.deviceLayer.appendChild(group);
    this.deviceElements.set(deviceId, group);
    
    return group;
  }

  addPCSSymbol(group, props) {
    // PCS舱体符号（矩形）
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '-40');
    rect.setAttribute('y', '-30');
    rect.setAttribute('width', '80');
    rect.setAttribute('height', '60');
    rect.setAttribute('fill', '#1a3a5c');
    rect.setAttribute('stroke', '#00ff88');
    rect.setAttribute('stroke-width', '2');
    group.appendChild(rect);
    
    // 设备名称
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('y', '0');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#00ff88');
    label.setAttribute('font-size', '12');
    label.textContent = props.name || 'PCS';
    group.appendChild(label);
    
    // 功率标注
    const powerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    powerLabel.setAttribute('y', '15');
    powerLabel.setAttribute('text-anchor', 'middle');
    powerLabel.setAttribute('fill', '#ffffff');
    powerLabel.setAttribute('font-size', '10');
    powerLabel.setAttribute('class', 'power-value');
    powerLabel.textContent = '0 kW';
    group.appendChild(powerLabel);
  }

  addBatterySymbol(group, props) {
    // 电池符号（多矩形组合）
    for (let i = 0; i < 4; i++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', -30 + i * 20);
      rect.setAttribute('y', -20);
      rect.setAttribute('width', '15');
      rect.setAttribute('height', '40');
      rect.setAttribute('fill', '#1a3a5c');
      rect.setAttribute('stroke', '#00aaff');
      rect.setAttribute('stroke-width', '1');
      group.appendChild(rect);
    }
    
    // SOC标注
    const socLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    socLabel.setAttribute('y', '30');
    socLabel.setAttribute('text-anchor', 'middle');
    socLabel.setAttribute('fill', '#00aaff');
    socLabel.setAttribute('font-size', '10');
    socLabel.setAttribute('class', 'soc-value');
    socLabel.textContent = 'SOC: 0%';
    group.appendChild(socLabel);
  }

  addTransformerSymbol(group, props) {
    // 变压器符号（圆形）
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('r', '35');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#ffaa00');
    circle.setAttribute('stroke-width', '3');
    group.appendChild(circle);
    
    // 高压侧标识
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('y', '5');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#ffaa00');
    label.setAttribute('font-size', '14');
    label.textContent = props.name || 'T';
    group.appendChild(label);
  }

  addMeterSymbol(group, props) {
    // 电能表符号
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '-20');
    rect.setAttribute('y', '-15');
    rect.setAttribute('width', '40');
    rect.setAttribute('height', '30');
    rect.setAttribute('fill', '#1a3a5c');
    rect.setAttribute('stroke', '#ffff00');
    rect.setAttribute('stroke-width', '2');
    group.appendChild(rect);
    
    // 功率因数标注
    const pfLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    pfLabel.setAttribute('y', '5');
    pfLabel.setAttribute('text-anchor', 'middle');
    pfLabel.setAttribute('fill', '#ffff00');
    pfLabel.setAttribute('font-size', '10');
    pfLabel.textContent = 'PF: -';
    group.appendChild(pfLabel);
  }

  // 添加导线
  addWire(startPos, endPos, options = {}) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    // 直线
    const d = `M ${startPos.x} ${startPos.y} L ${endPos.x} ${endPos.y}`;
    path.setAttribute('d', d);
    path.setAttribute('stroke', options.color || '#00ff88');
    path.setAttribute('stroke-width', options.width || 2);
    path.setAttribute('fill', 'none');
    path.setAttribute('class', 'wire');
    
    if (options.animate) {
      path.classList.add('animated');
      this.addWireAnimation(path);
    }
    
    this.wireLayer.appendChild(path);
    return path;
  }

  addWireAnimation(wire) {
    const length = wire.getTotalLength();
    wire.style.strokeDasharray = `${length}`;
    wire.style.strokeDashoffset = `${length}`;
    
    // CSS动画
    wire.style.animation = 'flow 2s linear infinite';
  }

  // 更新设备数据
  updateDeviceValue(deviceId, field, value) {
    const element = this.deviceElements.get(deviceId);
    if (!element) return;

    const valueElement = element.querySelector(`.${field}-value`);
    if (valueElement) {
      valueElement.textContent = `${value} ${this.getUnit(field)}`;
    }

    // 告警状态高亮
    if (field === 'alert' && value) {
      element.classList.add('alert');
      this.startAlertBlink(element);
    }
  }

  startAlertBlink(element) {
    let visible = true;
    setInterval(() => {
      visible = !visible;
      element.style.opacity = visible ? 1 : 0.3;
    }, 500);
  }

  highlightDevice(deviceId, highlight) {
    const element = this.deviceElements.get(deviceId);
    if (!element) return;

    const rect = element.querySelector('rect, circle');
    if (rect) {
      rect.setAttribute('stroke-width', highlight ? '4' : '2');
    }

    // 通知3D视图同步高亮
    if (highlight && this.onHighlight) {
      this.onHighlight(deviceId);
    }
  }

  onDeviceClick(deviceId) {
    // 通知主控制器跳转到3D视图对应设备
    if (this.onDeviceSelected) {
      this.onDeviceSelected(deviceId);
    }
  }

  getUnit(field) {
    const units = {
      power: 'kW',
      soc: '%',
      voltage: 'V',
      current: 'A',
      pf: ''
    };
    return units[field] || '';
  }
}
```

### 6.2 3D场站视图

**Three.js场站视图配置**：

```javascript
// 3D场站视图控制器
class ESS3DViewController {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.viewPresets = this.initViewPresets();
    this.init();
  }

  init() {
    // 创建场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1628);
    
    // 创建相机
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      10000
    );
    this.camera.position.set(80, 60, 80);
    
    // 创建渲染器
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
    
    // 创建控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 500;
    this.controls.minDistance = 10;
    
    // 添加光照
    this.addLighting();
    
    // 添加地面
    this.addGround();
    
    // 启动渲染循环
    this.animate();
  }

  initViewPresets() {
    return {
      overview: {
        position: new THREE.Vector3(100, 80, 100),
        target: new THREE.Vector3(0, 0, 0)
      },
      front: {
        position: new THREE.Vector3(0, 30, 150),
        target: new THREE.Vector3(0, 0, 0)
      },
      side: {
        position: new THREE.Vector3(150, 30, 0),
        target: new THREE.Vector3(0, 0, 0)
      },
      top: {
        position: new THREE.Vector3(0, 200, 0),
        target: new THREE.Vector3(0, 0, 0)
      },
      isometric: {
        position: new THREE.Vector3(100, 100, 100),
        target: new THREE.Vector3(0, 0, 0)
      }
    };
  }

  addLighting() {
    // 环境光
    const ambient = new THREE.AmbientLight(0x334466, 0.5);
    this.scene.add(ambient);
    
    // 主方向光
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(100, 100, 50);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 500;
    directional.shadow.camera.left = -100;
    directional.shadow.camera.right = 100;
    directional.shadow.camera.top = 100;
    directional.shadow.camera.bottom = -100;
    this.scene.add(directional);
    
    // 补充光
    const fillLight = new THREE.DirectionalLight(0x00aaff, 0.3);
    fillLight.position.set(-50, 50, -50);
    this.scene.add(fillLight);
  }

  addGround() {
    // 地面平面
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2638,
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // 网格辅助线
    const gridHelper = new THREE.GridHelper(500, 50, 0x334466, 0x1a2638);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  // 切换视角
  switchView(viewName, animate = true) {
    const preset = this.viewPresets[viewName];
    if (!preset) return;

    if (animate) {
      this.animateCameraTo(preset.position, preset.target);
    } else {
      this.camera.position.copy(preset.position);
      this.controls.target.copy(preset.target);
    }
  }

  animateCameraTo(targetPos, targetLookAt, duration = 1000) {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const easeT = this.easeInOutCubic(t);

      this.camera.position.lerpVectors(startPos, targetPos, easeT);
      this.controls.target.lerpVectors(startTarget, targetLookAt, easeT);

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // 剖面视图
  showCrossSection(axis = 'x', position = 0) {
    // 创建剖面裁剪
    const plane = new THREE.Plane(
      axis === 'x' ? new THREE.Vector3(1, 0, 0) :
      axis === 'y' ? new THREE.Vector3(0, 1, 0) :
                    new THREE.Vector3(0, 0, 1),
      -position
    );

    this.scene.traverse((object) => {
      if (object.isMesh && object.material) {
        object.material.clippingPlanes = [plane];
        object.material.clipShadows = true;
      }
    });

    this.renderer.localClippingEnabled = true;
  }

  // 隐藏剖面
  hideCrossSection() {
    this.scene.traverse((object) => {
      if (object.isMesh && object.material) {
        object.material.clippingPlanes = [];
      }
    });
  }

  // 聚焦到设备
  focusOnDevice(deviceId, animate = true) {
    const deviceMesh = this.scene.getObjectByName(deviceId);
    if (!deviceMesh) return;

    // 计算设备包围盒
    const box = new THREE.Box3().setFromObject(deviceMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // 计算相机位置（距离设备3倍尺寸）
    const direction = this.camera.position.clone().sub(center).normalize();
    const distance = maxDim * 3;
    const targetPos = center.clone().add(direction.multiplyScalar(distance));

    if (animate) {
      this.animateCameraTo(targetPos, center);
    } else {
      this.camera.position.copy(targetPos);
      this.controls.target.copy(center);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }
}
```

### 6.3 能量流向总览

```javascript
// 能量流向动态可视化
class EnergyFlowOverview {
  constructor(scene) {
    this.scene = scene;
    this.flowArrows = new Map();
    this.powerScale = 0.001;  // kW转3D单位
  }

  // 初始化能量流箭头
  initEnergyFlow(config) {
    // 35kV进线
    this.createFlowArrow('grid_in', {
      start: new THREE.Vector3(-100, 10, 0),
      end: new THREE.Vector3(-50, 10, 0),
      color: 0xffaa00,
      label: '35kV进线'
    });

    // 主变压器
    this.createFlowArrow('transformer', {
      start: new THREE.Vector3(-50, 10, 0),
      end: new THREE.Vector3(-20, 10, 0),
      color: 0xff8800,
      label: '主变'
    });

    // PCS舱
    this.createFlowArrow('pcs_001', {
      start: new THREE.Vector3(-20, 5, 0),
      end: new THREE.Vector3(0, 5, 0),
      color: 0x00ff88,
      label: 'PCS #1'
    });

    // 电池簇
    this.createFlowArrow('batt_001', {
      start: new THREE.Vector3(0, 5, 0),
      end: new THREE.Vector3(20, 5, 0),
      color: 0x00aaff,
      label: '电池簇 #1'
    });
  }

  createFlowArrow(id, config) {
    const group = new THREE.Group();
    group.name = `flow_${id}`;

    // 创建路径曲线
    const curve = new THREE.LineCurve3(config.start, config.end);
    const tubeGeometry = new THREE.TubeGeometry(curve, 32, 0.3, 8, false);
    
    const material = new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: 0.6
    });

    const tube = new THREE.Mesh(tubeGeometry, material);
    group.add(tube);

    // 箭头指示器
    const arrowDir = config.end.clone().sub(config.start).normalize();
    const arrowPos = config.end.clone().sub(arrowDir.clone().multiplyScalar(2));
    
    const arrow = new THREE.ArrowHelper(arrowDir, arrowPos, 2, config.color, 1, 0.5);
    group.add(arrow);

    // 流动粒子
    const particles = this.createFlowParticles(config.start, config.end, config.color);
    group.add(particles);

    this.scene.add(group);
    this.flowArrows.set(id, {
      group,
      material,
      particles,
      config
    });
  }

  createFlowParticles(start, end, color) {
    const count = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = start.x;
      positions[i * 3 + 1] = start.y;
      positions[i * 3 + 2] = start.z;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.8,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    points.userData = { start, end, progress: 0 };

    // 启动流动动画
    this.animateParticleFlow(points);

    return points;
  }

  animateParticleFlow(particles) {
    const update = () => {
      const positions = particles.geometry.attributes.position.array;
      const start = particles.userData.start;
      const end = particles.userData.end;
      
      particles.userData.progress = (particles.userData.progress + 0.005) % 1;

      for (let i = 0; i < positions.length / 3; i++) {
        const offset = (i / (positions.length / 3)) / 10;
        const t = (particles.userData.progress + offset) % 1;
        const point = start.clone().lerp(end, t);
        
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;
      }

      particles.geometry.attributes.position.needsUpdate = true;
      requestAnimationFrame(update);
    };

    update();
  }

  // 更新功率值（驱动动画速度）
  updatePowerFlow(id, powerKW) {
    const flow = this.flowArrows.get(id);
    if (!flow) return;

    // 功率越大，粒子速度越快，颜色越亮
    const intensity = Math.min(Math.abs(powerKW) / 5000, 1);  // 假设5MW为满功率
    flow.material.opacity = 0.4 + intensity * 0.4;
    flow.particles.material.size = 0.5 + intensity * 0.5;

    // 充放电方向指示
    if (powerKW < 0) {
      // 充电：反向流动
      flow.particles.userData.start.negate?.();
    }
  }

  // 颜色编码显示
  updateColorCoding(parameter, value) {
    // SOC: 蓝色→绿色→黄色→红色
    // 温度: 蓝色→绿色→黄色→红色
    // 功率: 绿色（有功）、蓝色（无功）

    const t = Math.max(0, Math.min(1, value / 100));
    const color = new THREE.Color().setHSL((1 - t) * 0.65, 1, 0.5);

    this.flowArrows.forEach((flow, id) => {
      flow.material.color = color;
      flow.particles.material.color = color;
    });
  }
}
```

---

## 七、项目交付清单

### 7.1 数字孪生系统交付检查表（≥30项）

| 序号 | 检查项 | 验收标准 | 状态 |
|------|--------|---------|------|
| 1 | 场站3D模型 | 所有设备模型已完成，格式为glTF/GLB | ☐ |
| 2 | LOD模型 | 每种设备包含LOD0/LOD1/LOD2三个精度级别 | ☐ |
| 3 | 模型命名 | 设备ID/类型/版本号命名规范统一 | ☐ |
| 4 | 坐标系转换 | GIS坐标到3D世界坐标转换正确 | ☐ |
| 5 | 场景完整性 | 场站建筑、道路、绿化全部建模 | ☐ |
| 6 | 电气接线 | 一次接线图SVG完整，设备位置准确 | ☐ |
| 7 | 导线动画 | 功率流动画流畅，方向正确 | ☐ |
| 8 | 设备状态显示 | PCS/BMS状态颜色编码正确 | ☐ |
| 9 | SOC可视化 | 电池SOC颜色渐变正确 | ☐ |
| 10 | 温度热图 | 电池温度热图颜色映射正确 | ☐ |
| 11 | 告警闪烁 | 告警设备边框正确闪烁 | ☐ |
| 12 | MQTT连接 | 实时数据订阅稳定，断线重连 | ☐ |
| 13 | 数据刷新 | 遥测数据≥1s刷新一次 | ☐ |
| 14 | 设备映射 | 设备ID与3D模型绑定正确 | ☐ |
| 15 | 本地缓存 | IndexedDB缓存离线可用 | ☐ |
| 16 | 历史回放 | 支持选取时间段回放数据 | ☐ |
| 17 | 回放动画 | 回放时信号流动画正常 | ☐ |
| 18 | Web端加载 | 首屏加载时间<5s | ☐ |
| 19 | Web端帧率 | 正常视图下≥30fps | ☐ |
| 20 | 电气图交互 | 点击设备跳转3D视图正常 | ☐ |
| 21 | 3D视角切换 | 预设视角动画流畅 | ☐ |
| 22 | 剖面视图 | 设备内部结构可见 | ☐ |
| 23 | VR模式入口 | VR按钮可见，可进入VR模式 | ☐ |
| 24 | VR帧率 | VR模式下≥72fps（PC VR）/≥72fps（Quest） | ☐ |
| 25 | VR视角切换 | VR中视角切换动画正常 | ☐ |
| 26 | VR设备交互 | 手柄指向设备显示数据面板 | ☐ |
| 27 | VR告警响应 | 告警设备高亮，手柄震动反馈 | ☐ |
| 28 | VR移动控制 | 第一人称漫游流畅 | ☐ |
| 29 | 数据面板 | 设备实时数据面板显示正确 | ☐ |
| 30 | 能量流总览 | 动态功率箭头动画正常 | ☐ |
| 31 | 权限验证 | 远程控制需要权限验证 | ☐ |
| 32 | 性能监控 | 帧率监控显示正常 | ☐ |
| 33 | 日志记录 | 操作日志完整记录 | ☐ |
| 34 | 文档交付 | 技术文档、API文档完整 | ☐ |
| 35 | 培训支持 | 运维人员培训完成 | ☐ |

### 7.2 模型交付格式要求

```
/models
├── ess_scene_lod0.glb      # 场站总览高精度（含所有设备）
├── ess_scene_lod2.glb      # 场站总览低精度（GIS地图用）
├── pcs
│   ├── PCS_001_lod0.glb   # PCS高精度（含风扇动画）
│   ├── PCS_001_lod1.glb   # PCS中精度
│   └── PCS_001_lod2.glb   # PCS低精度
├── battery
│   ├── BATT_001_lod0.glb  # 电池舱高精度（含液冷管路）
│   ├── BATT_001_lod1.glb  # 电池舱中精度
│   └── BATT_001_lod2.glb  # 电池舱低精度
├── transformer
│   └── TRANS_001.glb      # 变压器（单精度）
├── switchgear
│   ├── SWG_001.glb        # 并网柜
│   └── SWG_002.glb        # 开关柜
└── building
    ├── BLD_POWER.glb       # 配电房
    └── BLD_OFFICE.glb      # 综合楼

# 元数据文件
/device_metadata.json      # 设备ID、位置、属性映射表
/scene_config.json         # 场景配置、光照、雾效
```

**模型规范**：
- 格式：glTF 2.0 / GLB二进制
- 单位：米（1 unit = 1 meter）
- 轴向：Y轴向上
- 材质：PBR材质，支持metalness/roughness
- 动画：Draco压缩，<500KB单个文件
- 三角面数：LOD0 < 50K，LOD1 < 20K，LOD2 < 5K

### 7.3 数据接入接口规范

**MQTT主题规范**：

```
# 设备遥测数据
ess/{device_type}_{device_id}/telemetry
ess/pcs_001/telemetry
ess/bms_001/telemetry

# 遥测数据格式
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "deviceId": "PCS_001",
  "data": {
    "activePower": 2500.5,
    "reactivePower": -500.2,
    "dcVoltage": 1200,
    "dcCurrent": 2087,
    "temperature": [35, 36, 34, 37],
    "state": "grid_connected"
  }
}

# 告警数据
ess/{device_type}_{device_id}/alerts

# 告警数据格式
{
  "timestamp": "2025-01-15T10:30:05.000Z",
  "deviceId": "PCS_001",
  "alert": {
    "code": "PCS_OVER_TEMP",
    "level": "warning",
    "message": "PCS模块温度超过阈值",
    "value": 85,
    "threshold": 80
  }
}

# 控制指令（下行）
ess/{device_type}_{device_id}/control

# 控制指令格式
{
  "command": "set_power",
  "params": {
    "targetPower": 3000,
    "rampRate": 100
  },
  "requestId": "uuid-xxx"
}
```

**WebSocket接口**：

```javascript
// 连接
ws://server/api/v1/realtime

// 订阅消息
{ "type": "subscribe", "topics": ["ess/+/telemetry", "ess/+/alerts"] }

// 推送消息
{
  "type": "data",
  "topic": "ess/pcs_001/telemetry",
  "data": { ... }
}

// 心跳
{ "type": "ping" }
{ "type": "pong" }
```

### 7.4 性能指标要求

| 指标 | 要求 | 测试方法 |
|------|------|---------|
| **首屏加载时间** | <5秒（Web端）/ <10秒（VR端） | Lighthouse / Performance API |
| **Web端帧率** | ≥30fps（正常视图）/ ≥60fps（静止时） | Chrome DevTools FPS |
| **VR端帧率** | ≥72fps（PC VR）/ ≥72fps（Quest standalone） | VR系统监控 |
| **数据延迟** | MQTT→前端<500ms | 时间戳差值统计 |
| **告警响应** | 告警发生→前端显示<1s | 告警时间戳验证 |
| **视角切换** | 动画过渡<2s | 手动计时 |
| **模型加载** | 单个设备模型<1MB | 文件大小统计 |
| **并发连接** | MQTT客户端≥100 | 负载测试 |
| **内存占用** | Web端<2GB / VR端<4GB | 浏览器任务管理器 |

---

## 八、技术实现总结

本Skill提供了储能电站数字孪生VR虚拟现实系统的完整技术方案，涵盖：

1. **系统架构**：分层设计，从物理设备到多端展示的完整数据流
2. **3D建模**：设备模型清单、LOD策略、坐标系规范
3. **动态动画**：功率箭头、设备状态、SOC填充、温度热图的完整实现
4. **实时数据**：MQTT/OPC-UA接入、数据映射、缓存策略
5. **VR漫游**：A-Frame/Unity VR实现、视角切换、设备交互
6. **Web大屏**：SVG电气图、3D视图、能量流向可视化
7. **交付清单**：35项检查表、模型规范、接口规范、性能指标

核心亮点：
- 支持Web/PC/VR多端一体化展示
- 数据驱动的实时状态渲染，支持历史回放
- VR中支持手柄指向交互和数据面板显示
- 性能优化策略确保VR≥90fps流畅体验
- 完整的交付检查表确保项目质量可控

---

*Skill版本：v1.0*
*最后更新：2025-01-15*