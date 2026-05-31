# 硬件精确选型专业Skill v1.0

> 适用范围：储能电站(10kV/35kV并网)全设备精确选型与计算  
> 版本：v1.0 | 更新日期：2026-05-31  
> 编制依据：GB/T 34120、GB/T 34131、GB/T 36547、DL/T 5222、GB 50217

---

## 一、PCS储能变流器选型

### 1.1 功率等级与电压等级匹配

| 功率等级 | 交流电压等级 | 直流电压范围 | 典型应用场景 | 冷却方式 |
|---------|------------|------------|------------|---------|
| 50kW | 380V | 600~900V | 工商业屋顶 | 风冷 |
| 100kW | 380V/400V | 600~1000V | 工商业储能 | 风冷 |
| 250kW | 400V/480V | 700~1100V | 工商业大容量 | 风冷/液冷 |
| 500kW | 480V/690V | 800~1300V | 独立储能电站 | 液冷 |
| 1000kW | 690V/10kV | 1000~1500V | 大型储能电站 | 液冷 |
| 1500kW | 10kV | 1200~1700V | 大型储能电站 | 液冷 |

### 1.2 PCS关键参数要求

```
额定参数:
  - 额定有功功率: Pn (kW)
  - 额定视在功率: Sn ≥ Pn / 0.95 (kVA, 功率因数0.95过发能力)
  - 额定交流电压: Un (V)
  - 额定交流电流: In = Sn / (√3 × Un) (A)
  - 直流电压范围: Udc_min ~ Udc_max (V)
  
性能指标:
  - 额定效率(充电): η_chg ≥ 97.0%
  - 额定效率(放电): η_dis ≥ 97.0%
  - 功率因数范围: -0.95 ~ +0.95 (额定功率下)
  - 电流THD: ≤ 3% (额定工况)
  - 响应时间: 有功≤200ms, 无功≤100ms
  
保护功能:
  - 交流侧过流保护(三段式)
  - 直流侧过压/欠压保护
  - 防孤岛保护(主动+被动)
  - 低电压穿越(LVRT)
  - 过温降额/停机保护
```

### 1.3 冷却方式选型原则

```
风冷选型条件:
  - 功率等级 < 250kW
  - 环境温度 -20℃ ~ +50℃
  - 噪声要求 ≤ 75dB(A) @1m
  - IP防护等级 ≥ IP54
  - 优势: 结构简单, 维护方便, 成本低
  - 劣势: 散热能力有限, 噪声较大

液冷选型条件:
  - 功率等级 ≥ 250kW
  - 环境温度 -30℃ ~ +55℃
  - 噪声要求 ≤ 70dB(A) @1m
  - IP防护等级 ≥ IP55
  - 冷却液: 50%乙二醇水溶液(冰点-35℃)
  - 流量计算: Q = P_loss / (ρ × Cp × ΔT)
    Q: 流量(L/min), P_loss: 损耗功率(W)
    ρ: 密度(1.07 kg/L), Cp: 比热容(3.5 kJ/kg·K)
    ΔT: 温升(5~8K)
  - 优势: 散热均匀, 功率密度高, 噪声低
  - 劣势: 管路复杂, 维护要求高, 成本高
```

### 1.4 品牌对比矩阵

| 参数 | 阳光电源 | 科华数能 | 上能电气 | 华为数字能源 |
|------|---------|---------|---------|------------|
| 型号(500kW) | SC500TL | SC500K | UP500K | SmartPCS500 |
| 额定效率 | 97.5% | 97.2% | 97.0% | 97.5% |
| 功率因数范围 | ±0.9 | ±0.9 | ±0.85 | ±0.95 |
| THD | 2.5% | 3.0% | 3.0% | 2.0% |
| 响应时间(有功) | 150ms | 200ms | 200ms | 100ms |
| LVRT能力 | 有 | 有 | 有 | 有 |
| 冷却方式 | 液冷 | 液冷 | 液冷 | 液冷 |
| 通信协议 | Modbus/IEC104 | Modbus/IEC104 | Modbus/IEC104 | Modbus/IEC104 |
| 售后服务(响应) | 4h | 8h | 12h | 4h |
| 参考价格(万/kW) | 0.18~0.22 | 0.16~0.20 | 0.15~0.18 | 0.20~0.25 |
| 质保期 | 5年 | 5年 | 3年 | 5年 |
| 市场份额(2025) | 35% | 25% | 15% | 20% |

### 1.5 PCS选型计算书模板

```python
# PCS选型计算程序
def pcs_selection(
    battery_capacity_kwh: float,
    battery_voltage_v: float,
    grid_voltage_v: float,
    peak_power_kw: float,
    cos_phi: float = 0.95
):
    """PCS选型计算"""
    # 1. 确定PCS额定功率(取放电功率与峰值功率较大值)
    p_discharge = battery_capacity_kwh * 0.5 / 2  # 0.5C放电, 2小时
    p_rated = max(p_discharge, peak_power_kw)
    
    # 2. 选择标准功率等级
    standard_powers = [50, 100, 250, 500, 1000, 1500]
    for sp in standard_powers:
        if sp >= p_rated:
            p_rated = sp
            break
    
    # 3. 计算视在功率
    s_rated = p_rated / cos_phi
    
    # 4. 计算额定电流
    i_rated = s_rated * 1000 / (1.732 * grid_voltage_v)
    
    # 5. 直流电压范围校验
    udc_min = battery_voltage_v * 0.85
    udc_max = battery_voltage_v * 1.15
    
    # 6. 效率与损耗
    eta = 0.97
    p_loss = p_rated * (1 - eta) / eta
    q_cooling = p_loss * 1000 / (1.07 * 3.5 * 6)  # 液冷流量计算
    
    result = {
        "额定功率(kW)": p_rated,
        "视在功率(kVA)": round(s_rated, 1),
        "额定电流(A)": round(i_rated, 1),
        "直流电压范围(V)": f"{round(udc_min)}~{round(udc_max)}",
        "额定效率": f"{eta*100}%",
        "损耗功率(kW)": round(p_loss, 2),
        "冷却方式": "液冷" if p_rated >= 250 else "风冷",
        "液冷流量(L/min)": round(q_cooling, 1) if p_rated >= 250 else "N/A"
    }
    return result

# 示例：5MWh储能系统PCS选型
result = pcs_selection(
    battery_capacity_kwh=5000,
    battery_voltage_v=1000,
    grid_voltage_v=10000,
    peak_power_kw=2500
)
for k, v in result.items():
    print(f"{k}: {v}")
```

---

## 二、BESS储能电池系统选型

### 2.1 电芯选型对比

| 参数 | LFP(磷酸铁锂) | NMC(三元锂) |
|------|--------------|------------|
| 标称容量 | 280Ah | 110Ah |
| 标称电压 | 3.2V | 3.7V |
| 单体能量 | 896Wh | 407Wh |
| 循环寿命(80%SOH) | 6000~10000次 | 3000~5000次 |
| 工作电压范围 | 2.5~3.65V | 2.8~4.2V |
| 能量密度(单体) | 160~180Wh/kg | 220~260Wh/kg |
| 热失控起始温度 | 270℃ | 150℃ |
| 本征安全性 | 高 | 中 |
| 单价(元/Wh) | 0.35~0.45 | 0.50~0.65 |
| 推荐应用 | 大储/工商业 | 动力/空间受限 |

**选型结论：储能电站优先选用LFP 280Ah，安全性高、循环寿命长、成本低。**

### 2.2 电池簇配置计算

```
电芯参数(LFP 280Ah/3.2V):
  标称容量: C_cell = 280 Ah
  标称电压: U_cell = 3.2 V
  单体能量: E_cell = C_cell × U_cell = 896 Wh

串联配置(16S1P):
  簇电压: U_cluster = 16 × 3.2 = 51.2 V
  簇容量: C_cluster = 280 Ah (1P不变)
  簇能量: E_cluster = 51.2 × 280 / 1000 = 14.34 kWh
  簇电压范围: 16 × 2.5 ~ 16 × 3.65 = 40.0 ~ 58.4 V

串联配置(52S1P, 对应高压级联):
  簇电压: U_cluster = 52 × 3.2 = 166.4 V
  簇能量: E_cluster = 166.4 × 280 / 1000 = 46.59 kWh
  簇电压范围: 52 × 2.5 ~ 52 × 3.65 = 130.0 ~ 189.8 V
```

### 2.3 簇并联与集装箱配置

```python
def battery_container_config(
    cell_capacity_ah: float = 280,
    cell_voltage_v: float = 3.2,
    series_count: int = 16,
    target_energy_kwh: float = 5000,
    soc_usable: float = 0.9,
    dod: float = 0.9
):
    """电池集装箱配置计算"""
    # 簇参数
    cluster_voltage = series_count * cell_voltage_v
    cluster_capacity = cell_capacity_ah
    cluster_energy_kwh = cluster_voltage * cluster_capacity / 1000
    
    # 可用簇能量
    cluster_usable = cluster_energy_kwh * dod * soc_usable
    
    # 需要的簇数
    total_clusters = int(target_energy_kwh / cluster_usable) + 1
    
    # 集装箱配置(每箱16簇典型配置)
    clusters_per_container = 16
    containers = (total_clusters + clusters_per_container - 1) // clusters_per_container
    actual_clusters = containers * clusters_per_container
    
    # 总容量计算
    total_energy_kwh = actual_clusters * cluster_energy_kwh
    total_usable_kwh = total_energy_kwh * dod * soc_usable
    
    # 并联数(每簇1P)
    parallel_per_cluster = 1
    
    result = {
        "电芯规格": f"{cell_capacity_ah}Ah/{cell_voltage_v}V",
        "串联数": f"{series_count}S",
        "簇电压(V)": cluster_voltage,
        "簇容量(Ah)": cluster_capacity,
        "簇能量(kWh)": round(cluster_energy_kwh, 2),
        "目标容量(kWh)": target_energy_kwh,
        "总簇数": actual_clusters,
        "集装箱数": containers,
        "每箱簇数": clusters_per_container,
        "总标称容量(kWh)": round(total_energy_kwh, 2),
        "总可用容量(kWh)": round(total_usable_kwh, 2),
        "额定功率(kW, 0.5C)": round(total_energy_kwh * 0.5, 0),
        "电压范围(V)": f"{series_count*2.5:.0f}~{series_count*3.65:.0f}"
    }
    return result

# 示例：5MWh系统配置
config = battery_container_config(target_energy_kwh=5000)
for k, v in config.items():
    print(f"{k}: {v}")
```

### 2.4 温控选型对比

| 温控方式 | 适用容量 | 温度均匀性 | 能耗比 | 初投资 | 维护 | 噪声 |
|---------|---------|----------|-------|-------|------|------|
| 风冷(空调+风道) | <5MWh | ±5℃ | COP≈3.0 | 低 | 简单 | 65~75dB |
| 液冷(冷板+chiller) | 5~50MWh | ±3℃ | COP≈3.5 | 中 | 中等 | 55~65dB |
| 浸没式 | >10MWh | ±2℃ | COP≈4.0 | 高 | 复杂 | 50~60dB |

```
温控热负荷计算:
  Q_cooling = N_cell × I² × R_internal × (1 - η_round) + Q_ambient
  
  简化计算:
  Q_cooling = E_total × C_rate × (1 - η_rt) × 1000 (W)
  
  示例(5MWh, 0.5C充放电):
  Q_cooling = 5000 × 0.5 × (1 - 0.95) × 1000 = 125,000 W = 125 kW
  
  空调选型:
  制冷量 ≥ Q_cooling / COP = 125 / 3.0 = 41.7 kW → 选用50kW空调×3台
```

### 2.5 消防选型对比

| 消防方式 | 灭火介质 | 设计浓度 | 喷放时间 | 残留影响 | 适用场景 | 单价(元/m³) |
|---------|---------|---------|---------|---------|---------|------------|
| 气溶胶 | K₂O固体微粒 | 100g/m³ | ≤30s | 需清洁 | 电池舱 | 200~400 |
| 七氟丙烷(FM200) | CF₃CHFCF₃ | 7%(V/V) | ≤10s | 无残留 | 电气舱 | 500~800 |
| 水喷淋 | 自来水/纯水 | - | ≤60s | 需排水 | 舱外 | 100~200 |
| 全氟己酮(Novec1230) | C₆F₁₂O | 4.5%(V/V) | ≤10s | 无残留 | 精密电气 | 800~1500 |

### 2.6 BESS选型计算书模板

```python
def bess_calc_sheet(
    target_mwh: float,
    c_rate: float = 0.5,
    cell_ah: float = 280,
    cell_v: float = 3.2,
    series: int = 16,
    clusters_per_box: int = 16
):
    """BESS完整选型计算书"""
    cluster_kwh = series * cell_v * cell_ah / 1000
    total_clusters = int(target_mwh * 1000 / (cluster_kwh * 0.9 * 0.9)) + 1
    containers = (total_clusters + clusters_per_box - 1) // clusters_per_box
    actual_clusters = containers * clusters_per_box
    total_kwh = actual_clusters * cluster_kwh
    
    # PCS配置
    pcs_kw = total_kwh * c_rate
    standard_pcs = [50, 100, 250, 500, 1000, 1500]
    pcs_unit = 500  # 选500kW为单元
    pcs_count = int(pcs_kw / pcs_unit) + (1 if pcs_kw % pcs_unit > 0 else 0)
    
    # 变压器
    tx_kva = pcs_count * pcs_unit / 0.95 * 1.1  # 考虑功率因数和裕度
    standard_tx = [315, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000]
    tx_selected = next(t for t in standard_tx if t >= tx_kva)
    
    # 热负荷
    q_thermal = total_kwh * c_rate * (1 - 0.95) * 1000  # W
    
    sheet = {
        "一、电池系统": {
            "目标容量(MWh)": target_mwh,
            "电芯规格": f"LFP {cell_ah}Ah/{cell_v}V",
            "串联配置": f"{series}S1P",
            "簇能量(kWh)": round(cluster_kwh, 2),
            "总簇数": actual_clusters,
            "集装箱数": containers,
            "总标称容量(kWh)": round(total_kwh, 2),
            "总可用容量(kWh, 90%DOD×90%SOC)": round(total_kwh * 0.81, 2),
            "系统效率(RT)": "95%",
            "系统DOD": "90%",
        },
        "二、PCS系统": {
            "额定功率(kW)": round(pcs_kw, 0),
            "PCS单元功率(kW)": pcs_unit,
            "PCS数量(台)": pcs_count,
            "总PCS功率(kW)": pcs_count * pcs_unit,
            "效率要求": "≥97%",
            "冷却方式": "液冷",
        },
        "三、变压器": {
            "计算容量(kVA)": round(tx_kva, 0),
            "选择容量(kVA)": tx_selected,
            "阻抗电压": "6%",
            "连接组别": "Dyn11",
        },
        "四、温控": {
            "热负荷(kW)": round(q_thermal / 1000, 1),
            "温控方式": "液冷(冷板+chiller)" if target_mwh >= 5 else "风冷(空调+风道)",
            "COP": "3.5(液冷)" if target_mwh >= 5 else "3.0(风冷)",
        },
        "五、消防": {
            "主消防": "气溶胶(电池舱)",
            "副消防": "七氟丙烷(电气舱)",
            "极早期预警": "VESDA吸气式感烟",
        }
    }
    return sheet

# 生成5MWh系统计算书
sheet = bess_calc_sheet(target_mwh=5)
import json
print(json.dumps(sheet, ensure_ascii=False, indent=2))
```

---

## 三、变压器选型

### 3.1 容量计算

```
变压器容量计算公式:
  S = √(P² + Q²) / η_pcs × K_redundancy

  P: 储能有功功率(kW)
  Q: 储能无功功率(kVar), Q = P × tan(arccos(cosφ))
  η_pcs: PCS效率(取0.97)
  K_redundancy: 裕度系数(取1.05~1.10)

示例(2500kW储能, cosφ=0.95):
  P = 2500 kW
  Q = 2500 × tan(arccos(0.95)) = 2500 × 0.3287 = 821.7 kVar
  S = √(2500² + 821.7²) / 0.97 × 1.05 = 2631.6 / 0.97 × 1.05 = 2847.1 kVA
  → 选用3150kVA变压器
```

### 3.2 变压器选型参数表

| 参数 | 要求 | 备注 |
|------|------|------|
| 额定容量 | 按计算值选标准容量 | GB/T 6451标准序列 |
| 电压组合 | 10.5±5%/0.4kV 或 35±5%/10.5kV | 按并网电压确定 |
| 连接组别 | Dyn11 | 零序通路, 抑制谐波 |
| 阻抗电压 | 6%(10kV级)/6.5%(35kV级) | 限制短路电流 |
| 冷却方式 | ONAN(油浸自冷)/AN(干式自冷) | 储能站多用干式 |
| 能效等级 | 2级以上 | GB 20052 |
| 绝缘水平 | LI75/AC35(10kV) | 雷电冲击/工频耐压 |
| 温升限值 | 绕组:100K(干式F级)/顶层油:55K(油浸) | GB 1094.11 |

### 3.3 标准容量序列

```
10kV级干式变压器标准容量(kVA):
  30, 50, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000

35kV级干式变压器标准容量(kVA):
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500
```

### 3.4 变压器选型代码

```python
def transformer_selection(
    active_power_kw: float,
    cos_phi: float = 0.95,
    pcs_efficiency: float = 0.97,
    redundancy_factor: float = 1.05,
    voltage_class_kv: float = 10
):
    """变压器选型计算"""
    import math
    # 无功功率
    reactive_power_kvar = active_power_kw * math.tan(math.acos(cos_phi))
    
    # 视在功率
    apparent_power_kva = math.sqrt(active_power_kw**2 + reactive_power_kvar**2)
    
    # 考虑PCS效率和裕度
    tx_calculated = apparent_power_kva / pcs_efficiency * redundancy_factor
    
    # 选择标准容量
    standard_10kv = [30,50,80,100,125,160,200,250,315,400,500,630,
                     800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000]
    standard_35kv = [800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500]
    
    standard = standard_35kv if voltage_class_kv >= 35 else standard_10kv
    tx_selected = next(s for s in standard if s >= tx_calculated)
    
    # 短路阻抗计算
    z_percent = 6.0 if voltage_class_kv <= 10 else 6.5
    
    # 短路电流
    i_sc_ka = tx_selected / (1.732 * voltage_class_kv * z_percent / 100)
    
    return {
        "有功功率(kW)": active_power_kw,
        "无功功率(kVar)": round(reactive_power_kvar, 1),
        "计算容量(kVA)": round(tx_calculated, 1),
        "选择容量(kVA)": tx_selected,
        "电压等级(kV)": voltage_class_kv,
        "连接组别": "Dyn11",
        "阻抗电压(%)": z_percent,
        "短路电流(kA)": round(i_sc_ka, 2),
        "负载率(%)": round(tx_calculated / tx_selected * 100, 1),
        "能效等级要求": "2级(GB 20052)"
    }
```

---

## 四、开关柜选型

### 4.1 PCC并网柜

```
PCC并网柜配置清单:
┌─────────────────────────────────────────────────────┐
│  PCC并网柜 (KYN28A-12 型)                           │
├─────────────────────────────────────────────────────┤
│  1. 真空断路器 VCB                                   │
│     - 额定电压: 12kV                                 │
│     - 额定电流: 按负荷计算(630/1250/2000A)            │
│     - 遮断容量: 25kA/31.5kA                          │
│     - 操作机构: 弹簧操动                              │
│                                                     │
│  2. 电流互感器 CT (测量+保护)                         │
│     - 测量绕组: 0.2S级, 5VA                          │
│     - 保护绕组: 5P10级, 10VA                         │
│     - 变比: 按负荷电流选择                            │
│                                                     │
│  3. 电压互感器 PT                                    │
│     - 测量绕组: 0.2级, 30VA                          │
│     - 变比: 10kV/100V                               │
│                                                     │
│  4. 关口电能表                                       │
│     - 精度: 0.2S级(双向)                             │
│     - 通信: RS485/以太网                             │
│     - 功能: 正反向有功/正反向无功/需量                 │
│                                                     │
│  5. 微机综保装置                                     │
│     - 过流三段式/零序/方向                            │
│     - 防孤岛/逆流/低穿                               │
│                                                     │
│  6. 避雷器 HY5WZ-17/45                              │
│  7. 带电显示器                                       │
│  8. 智能操控单元(温湿度/加热/照明)                    │
└─────────────────────────────────────────────────────┘
```

### 4.2 储能并网柜

```
储能并网柜配置:
  - 额定电压: 12kV (10kV系统)
  - 额定电流: 按PCS总电流确定
  - 真空断路器: 同PCC柜
  - CT: 0.5级测量 + 5P10级保护
  - PT: 10kV/100V
  - 综保: 过流+过欠压+频偏
  - 隔离开关: GN30-12型
```

### 4.3 负荷开关柜

```
负荷开关柜配置 (XGN2-12 型):
  - 负荷开关+熔断器组合
  - 额定电流: 400A/630A
  - 熔断器: XRNT型, 按变压器容量选
  - 适用: 变压器出线侧(≤800kVA)
  - 优势: 成本低于断路器柜
```

---

## 五、电缆选型

### 5.1 载流量计算

```
载流量计算公式:
  I_z = K_t × K_g × K_n × I_table

  I_table: 电缆标准载流量(A), 查GB 50217附录
  K_t: 温度修正系数 = √((θ_max - θ_amb) / (θ_max - θ_ref))
    θ_max: 导体最高允许温度(XLPE=90℃, PVC=70℃)
    θ_amb: 环境温度(埋地25℃, 空气40℃)
    θ_ref: 基准温度(埋地25℃, 空气30℃)
  K_g: 并列修正系数, 查表(间距≥2d时K_g=1.0)
  K_n: 敷设方式修正系数, 查表

示例: YJV-10kV-3×70mm² 电缆
  I_table = 210A (空气中30℃)
  K_t = √((90-40)/(90-30)) = √(50/60) = 0.913
  K_g = 0.85 (6根并列, 间距1d)
  K_n = 1.0 (桥架敷设)
  I_z = 0.913 × 0.85 × 1.0 × 210 = 163.0 A
```

### 5.2 压降校验

```
电压降计算公式:
  ΔU% = (√3 × I × L × (R×cosφ + X×sinφ)) / (10 × U_N) × 100%

  I: 工作电流(A)
  L: 电缆长度(km)
  R: 交流电阻(Ω/km) = ρ/(S×1000) × K_skin
  X: 电抗(Ω/km) ≈ 0.08~0.10 (10kV级)
  cosφ: 功率因数
  U_N: 额定电压(V)

允许电压降:
  - 动力回路: ΔU% ≤ 5%
  - 照明回路: ΔU% ≤ 3%
  - PCS直流侧: ΔU% ≤ 2%

示例: 10kV, 150A, 200m, YJV-3×50mm²
  R = 0.408 Ω/km, X = 0.085 Ω/km, cosφ = 0.95
  ΔU% = (√3×150×0.2×(0.408×0.95+0.085×0.312))/(10×10000)×100
      = (1.732×150×0.2×(0.388+0.027))/100000×100
      = 0.216%
  → 满足ΔU%≤5%要求
```

### 5.3 短路热稳定校验

```
短路热稳定校验公式:
  S_min = I_k × √t_k / C

  S_min: 最小电缆截面(mm²)
  I_k: 短路电流有效值(A)
  t_k: 短路持续时间(s), 取继保动作时间+断路器全分闸时间
  C: 热稳定系数
    铜芯XLPE: C = 142
    铜芯PVC: C = 115
    铝芯XLPE: C = 94
    铝芯PVC: C = 76

示例: I_k = 20kA, t_k = 0.5s, 铜芯XLPE
  S_min = 20000 × √0.5 / 142 = 20000 × 0.707 / 142 = 99.6 mm²
  → 选用3×120mm²电缆(满足热稳定)
```

### 5.4 电缆选型代码

```python
def cable_sizing(
    working_current_a: float,
    cable_length_m: float,
    voltage_kv: float,
    cos_phi: float = 0.95,
    short_circuit_ka: float = 20,
    fault_time_s: float = 0.5,
    ambient_temp_c: float = 40,
    max_conductor_temp_c: float = 90,
    reference_temp_c: float = 30,
    parallel_cables: int = 1,
    cable_group_factor: float = 0.85,
    allow_vdrop_pct: float = 5.0
):
    """电缆选型计算"""
    import math
    
    # 温度修正系数
    K_t = math.sqrt((max_conductor_temp_c - ambient_temp_c) / 
                     (max_conductor_temp_c - reference_temp_c))
    K_g = cable_group_factor
    K_n = 1.0  # 桥架敷设
    
    # 需要的载流量
    I_required = working_current_a / (K_t * K_g * K_n)
    
    # 电缆标准载流量表(YJV, 空气中30℃, XLPE 90℃)
    # 截面: 载流量(1kV级)
    cable_table_1kv = {
        10: 62, 16: 82, 25: 107, 35: 134, 50: 162,
        70: 210, 95: 257, 120: 299, 150: 343, 185: 393,
        240: 470, 300: 542, 400: 641
    }
    cable_table_10kv = {
        25: 100, 35: 125, 50: 155, 70: 195, 95: 240,
        120: 280, 150: 320, 185: 370, 240: 450, 300: 520
    }
    
    cable_table = cable_table_10kv if voltage_kv >= 6 else cable_table_1kv
    
    # 按载流量选截面
    selected_cross_section = None
    for cs, it in sorted(cable_table.items()):
        if it >= I_required:
            selected_cross_section = cs
            break
    
    # 短路热稳定校验
    C = 142  # 铜芯XLPE
    S_min = short_circuit_ka * 1000 * math.sqrt(fault_time_s) / C
    thermal_cross_section = next(cs for cs in sorted(cable_table.keys()) if cs >= S_min)
    
    # 取大值
    final_cross_section = max(selected_cross_section, thermal_cross_section)
    
    # 电压降校验
    # 电阻率简化计算
    rho_cu = 0.0175  # Ω·mm²/m (20℃)
    R = rho_cu / final_cross_section * 1000  # Ω/km
    X = 0.085  # Ω/km
    sin_phi = math.sqrt(1 - cos_phi**2)
    I_calc = working_current_a
    L_km = cable_length_m / 1000
    vdrop_pct = (math.sqrt(3) * I_calc * L_km * (R * cos_phi + X * sin_phi)) / (10 * voltage_kv * 1000) * 100
    
    return {
        "工作电流(A)": working_current_a,
        "温度修正系数K_t": round(K_t, 3),
        "并列修正系数K_g": K_g,
        "所需载流量(A)": round(I_required, 1),
        "按载流量选截面(mm²)": selected_cross_section,
        "热稳定最小截面(mm²)": round(S_min, 1),
        "热稳定选截面(mm²)": thermal_cross_section,
        "最终截面(mm²)": final_cross_section,
        "电压降(%)": round(vdrop_pct, 3),
        "电压降校验": "合格" if vdrop_pct <= allow_vdrop_pct else "不合格",
        "电缆型号": f"YJV-{voltage_kv}kV-3×{final_cross_section}",
        "热稳定校验": "合格" if final_cross_section >= S_min else "不合格"
    }
```

---

## 六、CT/PT选型

### 6.1 CT选型参数

```
CT选型要点:
  1. 变比选择: I_primary / I_secondary
     I_primary ≥ 1.25 × I_working (额定一次电流)
     I_secondary = 1A 或 5A (推荐1A, 减小二次负荷)
  
  2. 准确级选择:
     - 关口计量: 0.2S级 (误差≤0.2%@100%In)
     - 一般测量: 0.5级
     - 保护用: 5P10 或 5P20 (5%误差@10In或20In)
  
  3. 额定容量选择:
     S_ct ≥ S_meter + S_cable + S_relay
     S_cable = I² × (R_cable × 2)  (考虑往返)
     示例: I=1A, L=50m, 截面2.5mm²
     R_cable = 0.018 × 50 / 2.5 = 0.36 Ω
     S_cable = 1² × 0.36 × 2 = 0.72 VA

  4. 二次负荷校验:
     Z_total = Z_meter + Z_cable + Z_relay
     S_total = I² × Z_total ≤ S_ct_rated
```

### 6.2 PT选型参数

```
PT选型要点:
  1. 变比选择:
     10kV系统: 10000/100 V → 变比100:1
     35kV系统: 35000/100 V → 变比350:1
  
  2. 准确级选择:
     - 关口计量: 0.2级
     - 一般测量: 0.5级
     - 保护用: 3P级
  
  3. 额定容量选择:
     S_pt ≥ Σ(S_load)
     注意: PT容量不宜过大, 否则影响精度
     典型选择: 30VA(测量), 50VA(保护)
  
  4. 接线方式:
     - 两相V/V接线(测量)
     - 三相Y/y接线(保护+测量)
     - 开口三角接线(零序电压)
```

### 6.3 CT/PT选型代码

```python
def ct_selection(
    working_current_a: float,
    cable_length_m: float = 50,
    cable_section_mm2: float = 2.5,
    secondary_current_a: float = 1,
    application: str = "measurement"  # measurement/protection/metering
):
    """CT选型计算"""
    import math
    
    # 一次电流标准序列
    primary_standard = [10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 
                        400, 500, 600, 800, 1000, 1200, 1500, 2000, 3000]
    
    # 一次电流选择
    i_primary_min = working_current_a * 1.25
    i_primary = next(i for i in primary_standard if i >= i_primary_min)
    
    # 变比
    ratio = f"{i_primary}/{secondary_current_a}"
    ratio_value = i_primary / secondary_current_a
    
    # 准确级
    accuracy_map = {"metering": "0.2S", "measurement": "0.5", "protection": "5P10"}
    accuracy = accuracy_map.get(application, "0.5")
    
    # 电缆电阻
    rho = 0.018  # 铜电阻率 Ω·mm²/m
    r_cable = rho * cable_length_m / cable_section_mm2
    s_cable = secondary_current_a**2 * r_cable * 2  # 往返
    
    # 负荷估算
    s_meter = 0.2 if application == "metering" else (1.0 if application == "measurement" else 2.0)
    s_relay = 0.5 if application == "protection" else 0.1
    s_total = s_cable + s_meter + s_relay
    
    # 标准容量
    s_standard = [2.5, 5, 10, 15, 20, 30, 50, 60, 75, 100]
    s_ct = next(s for s in s_standard if s >= s_total * 1.2)
    
    return {
        "工作电流(A)": working_current_a,
        "一次电流(A)": i_primary,
        "二次电流(A)": secondary_current_a,
        "变比": ratio,
        "准确级": accuracy,
        "电缆电阻(Ω)": round(r_cable, 3),
        "电缆负荷(VA)": round(s_cable, 3),
        "仪表负荷(VA)": s_meter,
        "保护负荷(VA)": s_relay,
        "总负荷(VA)": round(s_total, 3),
        "选择容量(VA)": s_ct,
        "负荷率(%)": round(s_total / s_ct * 100, 1),
        "校验": "合格" if s_total <= s_ct else "不合格"
    }
```

---

## 七、保护装置选型

### 7.1 微机综合保护装置

```
微机综保功能配置:
  ┌─────────────────────────────────────────────────┐
  │  保护功能                 │  定值范围            │
  ├─────────────────────────────────────────────────┤
  │  三段式过流保护           │  0.1~99.9A          │
  │  方向过流保护             │  0°~360°            │
  │  零序过流保护             │  0.01~9.99A         │
  │  过电压保护               │  50~199V(二次值)    │
  │  欠电压保护               │  2~99V(二次值)      │
  │  频率偏差保护             │  45~55Hz            │
  │  防孤岛保护               │  频偏+压偏+df/dt    │
  │  逆功率保护               │  -99.9~99.9%Pn      │
  │  差动保护(变压器)         │  0.1~99.9A          │
  │  重合闸                   │  0.1~9.9s           │
  │  事件记录                 │  ≥100条             │
  │  故障录波                 │  ≥10组              │
  └─────────────────────────────────────────────────┘

品牌推荐:
  - 国电南瑞: PCS-941系列, 电力系统首选
  - 许继电气: WBH-800系列, 性价比高
  - 四方继保: CSC-100系列, 通信功能强
  - 长园深瑞: ISA-300系列, 储能专用
```

### 7.2 防孤岛保护装置

```
防孤岛保护配置:
  主动检测:
    - 频率偏移法(AFD): 正常运行时施加微小频偏
    - 正反馈频移法(SFS): 增大频偏正反馈
    - 无功功率扰动法: 周期性注入无功扰动
  
  被动检测:
    - 过/欠频保护: 51.5Hz/48.5Hz
    - 过/欠压保护: 115%Un/85%Un
    - 频率变化率: df/dt > 2Hz/s
    - 相位突变: Δφ > 15°
    - 谐波检测: THD > 5%
  
  动作逻辑:
    任一检测触发 → 延时100ms(躲涌流) → 跳PCC断路器
    → 闭锁PCS → 上送EMS告警
```

### 7.3 逆流保护装置

```
逆流保护配置:
  逆流检测点: PCC并网点
  逆流定义: P_pcc < 0 (储能向电网放电)
  
  整定原则:
    - 逆流阈值: P_reverse = -3% × P_installed
    - 动作延时: 500ms (躲暂态波动)
    - 复归延时: 2000ms (防止频繁动作)
    - 滞回区间: 1% × P_installed (防止临界抖动)
  
  动作策略:
    P_pcc < P_reverse 持续500ms → 
    Step1: 限制PCS放电功率(每步降10%)
    Step2: 若仍逆流, 切除部分PCS
    Step3: 若仍逆流, 跳PCC断路器
```

---

## 八、通信设备选型

### 8.1 通信网关选型

```
储能通信网关选型:
  硬件要求:
    - CPU: ARM Cortex-A72 (4核1.8GHz) 或 x86
    - 内存: ≥4GB DDR4
    - 存储: ≥32GB eMMC/SSD
    - 网口: ≥4×RJ45(100/1000M) + 2×SFP(光口)
    - 串口: ≥4×RS485 + 2×RS232
    - USB: ≥2×USB2.0
    - 看门狗: 硬件看门狗+软狗
    - 工作温度: -40℃~+70℃
    - 防护等级: IP30(柜内)
    - 电源: DC 24V 或 AC 220V
  
  软件功能:
    - 协议转换: Modbus RTU/TCP ↔ IEC 104 ↔ IEC 61850
    - 数据汇聚: 多设备数据采集与转发
    - 规约解析: 支持主流PCS/BMS/电表协议
    - 边缘计算: 本地策略执行(通信中断时)
    - 远程运维: SSH/VPN远程访问
    - 日志管理: 操作日志/通信日志/告警日志
```

### 8.2 工业交换机选型

```
工业交换机选型:
  核心交换机(站控层):
    - 端口: ≥24×100/1000M RJ45 + 4×SFP
    - 管理功能: VLAN/QoS/RSTP/IGMP Snooping
    - 冗余: 环网冗余(恢复时间<20ms)
    - 供电: 双路DC 24V冗余
    - 防护: IP40, -40℃~+75℃
  
  接入交换机(间隔层):
    - 端口: ≥8×100/1000M RJ45 + 2×SFP
    - 管理功能: VLAN/QoS
    - 供电: DC 24V
    - 防护: IP30, -40℃~+70℃
  
  品牌推荐:
    - 赫斯曼: MICE系列, 工业级标杆
    - 摩莎: EDS系列, 性价比高
    - 华为: CloudEngine S5735-L, 国产化
    - 东土: Kiwi系列, 国产自主可控
```

### 8.3 光纤选型

```
站内通信光纤选型:
  光纤类型: 单模(G.652D) / 多模(G.651)
  纤芯数: 4芯/8芯/12芯/24芯
  光缆类型: 非铠装(室内) / 铠装(室外)
  
  链路计算:
    光功率预算 = P_tx - P_rx - L_splice - L_connector - Margin
    P_tx: 发光功率(典型-3~-8dBm)
    P_rx: 接收灵敏度(典型-20~-28dBm)
    L_splice: 熔接损耗(0.1dB/个)
    L_connector: 连接器损耗(0.5dB/个)
    Margin: 裕度(3dB)
  
  示例(1km单模):
    预算 = (-3) - (-28) - 0.2 - 1.0 - 3.0 = 20.8 dB
    链路衰减 = 0.4dB/km × 1km = 0.4 dB
    → 链路余量 = 20.8 - 0.4 = 20.4 dB ✓
```

---

## 九、选型计算书模板

### 9.1 计算书目录结构

```
储能电站设备选型计算书
├── 1. 项目概况
│   ├── 1.1 建设规模
│   ├── 1.2 并网方式
│   └── 1.3 运行模式
├── 2. PCS选型计算
│   ├── 2.1 功率计算
│   ├── 2.2 电压等级确定
│   ├── 2.3 效率校验
│   ├── 2.4 冷却方式选型
│   └── 2.5 品牌比选
├── 3. BESS选型计算
│   ├── 3.1 电芯选型
│   ├── 3.2 簇配置计算
│   ├── 3.3 集装箱配置
│   ├── 3.4 温控计算
│   └── 3.5 消防配置
├── 4. 变压器选型计算
│   ├── 4.1 容量计算
│   ├── 4.2 阻抗选择
│   └── 4.3 短路电流计算
├── 5. 开关柜选型计算
├── 6. 电缆选型计算
│   ├── 6.1 载流量计算
│   ├── 6.2 压降校验
│   └── 6.3 热稳定校验
├── 7. CT/PT选型计算
├── 8. 保护装置选型
└── 9. 通信设备选型
```

### 9.2 Excel计算书格式

```python
def generate_calc_sheet_excel():
    """生成选型计算书Excel模板结构"""
    import json
    
    template = {
        "工作簿名称": "储能电站设备选型计算书",
        "工作表": [
            {
                "名称": "1-项目概况",
                "列": ["项目名称", "建设地点", "装机容量(MWh)", "并网电压(kV)", 
                       "运行模式", "PCS功率(kW)", "业主单位", "设计单位"],
                "示例数据": ["XX储能电站", "XX省XX市", "5", "10", 
                            "调峰调频", "2500", "XX新能源", "XX设计院"]
            },
            {
                "名称": "2-PCS选型",
                "列": ["计算项", "公式", "参数", "计算结果", "单位", "备注"],
                "行数据": [
                    ["额定功率", "P=P_bess×C_rate", "5000×0.5", "2500", "kW", "0.5C放电"],
                    ["PCS台数", "N=P/P_pcs", "2500/500", "5", "台", "单台500kW"],
                    ["视在功率", "S=P/cosφ", "2500/0.95", "2631.6", "kVA", ""],
                    ["效率", "η≥97%", "-", "97.5%", "-", "阳光电源SC500TL"],
                    ["损耗", "P_loss=P×(1-η)/η", "2500×0.025/0.975", "64.1", "kW", ""],
                ]
            },
            {
                "名称": "3-变压器选型",
                "列": ["计算项", "公式", "参数", "计算结果", "单位", "备注"],
                "行数据": [
                    ["有功功率", "P_pcs", "-", "2500", "kW", ""],
                    ["无功功率", "Q=P×tan(arccos0.95)", "2500×0.3287", "821.7", "kVar", ""],
                    ["视在功率", "S=√(P²+Q²)", "-", "2631.6", "kVA", ""],
                    ["计算容量", "S_tx=S/η×K", "2631.6/0.97×1.05", "2847.1", "kVA", ""],
                    ["选择容量", "-", "-", "3150", "kVA", "标准序列"],
                    ["负载率", "η=S_calc/S_sel", "2847.1/3150", "90.4", "%", "≤95%合格"],
                ]
            }
        ]
    }
    return template
```

---

## 十、品牌对比矩阵与替代方案

### 10.1 全设备品牌对比矩阵

| 设备类别 | 第一梯队(推荐) | 第二梯队(可选) | 第三梯队(备选) |
|---------|--------------|-------------|-------------|
| PCS | 阳光电源/华为 | 科华数能 | 上能电气/禾望 |
| 电池模组 | 宁德时代/比亚迪 | 中创新航/国轩高科 | 亿纬锂能/瑞浦兰钧 |
| BMS | 高特电子/协能科技 | 亿协电子 | 华塑科技 |
| 变压器(干式) | 顺特电气/海南金盘 | 西门子/ABB | 特变电工/许继 |
| 开关柜 | 西门子/ABB | 施耐德/上海华明 | 森源电气/平高 |
| 电缆 | 远东/亨通 | 宝胜/中利 | 上上/起帆 |
| 保护装置 | 南瑞/许继 | 四方/长园深瑞 | 积成/威胜 |
| 通信网关 | 南瑞/四信 | 映翰通/摩莎 | 华为/东土 |
| 工业交换机 | 赫斯曼/摩莎 | 华为/东土 | 研华/卓越 |
| 电能表 | 威胜/许继 | 兰吉尔/三星 | 华立/浩宁瑞 |
| 空调/液冷 | 英维克/申菱 | 海信/美的 | 格力/海尔 |
| 消防 | 首安/海湾 | 利达/北大青鸟 | 鼎信/赋安 |

### 10.2 替代方案决策树

```
设备选型替代决策流程:

PCS品牌选择:
  ┌─ 预算充足? ──是──→ 华为(高可靠性,高溢价)
  │                    否
  ├─ 追求性价比? ──是──→ 科华数能(性价比最优)
  │                    否
  ├─ 大型央企项目? ──是──→ 阳光电源(份额最大,经验最丰富)
  │                    否
  └─ 预算有限? ──────→ 上能电气(价格最低)

电池品牌选择:
  ┌─ 要求极致安全? ──是──→ 宁德时代(EV级品控)
  │                     否
  ├─ 追求成本最优? ──是──→ 瑞浦兰钧(价格优势)
  │                     否
  ├─ 一体化方案? ────是──→ 比亚迪(电池+PCS+BMS一体化)
  │                     否
  └─ 均衡选择? ─────────→ 中创新航/国轩高科

替代触发条件:
  - 交货期超过合同约定20% → 启动替代方案
  - 设备停产/退市 → 强制替代
  - 业主指定品牌变更 → 按业主要求
  - 集采中标品牌变化 → 按集采结果
```

### 10.3 设备参数数据库(简表)

```python
EQUIPMENT_DB = {
    "PCS": {
        "阳光电源_SC500TL": {
            "power_kw": 500, "voltage_kv": 0.48, "efficiency": 0.975,
            "cos_phi_range": [-0.9, 0.9], "thd": 0.025,
            "cooling": "液冷", "price_per_kw": 200
        },
        "科华数能_SC500K": {
            "power_kw": 500, "voltage_kv": 0.48, "efficiency": 0.972,
            "cos_phi_range": [-0.9, 0.9], "thd": 0.03,
            "cooling": "液冷", "price_per_kw": 180
        },
        "上能电气_UP500K": {
            "power_kw": 500, "voltage_kv": 0.48, "efficiency": 0.97,
            "cos_phi_range": [-0.85, 0.85], "thd": 0.03,
            "cooling": "液冷", "price_per_kw": 165
        },
    },
    "BATTERY": {
        "宁德时代_LFP280": {
            "capacity_ah": 280, "voltage_v": 3.2, "cycle_life": 10000,
            "energy_density_wh_kg": 175, "price_per_wh": 0.42
        },
        "比亚迪_LFP280": {
            "capacity_ah": 280, "voltage_v": 3.2, "cycle_life": 8000,
            "energy_density_wh_kg": 170, "price_per_wh": 0.38
        },
        "中创新航_LFP280": {
            "capacity_ah": 280, "voltage_v": 3.2, "cycle_life": 6000,
            "energy_density_wh_kg": 165, "price_per_wh": 0.36
        },
    },
    "TRANSFORMER": {
        "顺特电气_SC11_3150_10": {
            "capacity_kva": 3150, "voltage_kv": 10, "impedance_pct": 6,
            "efficiency_class": 2, "price_k": 45
        },
        "金盘科技_SC11_3150_10": {
            "capacity_kva": 3150, "voltage_kv": 10, "impedance_pct": 6,
            "efficiency_class": 2, "price_k": 42
        },
    }
}
```

---

> **文档说明**: 本Skill涵盖储能电站全设备精确选型，所有计算公式、参数取值均依据国标与行业实践。使用时根据项目实际参数代入计算，输出选型计算书可直接用于设计评审与设备采购。  
> **注意事项**: 设备价格随市场波动，品牌排名仅代表行业一般认知，具体项目以招标结果为准。
