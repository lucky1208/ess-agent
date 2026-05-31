# 保护整定计算专业Skill v1.0

> 适用范围：储能电站(10kV/35kV并网)保护整定计算与配合  
> 版本：v1.0 | 更新日期：2026-05-31  
> 编制依据：DL/T 584、GB/T 14285、GB/T 36547、DL/T 5222

---

## 一、保护配置体系

### 1.1 PCC并网保护配置

```
PCC并网点保护配置总图:
  ┌───────────────────────────────────────────────────────┐
  │  PCC并网柜保护                                        │
  ├───────────────────────────────────────────────────────┤
  │  1. 过流保护I段(速断)    → 躲励磁涌流, 保护线路       │
  │  2. 过流保护II段(限时速断) → 保护线路全长              │
  │  3. 过流保护III段(过流)   → 后备保护+过负荷           │
  │  4. 方向元件             → 区分内部/外部故障          │
  │  5. 防孤岛保护           → 孤岛检测+跳闸             │
  │  6. 频率偏移保护         → 高频51.5Hz/低频48.5Hz     │
  │  7. 电压偏移保护         → 过压115%/欠压85%          │
  │  8. 逆流保护             → 防止向电网倒送            │
  │  9. 低电压穿越(LVRT)     → 电网故障时不脱网          │
  │  10. 重合闸闭锁          → 储能侧不重合闸            │
  └───────────────────────────────────────────────────────┘
```

### 1.2 变压器保护配置

```
变压器保护配置:
  ┌───────────────────────────────────────────────────────┐
  │  主保护:                                              │
  │    1. 差动保护(比率制动式)   → 区内故障主保护          │
  │    2. 差动速断                → 严重区内故障           │
  │    3. 重瓦斯保护              → 变压器内部严重故障     │
  │                                                       │
  │  后备保护:                                             │
  │    4. 复合电压过流(高压侧)   → 高压侧后备             │
  │    5. 复合电压过流(低压侧)   → 低压侧后备             │
  │    6. 零序过流(高压侧)       → 接地故障后备           │
  │    7. 过负荷保护              → 过负荷告警             │
  │                                                       │
  │  异常保护:                                             │
  │    8. 轻瓦斯告警              → 轻微故障告警           │
  │    9. 过温告警                → 油温/绕组温度          │
  │    10. 压力释放               → 内部压力异常           │
  │    11. 油位异常               → 油位过高/过低          │
  └───────────────────────────────────────────────────────┘
```

### 1.3 PCS保护配置

```
PCS保护配置:
  交流侧保护:
    - 过流I段(速断): 1.5×I_rated, 0s
    - 过流II段(限时): 1.2×I_rated, 0.3s
    - 过压保护: 1.15×U_rated, 0.2s
    - 欠压保护: 0.85×U_rated, 0.5s
    - 频率偏移: >51.5Hz或<48.5Hz, 0.1s
    - 电流THD越限: >5%, 告警
  
  直流侧保护:
    - 过压保护: 1.1×U_dc_rated, 0s
    - 欠压保护: 0.85×U_dc_rated, 1s
    - 极性反接检测
    - 绝缘监测: R_ins < 100kΩ, 告警; < 50kΩ, 跳闸
  
  系统保护:
    - 防孤岛保护(主动+被动)
    - 低电压穿越(LVRT)
    - 过温降额: 45℃降额, 50℃停机
    - 通信中断保护: 3s无通信→停机
```

### 1.4 BMS保护配置(三级)

```
BMS三级保护体系:
  ┌────────────┬──────────────────┬───────────────────────┐
  │  保护级别   │  动作             │  典型阈值              │
  ├────────────┼──────────────────┼───────────────────────┤
  │  一级(告警) │  上送EMS告警      │  SOC<10%/T>40℃       │
  │            │  限制充放电功率    │  U_cell<3.0V/>3.55V  │
  │            │                   │  ΔU_cluster>0.5V     │
  ├────────────┼──────────────────┼───────────────────────┤
  │  二级(降额) │  功率降额至50%    │  SOC<5%/T>45℃        │
  │            │  限制充放电电流    │  U_cell<2.8V/>3.6V   │
  │            │  告警+降额        │  I>1.2×I_rated       │
  ├────────────┼──────────────────┼───────────────────────┤
  │  三级(急停) │  断开直流接触器   │  SOC<2%/T>55℃        │
  │            │  跳PCS+跳PCC      │  U_cell<2.5V/>3.65V  │
  │            │  热失控预警       │  T>80℃或dT/dt>1℃/s   │
  │            │  绝缘<50kΩ        │  R_ins<50kΩ          │
  └────────────┴──────────────────┴───────────────────────┘
```

---

## 二、过流保护整定计算

### 2.1 过流I段(速断保护)

```
整定公式:
  I_dz.I = K_k × I"d_max

  K_k: 可靠系数, 取1.3~1.4 (微机保护取1.3)
  I"d_max: 最大运行方式下, 保护范围末端三相短路电流周期分量

灵敏度校验:
  K_lm = I"d_min / I_dz.I ≥ 1.5 (线路末端)
  I"d_min: 最小运行方式下, 保护范围末端两相短路电流

动作时间:
  t_I = 0s (速断, 固有动作时间约40ms)

示例(10kV PCC并网点):
  系统阻抗(最大): Z_s_max = 0.5Ω → I"d_max = 10.5/(√3×0.5) = 12.12kA
  保护范围末端短路电流(最大): I"d_max = 10.5/(√3×(0.5+1.0)) = 4.04kA
  I_dz.I = 1.3 × 4.04 = 5.25kA
  CT变比: 400/5 → 二次值 = 5.25/80 = 65.6A
  
  灵敏度(最小方式两相短路):
  Z_s_min = 0.8Ω → I"d_min = 0.866×10.5/(√3×0.8) = 6.56kA
  K_lm = 6.56/5.25 = 1.25 < 1.5 → 灵敏度不足, 需设方向元件
```

### 2.2 过流II段(限时速断保护)

```
整定公式:
  I_dz.II = K_k × K_fz × I"d_max_next

  K_k: 可靠系数, 取1.1~1.2
  K_fz: 分支系数, 取1.0(单侧电源)
  I"d_max_next: 下一级保护范围末端最大短路电流

动作时间:
  t_II = t_next + Δt = 0 + 0.3 = 0.3s

示例:
  下一级(变压器低压侧)最大短路电流: I"d = 2.0kA (折算到高压侧)
  I_dz.II = 1.1 × 1.0 × 2.0 = 2.2kA
  二次值 = 2.2/80 = 27.5A (CT 400/5)
  t_II = 0.3s
```

### 2.3 过流III段(定时限过流保护)

```
整定公式:
  I_dz.III = (K_k × K_zq × I_e) / (K_h × K_f)

  K_k: 可靠系数, 取1.2
  K_zq: 自启动系数, 取1.5~2.0 (储能取1.5, PCS无自启动涌流)
  I_e: 额定电流 = S/(√3×U)
  K_h: 返回系数, 取0.95 (微机保护)
  K_f: 功率因数相关系数, 取1.0

动作时间:
  t_III = t_next + Δt ≥ 0.6s (与II段配合)

示例(2500kW储能, 10kV):
  I_e = 2500/(√3×10.5) = 137.5A
  I_dz.III = (1.2 × 1.5 × 137.5)/(0.95 × 1.0) = 260.5A
  二次值 = 260.5/80 = 3.26A (CT 400/5)
  t_III = 0.6s
  
  灵敏度(远后备):
  K_lm = I"d_min / I_dz.III = 6560/260.5 = 25.2 ≥ 1.5 ✓
```

### 2.4 过流保护整定代码

```python
def overcurrent_setting(
    system_impedance_max_ohm: float,
    system_impedance_min_ohm: float,
    line_impedance_ohm: float,
    ct_ratio: float,
    rated_current_a: float,
    next_level_sc_current_ka: float = 2.0
):
    """过流保护三段式整定计算"""
    import math
    
    u_system = 10.5  # kV (10kV系统平均电压)
    
    # I段(速断)
    Kk_I = 1.3
    I_d3_max = u_system / (math.sqrt(3) * (system_impedance_max_ohm + line_impedance_ohm))
    Idz_I = Kk_I * I_d3_max
    # 灵敏度(最小方式两相短路, 保护安装处)
    I_d2_min = 0.866 * u_system / (math.sqrt(3) * system_impedance_min_ohm)
    Klm_I = I_d2_min / Idz_I
    
    # II段(限时速断)
    Kk_II = 1.1
    Idz_II = Kk_II * 1.0 * next_level_sc_current_ka
    Klm_II = I_d2_min / Idz_II  # 线路末端灵敏度
    t_II = 0.3
    
    # III段(过流)
    Kk_III = 1.2
    Kzq = 1.5
    Kh = 0.95
    Idz_III = (Kk_III * Kzq * rated_current_a / 1000) / (Kh * 1.0) * 1000
    Klm_III = I_d2_min / (Idz_III / 1000)
    t_III = 0.6
    
    result = {
        "过流I段(速断)": {
            "整定值(kA)": round(Idz_I, 3),
            "二次值(A)": round(Idz_I * 1000 / ct_ratio, 2),
            "动作时间(s)": 0,
            "灵敏度": round(Klm_I, 2),
            "校验": "合格" if Klm_I >= 1.5 else "不合格(需方向元件)"
        },
        "过流II段(限时速断)": {
            "整定值(kA)": round(Idz_II, 3),
            "二次值(A)": round(Idz_II * 1000 / ct_ratio, 2),
            "动作时间(s)": t_II,
            "灵敏度": round(Klm_II, 2),
            "校验": "合格" if Klm_II >= 1.5 else "需复核"
        },
        "过流III段(定时限过流)": {
            "整定值(A)": round(Idz_III, 1),
            "二次值(A)": round(Idz_III / ct_ratio, 2),
            "动作时间(s)": t_III,
            "灵敏度": round(Klm_III, 2),
            "校验": "合格" if Klm_III >= 1.5 else "需复核"
        }
    }
    return result

# 示例
settings = overcurrent_setting(
    system_impedance_max_ohm=0.5,
    system_impedance_min_ohm=0.8,
    line_impedance_ohm=1.0,
    ct_ratio=80,  # 400/5
    rated_current_a=137.5,
    next_level_sc_current_ka=2.0
)
import json
print(json.dumps(settings, ensure_ascii=False, indent=2))
```

---

## 三、差动保护整定计算

### 3.1 比率制动式差动保护

```
差动保护基本原理:
  差动电流: I_d = |Ī_1 + Ī_2| (两侧电流矢量和)
  制动电流: I_z = max(|Ī_1|, |Ī_2|) 或 (|Ī_1| + |Ī_2|)/2
  
  动作判据:
    I_d > I_dz.min                    当 I_z ≤ I_g (拐点前)
    I_d > I_dz.min + K_z×(I_z - I_g) 当 I_z > I_g (拐点后)
```

### 3.2 最小动作电流整定

```
最小动作电流:
  I_dz.min = K_k × I_e × K_cc × K_er

  K_k: 可靠系数, 取1.3~1.5
  I_e: 变压器额定电流(二次侧)
  K_cc: CT同型系数, 取1.0(同型)或0.5(不同型)
  K_er: CT误差, 取0.10(10P级)或0.05(5P级)

简化公式(工程常用):
  I_dz.min = (0.3~0.5) × I_e

  - 0.3I_e: 变压器参数准确, CT一致性好
  - 0.5I_e: 保守取值, 躲励磁涌流

示例(3150kVA, 10kV/0.4kV):
  I_e_10kV = 3150/(√3×10.5) = 173.5A
  CT变比: 200/5 → I_e_2次 = 173.5/40 = 4.34A
  
  I_e_0.4kV = 3150/(√3×0.4) = 4547.3A
  CT变比: 5000/5 → I_e_2次 = 4547.3/1000 = 4.55A
  
  I_dz.min = 0.5 × max(4.34, 4.55) = 2.27A
```

### 3.3 制动特性斜率整定

```
制动斜率K_z:
  K_z = K_k × (K_cc × K_er + ΔU + Δf)

  K_k: 可靠系数, 取1.3~1.5
  K_cc: 同型系数, 1.0
  K_er: CT误差, 0.10
  ΔU: 变压器调压范围, 0.05(±5%)
  Δf: CT变比误差, 0.05

  K_z = 1.3 × (1.0 × 0.10 + 0.05 + 0.05) = 0.26

工程取值:
  K_z = 0.3~0.5 (取0.4为常用值)
  - 0.3: 变压器参数准确
  - 0.5: 保守取值, 区外故障不误动
```

### 3.4 拐点电流整定

```
拐点电流:
  I_g = (1.0~2.0) × I_e

  常用取值: I_g = 1.0 × I_e
  - 拐点前: 无制动区, 灵敏度高
  - 拐点后: 比率制动区, 防区外故障误动

差动速断(二次谐波制动退出):
  I_dz.quick = (6~8) × I_e
  用于严重区内故障快速跳闸
  二次谐波闭锁: I_2/I_1 > 15% → 闭锁差动(躲励磁涌流)
```

### 3.5 差动保护整定代码

```python
def differential_setting(
    tx_capacity_kva: float,
    tx_voltage_hv_kv: float,
    tx_voltage_lv_kv: float,
    ct_ratio_hv: float,
    ct_ratio_lv: float,
    k_dz_min_factor: float = 0.5,
    k_z: float = 0.4,
    i_g_factor: float = 1.0
):
    """差动保护整定计算"""
    import math
    
    # 额定电流(一次)
    I_e_hv = tx_capacity_kva / (math.sqrt(3) * tx_voltage_hv_kv * 1.05)
    I_e_lv = tx_capacity_kva / (math.sqrt(3) * tx_voltage_lv_kv)
    
    # 额定电流(二次)
    I_e_hv_sec = I_e_hv / ct_ratio_hv * 5
    I_e_lv_sec = I_e_lv / ct_ratio_lv * 5
    
    # 差动最小动作电流
    I_e_max_sec = max(I_e_hv_sec, I_e_lv_sec)
    Idz_min = k_dz_min_factor * I_e_max_sec
    
    # 拐点电流
    I_g = i_g_factor * I_e_max_sec
    
    # 差动速断
    Idz_quick = 7 * I_e_max_sec
    
    # 二次谐波闭锁比
    harmonic_ratio = 0.15
    
    return {
        "变压器容量(kVA)": tx_capacity_kva,
        "高压侧额定电流(A)": round(I_e_hv, 2),
        "低压侧额定电流(A)": round(I_e_lv, 2),
        "高压侧二次电流(A)": round(I_e_hv_sec, 2),
        "低压侧二次电流(A)": round(I_e_lv_sec, 2),
        "最小动作电流(A)": round(Idz_min, 2),
        "制动斜率": k_z,
        "拐点电流(A)": round(I_g, 2),
        "差动速断电流(A)": round(Idz_quick, 2),
        "二次谐波闭锁比(%)": harmonic_ratio * 100,
        "制动特性方程": f"I_d > {round(Idz_min,2)} + {k_z}×(I_z - {round(I_g,2)})"
    }

# 示例
diff_set = differential_setting(
    tx_capacity_kva=3150,
    tx_voltage_hv_kv=10,
    tx_voltage_lv_kv=0.4,
    ct_ratio_hv=200/5,
    ct_ratio_lv=5000/5
)
import json
print(json.dumps(diff_set, ensure_ascii=False, indent=2))
```

---

## 四、防孤岛保护整定

### 4.1 被动式防孤岛检测

```
被动检测方法与整定值:
  ┌──────────────────┬─────────────────┬──────────────┐
  │  检测方法          │  整定值           │  动作延时     │
  ├──────────────────┼─────────────────┼──────────────┤
  │  过频保护          │  >51.5Hz         │  100ms       │
  │  欠频保护          │  <48.5Hz         │  100ms       │
  │  过压保护          │  >115%Un         │  100ms       │
  │  欠压保护          │  <85%Un          │  100ms       │
  │  频率变化率        │  df/dt>2Hz/s     │  100ms       │
  │  相位突变          │  Δφ>15°          │  100ms       │
  │  谐波检测          │  THD>5%          │  200ms       │
  └──────────────────┴─────────────────┴──────────────┘

说明:
  - 被动检测在负载与PCS功率匹配时可能失效(检测盲区)
  - 必须与主动检测方法配合使用
  - GB/T 36547要求2s内检测出孤岛并跳闸
```

### 4.2 主动式防孤岛检测

```
主动检测方法:
  1. 频率偏移法(AFD):
     - 正常运行时对PCS输出电流施加频率偏移Δf
     - 并网时: 电网频率钳制, 偏移被吸收
     - 孤岛时: 偏移累积→频率持续偏移→触发被动检测
     - Δf = 0.5Hz (典型值, 折中检测速度与电能质量)
  
  2. 正反馈频移法(SFS):
     - 在AFD基础上增加正反馈
     - Δf(n+1) = Δf(n) + K × (f(n) - f_0)
     - K: 正反馈系数, 取0.02~0.05
     - 孤岛时频率快速偏移→触发保护
     - 检测时间 < 0.5s
  
  3. 无功功率扰动法:
     - 周期性注入无功扰动ΔQ
     - 并网时: 电网吸收, 电压几乎不变
     - 孤岛时: 电压波动→触发被动检测
     - ΔQ = ±5% × Q_rated, 扰动周期1s
  
  4. 阻抗测量法:
     - 注入特定频率谐波电流
     - 测量端口阻抗变化
     - 孤岛时阻抗显著增大→检测
     - 注入频率: 20~50Hz (避开工频谐波)
```

### 4.3 防孤岛保护整定代码

```python
def anti_islanding_setting(
    rated_frequency_hz: float = 50,
    rated_voltage_v: float = 10000,
    afd_delta_f: float = 0.5,
    sfs_k: float = 0.03
):
    """防孤岛保护整定"""
    return {
        "被动检测": {
            "过频整定(Hz)": rated_frequency_hz + 1.5,
            "欠频整定(Hz)": rated_frequency_hz - 1.5,
            "过压整定(%Un)": 115,
            "欠压整定(%Un)": 85,
            "频率变化率(Hz/s)": 2.0,
            "相位突变(°)": 15,
            "THD阈值(%)": 5.0,
            "动作延时(ms)": 100
        },
        "主动检测": {
            "AFD频偏(Hz)": afd_delta_f,
            "SFS正反馈系数K": sfs_k,
            "无功扰动量(%Q_rated)": 5.0,
            "无功扰动周期(s)": 1.0,
            "阻抗测量注入频率(Hz)": "20~50"
        },
        "总检测时间要求": "≤2s (GB/T 36547)",
        "动作逻辑": "检测孤岛→延时100ms→跳PCC断路器→闭锁PCS→上报EMS"
    }
```

---

## 五、防逆流保护整定

### 5.1 逆流保护原理

```
逆流定义:
  P_pcc < 0 时, 储能系统向电网倒送功率(放电功率>负荷功率)

逆流保护策略:
  ┌─────────────────────────────────────────────────┐
  │  策略一: 功率限制(柔性)                          │
  │    P_pcc < P_reverse_threshold → 降PCS放电功率   │
  │    目标: P_pcc → 0 (零逆流)                      │
  │    优点: 不跳闸, 不影响供电连续性                  │
  │    缺点: 响应较慢(秒级)                           │
  │                                                   │
  │  策略二: 跳闸切除(硬性)                           │
  │    P_pcc < P_reverse_threshold → 跳PCC断路器      │
  │    优点: 动作明确, 可靠                            │
  │    缺点: 全部停机, 影响供电                        │
  │                                                   │
  │  策略三: 混合策略(推荐)                            │
  │    Step1: 降功率(柔性限制)                         │
  │    Step2: 降功率无效→切除部分PCS                   │
  │    Step3: 仍逆流→跳PCC断路器                      │
  └─────────────────────────────────────────────────┘
```

### 5.2 逆流保护整定参数

```
逆流阈值整定:
  P_reverse = -3% × P_installed

  说明:
  - 3%裕度: 躲测量误差(0.2S级表计误差≤0.2%)和功率波动
  - 不宜过小(≤1%): 测量噪声导致频繁触发
  - 不宜过大(≥5%): 逆流过大不满足电网要求

动作延时:
  t_delay = 500ms (躲暂态功率波动)
  - PCS功率指令变化瞬态: <200ms
  - 负荷突变暂态: <300ms
  - 500ms延时确保稳态逆流才动作

复归延时:
  t_reset = 2000ms (防止频繁动作-返回循环)
  - 逆流消除后延迟2s才复归
  - 避免功率在阈值附近波动时频繁动作

滞回区间:
  ΔP_hyst = 1% × P_installed (防止临界抖动)
  - 动作条件: P_pcc < P_reverse
  - 返回条件: P_pcc > P_reverse + ΔP_hyst
```

### 5.3 逆流保护代码

```python
def anti_reverse_setting(
    p_installed_kw: float,
    strategy: str = "hybrid"
):
    """防逆流保护整定"""
    p_reverse = -0.03 * p_installed_kw
    p_hyst = 0.01 * p_installed_kw
    
    setting = {
        "装机功率(kW)": p_installed_kw,
        "逆流阈值(kW)": round(p_reverse, 1),
        "动作延时(ms)": 500,
        "复归延时(ms)": 2000,
        "滞回区间(kW)": round(p_hyst, 1),
        "动作条件": f"P_pcc < {round(p_reverse,1)}kW",
        "返回条件": f"P_pcc > {round(p_reverse + p_hyst,1)}kW",
        "策略": strategy
    }
    
    if strategy == "hybrid":
        setting["动作逻辑"] = [
            f"Step1: P_pcc < {round(p_reverse,1)}kW 持续500ms → 限制PCS放电功率(每步降10%)",
            f"Step2: 30s后仍逆流 → 切除1台PCS",
            f"Step3: 再30s后仍逆流 → 切除全部PCS",
            f"Step4: 仍逆流 → 跳PCC断路器",
            f"复归: P_pcc > {round(p_reverse + p_hyst,1)}kW 持续2000ms → 恢复"
        ]
    
    return setting
```

---

## 六、零序保护整定

### 6.1 零序CT选型

```
零序CT选型:
  类型: 电缆型零序CT (穿芯式)
  变比: 100/5A 或 100/1A
  准确级: 5P10 或 10P10
  一次电流: ≥3I_0_max (最大零序电流)
  
  10kV系统零序电流计算:
    中性点不接地系统:
    I_0 = U_φ × ω × C_Σ (电容电流)
    C_Σ: 系统总对地电容
    
    经验估算:
    I_c ≈ (U_N × L_电缆) / 10 (A)
    U_N: 线电压(kV), L_电缆: 电缆长度(km)
    示例: 10kV, 5km电缆 → I_c ≈ 10×5/10 = 5A
```

### 6.2 零序过流整定

```
零序过流保护整定:
  中性点不接地系统(10kV):
    I_0_dz = K_k × 3 × I_0_max_unfault / K_h
    K_k: 可靠系数, 取1.2~1.3
    I_0_max_unfault: 最大不平衡零序电流(取CT二次1A)
    K_h: 返回系数, 取0.95
    
    工程简化: I_0_dz = 3~5A (一次值)
    二次值(CT 100/5): 0.15~0.25A
    动作时间: t = 0.5s (配合级差)

  中性点接地系统(35kV及以上):
    I_0_dz = K_k × I_0_max_external
    I_0_max_external: 区外最大零序电流
    动作时间: 与上一级零序保护配合
```

### 6.3 单相接地保护

```
单相接地保护(10kV中性点不接地系统):
  方式一: 零序过流(有选择性)
    I_0_dz = 1.5 × 3 × I_c_本线路
    I_c_本线路: 本线路电容电流
    t = 0.5s → 跳本线路断路器
  
  方式二: 零序方向(有选择性, 推荐)
    动作区: 电流滞后电压90°~270°(指向线路)
    灵敏度优于过流式
    适用: 系统电容电流较大, 过流难以整定
  
  方式三: 绝缘监测(无选择性)
    PT开口三角: 3U_0 > 30V → 告警
    只能判断系统接地, 不能选线
```

---

## 七、保护配合校验

### 7.1 灵敏度校验

```
灵敏度校验公式:
  K_lm = I_f_min / I_dz

  K_lm ≥ 1.5 (主保护)
  K_lm ≥ 1.2 (远后备保护)

  I_f_min: 最小运行方式下, 保护范围末端故障电流
  I_dz: 保护动作电流

各类保护灵敏度要求:
  ┌──────────────────┬──────────────┬───────────────────┐
  │  保护类型          │  K_lm要求     │  说明              │
  ├──────────────────┼──────────────┼───────────────────┤
  │  过流I段(速断)     │  ≥2.0        │  近后备            │
  │  过流II段(限时速断)│  ≥1.5        │  主保护            │
  │  过流III段(过流)   │  ≥1.5        │  远后备            │
  │  差动保护          │  ≥2.0        │  主保护            │
  │  零序过流          │  ≥1.5        │  主保护            │
  │  防孤岛保护        │  -           │  不考核灵敏度       │
  └──────────────────┴──────────────┴───────────────────┘
```

### 7.2 级差配合

```
时限级差配合原则:
  Δt ≥ 0.3s (微机保护之间)
  Δt ≥ 0.5s (微机保护与电磁式保护之间)

配合示例(10kV储能并网系统):
  ┌──────────────────┬──────────────┬──────────────┐
  │  保护位置          │  保护类型     │  动作时间      │
  ├──────────────────┼──────────────┼──────────────┤
  │  PCS内部          │  过流         │  0s(速断)     │
  │  储能侧断路器      │  过流II段     │  0.3s        │
  │  变压器高压侧      │  复压过流     │  0.6s        │
  │  PCC并网柜         │  过流II段     │  0.9s        │
  │  馈线保护          │  过流III段    │  1.2s        │
  └──────────────────┴──────────────┴──────────────┘

  级差校验:
    Δt(PCS-储能侧) = 0.3-0 = 0.3s ≥ 0.3s ✓
    Δt(储能侧-变压器) = 0.6-0.3 = 0.3s ≥ 0.3s ✓
    Δt(变压器-PCC) = 0.9-0.6 = 0.3s ≥ 0.3s ✓
    Δt(PCC-馈线) = 1.2-0.9 = 0.3s ≥ 0.3s ✓
```

### 7.3 最大最小运行方式

```
运行方式说明:
  最大运行方式:
    - 系统阻抗最小(所有发电机投入, 所有线路投入)
    - 短路电流最大
    - 用于: 速断保护整定, 校验设备动热稳定
  
  最小运行方式:
    - 系统阻抗最大(最小开机方式, 检修方式)
    - 短路电流最小
    - 用于: 灵敏度校验

  示例(10kV系统):
    最大方式: Z_s = 0.5Ω → I"d3_max = 12.12kA
    最小方式: Z_s = 0.8Ω → I"d3_min = 7.58kA
    两相短路: I"d2_min = 0.866 × 7.58 = 6.56kA
```

### 7.4 保护配合校验代码

```python
def protection_coordination_check(
    protection_stages: list
):
    """保护配合校验"""
    results = []
    delta_t_min = 0.3  # 微机保护级差要求
    
    for i in range(len(protection_stages) - 1):
        curr = protection_stages[i]
        next_stage = protection_stages[i + 1]
        
        delta_t = next_stage["time_s"] - curr["time_s"]
        check = "合格" if delta_t >= delta_t_min else "不合格"
        
        results.append({
            "上级保护": curr["name"],
            "下级保护": next_stage["name"],
            "上级时间(s)": curr["time_s"],
            "下级时间(s)": next_stage["time_s"],
            "级差(s)": delta_t,
            "要求(s)": delta_t_min,
            "校验": check
        })
    
    return results

# 示例
stages = [
    {"name": "PCS内部过流", "time_s": 0},
    {"name": "储能侧过流II段", "time_s": 0.3},
    {"name": "变压器复压过流", "time_s": 0.6},
    {"name": "PCC过流II段", "time_s": 0.9},
    {"name": "馈线过流III段", "time_s": 1.2}
]
check_results = protection_coordination_check(stages)
import json
print(json.dumps(check_results, ensure_ascii=False, indent=2))
```

---

## 八、保护定值单模板

### 8.1 定值单格式

```
┌─────────────────────────────────────────────────────────┐
│  储能电站保护定值单                                      │
├─────────────────────────────────────────────────────────┤
│  项目: XX储能电站        电压等级: 10kV                  │
│  编号: PRO-2026-001     日期: 2026-05-31                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  一、PCC并网柜保护定值                                   │
│  ─────────────────────────────────────────              │
│  CT变比: 400/5A          PT变比: 10000/100V             │
│                                                         │
│  1. 过流I段(速断)                                       │
│     电流整定: 65.6A(二次)  动作时间: 0s                   │
│                                                         │
│  2. 过流II段(限时速断)                                   │
│     电流整定: 27.5A(二次)  动作时间: 0.3s                 │
│                                                         │
│  3. 过流III段(定时限过流)                                │
│     电流整定: 3.26A(二次)  动作时间: 0.6s                 │
│                                                         │
│  4. 零序过流                                            │
│     电流整定: 0.2A(二次)   动作时间: 0.5s                 │
│                                                         │
│  5. 过电压保护                                          │
│     电压整定: 115V(二次)    动作时间: 0.2s                 │
│                                                         │
│  6. 欠电压保护                                          │
│     电压整定: 85V(二次)     动作时间: 0.5s                 │
│                                                         │
│  7. 过频率保护                                          │
│     频率整定: 51.5Hz        动作时间: 0.1s                 │
│                                                         │
│  8. 欠频率保护                                          │
│     频率整定: 48.5Hz        动作时间: 0.1s                 │
│                                                         │
│  9. 防孤岛保护                                          │
│     频率偏移: ±1.5Hz+df/dt>2Hz/s                        │
│     电压偏移: 115%/85%Un                                │
│     动作时间: 100ms                                      │
│                                                         │
│  10. 防逆流保护                                         │
│      逆流阈值: -3%Pn        动作延时: 500ms               │
│      复归延时: 2000ms       滞回区间: 1%Pn               │
│                                                         │
│  编制: ______  校验: ______  批准: ______                │
└─────────────────────────────────────────────────────────┘
```

### 8.2 定值单生成代码

```python
def generate_setting_sheet(
    project_name: str,
    voltage_kv: float,
    ct_ratio_str: str,
    pt_ratio_str: str,
    oc_settings: dict
):
    """生成保护定值单"""
    sheet = f"""
═══════════════════════════════════════════════════
  储能电站保护定值单
═══════════════════════════════════════════════════
  项目: {project_name}
  电压等级: {voltage_kv}kV
  CT变比: {ct_ratio_str}
  PT变比: {pt_ratio_str}
  编制日期: 2026-05-31
───────────────────────────────────────────────────
"""
    for protection_name, settings in oc_settings.items():
        sheet += f"\n  {protection_name}:\n"
        for param, value in settings.items():
            sheet += f"    {param}: {value}\n"
    
    sheet += """
───────────────────────────────────────────────────
  编制: ______  校验: ______  批准: ______
═══════════════════════════════════════════════════
"""
    return sheet
```

---

## 九、保护装置Modbus地址映射

### 9.1 PCC综保Modbus地址表

```
PCC微机综保Modbus寄存器映射:
  ┌──────────────────────┬──────────┬──────┬──────────────────┐
  │  寄存器名称            │  地址     │  类型 │  说明              │
  ├──────────────────────┼──────────┼──────┼──────────────────┤
  │  过流I段电流定值       │  40001   │  FLOAT│  二次值(A)        │
  │  过流I段时间定值       │  40003   │  FLOAT│  秒               │
  │  过流II段电流定值      │  40005   │  FLOAT│  二次值(A)        │
  │  过流II段时间定值      │  40007   │  FLOAT│  秒               │
  │  过流III段电流定值     │  40009   │  FLOAT│  二次值(A)        │
  │  过流III段时间定值     │  40011   │  FLOAT│  秒               │
  │  零序过流定值          │  40013   │  FLOAT│  二次值(A)        │
  │  零序过流时间定值      │  40015   │  FLOAT│  秒               │
  │  过压定值              │  40017   │  FLOAT│  二次值(V)        │
  │  欠压定值              │  40019   │  FLOAT│  二次值(V)        │
  │  过频定值              │  40021   │  FLOAT│  Hz               │
  │  欠频定值              │  40023   │  FLOAT│  Hz               │
  │  A相电流              │  40025   │  FLOAT│  一次值(A)        │
  │  B相电流              │  40027   │  FLOAT│  一次值(A)        │
  │  C相电流              │  40029   │  FLOAT│  一次值(A)        │
  │  AB线电压             │  40031   │  FLOAT│  一次值(V)        │
  │  BC线电压             │  40033   │  FLOAT│  一次值(V)        │
  │  CA线电压             │  40035   │  FLOAT│  一次值(V)        │
  │  频率                 │  40037   │  FLOAT│  Hz               │
  │  有功功率             │  40039   │  FLOAT│  kW               │
  │  无功功率             │  40041   │  FLOAT│  kVar             │
  │  功率因数             │  40043   │  FLOAT│  -1~+1            │
  │  保护动作字           │  40045   │  DWORD│  位定义见下表     │
  │  告警字               │  40047   │  DWORD│  位定义见下表     │
  └──────────────────────┴──────────┴──────┴──────────────────┘
```

### 9.2 保护动作字位定义

```
保护动作字(40045, DWORD=32bit):
  Bit0:  过流I段动作
  Bit1:  过流II段动作
  Bit2:  过流III段动作
  Bit3:  零序过流动作
  Bit4:  过压动作
  Bit5:  欠压动作
  Bit6:  过频动作
  Bit7:  欠频动作
  Bit8:  防孤岛动作
  Bit9:  逆流动作
  Bit10: 差动动作
  Bit11: 差动速断动作
  Bit12: 重合闸动作
  Bit13~15: 备用
  
告警字(40047, DWORD=32bit):
  Bit0:  CT断线告警
  Bit1:  PT断线告警
  Bit2:  过负荷告警
  Bit3:  频率异常告警
  Bit4:  电压异常告警
  Bit5:  通信异常告警
  Bit6:  装置自检告警
  Bit7:  控制回路断线
  Bit8~15: 备用
```

### 9.3 Modbus通信代码

```python
import struct

class ProtectionRelayModbus:
    """保护装置Modbus通信"""
    
    # 寄存器地址定义
    REG_OC1_CURRENT = 40001
    REG_OC1_TIME = 40003
    REG_OC2_CURRENT = 40005
    REG_OC2_TIME = 40007
    REG_OC3_CURRENT = 40009
    REG_OC3_TIME = 40011
    REG_PHASE_A_CURRENT = 40025
    REG_FREQUENCY = 40037
    REG_ACTIVE_POWER = 40039
    REG_PROTECTION_WORD = 40045
    REG_ALARM_WORD = 40047
    
    def __init__(self, slave_id: int, uart_port: str = "/dev/ttyUSB0"):
        self.slave_id = slave_id
        self.port = uart_port
    
    def read_float(self, register_address: int) -> float:
        """读取FLOAT寄存器(占用2个寄存器)"""
        pass
    
    def write_float(self, register_address: int, value: float):
        """写入FLOAT定值"""
        pass
    
    def read_protection_status(self) -> dict:
        """读取保护状态"""
        word = 0  # 实际从Modbus读取
        return {
            "过流I段": bool(word & (1 << 0)),
            "过流II段": bool(word & (1 << 1)),
            "过流III段": bool(word & (1 << 2)),
            "零序过流": bool(word & (1 << 3)),
            "过压": bool(word & (1 << 4)),
            "欠压": bool(word & (1 << 5)),
            "过频": bool(word & (1 << 6)),
            "欠频": bool(word & (1 << 7)),
            "防孤岛": bool(word & (1 << 8)),
            "逆流": bool(word & (1 << 9)),
            "差动": bool(word & (1 << 10)),
        }
    
    def download_settings(self, settings: dict):
        """下发保护定值"""
        mapping = {
            "过流I段电流": self.REG_OC1_CURRENT,
            "过流I段时间": self.REG_OC1_TIME,
            "过流II段电流": self.REG_OC2_CURRENT,
            "过流II段时间": self.REG_OC2_TIME,
            "过流III段电流": self.REG_OC3_CURRENT,
            "过流III段时间": self.REG_OC3_TIME,
        }
        for name, address in mapping.items():
            if name in settings:
                self.write_float(address, settings[name])
```

---

> **文档说明**: 本Skill涵盖储能电站保护整定计算全流程，包括过流/差动/防孤岛/逆流/零序等保护的整定公式、参数取值、灵敏度校验和配合级差。所有计算依据DL/T 584和GB/T 14285标准。  
> **注意事项**: 保护定值需经调度部门审批后方可下发执行，现场投运前必须进行传动试验验证。
