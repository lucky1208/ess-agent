---
name: minimax_net_capacity_sizing
description: >
  储能微网系统容量优化选型专业Skill。覆盖负荷分析、储能容量优化算法
  （峰谷套利迭代法/IRRVaR风险收益法/MILP两阶段优化/强化学习自适应规划）、
  光伏容量匹配算法、经济性建模、多方案对比、敏感性分析、推荐配置输出。
  适用场景：微网项目投标/可研阶段，回答"配多少储能、配多大光伏、要不要柴发"
  核心问题。适用对象：系统设计工程师、项目经理、投资分析师。
  参考依据：GB/T 34120、GB/T 36549、电化学储能电站设计规范、各省配储政策。
---

# 储能微网系统容量优化选型专业Skill v1.0

## 目录

- [一、输入参数采集清单](#一输入参数采集清单)
- [二、储能容量优化算法](#二储能容量优化算法)
  - [方法A：基于峰谷套利的迭代法](#方法a基于峰谷套利的迭代法)
  - [方法B：基于风险调整收益最大化IRRVaR](#方法b基于风险调整收益最大化irrvar)
  - [方法C：基于MILP的两阶段优化](#方法c基于milp的两阶段优化)
  - [方法D：基于强化学习的自适应容量规划](#方法d基于强化学习的自适应容量规划)
- [三、光伏容量匹配算法](#三光伏容量匹配算法)
- [四、经济性建模与对比矩阵](#四经济性建模与对比矩阵)
- [五、输出：推荐配置方案](#五输出推荐配置方案)
- [六、典型案例参考](#六典型案例参考)
- [附录A：设备技术参数参考表](#附录a设备技术参数参考表)
- [附录B：计算参数默认值](#附录b计算参数默认值)

---

## 一、输入参数采集清单

### 1.1 负荷数据采集模板

#### 数据精度等级

| 精度等级 | 数据类型 | 适用场景 | 采集要求 |
|---------|---------|---------|---------|
| L1 | 8760h逐时数据 | 精确经济性评估 | 全年每小时负荷数据 |
| L2 | 典型日数据×12 | 一般可研/概算 | 四季各选1个典型日，每15min |
| L3 | 月度峰值/谷值/均值 | 初步估算 | 月最大/最小/平均负荷 |
| L4 | 最大需量+年用电量 | 粗估 | 仅需年度汇总数据 |

#### 负荷数据采集表模板

```csv
时间戳,总有功功率(kW),总有功电量(kWh),功率因数,PCC电压(kV)
2024-01-01 00:00:00,1250.5,20.84,0.95,10.12
2024-01-01 01:00:00,1180.3,19.67,0.94,10.11
...
```

**关键指标计算**：

```python
# 负荷特性指标计算
def calc_load_indicators(load_8760):
    """
    输入: load_8760 - 8760小时负荷数据列表(kW)
    输出: 负荷特性指标字典
    """
    import numpy as np
    load = np.array(load_8760)
    
    indicators = {
        # 基础统计
        '年最大负荷_Pmax': np.max(load),           # kW
        '年最小负荷_Pmin': np.min(load),           # kW
        '年平均负荷_Pavg': np.mean(load),           # kW
        '年用电量_E_total': np.sum(load),           # kWh
        
        # 负荷率指标
        '年负荷率_LF': np.mean(load)/np.max(load),  # 负荷因子
        '峰谷差_PV_diff': np.max(load)-np.min(load),# kW
        '峰谷比_PV_ratio': np.max(load)/np.min(load),
        
        # 持续曲线
        'T_load_500': calc_load_duration(load, 0.5),  # 负荷>50%持续小时数
        'T_load_800': calc_load_duration(load, 0.8),  # 负荷>80%持续小时数
        
        # 典型工作日/休息日特性
        'workday_avg': calc_workday_avg(load),
        'holiday_avg': calc_holiday_avg(load),
    }
    return indicators

def calc_load_duration(load, threshold_ratio):
    """计算负荷超过threshold_ratio*最大负荷的小时数"""
    import numpy as np
    threshold = threshold_ratio * np.max(load)
    return int(np.sum(load > threshold))
```

### 1.2 光伏发电数据采集

#### 数据来源优先级

| 优先级 | 数据来源 | 精度 | 获取方式 |
|-------|---------|------|---------|
| 1 | PVsyst仿真数据 | 高 | 项目地辐照数据+组件/逆变器选型仿真 |
| 2 | 卫星数据API | 中高 | Solcast、NASA POWER、Wxprise |
| 3 | PVSAT在线工具 | 中 | 网页输入坐标估算 |
| 4 | 当地气象站统计值 | 中 | 多年平均月辐照量 |
| 5 | 经验估算 | 低 | kWh/kWp系数×装机容量 |

#### 光伏数据采集表模板

```csv
月份,水平面辐照GHI(kWh/m²),斜面辐照DNI(kWh/m²),环境温度(℃),发电量估算(kWh/kWp)
01,85.2,72.5,8.5,65
02,95.8,82.3,11.2,78
...
12,78.3,65.1,6.8,58
```

**年度发电量估算公式**：

$$E_{PV\_annual} = P_{PV\_rated} \times k_{pr} \times H_{ yearly } \times (1 - L_{curt})

其中：
- $P_{PV\_rated}$：光伏额定装机容量（kWp）
- $k_{pr}$：性能比（Performance Ratio），通常0.75~0.85
- $H_{yearly}$：年等效峰值日照小时数（h）
- $L_{curt}$：弃光率（小数，默认0）

### 1.3 电价结构数据采集

#### 分时电价数据表模板

```csv
时段类型,开始时刻,结束时刻,电价(元/kWh),适用月份
尖峰,09:00,11:00,1.35,6-9月
高峰,08:00,11:00,1.15,全年
高峰,18:00,21:00,1.15,全年
平段,07:00,08:00,0.75,全年
平段,11:00,18:00,0.75,全年
平段,21:00,23:00,0.75,全年
低谷,23:00,07:00,0.32,全年
```

#### 电价数据结构设计

```python
@dataclass
class TariffStructure:
    """电价结构数据类"""
    province: str
    city: str
    voltage_level: str          # 10kV/35kV/110kV
    tariff_type: str            # 一般工商业/大工业
    
    # 分时电价
    TOU: Dict[str, List[dict]]  # {season: [(start, end, price), ...]}
    
    # 基本电费
    demand_charge: float        # 需量电费，元/kW/月
    capacity_charge: float      # 容量电费，元/kVA/月
    demand_mode: str            # 'max_demand' or 'contracted_capacity'
    
    # 力调电费参数
    pf_threshold: float         # 功率因数考核标准，默认0.90
    pf_bonus_rate: float       # 功率因数奖励比例上限，0.75%
    
    # 政府性基金
    gov_surcharge: float        # 政府性基金，元/kWh
```

### 1.4 可用资源约束

```csv
约束类型,参数名称,数值,单位,备注
可用面积,可用屋顶面积,15000,m²,需扣除女儿墙/设备间距
光伏安装,最大安装倾角,15,°,彩钢瓦屋面限制
光伏安装,方位角范围,180±30,°,仅南侧可用
变压器,现有变压器容量,2000,kVA,并网侧
变压器,最大变压器容量,3150,kVA,物理上限
并网限功,并网限功率,1500,kW,电网批复值
并网限功,最大允许反向功率,200,kW,馈线容量限制
电网接入,接入电压等级,10,kV,PCC点电压
海拔高度,项目地海拔,50,m,非高原设计可忽略
```

### 1.5 投资约束

```csv
约束类型,参数名称,数值,单位,说明
预算约束,总投资预算上限,3000,万元,含送出线路
预算约束,单位投资上限,3500,元/kWh,电化学储能
回收期,最大投资回收期,8,年,含建设期
IRR,最低项目IRR,10%,,税后财务基准
IRR,最低资本金IRR,12%,,自有资金部分
容量补贴,是否有容量补贴,否,--,部分地区有
```

### 1.6 保电需求

```python
@dataclass
class BackupRequirement:
    """保电需求数据类"""
    # 关键负荷清单
    critical_loads: List[dict]  # [{'name': '控制室', 'power': 50, 'priority': 1}, ...]
    
    # 保电时长要求
    backup_duration: float      # 保电时长，h
    backup_depth: float         # 保电深度（放电深度下限），%，通常20~50%
    
    # 储能SOC约束
    min_soc_normal: float       # 正常运行下限SOC，默认20%
    min_soc_backup: float       # 保电模式下限SOC，默认50%
    max_soc: float              # 充电上限SOC，默认95%
    
    # 柴发需求
    need_diesel: bool           # 是否需要配置柴发
    diesel_priority: int       # 柴发优先级（1最高）
```

### 1.7 政策补贴与配储要求

```python
@dataclass
class PolicyData:
    """政策与补贴数据"""
    # 新能源配储要求
    storage_ratio_req: float    # 配储比例（如：10%/15%/20%）
    storage_duration_req: float # 配储时长（h），通常2h/4h
    storage_mandatory: bool    # 是否强制配储
    
    # 补贴政策
    subsidy_type: str          # 'capacity'/'energy'/'per_kW'/'none'
    subsidy_amount: float      # 补贴金额
    subsidy_unit: str          # '元/kWh'/'元/kW'/'元/项目'
    subsidy_duration: int       # 补贴年限
    subsidy_cap: float         # 单项目补贴上限
    
    # 并网政策
    grid_code: str             # 适用并网标准（GB/T 36549等）
    capacity_limit_per_mw: float # 每MW最大并网点数
```

---

## 二、储能容量优化算法

### 方法A：基于峰谷套利的迭代法

#### 2.1.1 算法原理

通过迭代搜索不同储能配置（容量 $E_{ESS}$、功率 $P_{ESS}$），计算各配置下的年化收益，比较不同配置的 IRR，选择 IRR 最大配置为最优。

#### 2.1.2 核心公式

**每日峰谷套利收益计算**：

$$R_{daily} = \sum_{t=1}^{24} \left[ P_{dis}(t) - P_{ch}(t) \right] \times Price(t) \times \eta_{round-trip} \times \Delta t$$

其中：
- $P_{dis}(t)$：时段t放电功率（kW）
- $P_{ch}(t)$：时段t充电功率（kW）
- $Price(t)$：时段t电价（元/kWh）
- $\eta_{round-trip}$：储能系统往返效率（考虑充电+放电损耗）

**储能系统往返效率**：

$$\eta_{RT} = \eta_{ch} \times \eta_{dis} = \sqrt{\eta_{ESS}}$$

典型值：$\eta_{RT} \approx 0.85 \sim 0.90$（$\eta_{ch} \approx 0.95, \eta_{dis} \approx 0.95$）

**年化总收益**：

$$R_{annual} = \sum_{day=1}^{365} R_{daily} - O\&M_{annual} - Loss_{replace}$$

**储能生命周期成本**：

$$C_{ESS} = C_{cap} + C_{om} \times L + C_{rep} - V_{salvage}$$

其中：
- $C_{cap}$：初始投资成本（元/kWh × 容量）
- $C_{om}$：年运维成本（元/kWh/年）
- $L$：项目生命周期（年）
- $C_{rep}$：电池替换成本折现值
- $V_{salvage}$：残值折现值

#### 2.1.3 迭代求解算法

```
算法：峰谷套利IRR最优配置迭代法
输入：负荷数据、光伏数据、电价数据、参数边界
输出：最优ESS容量/功率、IRR

1. 初始化搜索范围：
   - 功率范围：P_min ~ P_max（kW），步长ΔP
   - 容量范围：E_min ~ E_max（kWh），步长ΔE

2. 双重循环遍历配置：
   for P_ess in [P_min:ΔP:P_max]:
       for E_ess in [E_min:ΔE:E_max]:
           # 2.1 运行策略优化
           P_ch(t), P_dis(t) = optimize_dispatch(P_ess, E_ess, load, tariff)
           
           # 2.2 收益计算
           R_annual = calc_annual_revenue(P_ch, P_dis, price, eta_rt)
           R_lifetime = calc_lifetime_revenue(R_annual, L, discount_rate)
           
           # 2.3 成本计算
           C_invest = cap_cost * E_ess + power_cost * P_ess
           C_lifetime = calc_lifetime_cost(C_invest, E_ess, L, discount_rate)
           
           # 2.4 IRR计算
           cash_flows = [-C_invest] + [R_annual - O&M] * L
           IRR = calc_IRR(cash_flows)
           
           # 2.5 记录结果
           if IRR > IRR_best:
               IRR_best = IRR
               config_opt = {P_ess, E_ess}

3. 输出最优配置
```

#### 2.1.4 放电策略优化（核心子函数）

```python
import numpy as np
from scipy.optimize import linprog
import matplotlib.pyplot as plt

def optimize_dispatch_arb(P_ess, E_ess, load_8760, tariff):
    """
    基于峰谷套利的储能充放电策略优化
    策略：谷时充满，峰时放光（简化贪婪策略）
    
    参数：
        P_ess: 储能额定功率 (kW)
        E_ess: 储能额定容量 (kWh)
        load_8760: 8760小时负荷数据
        tariff: 电价结构数据
    返回：
        P_ch, P_dis: 各时刻充放电功率
    """
    n_hours = len(load_8760)
    P_ch = np.zeros(n_hours)
    P_dis = np.zeros(n_hours)
    soc = np.zeros(n_hours + 1)
    soc[0] = 0.5 * E_ess  # 初始SOC 50%
    
    # 获取24小时电价序列（重复365天）
    price_24h = tariff.get_hourly_price()  # 24元素
    price_8760 = np.tile(price_24h, 365)
    
    eta_rt = 0.85  # 往返效率
    
    for t in range(n_hours):
        current_price = price_8760[t]
        
        # 找到当天最低/最高电价时段
        day_start = (t // 24) * 24
        day_end = day_start + 24
        day_price = price_8760[day_start:day_end]
        min_price_hour = day_start + np.argmin(day_price)
        max_price_hour = day_start + np.argmax(day_price)
        
        # 谷时充电（当天最低价时段）
        if t == min_price_hour and soc[t] < E_ess * 0.95:
            # 谷时充电（优先用电网充电，储能吸收）
            avail_power = min(P_ess, E_ess * 0.95 - soc[t])
            P_ch[t] = avail_power
            soc[t+1] = soc[t] + P_ch[t]
        
        # 峰时放电（当天最高价时段）
        elif t == max_price_hour and soc[t] > E_ess * 0.05:
            avail_power = min(P_ess, soc[t] - E_ess * 0.05)
            P_dis[t] = avail_power
            soc[t+1] = soc[t] - P_dis[t]
        
        else:
            soc[t+1] = soc[t]
        
        # SOC约束
        soc[t+1] = np.clip(soc[t+1], E_ess * 0.05, E_ess * 0.95)
    
    return P_ch, P_dis, soc[:-1]

def calc_annual_revenue_arb(P_ch, P_dis, price_8760, eta_rt=0.85):
    """计算年度峰谷套利总收益"""
    net_energy = (P_dis - P_ch) * eta_rt  # 考虑效率损耗
    return np.sum(net_energy * price_8760)

def iterative_search_irr(load_8760, tariff, 
                         P_range=(100, 2000, 100),  # 功率搜索范围
                         E_range=(100, 4000, 200)):  # 容量搜索范围
    """
    迭代搜索最优ESS配置（基于IRR最大化）
    """
    results = []
    price_8760 = np.tile(tariff.get_hourly_price(), 365)
    
    for P_ess in range(P_range[0], P_range[1]+1, P_range[2]):
        for E_ess in range(E_range[0], E_range[1]+1, E_range[2]):
            # 优化调度策略
            P_ch, P_dis, soc = optimize_dispatch_arb(P_ess, E_ess, load_8760, tariff)
            
            # 计算年收益
            R_annual = calc_annual_revenue_arb(P_ch, P_dis, price_8760)
            
            # 成本计算
            capex_ess = 1500 * E_ess + 800 * P_ess  # 元/kWh + 元/kW
            opex_annual = 30 * E_ess  # 元/kWh/年运维
            lifetime = 10
            
            # 净现金流
            annual_cf = R_annual - opex_annual
            NPV = -capex_ess + annual_cf * (1 - (1+0.06)**(-lifetime)) / 0.06
            
            # 近似IRR（简化计算）
            if annual_cf > 0:
                payback = capex_ess / annual_cf
                IRR_approx = 1/payback * lifetime if payback < lifetime else 0
            else:
                IRR_approx = 0
            
            results.append({
                'P_ess': P_ess,
                'E_ess': E_ess,
                'NPV': NPV,
                'IRR_approx': IRR_approx,
                'payback': payback
            })
    
    # 返回最优配置
    return max(results, key=lambda x: x['IRR_approx'])
```

#### 2.1.5 收敛条件

迭代终止条件（三选一）：
1. **IRR变化率** $|IRR_{n+1} - IRR_n| < \epsilon_1$（通常 $\epsilon_1 = 0.001$）
2. **达到最大迭代次数** $n > N_{max}$（通常 $N_{max} = 100$）
3. **配置步长精度** $\Delta P < P_{step\_min}$ 且 $\Delta E < E_{step\_min}$

---

### 方法B：基于风险调整收益最大化IRRVaR

#### 2.2.1 算法原理

传统IRR方法仅考虑期望收益，忽略收益的波动风险。IRRVaR方法在IRR框架下引入CVaR（Conditional Value at Risk）风险度量，找到**风险调整后收益最大化**的配置。

#### 2.2.2 VaR/CVaR定义

**Value at Risk（VaR）**：
$$VaR_{\alpha} = \inf\{x \in \mathbb{R} : P(R > x) \leq 1 - \alpha\}$$

财务上解释：在置信水平 $\alpha$（如95%）下，最大可能损失。

**Conditional VaR（CVaR）**：
$$CVaR_{\alpha} = E[R | R \leq VaR_{\alpha}] = \frac{1}{1-\alpha}\int_{\alpha}^{1} VaR_{u} du$$

财务上解释：超过VaR阈值的平均损失（尾部风险期望）。

#### 2.2.3 IRRVaR目标函数

$$\max_{P_{ess}, E_{ess}} \quad IRR_{expected} - \lambda \cdot CVaR_{\alpha}(IRR)$$

其中 $\lambda$ 为风险厌恶系数（$\lambda > 0$），$\alpha$ 为VaR置信水平（通常取0.90或0.95）。

或等效为最大化风险调整收益：

$$J = E[IRR] - \lambda \cdot CVaR_{\alpha}[IRR]$$

#### 2.2.4 蒙特卡洛模拟流程

```python
import numpy as np
from scipy.stats import norm

def monte_carlo_irr(P_ess, E_ess, load_8760, tariff, 
                    n_scenarios=1000, random_seed=42):
    """
    蒙特卡洛模拟计算IRR分布
    
    参数：
        n_scenarios: 模拟场景数
        random_seed: 随机种子，确保可复现
    返回：
        irr_samples: IRR样本数组
    """
    np.random.seed(random_seed)
    irr_samples = []
    
    for s in range(n_scenarios):
        # 随机化关键不确定参数
        # 1. 电价波动（±15%）
        price_noise = 1 + np.random.normal(0, 0.15)
        tariff_scenario = tariff * price_noise
        
        # 2. 光伏出力波动（±20%）
        pv_noise = 1 + np.random.normal(0, 0.20)
        
        # 3. 负荷波动（±10%）
        load_noise = 1 + np.random.normal(0, 0.10)
        load_scenario = load_8760 * load_noise
        
        # 4. 设备效率衰减（年衰减2%）
        eff_year = np.random.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        eta_degradation = (1 - 0.02) ** eff_year
        
        # 计算该场景IRR
        irr_s = calc_single_irr_scenario(
            P_ess, E_ess, load_scenario, tariff_scenario, eta_degradation
        )
        irr_samples.append(irr_s)
    
    return np.array(irr_samples)

def calc_single_irr_scenario(P_ess, E_ess, load, tariff, eta_degradation):
    """计算单次IRR"""
    P_ch, P_dis, _ = optimize_dispatch_arb(P_ess, E_ess, load, tariff)
    R_annual = np.sum((P_dis - P_ch) * tariff.get_hourly_price() * eta_degradation)
    
    capex = 1500 * E_ess + 800 * P_ess
    opex = 30 * E_ess
    annual_cf = R_annual - opex
    lifetime = 10
    
    # 简化的IRR计算（线性插值）
    r_low, r_high = -0.1, 0.5
    for _ in range(100):
        r_mid = (r_low + r_high) / 2
        pv_factor = (1 - (1+r_mid)**(-lifetime)) / r_mid
        npv = -capex + annual_cf * pv_factor
        
        if abs(npv) < 1:  # 收敛
            return r_mid
        elif npv > 0:
            r_low = r_mid
        else:
            r_high = r_mid
    
    return r_mid

def calc_var_cvar(irr_samples, alpha=0.95):
    """计算VaR和CVaR"""
    irr_sorted = np.sort(irr_samples)
    var_idx = int((1 - alpha) * len(irr_samples))
    VaR = irr_sorted[var_idx]
    CVaR = np.mean(irr_sorted[:var_idx])
    return VaR, CVaR

def irrvar_objective(results_df, lambda_risk=0.3, alpha=0.95):
    """
    IRRVaR目标函数计算
    返回：每个配置的 IRR - λ * CVaR 值
    """
    score = []
    for _, row in results_df.iterrows():
        irr_samples = row['irr_samples']
        E_IRR = np.mean(irr_samples)
        _, CVaR = calc_var_cvar(irr_samples, alpha)
        score.append(E_IRR - lambda_risk * CVaR)
    return np.array(score)

def select_config_irrvarr(results_df, lambda_risk=0.3, alpha=0.95):
    """选择IRRVaR最优配置"""
    scores = irrvar_objective(results_df, lambda_risk, alpha)
    best_idx = np.argmax(scores)
    return results_df.iloc[best_idx]
```

#### 2.2.5 风险偏好参数选择

| 风险类型 | λ取值 | 适用场景 |
|---------|-------|---------|
| 激进 | 0.1~0.2 | 电价政策稳定、补贴明确、风险承受能力强 |
| 中性 | 0.3~0.4 | 一般工商业项目、风险中性投资者 |
| 保守 | 0.5~0.7 | 政策不明朗、投资回收期敏感、微网离网项目 |

---

### 方法C：基于MILP的两阶段优化

#### 2.3.1 算法原理

使用混合整数线性规划（MILP）进行两阶段优化：
- **第一阶段（日级）**：以15分钟为时段，优化一天内24×4=96个时段的充放电决策
- **第二阶段（年度）**：基于日级优化结果，评估全年经济性

#### 2.3.2 决策变量定义

| 变量符号 | 变量名 | 类型 | 维度 | 说明 |
|---------|--------|------|------|------|
| $P_{ch,t}$ | 充电功率 | 连续变量≥0 | 96×365 | 时段t充电功率(kW) |
| $P_{dis,t}$ | 放电功率 | 连续变量≥0 | 96×365 | 时段t放电功率(kW) |
| $SOC_t$ | 荷电状态 | 连续变量 | 96×365 | 时段t储能SOC(kWh) |
| $u_{ch,t}$ | 充电标志 | 二进制 | 96×365 | 充电=1，否则0 |
| $u_{dis,t}$ | 放电标志 | 二进制 | 96×365 | 放电=1，否则0 |
| $P_{pv,t}$ | 光伏出力 | 连续变量 | 96×365 | 光伏实际出力(kW) |
| $P_{grid,t}$ | 电网交换功率 | 连续变量 | 96×365 | 正值=从电网购电 |

#### 2.3.3 目标函数

**日级优化目标（运营成本最小化）**：

$$\min \sum_{t=1}^{96} \left[ P_{grid,t} \cdot Price_t \cdot \Delta t + u_{ch,t} \cdot C_{sw} \right]$$

其中：
- $Price_t$：时段t的实时电价（元/kWh）
- $C_{sw}$：储能启停切换成本（元/次）
- $\Delta t$：时段长度（0.25h，即15分钟）

**年度经济性评估目标**：

$$\max \quad NPV = -C_{cap} + \sum_{y=1}^{L} \frac{R_y - O\&M_y}{(1+r)^y} + \frac{V_{salvage}}{(1+r)^L}$$

#### 2.3.4 约束条件

**功率平衡约束**：

$$P_{load,t} + P_{ch,t} \cdot \eta_{ch} = P_{pv,t} + P_{dis,t} \cdot \eta_{dis} + P_{grid,t}$$

**SOC演化约束**：

$$SOC_{t+1} = SOC_t + P_{ch,t} \cdot \eta_{ch} \cdot \Delta t - \frac{P_{dis,t}}{\eta_{dis}} \cdot \Delta t$$

**SOC边界约束**：

$$E_{ess} \cdot SOC_{min} \leq SOC_t \leq E_{ess} \cdot SOC_{max}$$

**功率限值约束**：

$$P_{ch,t} \leq P_{ess} \cdot u_{ch,t}$$
$$P_{dis,t} \leq P_{ess} \cdot u_{dis,t}$$

**互斥约束**（同一时刻不能同时充放电）：

$$u_{ch,t} + u_{dis,t} \leq 1$$

**并网限功率约束**：

$$-P_{grid\_export\_max} \leq P_{grid,t} \leq P_{grid\_import\_max}$$

**光伏消纳约束**：

$$P_{pv,t} \leq P_{pv\_rated} \cdot \gamma_t \cdot (1 - L_{curt\_max})$$

其中 $\gamma_t$ 为光伏归一化出力系数（0~1）。

#### 2.3.5 Pyomo/Gurobi配置模板

```python
from pyomo.environ import *
import numpy as np

def build_milp_model(P_ess, E_ess, load_profile, pv_profile, tariff, 
                     SOC_min=0.20, SOC_max=0.95, eta_ch=0.95, eta_dis=0.95):
    """
    构建储能调度的MILP模型（使用Pyomo + Gurobi求解器）
    """
    model = ConcreteModel()
    
    n_hours = len(load_profile)  # 通常96（24h×4）
    delta_t = 1.0 / 4  # 15分钟
    
    # ==================== 决策变量 ====================
    model.P_ch = Var(range(n_hours), bounds=(0, P_ess), within=NonNegativeReals)
    model.P_dis = Var(range(n_hours), bounds=(0, P_ess), within=NonNegativeReals)
    model.SOC = Var(range(n_hours+1), bounds=(SOC_min*E_ess, SOC_max*E_ess))
    model.u_ch = Var(range(n_hours), within=Binary)
    model.u_dis = Var(range(n_hours), within=Binary)
    model.P_grid = Var(range(n_hours))  # 可正可负
    
    # ==================== 目标函数 ====================
    def obj_rule(model):
        cost_energy = sum(model.P_grid[t] * tariff[t] * delta_t 
                        for t in range(n_hours))
        cost_switch = sum(0.5 * (model.u_ch[t] + model.u_dis[t]) 
                         for t in range(n_hours))
        return cost_energy + cost_switch
    
    model.OBJ = Objective(rule=obj_rule, sense=minimize)
    
    # ==================== 约束条件 ====================
    
    # 功率平衡约束
    def power_balance_rule(model, t):
        return (model.P_ch[t] * eta_ch + load_profile[t] 
                == model.P_dis[t] * eta_dis + pv_profile[t] + model.P_grid[t])
    model.power_balance = Constraint(range(n_hours), rule=power_balance_rule)
    
    # SOC演化约束
    def soc_evolve_rule(model, t):
        return (model.SOC[t+1] == model.SOC[t] 
                + model.P_ch[t] * eta_ch * delta_t 
                - model.P_dis[t] / eta_dis * delta_t)
    model.soc_evolve = Constraint(range(n_hours), rule=soc_evolve_rule)
    
    # SOC初始条件
    model.SOC_init = Constraint(expr=model.SOC[0] == (SOC_min + SOC_max) / 2 * E_ess)
    
    # 充电功率限值
    def ch_power_limit_rule(model, t):
        return model.P_ch[t] <= P_ess * model.u_ch[t]
    model.ch_power_limit = Constraint(range(n_hours), rule=ch_power_limit_rule)
    
    # 放电功率限值
    def dis_power_limit_rule(model, t):
        return model.P_dis[t] <= P_ess * model.u_dis[t]
    model.dis_power_limit = Constraint(range(n_hours), rule=dis_power_limit_rule)
    
    # 互斥约束
    def mutex_rule(model, t):
        return model.u_ch[t] + model.u_dis[t] <= 1
    model.mutex = Constraint(range(n_hours), rule=mutex_rule)
    
    # 并网限功率约束
    def grid_limit_rule(model, t):
        return Inequality(-200, model.P_grid[t], 1500)  # 馈线限制
    model.grid_limit = Constraint(range(n_hours), rule=grid_limit_rule)
    
    return model

def solve_milp(model, solver='gurobi'):
    """求解MILP模型"""
    solver_obj = SolverFactory(solver)
    results = solver_obj.solve(model, tee=False)
    
    if results.solver.status == SolverStatus.ok:
        # 提取结果
        P_ch_opt = [value(model.P_ch[t]) for t in range(len(model.P_ch))]
        P_dis_opt = [value(model.P_dis[t]) for t in range(len(model.P_dis))]
        SOC_opt = [value(model.SOC[t]) for t in range(len(model.SOC))]
        obj_val = value(model.OBJ)
        return {'P_ch': P_ch_opt, 'P_dis': P_dis_opt, 'SOC': SOC_opt, 
                'obj': obj_val, 'status': 'optimal'}
    else:
        return {'status': 'infeasible'}

def evaluate_capacity_config(P_ess, E_ess, load_8760, pv_8760, tariff, 
                             project_life=10, discount_rate=0.06):
    """
    评估给定容量配置的经济性（调用MILP模型）
    """
    # 逐日优化
    daily_revenue = []
    for day in range(365):
        day_load = load_8760[day*24:(day+1)*24]
        day_pv = pv_8760[day*24:(day+1)*24]
        day_tariff = tariff[day*24:(day+1)*24]
        
        # 构建并求解当日MILP
        model = build_milp_model(P_ess, E_ess, day_load, day_pv, day_tariff)
        result = solve_milp(model)
        
        if result['status'] == 'optimal':
            # 计算当日收益（节省的电费）
            P_ch = np.array(result['P_ch'])
            P_dis = np.array(result['P_dis'])
            revenue = np.sum((P_dis - P_ch) * day_tariff * 0.85)
            daily_revenue.append(revenue)
    
    # 年度经济性汇总
    R_annual = np.mean(daily_revenue) * 365
    capex = 1500 * E_ess + 800 * P_ess
    opex = 30 * E_ess
    annual_cf = R_annual - opex
    
    # NPV计算
    discount_factor = sum(1/(1+discount_rate)**y for y in range(1, project_life+1))
    NPV = -capex + annual_cf * discount_factor
    
    # IRR计算
    IRR = calc_irr([-capex] + [annual_cf] * project_life)
    
    return {'NPV': NPV, 'IRR': IRR, 'R_annual': R_annual, 'capex': capex}
```

---

### 方法D：基于强化学习的自适应容量规划

#### 2.4.1 算法原理

对于需要长期滚动规划、多阶段投资决策的微网项目，传统优化方法难以处理动态电价、多阶段投资时序问题。强化学习（RL）方法可学习最优策略，适用于：
- 电价不确定的现货市场环境
- 分阶段建设的微网项目
- 需要实时响应的调度场景

#### 2.4.2 状态空间/动作空间/奖励函数定义

**状态空间 $\mathcal{S}$**：

$$\mathcal{S} = \{S_{current\_hour}, S_{PV\_forecast}, S_{load\_forecast}, S_{SOC}, S_{price\}$$

| 状态变量 | 符号 | 维度 | 描述 |
|---------|------|------|------|
| 时段标志 | $h$ | 24 | 小时归一化（0~23/24） |
| 光伏出力预测 | $P_{pv}^{pred}$ | 24 | 未来24h光伏预测 |
| 负荷预测 | $P_{load}^{pred}$ | 24 | 未来24h负荷预测 |
| 当前SOC | $SOC_t$ | 1 | 当前荷电状态 |
| 电价预测 | $\lambda^{pred}$ | 24 | 未来24h电价预测 |

**动作空间 $\mathcal{A}$**：

$$\mathcal{A} = \{a_1, a_2, ..., a_n\}$$

| 动作 | 值 | 描述 |
|-----|---|------|
| 充电 | $a=1$ | 以额定功率充电 |
| 待机 | $a=0$ | 不充不放 |
| 放电 | $a=-1$ | 以额定功率放电 |

或扩展为连续动作：

$$a \in [-1, 1], \quad P_{action} = a \times P_{ess}$$

**奖励函数 $\mathcal{R}$**：

$$R_t = \underbrace{(P_{dis,t} - P_{ch,t}) \cdot \lambda_t \cdot \eta_{RT}}_{\text{实时收益}} - \underbrace{C_{wear} \cdot |a_t|}_{\text{循环损耗成本}}$$

其中 $C_{wear}$ 为电池单位循环损耗成本（元/%Depth/次），通常：

$$C_{wear} = \frac{C_{replace}}{2 \times DOD_{max} \times Cycles_{design}}$$

#### 2.4.3 DQN算法框架

```python
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from collections import deque
import random

class ReplayBuffer:
    """经验回放缓冲区"""
    def __init__(self, capacity=10000):
        self.buffer = deque(maxlen=capacity)
    
    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))
    
    def sample(self, batch_size):
        return random.sample(self.buffer, batch_size)

class DQNNetwork(nn.Module):
    """深度Q网络"""
    def __init__(self, state_dim, action_dim, hidden_dim=128):
        super(DQNNetwork, self).__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, action_dim)
        )
    
    def forward(self, x):
        return self.net(x)

class ESS_RL_Agent:
    """储能调度强化学习智能体"""
    def __init__(self, state_dim, action_dim, hidden_dim=128, learning_rate=0.001):
        self.state_dim = state_dim
        self.action_dim = action_dim
        
        self.q_network = DQNNetwork(state_dim, action_dim, hidden_dim)
        self.target_network = DQNNetwork(state_dim, action_dim, hidden_dim)
        self.target_network.load_state_dict(self.q_network.state_dict())
        
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=learning_rate)
        self.memory = ReplayBuffer(capacity=10000)
        
        self.epsilon = 1.0  # 探索率
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        
        self.gamma = 0.99  # 折扣因子
        self.batch_size = 64
    
    def select_action(self, state):
        """ε-贪心策略选择动作"""
        if random.random() < self.epsilon:
            return random.randint(0, self.action_dim - 1)
        else:
            with torch.no_grad():
                state_tensor = torch.FloatTensor(state).unsqueeze(0)
                q_values = self.q_network(state_tensor)
                return q_values.argmax().item()
    
    def train_step(self):
        """训练一步"""
        if len(self.memory.buffer) < self.batch_size:
            return
        
        states, actions, rewards, next_states, dones = \
            self.memory.sample(self.batch_size)
        
        states = torch.FloatTensor(states)
        actions = torch.LongTensor(actions)
        rewards = torch.FloatTensor(rewards)
        next_states = torch.FloatTensor(next_states)
        dones = torch.FloatTensor(dones)
        
        # 计算当前Q值
        q_values = self.q_network(states).gather(1, actions.unsqueeze(1))
        
        # 计算目标Q值
        with torch.no_grad():
            next_q_values = self.target_network(next_states).max(1)[0]
            target_q = rewards + self.gamma * next_q_values * (1 - dones)
        
        # 损失函数
        loss = nn.MSELoss()(q_values.squeeze(), target_q)
        
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        
        # ε衰减
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)
        
        return loss.item()
    
    def update_target_network(self):
        """更新目标网络（软更新）"""
        tau = 0.005
        for target_param, param in zip(
            self.target_network.parameters(), 
            self.q_network.parameters()
        ):
            target_param.data.copy_(tau * param.data + (1 - tau) * target_param.data)

def train_ess_rl(P_ess, E_ess, load_8760, pv_8760, tariff_8760, 
                 n_episodes=500, max_steps=8760):
    """
    训练储能调度强化学习智能体
    
    参数：
        P_ess, E_ess: 储能配置
        load_8760, pv_8760, tariff_8760: 8760小时数据
        n_episodes: 训练回合数
        max_steps: 每回合最大步数
    """
    # 状态维度：时段(1) + 光伏预测(24) + 负荷预测(24) + SOC(1) + 电价预测(24) = 74
    state_dim = 1 + 24 + 24 + 1 + 24
    action_dim = 3  # 充电/待机/放电
    
    agent = ESS_RL_Agent(state_dim, action_dim)
    
    episode_rewards = []
    
    for episode in range(n_episodes):
        total_reward = 0
        soc = 0.5 * E_ess  # 初始SOC 50%
        
        for step in range(max_steps):
            # 构建状态（简化版：仅使用当前时刻数据）
            state = np.array([
                step % 24 / 24,  # 时段归一化
                soc / E_ess,     # SOC归一化
                tariff_8760[step] / max(tariff_8760),  # 电价归一化
                pv_8760[step] / max(pv_8760) if max(pv_8760) > 0 else 0,
                load_8760[step] / max(load_8760)
            ])
            
            # 选择动作
            action = agent.select_action(state)
            
            # 执行动作，计算奖励
            if action == 0:  # 待机
                P_ch, P_dis = 0, 0
            elif action == 1:  # 充电
                P_ch = min(P_ess, E_ess * 0.95 - soc)
                P_dis = 0
            else:  # 放电
                P_ch = 0
                P_dis = min(P_ess, soc - E_ess * 0.05)
            
            # SOC更新
            soc_new = soc + P_ch * 0.95 - P_dis / 0.95
            soc_new = np.clip(soc_new, E_ess * 0.05, E_ess * 0.95)
            
            # 奖励计算
            reward = (P_dis - P_ch) * tariff_8760[step] * 0.85
            total_reward += reward
            
            # 判断是否结束
            done = (step == max_steps - 1)
            
            # 存储经验
            next_state = np.array([
                (step + 1) % 24 / 24,
                soc_new / E_ess,
                tariff_8760[(step+1) % 8760] / max(tariff_8760),
                pv_8760[(step+1) % 8760] / max(pv_8760) if max(pv_8760) > 0 else 0,
                load_8760[(step+1) % 8760] / max(load_8760)
            ])
            agent.memory.push(state, action, reward, next_state, done)
            
            # 训练
            agent.train_step()
            agent.update_target_network()
            
            soc = soc_new
        
        episode_rewards.append(total_reward)
        if episode % 50 == 0:
            print(f"Episode {episode}, Avg Reward: {np.mean(episode_rewards[-50:]):.2f}")
    
    return agent, episode_rewards
```

#### 2.4.4 适用场景说明

| 方法 | 适用场景 | 不适用场景 |
|------|---------|-----------|
| 方法A（迭代法） | 项目概算、初步选型、方案对比 | 精确调度、多时段耦合 |
| 方法B（IRRVaR） | 风险厌恶型投资者、政策不稳定地区 | 数据不足、极端价格波动 |
| 方法C（MILP） | 日级精确调度、并网优化 | 求解器不可用、大规模多阶段 |
| 方法D（RL） | 现货市场、多阶段建设、实时调度 | 离线规划、数据训练成本高 |

---

## 三、光伏容量匹配算法

### 3.1 自发自用率最优（负载匹配法）

#### 3.1.1 核心概念

**自发自用率（Self-Consumption Rate, SCR）**：

$$SCR = \frac{E_{self\_consumed}}{E_{PV\_total}} = \frac{\min(E_{PV}, E_{load})}{E_{PV}}$$

**光伏发电量**：

$$E_{PV} = P_{PV\_rated} \times PR \times H_{yearly}$$

**负荷用电量**：

$$E_{load} = \sum_{t=1}^{8760} P_{load}(t) \times \Delta t$$

#### 3.1.2 迭代求最优光伏/负荷比

目标：找到使全生命周期净收益最大的光伏装机容量。

```python
def calc_self_consumption_ratio(P_pv_rated, load_8760, pv_8760):
    """
    计算自发自用率
    
    参数：
        P_pv_rated: 光伏装机容量 (kWp)
        load_8760: 8760小时负荷数据 (kW)
        pv_8760: 8760小时光伏出力数据 (kW)
    返回：
        SCR: 自发自用率
        E_self_consumed: 自发自用电量 (kWh)
        E_exported: 上网电量 (kWh)
    """
    n_hours = len(load_8760)
    E_self = 0
    E_pv_total = 0
    
    for t in range(n_hours):
        pv_output = min(pv_8760[t], P_pv_rated)  # 光伏实际出力
        E_pv_total += pv_output
        E_self += min(pv_output, load_8760[t])  # 自用部分
    
    SCR = E_self / E_pv_total if E_pv_total > 0 else 0
    E_exported = E_pv_total - E_self
    
    return SCR, E_self, E_exported

def optimize_pv_capacity(load_8760, pv_8760, tariff, 
                         P_pv_range=(0, 5000, 100)):
    """
    迭代搜索最优光伏装机容量（基于净收益最大化）
    """
    results = []
    
    for P_pv in range(P_pv_range[0], P_pv_range[1]+1, P_pv_range[2]):
        SCR, E_self, E_exported = calc_self_consumption_ratio(P_pv, load_8760, pv_8760)
        
        # 收益计算
        R_self = E_self * np.mean(tariff)  # 自用电节省电费
        R_export = E_exported * 0.35  # 上网电价（假设）
        
        # 成本计算
        capex_pv = 4000 * P_pv  # 光伏单位投资，元/kWp
        opex_pv = 50 * P_pv  # 年运维费用
        lifetime = 25
        
        annual_cf = R_self + R_export - opex_pv
        discount_rate = 0.06
        pv_factor = (1 - (1+discount_rate)**(-lifetime)) / discount_rate
        NPV = -capex_pv + annual_cf * pv_factor
        
        results.append({
            'P_pv': P_pv,
            'SCR': SCR,
            'E_self': E_self,
            'E_exported': E_exported,
            'NPV': NPV
        })
    
    # 返回NPV最大的配置
    return max(results, key=lambda x: x['NPV'])
```

### 3.2 消纳率约束下的最大光伏

#### 3.2.1 消纳率定义

**消纳率（Utilization Rate, UR）**：

$$UR = \frac{E_{curtailed}}{E_{PV\_total}} = 1 - \frac{E_{curtailed}}{E_{PV\_total}}$$

或等效于：

$$UR = \frac{E_{load\_total} - E_{grid\_export}}{E_{PV\_total}}$$

#### 3.2.2 约束下最大光伏求解

目标：在消纳率约束 $UR \geq UR_{min}$ 下，求最大光伏装机。

约束条件：
$$E_{PV} - E_{self} - E_{storage} \leq E_{PV} \times L_{curt\_max}$$

其中 $UR_{min}$ 通常取 90%（各地政策要求不同）。

```python
def calc_max_pv_with_utilization(P_ess, E_ess, load_8760, pv_8760, 
                                  UR_min=0.90, P_pv_max=10000):
    """
    在消纳率约束下求最大光伏装机
    """
    for P_pv in range(P_pv_max, 0, -100):
        # 计算该装机下的消纳情况
        E_pv_total = 0
        E_self = 0
        E_storage_used = 0
        
        soc = E_ess * 0.5
        
        for t in range(8760):
            pv_output = min(pv_8760[t] * (P_pv / 1000), P_pv)  # 归一化
            E_pv_total += pv_output
            
            # 自用
            self_use = min(pv_output, load_8760[t])
            E_self += self_use
            
            # 储能消纳（多余部分充电）
            excess = pv_output - self_use
            if excess > 0 and soc < E_ess * 0.95:
                storage_charge = min(excess, P_ess * 0.95, E_ess * 0.95 - soc)
                E_storage_used += storage_charge
                soc += storage_charge / 0.95
            
            # 弃光
            curtailed = pv_output - self_use - (pv_output - self_use - curtailed if excess > 0 else 0)
        
        # 消纳率
        UR = (E_self + E_storage_used) / E_pv_total if E_pv_total > 0 else 0
        
        if UR >= UR_min:
            return {'P_pv_max': P_pv, 'UR': UR}
    
    return {'P_pv_max': 0, 'UR': 0}
```

### 3.3 变压器容量约束

#### 3.3.1 并网功率限制模型

变压器容量限制：

$$P_{grid\_max} = \sqrt{3} \times U_{grid} \times I_{max} \times \cos\phi$$

典型10kV并网点：
- 额定容量：$S_{trafo} = 2000 \text{kVA}$
- 最大允许电流：$I_{max} = S_{trafo} / (1.732 \times U_{grid}) = 115 \text{A}$
- 最大允许功率：$P_{grid\_max} = 1732 \text{kW}$

#### 3.3.2 最大光伏/储能功率计算

```python
def calc_transformer_limited_capacity(S_trafo, P_load_max, cos_phi=0.95):
    """
    计算变压器容量约束下的最大并网功率
    
    参数：
        S_trafo: 变压器额定容量 (kVA)
        P_load_max: 最大负荷功率 (kW)
        cos_phi: 功率因数
    返回：
        P_grid_max: 最大并网功率 (kW)
        P_pv_max: 最大光伏装机 (kWp)
        P_ess_ch_max: 最大充电功率 (kW)
    """
    # 变压器可用容量
    S_available = S_trafo * cos_phi - P_load_max
    if S_available < 0:
        S_available = 0
    
    # 最大并网功率（馈线安全约束）
    P_grid_max = min(S_available, 1500)  # 并网点限功率
    
    # 最大光伏（考虑负荷抵消后的净输出）
    P_pv_max = P_grid_max + P_load_max  # 光伏最大出力 = 并网限值 + 负荷
    
    # 储能充电功率（不能超过变压器剩余容量）
    P_ess_ch_max = S_available
    
    return {
        'P_grid_max': P_grid_max,
        'P_pv_max': P_pv_max,
        'P_ess_ch_max': P_ess_ch_max,
        'S_available': S_available
    }
```

---

## 四、经济性建模与对比矩阵

### 4.1 全生命周期成本分解

#### 4.1.1 CAPEX成本结构

| 设备/工程 | 单价参考（元/kW或元/kWh） | 备注 |
|-----------|--------------------------|------|
| 储能电池系统 | 1200~1500 / kWh | 磷酸铁锂 |
| 储能BMS/PCS | 300~500 / kWh | 含管理系统 |
| 集装箱/土建 | 200~400 / kWh | 视项目规模 |
| 光伏组件 | 3000~4000 / kWp | 单晶PERC/N型 |
| 光伏逆变器 | 500~800 / kWp | |
| 光伏支架/安装 | 800~1200 / kWp | 固定/跟踪 |
| 柴发机组 | 800~1500 / kW | |
| 变压器/配电 | 200~500 / kVA | |
| 施工安装 | 总投资的5~10% | |
| 其他（设计/调试） | 总投资的3~5% | |

#### 4.1.2 OPEX成本结构

| 成本项 | 计算方式 | 参考值 |
|--------|---------|--------|
| 运维成本 | 元/kWh/年 或 元/kWp/年 | 储能30~50/kWh/年，光伏50/kWp/年 |
| 保险费 | CAPEX的0.5~1% | |
| 租地/屋顶租金 | 元/m²/年 | |
| 回收处置 | 残值回收（负成本） | |

#### 4.1.3 替换成本

储能电池寿命通常小于项目全生命周期：
- **循环寿命**：6000~10000次（0.5C, 25℃）
- **日历寿命**：10~15年
- **替换时点**：第10年（通常）

$$C_{replace} = E_{ess} \times C_{battery} \times (1 + r)^{-10}$$

### 4.2 IRR/NPV/回收期计算公式

#### 4.2.1 IRR（内部收益率）

使NPV=0的折现率：

$$\sum_{y=0}^{L} \frac{CF_y}{(1 + IRR)^y} = 0$$

其中 $CF_0 = -CAPEX$，$CF_y = R_y - O\&M_y$（y≥1）。

#### 4.2.2 NPV（净现值）

$$NPV = \sum_{y=0}^{L} \frac{R_y - C_y}{(1 + r)^y}$$

#### 4.2.3 静态回收期

$$T_{payback} = \frac{CAPEX}{R_{annual} - O\&M_{annual}}$$

#### 4.2.4 动态回收期

使累计折现现金流首次为正的年份：

$$\sum_{y=0}^{T_{dynamic}} \frac{CAPEX}{(1+r)^y} = \sum_{y=0}^{T_{dynamic}} \frac{R_y - C_y}{(1+r)^y}$$

### 4.3 多方案对比矩阵

| 评价维度 | 权重 | 方案A | 方案B | 方案C |
|---------|------|-------|-------|-------|
| **经济性** | 30% | | | |
| - IRR | | | | |
| - NPV（万元） | | | | |
| - 回收期（年） | | | | |
| - 单位成本（元/kWh） | | | | |
| **技术性** | 30% | | | |
| - 系统效率 | | | | |
| - 峰谷套利深度 | | | | |
| - 负荷平滑能力 | | | | |
| **安全性** | 20% | | | |
| - SOC安全余量 | | | | | |
| - 并网稳定性 | | | | |
| - 防火/应急 | | | | |
| **运维便利性** | 10% | | | |
| - 设备成熟度 | | | | |
| - 运维复杂度 | | | | |
| **灵活性** | 10% | | | |
| - 扩容能力 | | | | |
| - 调度灵活性 | | | | |
| **加权得分** | 100% | | | |

### 4.4 敏感性分析

#### 4.4.1 敏感性因素清单

| 敏感性因素 | 变化范围 | 参考值 | 影响方向 |
|-----------|---------|--------|---------|
| 电价变化 | ±20% | 基准电价 | ±IRR |
| 补贴退坡 | -30%~0% | 初始补贴 | ↓IRR |
| 设备降价 | -10%~0% | 初始价格 | ↑IRR |
| 利用率下降 | -20%~0% | 基准出力 | ↓IRR |
| 贷款利率上升 | +0.5%~2% | 基准利率 | ↓IRR |

#### 4.4.2 敏感性分析代码模板

```python
def sensitivity_analysis(base_config, base_result, 
                        factors=['electricity_price', 'subsidy', 'equipment_cost'],
                        ranges=[-0.2, -0.1, 0, 0.1, 0.2]):
    """
    敏感性分析
    """
    results = {}
    
    for factor in factors:
        irr_sensitivity = []
        
        for delta in ranges:
            # 修改参数
            config = copy.deepcopy(base_config)
            
            if factor == 'electricity_price':
                config['price_multiplier'] = 1 + delta
            elif factor == 'subsidy':
                config['subsidy_factor'] = 1 + delta
            elif factor == 'equipment_cost':
                config['cost_multiplier'] = 1 + delta
            
            # 重新计算经济性
            result = evaluate_config(config)
            irr_sensitivity.append(result['IRR'])
        
        # 计算敏感度系数
        base_irr = base_result['IRR']
        sensitivity_coef = (max(irr_sensitivity) - min(irr_sensitivity)) / (max(ranges) - min(ranges))
        
        results[factor] = {
            'irr_range': irr_sensitivity,
            'base_irr': base_irr,
            'sensitivity_coef': sensitivity_coef
        }
    
    return results
```

---

## 五、输出：推荐配置方案

### 5.1 推荐配置表模板

| 配置项 | 推荐值 | 变化范围 | 备注 |
|-------|-------|---------|------|
| **光伏装机容量** | XXXX kWp | ±10% | |
| **储能系统容量** | XXXX kWh | ±5% | |
| **储能系统功率** | XXXX kW | ±10% | |
| **储能类型** | 磷酸铁锂 | - | |
| **充放电深度** | 90%DOD | - | |
| **柴发容量** | XXXX kW | - | 视需配置 |
| **变压器增容** | XXXX kVA | - | 如需 |
| **并网点功率限值** | XXXX kW | - | |

### 5.2 配置理由说明模板

```
推荐配置理由：

1. 储能容量确定依据：
   - 基于峰谷套利IRR最优算法，在电价结构[尖峰X:XX元/kWh，平段X:XX元/kWh，谷段X:XX元/kWh]下，
     迭代搜索得到最优ESS容量为XXXX kWh。
   - 该配置下年化收益XXXX万元，IRR约XX%，满足项目IRR≥XX%的要求。

2. 光伏容量确定依据：
   - 基于自发自用率最优原则，光伏/负荷比约为XX%，对应最优装机XXXX kWp。
   - 在变压器容量XXXX kVA约束下，最大可安装光伏XXXX kWp，考虑消纳率要求后确定。

3. 柴发配置说明：
   - 根据保电需求[关键负荷XXXX kW，保电时长XXXX h]，计算所需柴发容量。
   - 如关键负荷低于XXX kW且保电时长<XX h，可考虑纯储能保电方案。
```

### 5.3 典型日能量平衡图

```
┌──────────────────────────────────────────────────────────────────────┐
│                    典型日光伏/储能/负荷曲线                              │
├──────────────────────────────────────────────────────────────────────┤
│ 功率(kW)│                                                             │
│         │    ████                    ████                            │
│  2000   │    ████                    ████        ─── 负荷               │
│         │    ████▌                  ▐████        ─── 光伏              │
│  1500   │    ████▌                  ▐████        ─── 储能(右轴)        │
│         │    ████▌▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄████        ─── 放电             │
│  1000   │    ████████████████████████████      ─── 充电             │
│         │    ████████████████████████████                              │
│   500   │▄▄▄▄███████████████████████████▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄│
│     0   │0   2   4   6   8  10  12  14  16  18  20  22  24          │
│         │                        时间(h)                              │
├──────────────────────────────────────────────────────────────────────┤
│ SOC(%)  │ 95% ┤                           ████████████               │
│         │  80% ┤              ████████                    ████████      │
│         │  50% ┤    ████                                              │
│         │  20% ┤▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄│
└──────────────────────────────────────────────────────────────────────┘
```

说明：
- 00:00-06:00：谷时段，储能充电（SOC上升）
- 06:00-09:00：平段/高峰，光伏自发自用，储能待机
- 09:00-12:00：尖峰时段，储能放电（SOC下降）
- 12:00-14:00：平段，光伏出力高峰，多余充电
- 14:00-18:00：高峰，光伏+储能联合供电
- 18:00-22:00：尖峰/高峰，储能放电高峰
- 22:00-24:00：谷时段，储能充电

### 5.4 全生命周期经济性摘要

| 经济性指标 | 数值 | 备注 |
|-----------|------|------|
| 总投资（CAPEX） | XXXX万元 | |
| 其中：光伏投资 | XXXX万元 | |
| 其中：储能投资 | XXXX万元 | |
| 其中：柴发/其他 | XXXX万元 | |
| 年运营成本（OPEX） | XX万元/年 | |
| 首年收益 | XXXX万元/年 | |
| 年化IRR | XX% | 税后 |
| 项目NPV | XXXX万元 | 折现率6% |
| 静态回收期 | X.X年 | |
| 全生命周期（10年）NPV | XXXX万元 | 含电池替换 |
| 度电成本（LCOE） | X.XX元/kWh | |

---

## 六、典型案例参考

### 案例一：长三角某工业园用户侧储能项目

#### 6.1.1 项目背景

| 项目参数 | 数值 |
|---------|------|
| 项目地址 | 浙江嘉兴某工业园区 |
| 行业类型 | 纺织/化工混合园区 |
| 负荷类型 | 典型工业负荷，白天生产，晚间低负荷 |
| 变压器容量 | 3150 kVA |
| 并网电压等级 | 10 kV |
| 年用电量 | 约1800万 kWh |
| 最大需量 | 约2200 kW |

**电价结构（浙江大工业分时电价）**：
- 尖峰电价：1.32元/kWh（8-11时、15-17时）
- 高峰电价：1.05元/kWh（8-11时、13-15时、17-21时）
- 平段电价：0.72元/kWh（6-8时、11-13时、15-17时、21-22时）
- 谷段电价：0.32元/kWh（22-次日6时）
- 基本电费：需量32元/kW/月

#### 6.1.2 配置方案

| 设备 | 配置 | 备注 |
|-----|------|------|
| 储能容量 | 2000 kWh（2MW/2MWh） | |
| 储能功率 | 2000 kW | 1C放电 |
| PCS配置 | 2台1MW PCS | |
| 运行策略 | 两充两放 | 谷时充满，峰时放光 |
| 日收益 | 约5000元/天 | 年180万元 |
| 运行年限 | 10年（电池需替换） | |

#### 6.1.3 核心计算参数

```python
# 项目参数
P_ess = 2000  # kW
E_ess = 2000  # kWh
SOC_min = 0.10
SOC_max = 0.95
eta_rt = 0.85

# 电价（浙江大工业）
price_peak = 1.32  # 尖峰
price_high = 1.05  # 高峰
price_flat = 0.72  # 平段
price_valley = 0.32  # 谷段

# 每日两充两放策略
# 充电时段：01:00-07:00（谷段），12:00-14:00（平段光伏消纳）
# 放电时段：09:00-11:00（尖峰），18:00-21:00（尖峰/高峰）

# 计算示例
ch_hours_valley = 6  # 谷段6小时
ch_hours_flat = 2   # 平段2小时
dis_hours_peak = 2   # 尖峰2小时
dis_hours_high = 3   # 高峰3小时

E_ch_daily = P_ess * (ch_hours_valley + ch_hours_flat)  # 16000 kWh
E_dis_daily = P_ess * (dis_hours_peak + dis_hours_high) # 10000 kWh

# 考虑效率后的净放电量
E_dis_net = E_dis_daily * eta_rt  # 8500 kWh
E_ch_net = E_ch_daily  # 16000 kWh

# 日收益计算（简化）
R_daily = E_dis_net * price_peak * 2 + E_dis_net * price_high * 3/5 - E_ch_net * price_valley * 0.8
# 实际需详细计算各时段收益
```

#### 6.1.4 经济性结果

| 指标 | 数值 | 备注 |
|------|------|------|
| 总投资 | 520万元 | 储能系统 |
| 单位投资 | 2600元/kWh | |
| 年运维成本 | 10万元/年 | |
| 年收益 | 180万元/年 | 峰谷套利+需量优化 |
| IRR | 12.5% | 税后 |
| 回收期 | 6.5年 | 静态 |
| 10年NPV | 280万元 | 折现率6% |

---

### 案例二：西北某大型光伏配储项目（电网侧）

#### 6.2.1 项目背景

| 项目参数 | 数值 |
|---------|------|
| 项目地址 | 青海省海南州 |
| 光伏装机 | 100 MWp |
| 储能配置 | 10MW/40MWh（1C/4h） |
| 并网电压等级 | 110 kV |
| 接入方式 | 光伏侧集中配储 |
| 年等效峰值日照 | 1700 h |
| 上网电价 | 0.2277元/kWh（上网） |

#### 6.2.2 配置方案

| 设备 | 配置 | 备注 |
|-----|------|------|
| 光伏组件 | 100 MWp（单晶PERC 540Wp） | |
| 储能容量 | 40 MWh（集装箱） | |
| 储能功率 | 10 MW | |
| 运行模式 | 集中式共享储能 | |
| 调频服务 | 参与电网一次/二次调频 | |

#### 6.2.3 核心计算参数

```python
# 光伏参数
P_pv = 100000  # kWp
PR = 0.82  # 性能比
H_yearly = 1700  # 年等效峰值日照小时

# 光伏年发电量
E_pv_annual = P_pv * PR * H_yearly / 1000  # 亿kWh
# = 100000 * 0.82 * 1700 / 10000000 = 13.94 亿kWh

# 储能参数
P_ess = 10000  # kW
E_ess = 40000  # kWh
E_ess_MW = 40  # MWh
charge_ratio = E_ess_MW / (P_ess/1000)  # 4h

# 配储比例
storage_ratio = E_ess_MW / (P_pv/1000)  # 0.4 MWh/MWp = 40%

# 收益来源
R_pv = E_pv_annual * 0.35  # 光伏上网收益（假设含补贴）
R_storage_freq = P_ess * 0.015 * 365  # 调频辅助服务收益估算
```

#### 6.2.4 经济性结果

| 指标 | 数值 | 备注 |
|------|------|------|
| 光伏投资 | 4.0亿元 | |
| 储能投资 | 0.8亿元 | |
| 总投资 | 4.8亿元 | |
| 年发电量 | 13.94亿kWh | |
| 年利用小时 | 1394h | |
| 光伏IRR | 8.5% | 含补贴 |
| 储能IRR | 6.2% | 调频收益 |
| 综合IRR | 7.8% | |

---

### 案例三：海南某海岛微网项目（离网型）

#### 6.3.1 项目背景

| 项目参数 | 数值 |
|---------|------|
| 项目地址 | 海南三沙某海岛 |
| 项目类型 | 离网微网 |
| 负荷类型 | 军民混合用电 |
| 最大负荷 | 500 kW |
| 日用电量 | 约8000 kWh/天 |
| 可用面积 | 约3000 m² |
| 年均风速 | 6.5 m/s |
| 年均太阳辐照 | 1800 kWh/m²/年 |

#### 6.3.2 配置方案

| 设备 | 配置 | 备注 |
|-----|------|------|
| 光伏装机 | 800 kWp | 屋面+地面 |
| 储能容量 | 2000 kWh（500kW/4h） | |
| 储能功率 | 500 kW | |
| 柴发配置 | 2×400 kW | 主备 |
| 运行模式 | 离网型微网 | |
| 保电时长 | 8小时（纯储能） | |

#### 6.3.3 系统架构

```
                    ┌─────────────┐
                    │   光伏阵列  │
                    │  800 kWp   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    DC Bus   │
                    │  (汇流)     │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼───────┐   ┌──────▼──────┐   ┌──────▼──────┐
│   储能系统    │   │   柴发系统  │   │   负荷侧    │
│ 500kW/2MWh   │   │  2×400kW   │   │   500kW    │
│   (并网逆变器)│   │  (备用)     │   │            │
└───────────────┘   └─────────────┘   └─────────────┘
```

#### 6.3.4 经济性结果

| 指标 | 数值 | 备注 |
|------|------|------|
| 总投资 | 1800万元 | |
| 其中：光伏 | 320万元 | |
| 其中：储能 | 520万元 | |
| 其中：柴发 | 180万元 | |
| 其中：其他 | 780万元 | |
| 年发电量 | 140万kWh | |
| 替代柴油量 | 约400吨/年 | |
| 年节省燃料 | 约280万元 | 柴油8元/L |
| IRR | 11.2% | 含环保效益 |
| 回收期 | 约7年 | |
| LCOE | 0.85元/kWh | |

---

## 附录A：设备技术参数参考表

### A.1 磷酸铁锂电池技术参数

| 参数 | 规格 | 备注 |
|------|------|------|
| 能量密度 | 120~160 Wh/kg | 方形/软包 |
| 循环寿命 | 6000~10000次 | 0.5C, 25℃, 80%DOD |
| 日历寿命 | 15~20年 | |
| 充放电效率 | 95~98% | 单体 |
| SOC范围 | 5%~95% | 推荐工作区间 |
| 工作温度 | -20℃~55℃ | |
| 安全性 | 不燃/热失控难触发 | |

### A.2 储能变流器（PCS）参数

| 参数 | 规格 | 备注 |
|------|------|------|
| 额定功率 | 500kW~2MW | 模块化可并联 |
| 直流电压范围 | 600~1500V | |
| 效率 | 98~99% | 最大效率点 |
| 并网标准 | GB/T 34120 | |
| 通讯接口 | CAN/Modbus/以太网 | |

### A.3 光伏组件参数参考

| 组件类型 | 单晶PERC | TOPCon | HJT |
|---------|---------|--------|-----|
| 效率 | 21~22% | 23~25% | 24~26% |
| 单瓦成本（元/W） | 1.0~1.2 | 1.2~1.5 | 1.5~2.0 |
| 温度系数 | -0.4%/℃ | -0.3%/℃ | -0.25%/℃ |
| 衰减率 | 首年2%，逐年0.55% | 首年1%，逐年0.4% | 首年0.5%，逐年0.2% |

---

## 附录B：计算参数默认值

| 参数类别 | 参数名 | 默认值 | 取值范围 |
|---------|--------|-------|---------|
| 储能 | 电池单位成本 | 1500元/kWh | 1200~2000 |
| 储能 | PCS单位成本 | 400元/kW | 300~600 |
| 储能 | 年运维成本 | 30元/kWh/年 | 20~50 |
| 储能 | 循环效率 | 0.85 | 0.80~0.90 |
| 储能 | SOC下限 | 10% | 5%~20% |
| 储能 | SOC上限 | 95% | 90%~100% |
| 光伏 | 单位成本 | 3500元/kWp | 3000~4500 |
| 光伏 | 性能比PR | 0.82 | 0.75~0.85 |
| 光伏 | 年运维成本 | 50元/kWp/年 | 30~80 |
| 光伏 | 组件衰减 | 0.55%/年 | 视技术路线 |
| 经济 | 折现率 | 6% | 5%~8% |
| 经济 | 项目生命周期 | 10年 | 10~25年 |
| 经济 | 贷款利率 | 4.5% | 4%~6% |
| 政策 | 配储比例要求 | 10%~20% | 视省份 |
| 政策 | 配储时长要求 | 2~4h | 视项目类型 |

---

**文档版本**：v1.0  
**编写日期**：2024年  
**适用范围**：储能微网项目投标/可研阶段容量选型  
**参考标准**：GB/T 34120、GB/T 36549、GB 51048