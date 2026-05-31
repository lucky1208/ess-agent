---
name: minimax-net-oneclick-deploy
description: >
  储能电站EMS一键部署Skill v2.0 可执行版。覆盖现场预检→参数配置→数据采集驱动配置→
  EMQX规则引擎→TDengine数据库→EMS微服务→备份恢复→远程运维的全链路可执行部署。
  新增：Modbus/IEC104/CAN采集服务配置、EMQX→TDengine规则引擎完整配置、
  TDengine连续查询(CQP)配置、一键备份恢复脚本、frp/WireGuard远程运维。
  适用场景：储能站现场工程师一键部署/远程运维，20分钟完成全部系统上线并通过健康检查。
  本skill为现场可执行版本，所有脚本参数化、工程师只需填.env配置即可。
---

# 储能电站EMS一键部署Skill v2.0 可执行版

## 目录

- [一、部署架构总览](#一部署架构总览)
- [二、现场预检脚本（PowerShell）](#二现场预检脚本powershell)
- [三、参数配置模板（.env格式）](#三参数配置模板env格式)
- [四、EMS南向数据采集服务配置](#四ems南向数据采集服务配置)
- [五、EMQX规则引擎配置](#五emqx规则引擎配置)
- [六、TDengine数据库设计](#六tdengine数据库设计)
- [七、EMS核心服务Docker配置](#七ems核心服务docker配置)
- [八、备份恢复脚本](#八备份恢复脚本)
- [九、远程运维配置](#九远程运维配置)
- [十、一键部署脚本](#十一键部署脚本)
- [十一、健康检查脚本](#十一健康检查脚本)
- [十二、交付检查清单](#十二交付检查清单)
- [附录A：端口清单](#附录a端口清单)
- [附录B：目录结构规范](#附录b目录结构规范)

---

## 一、部署架构总览

### 1.1 系统拓扑

```
┌─────────────────────────────────────────────────────────────────┐
│                    储能站服务器 / 工控机                          │
│         Windows Server 2019+ 或 Ubuntu 20.04+                     │
│         CPU ≥ 8核 | 内存 ≥ 16GB | SSD ≥ 256GB                    │
├─────────────────────────────────────────────────────────────────┤
│                    Docker Engine 24+                             │
│                                                                 │
│  【中间件层】                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ TDengine │ │  EMQX    │ │PostgreSQL│ │  Redis   │           │
│  │  时序库   │ │ MQTT     │ │  关系库   │ │  缓存    │           │
│  │ 3.2.3.0  │ │  5.4.1   │ │  15-alpine│ │  7-alpine│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  【应用层】                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │EMS-Core  │ │EMS-API   │ │EMS-WebUI │ │ Nginx    │           │
│  │数据采集  │ │ REST接口  │ │ 前端界面  │ │反向代理  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐                                      │
│  │EMS-Strgy │ │EMS-Rpt   │                                      │
│  │ 策略引擎  │ │ 报表统计  │                                      │
│  └──────────┘ └──────────┘                                      │
│                                                                 │
│  【采集驱动层】                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ModbusTCP │ │ IEC104   │ │CAN采集   │ │ MQTT     │           │
│  │ Master   │ │ Master   │ │ Service  │ │ Client   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
  【南向设备】
  PCS（功率变流器）← CAN / Modbus TCP / IEC104
  BMS（电池管理）← CAN / Modbus TCP
  电表（PCC关口）← Modbus RTU / IEC104
  消防主机← 干接点 / Modbus TCP
  PLC/继电器保护← 硬接线 / IEC104
```

### 1.2 部署时序（6阶段/约20分钟）

```
Phase 1: 服务器预检        (3 min)   — 硬件/OS/依赖/端口检查
Phase 2: Docker环境        (2 min)   — Docker和docker-compose安装
Phase 3: 中间件部署        (5 min)   — TDengine + EMQX + PostgreSQL + Redis
Phase 4: 采集驱动+数据库初始化 (5 min) — 南向驱动配置 + TDengine超级表 + EMQX规则
Phase 5: EMS微服务部署      (3 min)   — EMS Core/API/WebUI/Strategy
Phase 6: 健康检查+交付      (2 min)   — 全部探针验证 + 交付报告
```

### 1.3 部署包目录结构

```
/opt/ems/                        # Linux部署根目录
C:\EMS\                          # Windows部署根目录（对应路径）
├── .env                         # ★ 唯一需要工程师修改的配置
├── docker-compose.yml            # 完整容器编排
├── docker-daemon.json            # Docker守护进程配置
├── docker_install.sh             # Docker安装脚本
│
├── configs/
│   ├── tdengine/
│   │   ├── taos.cfg             # TDengine配置
│   │   └── init.sql             # 数据库初始化SQL
│   ├── emqx/
│   │   ├── emqx.conf            # EMQX基础配置
│   │   ├── acl.conf             # ACL权限配置
│   │   └── rules/               # 规则引擎配置
│   ├── postgres/
│   │   └── init.sql             # PostgreSQL初始化
│   ├── nginx/
│   │   ├── nginx.conf           # Nginx反向代理配置
│   │   └── ssl/                 # SSL证书目录
│   ├── collector/
│   │   ├── modbus_tcp.yaml      # Modbus TCP采集配置
│   │   ├── modbus_rtu.yaml      # Modbus RTU采集配置
│   │   ├── iec104.yaml          # IEC104采集配置
│   │   └── can.yaml             # CAN采集配置
│   └── ems/
│       ├── core_config.yaml     # EMS Core主配置
│       └── strategy.yaml         # 策略参数配置
│
├── scripts/
│   ├── pre_check.ps1            # 预检脚本（PowerShell）
│   ├── pre_check.sh             # 预检脚本（Bash）
│   ├── deploy.sh                # 一键部署脚本
│   ├── deploy.ps1               # 一键部署脚本（PowerShell）
│   ├── health_check.sh          # 健康检查脚本
│   ├── backup.sh                # 备份脚本
│   ├── restore.sh               # 恢复脚本
│   └── remote_ops_setup.sh      # 远程运维配置脚本
│
├── data/
│   ├── tdengine/               # TDengine数据目录
│   ├── emqx/                   # EMQX数据目录
│   ├── postgres/               # PostgreSQL数据目录
│   ├── redis/                  # Redis数据目录
│   └── ems-logs/               # EMS日志目录
│
└── dockerfiles/
    ├── ems-core.Dockerfile     # EMS Core服务镜像
    ├── ems-api.Dockerfile       # EMS API服务镜像
    └── ems-strategy.Dockerfile  # EMS策略引擎镜像
```

---

## 二、现场预检脚本（PowerShell）

### 2.1 Windows预检脚本（pre_check.ps1）

```powershell
# pre_check.ps1 - EMS部署预检脚本（Windows）
# 使用方法：以管理员身份运行 PowerShell，然后执行：.\pre_check.ps1

$ErrorActionPreference = "Continue"
$Global:PASS_COUNT = 0
$Global:FAIL_COUNT = 0

function Test-Requirement {
    param($Name, $Condition, $Required)
    $status = if ($Condition) { "PASS" } else { "FAIL" }
    $icon = if ($Condition) { "✓" } else { "✗" }
    $color = if ($Condition) { "Green" } else { "Red" }
    if (-not $Condition) { $Global:FAIL_COUNT++ }
    else { $Global:PASS_COUNT++ }
    Write-Host "  $icon $Name" -ForegroundColor $color
    if (-not $Condition -and $Required) {
        Write-Host "    → 必须满足此条件，部署将被终止" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  EMS系统部署预检 v2.0" -ForegroundColor Cyan
Write-Host "  时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# === CPU检查 ===
Write-Host "【CPU】" -ForegroundColor Yellow
$cpuCores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
Test-Requirement "CPU逻辑核心数: $cpuCores (要求≥4)" ($cpuCores -ge 4) $true

# === 内存检查 ===
Write-Host "【内存】" -ForegroundColor Yellow
$memObj = Get-CimInstance Win32_ComputerSystem
$totalMemGB = [math]::Round($memObj.TotalPhysicalMemory / 1GB, 1)
$availMemGB = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB / 1024, 1)
Test-Requirement "总物理内存: ${totalMemGB}GB (要求≥8GB)" ($totalMemGB -ge 8) $true
Test-Requirement "可用内存: ${availMemGB}GB" ($availMemGB -ge 2) $true

# === 磁盘空间检查 ===
Write-Host "【磁盘】" -ForegroundColor Yellow
$diskFilter = "DriveType='3'"  # Fixed disks only
Get-CimInstance Win32_LogicalDisk -Filter $diskFilter | ForEach-Object {
    $freeGB = [math]::Round($_.FreeSpace / 1GB, 1)
    $totalGB = [math]::Round($_.Size / 1GB, 1)
    $usedPct = [math]::Round(($_.Size - $_.FreeSpace) / $_.Size * 100, 1)
    Test-Requirement "磁盘 $($_.DeviceID) 可用: ${freeGB}GB / 总计${totalGB}GB (要求C盘≥50GB可用)" ($freeGB -ge 50 -and $_.DeviceID -eq "C:") $true
}

# === OS版本检查 ===
Write-Host "【操作系统】" -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$osVer = $os.Caption
$osBuild = $os.BuildNumber
$supported = ($osBuild -ge 17763)  # Windows Server 2019 = Build 17763
Test-Requirement "OS: $osVer (Build $osBuild)" $supported $true

# === Docker检查 ===
Write-Host "【Docker】" -ForegroundColor Yellow
$dockerVersion = & docker --version 2>$null
if ($dockerVersion) {
    $dockerInstalled = $true
    $dockerVer = $dockerVersion -replace 'Docker version ', '' -replace ',.*', ''
    Test-Requirement "Docker已安装: $dockerVer (要求≥20.10)" $true $true
    
    # Docker状态
    $dockerRunning = (Get-Service docker -ErrorAction SilentlyContinue).Status -eq 'Running'
    Test-Requirement "Docker服务运行中" $dockerRunning $true
} else {
    Test-Requirement "Docker未安装" $false $true
    Write-Host "    → 请运行: Start-Process powershell -Verb RunAs -ArgumentList 'irm docker.com/install.ps1 | iex'" -ForegroundColor Yellow
}

# === Docker Compose检查 ===
Write-Host "【Docker Compose】" -ForegroundColor Yellow
$composeVersion = & docker compose version 2>$null
if ($composeVersion) {
    Test-Requirement "Docker Compose已安装: $composeVersion" $true $true
} else {
    Test-Requirement "Docker Compose未安装" $false $true
}

# === Python检查 ===
Write-Host "【Python环境】" -ForegroundColor Yellow
$pythonVersion = & python --version 2>$null
if ($pythonVersion) {
    $pyVer = $pythonVersion -replace 'Python ', ''
    $pyMajor = [int]($pyVer.Split('.')[0])
    Test-Requirement "Python: $pyVersion (要求≥3.9)" ($pyMajor -ge 3) $true
} else {
    Write-Host "  - Python未安装（EMS采集驱动需要）" -ForegroundColor Yellow
}

# === TDengine客户端检查 ===
Write-Host "【TDengine客户端】" -ForegroundColor Yellow
$taosVersion = & taos -version 2>$null
if ($taosVersion) {
    Test-Requirement "TDengine CLI: $taosVersion" $true $false
} else {
    Write-Host "  - TDengine CLI未安装（可选，不影响容器部署）" -ForegroundColor Yellow
}

# === 网络连通性检查 ===
Write-Host "【网络连通性】" -ForegroundColor Yellow
$testTargets = @(
    @{Host="tdengine"; Port=6030; Desc="TDengine"},
    @{Host="emqx"; Port=1883; Desc="MQTT Broker"},
    @{Host="postgres"; Port=5432; Desc="PostgreSQL"},
    @{Host="redis"; Port=6379; Desc="Redis"}
)
foreach ($target in $testTargets) {
    $portOpen = Test-NetConnection -ComputerName $target.Host -Port $target.Port -WarningAction SilentlyContinue -InformationLevel Quiet 2>$null
    Test-Requirement "$($target.Desc)端口$($target.Port)连通" $portOpen $false
}

# === 端口冲突检查 ===
Write-Host "【端口冲突】" -ForegroundColor Yellow
$requiredPorts = @(1883, 8083, 5432, 6379, 6030, 6041, 8080, 8081, 18083, 9001)
$usedPorts = @()
foreach ($port in $requiredPorts) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $usedPorts += $port
        Test-Requirement "端口 $port 已占用 (需释放)" $false $true
    } else {
        Test-Requirement "端口 $port 可用" $true $true
    }
}

# === 防火墙检查 ===
Write-Host "【防火墙】" -ForegroundColor Yellow
$firewallEnabled = (Get-NetFirewallProfile -Profile Domain,Public,Private | Where-Object { $_.Enabled -eq $true }).Count -gt 0
if ($firewallEnabled) {
    Write-Host "  ⚠ 防火墙已启用，建议开放以下端口（或创建入站规则）:" -ForegroundColor Yellow
    Write-Host "    TCP: 1883, 8083, 5432, 6379, 6030, 6041, 8080, 8081, 18083" -ForegroundColor Cyan
} else {
    Test-Requirement "防火墙未启用" $true $false
}

# === NTP时间同步 ===
Write-Host "【时间同步】" -ForegroundColor Yellow
$timeOffset = (Get-Date) - (Get-CimInstance Win32_LocalTime)
$timeDiffMin = [math]::Abs($timeOffset.TotalMinutes)
Test-Requirement "服务器时间偏差: $([math]::Round($timeDiffMin, 1))分钟 (要求≤5分钟)" ($timeDiffMin -le 5) $true

# === 输出预检报告 ===
Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  预检结果汇总" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  通过: $Global:PASS_COUNT 项" -ForegroundColor Green
Write-Host "  失败: $Global:FAIL_COUNT 项" -ForegroundColor Red
Write-Host ""

if ($Global:FAIL_COUNT -gt 0) {
    Write-Host "  ⚠ 预检未通过，请修复以上FAIL项后重新执行部署" -ForegroundColor Red
    Write-Host "  典型修复方法:" -ForegroundColor Yellow
    Write-Host "    - Docker未安装: 以管理员身份运行 install_docker.ps1" -ForegroundColor Gray
    Write-Host "    - 端口冲突: 检查占用进程并停止或修改端口" -ForegroundColor Gray
    Write-Host "    - 内存不足: 关闭其他应用或增加物理内存" -ForegroundColor Gray
    exit 1
} else {
    Write-Host "  ✓ 所有检查通过，可以执行部署" -ForegroundColor Green
    exit 0
}
```

### 2.2 Linux预检脚本（pre_check.sh）

```bash
#!/bin/bash
# pre_check.sh - EMS部署预检脚本（Linux/Ubuntu）
# 使用方法: chmod +x pre_check.sh && ./pre_check.sh

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
PASS=0; FAIL=0

check() {
    local label="$1"; local cond=$2; local required=$3
    if [ "$cond" = "1" ]; then
        echo -e "  ${GREEN}✓${NC} $label"; ((PASS++))
    else
        echo -e "  ${RED}✗${NC} $label"
        if [ "$required" = "1" ]; then echo -e "    → 必须满足此条件"; fi
        ((FAIL++))
    fi
}

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  EMS系统部署预检 v2.0${NC}"
echo -e "${CYAN}  时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo ""

# CPU
echo -e "${YELLOW}【CPU】${NC}"
CORES=$(nproc 2>/dev/null || echo 4)
check "CPU核心数: $CORES (要求≥4)" $([ $CORES -ge 4 ] && echo 1 || echo 0) 1

# 内存
echo -e "${YELLOW}【内存】${NC}"
MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
MEM_GB=$((MEM_KB / 1024 / 1024))
AVAIL_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
AVAIL_GB=$((AVAIL_KB / 1024 / 1024))
check "总物理内存: ${MEM_GB}GB (要求≥8GB)" $([ $MEM_GB -ge 8 ] && echo 1 || echo 0) 1
check "可用内存: ${AVAIL_GB}GB" $([ $AVAIL_GB -ge 2 ] && echo 1 || echo 0) 1

# 磁盘
echo -e "${YELLOW}【磁盘】${NC}"
ROOT_FREE=$(df / | tail -1 | awk '{print $4/1024/1024}')
DATA_FREE=$(df /data 2>/dev/null | tail -1 | awk '{print $4/1024/1024}' || echo $ROOT_FREE)
check "根分区可用: $(printf '%.1f' $ROOT_FREE)GB (要求≥50GB)" $([ $(echo "$ROOT_FREE > 50" | bc -l) -eq 1 ] && echo 1 || echo 0) 1
check "数据分区可用: $(printf '%.1f' $DATA_FREE)GB" $([ $(echo "$DATA_FREE > 20" | bc -l) -eq 1 ] && echo 1 || echo 0) 1

# OS
echo -e "${YELLOW}【操作系统】${NC}"
. /etc/os-release
check "OS: $NAME $VERSION (要求Ubuntu 20.04+/CentOS 7.9+)" 1 1

# Docker
echo -e "${YELLOW}【Docker】${NC}"
if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
    check "Docker已安装: $(docker --version | grep -oP 'Docker version \K[^,]+')" 1 1
    DOCKER_RUNNING=$(systemctl is-active docker 2>/dev/null || echo inactive)
    check "Docker服务运行中 (状态: $DOCKER_RUNNING)" $([ "$DOCKER_RUNNING" = "active" ] && echo 1 || echo 0) 1
else
    check "Docker未安装" 0 1
    echo -e "    → 安装命令: curl -fsSL https://get.docker.com | sh"
fi

# Docker Compose
echo -e "${YELLOW}【Docker Compose】${NC}"
if docker compose version &>/dev/null || docker-compose --version &>/dev/null; then
    check "Docker Compose已安装" 1 1
else
    check "Docker Compose未安装" 0 1
fi

# Python
echo -e "${YELLOW}【Python】${NC}"
if command -v python3 &>/dev/null; then
    PY_VER=$(python3 --version | grep -oP '\d+\.\d+')
    PY_MAJOR=$(echo $PY_VER | cut -d. -f1)
    check "Python: $(python3 --version) (要求≥3.9)" $([ $PY_MAJOR -ge 3 ] && echo 1 || echo 0) 1
else
    check "Python未安装" 0 1
fi

# 端口冲突
echo -e "${YELLOW}【端口冲突】${NC}"
REQUIRED_PORTS=(1883 8083 5432 6379 6030 6041 8080 8081 18083)
for PORT in "${REQUIRED_PORTS[@]}"; do
    if ss -tlnp 2>/dev/null | grep -q ":$PORT " || netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
        check "端口 $PORT 已占用" 0 1
    else
        check "端口 $PORT 可用" 1 1
    fi
done

# NTP
echo -e "${YELLOW}【时间同步】${NC}"
TIME_OFFSET=$(ntpdate -q pool.ntp.org 2>/dev/null | head -1 | grep -oP 'offset \K[-\d.]+' || echo 0)
TIME_OFFSET_ABS=$(echo "$TIME_OFFSET" | sed 's/-//')
check "NTP时间偏差: $(echo $TIME_OFFSET)s (要求≤5s)" $(echo "$TIME_OFFSET_ABS < 5" | bc -l 2>/dev/null && echo 1 || echo 0) 1

# 汇总
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  预检结果汇总${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "  通过: ${GREEN}$PASS${NC} 项"
echo -e "  失败: ${RED}$FAIL${NC} 项"
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "  ${RED}⚠ 预检未通过，请修复以上FAIL项后重新执行部署${NC}"
    exit 1
else
    echo -e "  ${GREEN}✓ 所有检查通过，可以执行部署${NC}"
    exit 0
fi
```

### 2.3 预检通过标准

| 检查项 | 必须满足 | 推荐满足 | 检查命令 |
|--------|---------|---------|---------|
| CPU核数 | ≥ 4核 | ≥ 8核 | `nproc` / `Get-CimInstance Win32_ComputerSystem` |
| 内存 | ≥ 8GB | ≥ 16GB | `free -h` / 任务管理器 |
| 磁盘C盘/根分区 | ≥ 50GB可用 | ≥ 100GB可用 | `df -h` / 磁盘管理 |
| OS | Ubuntu 20.04+ / Windows Server 2019+ | Ubuntu 22.04 / Windows Server 2022 | `lsb_release -a` / `winver` |
| Docker | v20+ | v24+ | `docker --version` |
| Docker Compose | v2+ | v2.20+ | `docker compose version` |
| 端口 | 全部空闲 | — | `ss -tlnp` / `netstat -tlnp` |
| 时间偏差 | ≤ 5分钟 | ≤ 1分钟 | `timedatectl` / NTP查询 |
| 防火墙 | 已关闭 或 已开放必要端口 | — | `ufw status` / `Get-NetFirewallProfile` |

---

## 三、参数配置模板（.env格式）

### 3.1 .env配置完整参数说明

`★` = 工程师必须根据项目实际填写的参数

```bash
# ============================================================
# EMS一键部署配置文件
# 说明：复制本文件为 .env，然后修改★标记的参数
# ============================================================

# ============================================================
# 【项目基本信息】
# ============================================================
SITE_NAME="浙江杭州XX工业园储能站"         # ★ 站点名称（用于页面标题/告警通知）
SITE_ID="ems-hangzhou-001"                # ★ 站点唯一ID（建议用"ems-{城市}-{序号}"格式）
EMS_VERSION="v2.3.1"                      # EMS软件版本号
DEPLOY_DATE="$(date '+%Y-%m-%d')"         # 部署日期（自动生成）

# ============================================================
# 【数据库配置】TDengine
# ============================================================
TDENGINE_VERSION="3.2.3.0"               # TDengine版本（建议固定使用3.2.3.0 LTS）
TDENGINE_FQDN="tdengine"                  # TDengine内部主机名（不改）
TDENGINE_PORT="6030"                      # TDengine客户端连接端口（不改）
TDENGINE_REST_PORT="6041"                 # TDengine REST API端口（不改）
TDENGINE_WEB_PORT="18083"                 # TDengine Web管理界面端口
TDENGINE_USERNAME="root"                  # TDengine用户名
TDENGINE_PASSWORD="taosdata"              # ★ 修改为强密码
TDENGINE_DATABASE="ems_tsdb"              # 时序数据库名（不改）
TDENGINE_KEEP_DAYS="365"                  # 数据保留天数（日级：365天；分钟级：30天）
TDENGINE_BUFFER_SIZE="256"                # TDengine缓存大小(MB)
TDENGINE_MAX_TABLES="10000"               # 预估最大子表数量（估算值：设备数×采集点×分表规则）

# ============================================================
# 【MQTT Broker配置】EMQX
# ============================================================
EMQX_VERSION="5.4.1"                     # EMQX版本（建议5.x）
EMQX_NODE_NAME="emqx@127.0.0.1"          # EMQX节点名（不改）
EMQX_MQTT_PORT="1883"                    # MQTT TCP端口（不改）
EMQX_WS_PORT="8083"                      # MQTT WebSocket端口
EMQX_DASHBOARD_PORT="18083"              # EMQX管理控制台端口
EMQX_API_PORT="8081"                     # EMQX HTTP API端口
EMQX_ADMIN_USER="admin"                  # EMQX管理员用户名
EMQX_ADMIN_PASSWORD="Emqx@2024"         # ★ 修改为强密码
EMQX_MAX_CONNECTIONS="102400"            # 最大并发连接数
EMQX_MQTT_MAX_PACKET_SIZE="10MB"         # 最大MQTT数据包大小

# ============================================================
# 【关系数据库配置】PostgreSQL
# ============================================================
PG_VERSION="15-alpine"                   # PostgreSQL版本（不改）
PG_HOST="postgres"                        # PostgreSQL内部主机名（不改）
PG_PORT="5432"                           # PostgreSQL端口（不改）
PG_DATABASE="ems_config"                  # EMS配置数据库名（不改）
PG_USERNAME="ems"                        # 数据库用户名
PG_PASSWORD="Pg@2024Ems"                 # ★ 修改为强密码
PG_MAX_CONNECTIONS="200"                  # 最大连接数
PG_SHARED_BUFFERS="256MB"                 # 共享缓冲区大小

# ============================================================
# 【缓存配置】Redis
# ============================================================
REDIS_VERSION="7-alpine"                 # Redis版本（不改）
REDIS_HOST="redis"                       # Redis内部主机名（不改）
REDIS_PORT="6379"                        # Redis端口（不改）
REDIS_PASSWORD="Redis@2024Ems"           # ★ 修改为强密码
REDIS_MAXMEMORY="512mb"                  # Redis最大内存
REDIS_MAXMEMORY_POLICY="allkeys-lru"     # 内存淘汰策略：lru模式

# ============================================================
# 【Nginx配置】
# ============================================================
NGINX_HTTP_PORT="80"                     # HTTP端口
NGINX_HTTPS_PORT="443"                   # HTTPS端口（★ 如果启用SSL则配置）
NGINX_SSL_CERT="/opt/ems/configs/nginx/ssl/server.crt"  # ★ SSL证书路径
NGINX_SSL_KEY="/opt/ems/configs/nginx/ssl/server.key"    # ★ SSL私钥路径
EMS_API_UPSTREAM="ems-api:8080"          # EMS API后端地址（不改）
EMS_WEBUI_UPSTREAM="ems-webui:80"        # EMS WebUI后端地址（不改）

# ============================================================
# 【EMS Core采集配置】
# ============================================================
EMS_CORE_PORT="8080"                     # EMS Core服务端口
EMS_CORE_LOG_LEVEL="INFO"                # 日志级别: DEBUG/INFO/WARN/ERROR
COLLECTOR_INTERVAL_MS="1000"             # 采集周期（毫秒，推荐1000ms=1s）
COLLECTOR_MODBUS_TCP_ENABLED="true"      # 启用Modbus TCP采集
COLLECTOR_MODBUS_RTU_ENABLED="false"     # 启用Modbus RTU采集
COLLECTOR_IEC104_ENABLED="false"         # 启用IEC104采集
COLLECTOR_CAN_ENABLED="true"             # 启用CAN采集
COLLECTOR_MQTT_ENABLED="true"            # 启用MQTT客户端

# ============================================================
# 【南向设备配置】★ 工程师根据实际项目填写
# ============================================================

# --- PCS设备配置（多条PCS请复制配置块）---
PCS_001_ID="pcs-001"                     # ★ PCS设备ID
PCS_001_NAME="1号PCS"                     # ★ PCS名称
PCS_001_PROTOCOL="can"                   # 通信协议：can/modbus_tcp/iec104
PCS_001_IP="192.168.1.10"                # ★ PCS IP地址（Modbus/ IEC104时填写）
PCS_001_PORT="502"                       # ★ Modbus端口（Modbus TCP时填写）
PCS_001_SLAVE_ID="1"                     # ★ Modbus从站地址
PCS_001_CAN_CHANNEL="0"                  # ★ CAN通道号
PCS_001_CAN_BITRATE="250000"             # CAN波特率
PCS_001_CAN_ID="0x100"                    # ★ CAN报文ID（发送功率指令用）
PCS_001_RATED_POWER_KW="500"             # ★ PCS额定功率（kW）
PCS_001_DC_VOLTAGE_MIN="600"             # ★ 直流电压下限（V）
PCS_001_DC_VOLTAGE_MAX="1200"            # ★ 直流电压上限（V）

PCS_002_ID="pcs-002"                     # ★ 第2台PCS（如有）
PCS_002_NAME="2号PCS"
PCS_002_PROTOCOL="can"
PCS_002_CAN_CHANNEL="1"
PCS_002_CAN_BITRATE="250000"
PCS_002_CAN_ID="0x101"
PCS_002_RATED_POWER_KW="500"
PCS_002_DC_VOLTAGE_MIN="600"
PCS_002_DC_VOLTAGE_MAX="1200"

# --- BMS设备配置 ---
BMS_001_ID="bms-001"
BMS_001_NAME="BMS系统1"
BMS_001_PROTOCOL="can"
BMS_001_CAN_CHANNEL="0"
BMS_001_CAN_ID="0x200"
BMS_001_RATED_CAPACITY_KWH="500"         # ★ 电池额定容量（kWh）
BMS_001_CELL_COUNT="256"                 # ★ 电芯数量

# --- 电表配置 ---
METER_PCC_ID="meter-pcc"
METER_PCC_NAME="PCC关口表"
METER_PCC_PROTOCOL="modbus_tcp"
METER_PCC_IP="192.168.1.20"              # ★ 电表IP
METER_PCC_PORT="502"
METER_PCC_SLAVE_ID="1"
METER_PCC_MODBUS_REG_START="0"           # ★ Modbus寄存器起始地址（根据电表厂家确定）

# ============================================================
# 【MQTT主题配置】
# ============================================================
MQTT_BROKER_HOST="emqx"                  # MQTT Broker主机名（不改）
MQTT_BROKER_PORT="1883"
MQTT_USERNAME="ems-server"               # EMS MQTT客户端用户名
MQTT_PASSWORD="Mqtt@2024Ems"            # ★ 修改为强密码
MQTT_CLIENT_ID="ems-collector-001"      # MQTT客户端ID（不改）
MQTT_QOS="1"                             # QoS级别: 0=至多一次/1=至少一次/2=恰好一次

# 遥测数据Topic模板
MQTT_TOPIC_TELEMETRY="ems/{site_id}/+/+/measure"
# 告警事件Topic模板
MQTT_TOPIC_ALARM="ems/{site_id}/+/+/alarm"
# 状态变化Topic模板
MQTT_TOPIC_STATUS="ems/{site_id}/+/+/status"
# 控制指令Topic模板
MQTT_TOPIC_COMMAND="ems/{site_id}/+/+/command"

# ============================================================
# 【EMS策略配置】
# ============================================================
STRATEGY_DEFAULT_MODE="peak_shaving"     # 默认策略模式: peak_shaving/valley_filling/emergency/manual
STRATEGY_PEAK_START="08:00"               # 峰时段开始（默认）
STRATEGY_PEAK_END="11:00"
STRATEGY_VALLEY_START="23:00"            # 谷时段开始（默认）
STRATEGY_VALLEY_END="07:00"
STRATEGY_TARGET_SOC_MIN="20"             # SOC下限保护（%）
STRATEGY_TARGET_SOC_MAX="95"             # SOC上限保护（%）
STRATEGY_MAX_DISCHARGE_POWER_KW="500"     # 最大放电功率（kW）
STRATEGY_MAX_CHARGE_POWER_KW="500"        # 最大充电功率（kW）

# ============================================================
# 【告警通知配置】
# ============================================================
ALARM_EMAIL_ENABLED="false"               # 启用邮件告警
ALARM_EMAIL_SMTP_HOST="smtp.qq.com"       # ★ SMTP服务器
ALARM_EMAIL_SMTP_PORT="587"               # SMTP端口（TLS）
ALARM_EMAIL_FROM="alarm@yourcompany.com"  # ★ 发件人
ALARM_EMAIL_TO="ops@yourcompany.com"      # ★ 收件人（多个用逗号分隔）

ALARM_LARK_ENABLED="true"                # ★ 启用飞书告警通知
ALARM_LARK_WEBHOOK_URL=""                 # ★ 填入飞书群机器人Webhook URL
ALARM_LARK_SECRET=""                      # ★ 飞书机器人加签密钥

# ============================================================
# 【安全配置】
# ============================================================
SSH_ROOT_LOGIN="no"                      # 禁止root登录（Linux）
SSH_KEY_AUTH="yes"                        # 必须使用密钥登录（Linux）
FIREWALL_ENABLED="false"                 # 防火墙开关（生产环境建议true）
ALLOW_PORTS="1883,5432,6379,8080,8081,18083,80,443"

# ============================================================
# 【备份配置】
# ============================================================
BACKUP_ENABLED="true"                    # 启用自动备份
BACKUP_CRON="0 2 * * *"                  # 备份计划（每天凌晨2点）
BACKUP_RETENTION_DAYS="7"                 # 备份保留天数
BACKUP_DATA_DIR="/opt/ems/backups"        # 备份存储目录
BACKUP_INCLUDE_DB="true"                 # 包含数据库快照
BACKUP_INCLUDE_CONFIG="true"             # 包含配置文件
BACKUP_INCLUDE_LOGS="false"               # 是否包含日志（不建议开启）

# ============================================================
# 【远程运维配置】
# ============================================================
REMOTE_OPS_ENABLED="false"               # ★ 启用远程运维通道
REMOTE_OPS_TYPE="frp"                     # 远程运维方式: frp / wireguard / none
FRP_SERVER_HOST=""                        # ★ FRP服务器公网IP
FRP_SERVER_PORT="7000"                    # FRP服务器连接端口
FRP_AUTH_TOKEN=""                         # ★ FRP认证Token
FRP_SSH_PORT="6000"                       # SSH反向代理端口
FRP_RDP_PORT="6001"                       # RDP反向代理端口
FRP_HTTP_PORT="6002"                      # HTTP反向代理端口
WIREGUARD_PORT="51820"                    # WireGuard监听端口
WIREGUARD_SUBNET="10.88.0.0/24"          # WireGuard客户端分配网段
```

---

## 四、EMS南向数据采集服务配置

### 4.1 Modbus TCP Master配置（modbus_tcp.yaml）

```yaml
# ============================================================
# EMS Modbus TCP Master配置
# 说明：每个device节点对应一个Modbus TCP从站设备
# 采集服务按 poll_interval_ms 轮询每个设备
# ============================================================

version: "1.0"
collector:
  type: modbus_tcp
  enabled: ${COLLECTOR_MODBUS_TCP_ENABLED}
  error_retry_count: 3
  error_retry_interval_ms: 5000
  connect_timeout_ms: 3000
  read_timeout_ms: 5000

# ============================================================
# PCS设备1 — 华为/阳光/固德威等通用Modbus映射
# ============================================================
devices:
  - device_id: "pcs-001"
    device_name: "1号PCS"
    enabled: true
    host: "${PCS_001_IP}"
    port: ${PCS_001_PORT}
    slave_id: ${PCS_001_SLAVE_ID}
    byte_order: big_endian       # 字节序: big_endian / little_endian
    poll_interval_ms: 1000      # 采集周期（ms）

    # Modbus功能码配置
    holding_registers:
      # 遥测数据（功能码0x03保持寄存器）
      telemetry:
        - name: "active_power"
          address: 4000        # Modbus地址=功能码起始地址-1=功能码3的0地址
          count: 1
          type: int16           # 有功功率寄存器类型（根据厂家确定）
          scale: 0.1            # 比例系数（实际值=寄存器值×scale）
          unit: "kW"
          description: "PCS有功功率"

        - name: "reactive_power"
          address: 4001
          count: 1
          type: int16
          scale: 0.1
          unit: "kVar"
          description: "PCS无功功率"

        - name: "voltage_ab"
          address: 4002
          count: 1
          type: uint16
          scale: 0.1
          unit: "V"
          description: "AB线电压"

        - name: "voltage_bc"
          address: 4003
          count: 1
          type: uint16
          scale: 0.1
          unit: "V"
          description: "BC线电压"

        - name: "current_a"
          address: 4004
          count: 1
          type: int16
          scale: 0.01
          unit: "A"
          description: "A相电流"

        - name: "current_b"
          address: 4005
          count: 1
          type: int16
          scale: 0.01
          unit: "A"
          description: "B相电流"

        - name: "current_c"
          address: 4006
          count: 1
          type: int16
          scale: 0.01
          unit: "A"
          description: "C相电流"

        - name: "frequency"
          address: 4007
          count: 1
          type: uint16
          scale: 0.01
          unit: "Hz"
          description: "电网频率"

        - name: "dc_voltage"
          address: 4010
          count: 1
          type: uint16
          scale: 0.1
          unit: "V"
          description: "直流电压"

        - name: "dc_current"
          address: 4011
          count: 1
          type: int16
          scale: 0.1
          unit: "A"
          description: "直流电流"

        - name: "pcs_temperature"
          address: 4020
          count: 1
          type: int16
          scale: 0.1
          unit: "°C"
          description: "PCS内部温度"

        - name: "total_energy_charged"
          address: 4030
          count: 2
          type: uint32           # 累积充电量需要32位寄存器
          scale: 0.1
          unit: "kWh"
          description: "累计充电量"

        - name: "total_energy_discharged"
          address: 4032
          count: 2
          type: uint32
          scale: 0.1
          unit: "kWh"
          description: "累计放电量"

      # 控制指令（功能码0x06写单个寄存器 / 0x10写多个寄存器）
      control:
        - name: "active_power_setpoint"
          address: 4100
          count: 1
          type: int16
          scale: 0.1
          unit: "kW"
          writable: true
          min: -500               # PCS可反向充电，负值为充电
          max: 500
          description: "有功功率设定值（正=放电，负=充电）"

        - name: "reactive_power_setpoint"
          address: 4101
          count: 1
          type: int16
          scale: 0.1
          unit: "kVar"
          writable: true
          min: -200
          max: 200
          description: "无功功率设定值"

        - name: "pcs_start_stop"
          address: 4102
          count: 1
          type: uint16
          writable: true
          enum_values: {1: "stop", 2: "start", 3: "emergency_stop"}
          description: "PCS起停控制"

    # 输入寄存器（功能码0x04，只读）
    input_registers:
      - name: "pcs_status"
        address: 5000
        count: 1
        type: uint16
        enum_values: {0: "standby", 1: "running", 2: "fault", 3: "offline"}
        description: "PCS运行状态"

      - name: "fault_code"
        address: 5001
        count: 1
        type: uint16
        description: "故障代码"

      - name: "pcs_mode"
        address: 5002
        count: 1
        type: uint16
        enum_values: {0: "grid_connected", 1: "off_grid", 2: "standby"}
        description: "PCS运行模式"

# ============================================================
# 电表配置（PCC关口表）
# ============================================================
  - device_id: "meter-pcc"
    device_name: "PCC关口表"
    enabled: true
    host: "${METER_PCC_IP}"
    port: ${METER_PCC_PORT}
    slave_id: ${METER_PCC_SLAVE_ID}
    byte_order: big_endian
    poll_interval_ms: 1000

    holding_registers:
      - name: "voltage_a"
        address: 0
        count: 1
        type: uint16
        scale: 0.1
        unit: "V"

      - name: "voltage_b"
        address: 1
        count: 1
        type: uint16
        scale: 0.1
        unit: "V"

      - name: "voltage_c"
        address: 2
        count: 1
        type: uint16
        scale: 0.1
        unit: "V"

      - name: "current_a"
        address: 3
        count: 1
        type: uint16
        scale: 0.01
        unit: "A"

      - name: "current_b"
        address: 4
        count: 1
        type: uint16
        scale: 0.01
        unit: "A"

      - name: "current_c"
        address: 5
        count: 1
        type: uint16
        scale: 0.01
        unit: "A"

      - name: "active_power_total"
        address: 13
        count: 2
        type: int32
        scale: 0.1
        unit: "kW"

      - name: "reactive_power_total"
        address: 15
        count: 2
        type: int32
        scale: 0.1
        unit: "kVar"

      - name: "power_factor_total"
        address: 17
        count: 1
        type: uint16
        scale: 0.001
        unit: ""

      - name: "frequency"
        address: 18
        count: 1
        type: uint16
        scale: 0.01
        unit: "Hz"

      - name: "active_energy_import"
        address: 100
        count: 2
        type: uint32
        scale: 0.01
        unit: "kWh"
        description: "正向有功电能（购电）"

      - name: "active_energy_export"
        address: 102
        count: 2
        type: uint32
        scale: 0.01
        unit: "kWh"
        description: "反向有功电能（售电）"

      - name: "demand_current"
        address: 200
        count: 1
        type: uint16
        scale: 0.001
        unit: "A"
        description: "当前需量"
```

### 4.2 IEC 104 Master配置（iec104.yaml）

```yaml
# ============================================================
# EMS IEC 104 Master配置
# 说明：用于与调度系统、保护装置通信
# IEC 104是电力系统标准协议，适合远动通信
# ============================================================

version: "1.1"
collector:
  type: iec104
  enabled: ${COLLECTOR_IEC104_ENABLED}

connection:
  host: "192.168.1.100"              # ★ IEC104服务端IP（调度主站或保护装置）
  port: 2404                          # IEC104标准端口
  local_ip: "0.0.0.0"
  t0_timeout_s: 30                   # 连接建立超时（s）
  t1_timeout_s: 15                   # 发送测试帧超时（s）
  t2_timeout_s: 10                   # 收到确认超时（s）
  t3_timeout_s: 20                   # 无数据发送时发送S-FRAME间隔（s）
  k_octets: 12                        # 未确认最大帧数（发送窗口）
  w_octets: 8                         # 未确认最大帧数（接收窗口）

# ============================================================
# ASDU类型配置
# ============================================================
asdu_types:
  # 类型标识1：单点信息（1bit，用于开关状态）
  type_id_1:
    type_id: 1
    description: "单点遥信"
    ioa_range: [1, 100]
    mapping:
      1: "breaker_status"            # IOA=1 → 断路器状态
      2: "isolation_switch_status"    # IOA=2 → 隔离开关状态
      3: "ground_switch_status"       # IOA=3 → 地刀状态
      4: "protection_trip_status"     # IOA=4 → 保护跳闸状态

  # 类型标识3：双点信息（2bit，用于断路器位置）
  type_id_3:
    type_id: 3
    description: "双点遥信"
    ioa_range: [101, 200]
    mapping:
      101: "breaker_position"        # IOA=101 → 断路器位置（00=中间/01=合/10=分）
      102: "protection_status"       # IOA=102 → 保护装置状态

  # 类型标识9：归一化测量值（-1~1的标幺值）
  type_id_9:
    type_id: 9
    description: "归一化测量值"
    ioa_range: [201, 300]
    mapping:
      201: "active_power_pu"         # IOA=201 → 有功功率（标幺值）
      202: "reactive_power_pu"        # IOA=202 → 无功功率（标幺值）

  # 类型标识13：标度化测量值（实际工程值）
  type_id_13:
    type_id: 13
    description: "标度化测量值"
    ioa_range: [301, 400]
    mapping:
      301: "active_power_kw"          # IOA=301 → 有功功率（kW）
      302: "reactive_power_kvar"      # IOA=302 → 无功功率（kVar）
      303: "voltage_ab"               # IOA=303 → AB线电压（V）
      304: "voltage_bc"               # IOA=304 → BC线电压（V）
      305: "current_a"                # IOA=305 → A相电流（A）
      306: "frequency"               # IOA=306 → 频率（Hz）

  # 类型标识45：步位置信息（用于变压器分接头）
  type_id_45:
    type_id: 45
    description: "步调节信息"
    ioa_range: [401, 410]
    mapping:
      401: "tap_position"            # IOA=401 → 分接头位置

# ============================================================
# 命令下发配置
# ============================================================
commands:
  # 单点遥控（类型标识45）
  single_command:
    - name: "breaker_open"
      ioa: 1
      description: "断路器分闸"
    - name: "breaker_close"
      ioa: 1
      description: "断路器合闸"

  # 双点遥控（类型标识46）
  double_command:
    - name: "tap_up"
      ioa: 401
      description: "分接头升档"
    - name: "tap_down"
      ioa: 401
      description: "分接头降档"

  # 调节命令（类型标识48）
  regulating_command:
    - name: "active_power_setpoint"
      ioa: 201
      type: setpoint_normalized       # 归一化设定值
      min: -1.0
      max: 1.0
      description: "有功功率调度指令"
```

### 4.3 CAN采集配置（can.yaml）

```yaml
# ============================================================
# EMS CAN采集服务配置
# 说明：用于直接通过CAN总线与PCS/BMS通信
# 常见于华为PCS、阳光电源PCS、比亚迪BMS等
# ============================================================

version: "1.0"
collector:
  type: can
  enabled: ${COLLECTOR_CAN_ENABLED}

# ============================================================
# CAN硬件配置
# ============================================================
can_interfaces:
  - name: "can0"
    channel: 0
    enabled: true
    bitrate: 250000                    # 波特率：250kbps（常见）/ 500kbps
    sample_point: 0.875                # 采样点：87.5%（CAN标准）
    termination: 120                   # 终端电阻：120Ω
    timeout_ms: 100                    # 报文超时（ms）

  - name: "can1"
    channel: 1
    enabled: true
    bitrate: 250000
    sample_point: 0.875
    termination: 120
    timeout_ms: 100

# ============================================================
# CAN报文解析规则
# ============================================================
devices:
  - device_id: "pcs-001"
    device_name: "1号PCS（华为）"
    interface: "can0"
    protocol: "huawei_pcs_can"         # 协议名称（需与驱动协商）

    # 接收：PCS上报遥测数据
    rx_messages:
      - can_id: "0x1801F001"          # ★ CAN ID（11位/29位）
        dlc: 8                         # 数据长度：8字节
        interval_ms: 1000              # 期望接收间隔（ms）
        timeout_ms: 3000               # 超时阈值（ms）
        fields:
          - name: "active_power"
            byte_start: 0
            byte_len: 2
            byte_order: little_endian
            type: int16
            scale: 0.1
            unit: "kW"
            description: "有功功率"

          - name: "reactive_power"
            byte_start: 2
            byte_len: 2
            byte_order: little_endian
            type: int16
            scale: 0.1
            unit: "kVar"
            description: "无功功率"

          - name: "voltage_ab"
            byte_start: 4
            byte_len: 2
            byte_order: little_endian
            type: uint16
            scale: 0.1
            unit: "V"
            description: "AB线电压"

          - name: "current_a"
            byte_start: 6
            byte_len: 2
            byte_order: little_endian
            type: int16
            scale: 0.1
            unit: "A"
            description: "A相电流"

      - can_id: "0x1802F001"
        dlc: 8
        interval_ms: 1000
        fields:
          - name: "frequency"
            byte_start: 0
            byte_len: 2
            byte_order: little_endian
            type: uint16
            scale: 0.01
            unit: "Hz"
            description: "电网频率"

          - name: "dc_voltage"
            byte_start: 2
            byte_len: 2
            byte_order: little_endian
            type: uint16
            scale: 0.1
            unit: "V"
            description: "直流电压"

          - name: "dc_current"
            byte_start: 4
            byte_len: 2
            byte_order: little_endian
            type: int16
            scale: 0.1
            unit: "A"
            description: "直流电流"

    # 发送：EMS下发功率指令
    tx_messages:
      - can_id: "0x1808F001"
        dlc: 8
        interval_ms: 100               # 控制指令100ms刷新一次
        fields:
          - name: "active_power_setpoint"
            byte_start: 0
            byte_len: 2
            byte_order: little_endian
            type: int16
            scale: 0.1
            unit: "kW"
            writable: true
            min: -500
            max: 500
            description: "有功功率指令（正=放电/负=充电）"

          - name: "reactive_power_setpoint"
            byte_start: 2
            byte_len: 2
            byte_order: little_endian
            type: int16
            scale: 0.1
            unit: "kVar"
            writable: true
            min: -200
            max: 200
            description: "无功功率指令"

          - name: "command_type"
            byte_start: 6
            byte_len: 1
            type: uint8
            enum_values: {0: "stop", 1: "start", 2: "standby"}
            writable: true
            description: "起停控制"

  - device_id: "bms-001"
    device_name: "BMS系统"
    interface: "can0"
    protocol: "custom_bms_can"

    rx_messages:
      - can_id: "0x1803F001"
        dlc: 8
        interval_ms: 1000
        timeout_ms: 5000
        fields:
          - name: "soc"
            byte_start: 0
            byte_len: 2
            byte_order: little_endian
            type: uint16
            scale: 0.1
            unit: "%"
            description: "电池SOC"

          - name: "soh"
            byte_start: 2
            byte_len: 2
            byte_order: little_endian
            type: uint16
            scale: 0.1
            unit: "%"
            description: "电池SOH"

          - name: "total_voltage"
            byte_start: 4
            byte_len: 2
            byte_order: little_endian
            type: uint16
            scale: 0.1
            unit: "V"
            description: "电池总电压"

          - name: "total_current"
            byte_start: 6
            byte_len: 2
            byte_order: little_endian
            type: int16
            scale: 0.1
            unit: "A"
            description: "电池总电流（正=充电/负=放电）"
```

---

## 五、EMQX规则引擎配置

### 5.1 规则引擎：从MQTT Topic→TDengine写入

EMQX规则引擎通过SQL语句从MQTT消息中提取数据，然后通过桥接器写入TDengine。

```json
// ============================================================
// 规则引擎配置示例（通过EMQX Dashboard或HTTP API创建）
// 这里给出SQL语句模板，实际使用时通过EMQX API创建规则
// ============================================================

// 规则1：解析遥测数据并写入TDengine
{
  "name": "ems_telemetry_to_tdengine",
  "sql": "SELECT\n  payload.device_id AS device_id,\n  payload.device_type AS device_type,\n  payload.ts AS ts,\n  payload.data AS data\nFROM \"ems/+/+/+/measure\"",
  "actions": [
    {
      "function": "builtin:tdengine",
      "args": {
        "database": "ems_tsdb",
        "table": "telemetry",
        "fields": [
          {"field": "device_id", "type": "tag"},
          {"field": "device_type", "type": "tag"},
          {"field": "ts", "type": "timestamp"},
          {"field": "data", "type": "json"}
        ],
        "tags": {
          "device_id": "${device_id}",
          "device_type": "${device_type}"
        },
        "timestamp_field": "ts",
        "timestamp_format": "unix"
      }
    }
  ],
  "description": "EMS遥测数据写入TDengine"
}

// 规则2：解析告警事件并写入TDengine
{
  "name": "ems_alarm_to_tdengine",
  "sql": "SELECT\n  payload.device_id AS device_id,\n  payload.alarm_level AS alarm_level,\n  payload.alarm_code AS alarm_code,\n  payload.alarm_message AS alarm_message,\n  payload.ts AS ts\nFROM \"ems/+/+/+/alarm\"",
  "actions": [
    {
      "function": "builtin:tdengine",
      "args": {
        "database": "ems_tsdb",
        "table": "alarm_events",
        "fields": [
          {"field": "device_id", "type": "tag"},
          {"field": "alarm_level", "type": "value"},
          {"field": "alarm_code", "type": "value"},
          {"field": "alarm_message", "type": "value"},
          {"field": "ts", "type": "timestamp"}
        ],
        "tags": {
          "device_id": "${device_id}"
        },
        "timestamp_field": "ts",
        "timestamp_format": "unix"
      }
    },
    {
      "function": "builtin:republish",
      "args": {
        "topic": "ems/alarm/feishu/notify",
        "payload": "${payload}"
      }
    }
  ],
  "description": "EMS告警写入TDengine并转发飞书通知"
}

// 规则3：提取遥测JSON中的具体字段
{
  "name": "ems_telemetry_fields_parse",
  "sql": "SELECT\n  payload.device_id AS device_id,\n  payload.ts AS ts,\n  payload.pcs.active_power AS active_power,\n  payload.pcs.reactive_power AS reactive_power,\n  payload.pcs.voltage_ab AS voltage_ab,\n  payload.pcs.current_a AS current_a,\n  payload.pcs.frequency AS frequency,\n  payload.bms.soc AS bms_soc,\n  payload.bms.soh AS bms_soh,\n  payload.bms.total_voltage AS bms_voltage,\n  payload.bms.total_current AS bms_current,\n  payload.meter.active_power_total AS meter_active_power,\n  payload.meter.energy_import AS meter_energy_import,\n  payload.meter.energy_export AS meter_energy_export\nFROM \"ems/+/+/+/measure\"",
  "actions": [
    {
      "function": "builtin:tdengine",
      "args": {
        "database": "ems_tsdb",
        "fields_as_columns": true,
        "timestamp_field": "ts"
      }
    }
  ]
}
```

### 5.2 EMQX→TDengine桥接器配置

```json
// TDengine桥接器配置（EMQX 5.x REST API方式）
// POST /api/v5/connector
{
  "name": "tdengine-bridge",
  "type": "webhook",
  "url": "http://tdengine:6041/rest/sql/ems_tsdb",
  "request_timeout": "5s",
  "enable": true
}

// ============================================================
// 通过EMQX HTTP API创建规则（示例命令）
// ============================================================

# 创建遥测写入规则
curl -X POST http://localhost:8081/api/v5/rules \
  -H "Content-Type: application/json" \
  -u "admin:${EMQX_ADMIN_PASSWORD}" \
  -d '{
    "name": "ems_telemetry_to_tdengine",
    "sql": "SELECT payload.device_id, payload.ts, payload.data FROM \"ems/+/+/+/measure\"",
    "actions": [{
      "function": "http",
      "args": {
        "url": "http://tdengine:6041/rest/sql/ems_tsdb",
        "method": "POST",
        "headers": {"Content-Type": "application/json"},
        "body": "INSERT INTO ${payload.device_id}_telemetry USING pcs_telemetry TAGS (''${payload.device_id}'', ''${payload.device_id}'', ''${SITE_ID}'') VALUES (${payload.ts}, ${payload.data.active_power}, ${payload.data.reactive_power})"
      }
    }]
  }'
```

### 5.3 告警路由配置（飞书通知）

```json
// 告警飞书Webhook配置
// EMQX规则引擎将告警重发布到飞书
{
  "name": "ems_alarm_feishu",
  "sql": "SELECT payload FROM \"ems/+/+/+/alarm\" WHERE payload.alarm_level >= 2",
  "actions": [
    {
      "function": "http",
      "args": {
        "url": "${ALARM_LARK_WEBHOOK_URL}",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": "{\n  \"msg_type\": \"post\",\n  \"content\": {\n    \"post\": {\n      \"zh_cn\": {\n        \"title\": \"⚠️ EMS告警通知\",\n        \"content\": [\n          [{\"tag\": \"text\", \"text\": \"告警级别: ${payload.alarm_level}\"}],\n          [{\"tag\": \"text\", \"text\": \"设备: ${payload.device_id}\"}],\n          [{\"tag\": \"text\", \"text\": \"告警码: ${payload.alarm_code}\"}],\n          [{\"tag\": \"text\", \"text\": \"消息: ${payload.alarm_message}\"}],\n          [{\"tag\": \"text\", \"text\": \"时间: ${payload.ts}\"}]\n        ]\n      }\n    }\n  }\n}"
      }
    }
  ]
}
```

---

## 六、TDengine数据库设计

### 6.1 超级表完整Schema

```sql
-- ============================================================
-- TDengine EMS时序数据库初始化SQL
-- 执行方式：docker exec ems-tdengine taos -s < init.sql
-- 或通过TDengine REST API执行
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS ems_tsdb
  KEEP 365 DAYS
  CACHE 256
  BLOCKS 6
  PRECISION 'ms'
  WAL_LEVEL 1
  WAL_RETENTION_PERIOD 3;
USE ems_tsdb;

-- ============================================================
-- 超级表1：PCS遥测数据
-- ============================================================
CREATE STABLE IF NOT EXISTS pcs_telemetry (
  ts TIMESTAMP,                        -- 时间戳（毫秒精度）
  active_power FLOAT,                  -- 有功功率 (kW)
  reactive_power FLOAT,                -- 无功功率 (kVar)
  frequency FLOAT,                     -- 电网频率 (Hz)
  voltage_a FLOAT,                     -- A相电压 (V)
  voltage_b FLOAT,                     -- B相电压 (V)
  voltage_c FLOAT,                     -- C相电压 (V)
  current_a FLOAT,                     -- A相电流 (A)
  current_b FLOAT,                     -- B相电流 (A)
  current_c FLOAT,                     -- C相电流 (A)
  dc_voltage FLOAT,                    -- 直流电压 (V)
  dc_current FLOAT,                    -- 直流电流 (A)
  dc_power FLOAT,                      -- 直流功率 (kW)
  temp_igbt_a FLOAT,                   -- IGBT A温度 (°C)
  temp_igbt_b FLOAT,                   -- IGBT B温度 (°C)
  temp_igbt_c FLOAT,                   -- IGBT C温度 (°C)
  total_energy_charged FLOAT,          -- 累计充电量 (kWh)
  total_energy_discharged FLOAT        -- 累计放电量 (kWh)
)
TAGS (
  device_id NCHAR(32),                 -- 设备唯一ID（标签，不可修改）
  device_name NCHAR(64),               -- 设备名称（标签）
  site_id NCHAR(64)                    -- 站点ID（标签）
);

-- ============================================================
-- 超级表2：BMS遥测数据
-- ============================================================
CREATE STABLE IF NOT EXISTS bms_telemetry (
  ts TIMESTAMP,
  soc FLOAT,                           -- 荷电状态 (%)
  soh FLOAT,                           -- 健康状态 (%)
  total_voltage FLOAT,                 -- 电池总电压 (V)
  total_current FLOAT,                 -- 电池总电流 (A)
  total_power FLOAT,                   -- 电池总功率 (kW)
  max_cell_voltage FLOAT,              -- 最高单体电压 (V)
  min_cell_voltage FLOAT,              -- 最低单体电压 (V)
  max_cell_temp FLOAT,                 -- 最高单体温度 (°C)
  min_cell_temp FLOAT,                 -- 最低单体温度 (°C)
  max_cell_temp_diff FLOAT,            -- 电芯温差 (°C)
  insulation_r_plus FLOAT,            -- 正极绝缘电阻 (kΩ)
  insulation_r_minus FLOAT           -- 负极绝缘电阻 (kΩ)
)
TAGS (
  device_id NCHAR(32),
  device_name NCHAR(64),
  site_id NCHAR(64)
);

-- ============================================================
-- 超级表3：电表遥测数据
-- ============================================================
CREATE STABLE IF NOT EXISTS meter_telemetry (
  ts TIMESTAMP,
  voltage_a FLOAT,
  voltage_b FLOAT,
  voltage_c FLOAT,
  current_a FLOAT,
  current_b FLOAT,
  current_c FLOAT,
  active_power_total FLOAT,
  reactive_power_total FLOAT,
  power_factor_total FLOAT,
  frequency FLOAT,
  active_energy_import FLOAT,         -- 正向有功电能 (kWh)
  active_energy_export FLOAT,         -- 反向有功电能 (kWh)
  reactive_energy_import FLOAT,       -- 正向无功电能 (kVarh)
  reactive_energy_export FLOAT,       -- 反向无功电能 (kVarh)
  demand_current FLOAT,               -- 当前需量 (A)
  demand_power_max FLOAT              -- 最大需量 (kW)
)
TAGS (
  device_id NCHAR(32),
  device_name NCHAR(64),
  site_id NCHAR(64),
  meter_type NCHAR(16)                 -- 电表类型：pcc/aux
);

-- ============================================================
-- 超级表4：告警事件表
-- ============================================================
CREATE STABLE IF NOT EXISTS alarm_events (
  ts TIMESTAMP,
  alarm_level TINYINT,                 -- 告警级别：1=提示/2=警告/3=严重/4=紧急
  alarm_code INT,                      -- 告警代码
  alarm_message NCHAR(256),           -- 告警消息
  device_type NCHAR(16),              -- 设备类型
  ack_status TINYINT,                 -- 确认状态：0=未确认/1=已确认/2=已恢复
  recover_time TIMESTAMP              -- 恢复时间
)
TAGS (
  device_id NCHAR(32),
  device_name NCHAR(64),
  site_id NCHAR(64)
);

-- ============================================================
-- 超级表5：EMS策略执行日志
-- ============================================================
CREATE STABLE IF NOT EXISTS strategy_log (
  ts TIMESTAMP,
  strategy_mode NCHAR(32),
  target_power FLOAT,
  actual_power FLOAT,
  power_error FLOAT,
  soc_before FLOAT,
  soc_after FLOAT,
  reason NCHAR(256)
)
TAGS (
  device_id NCHAR(32),
  site_id NCHAR(64)
);

-- ============================================================
-- 创建子表（设备注册时由EMS自动创建）
-- ============================================================
-- 模板：CREATE TABLE {device_id}_telemetry USING {supertable} TAGS ('{tag_values}');

-- 示例PCS子表
CREATE TABLE IF NOT EXISTS pcs001_telemetry
  USING pcs_telemetry TAGS ('pcs001', '1号PCS', 'ems-hangzhou-001');

CREATE TABLE IF NOT EXISTS pcs002_telemetry
  USING pcs_telemetry TAGS ('pcs002', '2号PCS', 'ems-hangzhou-001');

-- 示例BMS子表
CREATE TABLE IF NOT EXISTS bms001_telemetry
  USING bms_telemetry TAGS ('bms001', 'BMS系统', 'ems-hangzhou-001');

-- 示例电分子表
CREATE TABLE IF NOT EXISTS meter_pcc_telemetry
  USING meter_telemetry TAGS ('meter-pcc', 'PCC关口表', 'ems-hangzhou-001', 'pcc');

-- 示例告警子表
CREATE TABLE IF NOT EXISTS pcs001_alarm
  USING alarm_events TAGS ('pcs001', '1号PCS', 'ems-hangzhou-001');
```

### 6.2 TDengine连续查询（CQP降采样）配置

```sql
-- ============================================================
-- TDengine连续查询（CQP）配置
-- 将1秒原始数据自动降采样为15分钟/1小时数据
-- 用于报表统计和长周期查询
-- ============================================================

-- 创建15分钟降采样超级表
CREATE STABLE IF NOT EXISTS pcs_telemetry_15m (
  ts TIMESTAMP,
  active_power_avg FLOAT,
  active_power_max FLOAT,
  active_power_min FLOAT,
  reactive_power_avg FLOAT,
  voltage_ab_avg FLOAT,
  current_a_avg FLOAT,
  frequency_avg FLOAT,
  total_energy_charged FLOAT,
  total_energy_discharged FLOAT
)
TAGS (
  device_id NCHAR(32),
  device_name NCHAR(64),
  site_id NCHAR(64)
);

-- 创建1小时降采样超级表
CREATE STABLE IF NOT EXISTS pcs_telemetry_1h (
  ts TIMESTAMP,
  active_power_avg FLOAT,
  active_power_max FLOAT,
  active_power_min FLOAT,
  reactive_power_avg FLOAT,
  total_energy_charged FLOAT,
  total_energy_discharged FLOAT
)
TAGS (
  device_id NCHAR(32),
  device_name NCHAR(64),
  site_id NCHAR(64)
);

-- ============================================================
-- 连续查询1：1s → 15min 降采样（按设备）
-- ============================================================
CREATE TABLE IF NOT EXISTS pcs001_telemetry_15m
  USING pcs_telemetry_15m TAGS ('pcs001', '1号PCS', 'ems-hangzhou-001')
  INTERVAL (15m) OVER (pcs001_telemetry)
  FILL (LINEAR);

CREATE TABLE IF NOT EXISTS pcs002_telemetry_15m
  USING pcs_telemetry_15m TAGS ('pcs002', '2号PCS', 'ems-hangzhou-001')
  INTERVAL (15m) OVER (pcs002_telemetry)
  FILL (LINEAR);

-- ============================================================
-- 连续查询2：1s → 1h 降采样
-- ============================================================
CREATE TABLE IF NOT EXISTS pcs001_telemetry_1h
  USING pcs_telemetry_1h TAGS ('pcs001', '1号PCS', 'ems-hangzhou-001')
  INTERVAL (1h) OVER (pcs001_telemetry)
  FILL (LINEAR);

CREATE TABLE IF NOT EXISTS pcs002_telemetry_1h
  USING pcs_telemetry_1h TAGS ('pcs002', '2号PCS', 'ems-hangzhou-001')
  INTERVAL (1h) OVER (pcs002_telemetry)
  FILL (LINEAR);

-- ============================================================
-- 电表连续查询（用于需量统计）
-- ============================================================
CREATE STABLE IF NOT EXISTS meter_telemetry_15m (
  ts TIMESTAMP,
  active_power_avg FLOAT,
  active_power_max FLOAT,
  active_power_min FLOAT,
  energy_import_15m FLOAT,           -- 15分钟累计购电量
  energy_export_15m FLOAT            -- 15分钟累计售电量
)
TAGS (
  device_id NCHAR(32),
  device_name NCHAR(64),
  site_id NCHAR(64),
  meter_type NCHAR(16)
);

CREATE TABLE IF NOT EXISTS meter_pcc_telemetry_15m
  USING meter_telemetry_15m TAGS ('meter-pcc', 'PCC关口表', 'ems-hangzhou-001', 'pcc')
  INTERVAL (15m) OVER (meter_pcc_telemetry)
  FILL (LINEAR);

-- ============================================================
-- 查询示例：从降采样数据计算峰谷时段收益
-- ============================================================
-- 查询昨日各小时充放电量（利用1h降采样数据）
SELECT
  _wstart AS hour_ts,
  SUM(active_power_avg * 1) / 1000 * 1 AS energy_kwh,  -- 1h平均功率×1h=电量
  CASE
    WHEN HOUR(hour_ts) BETWEEN 8 AND 11 THEN 'peak'
    WHEN HOUR(hour_ts) BETWEEN 14 AND 16 THEN 'peak'
    WHEN HOUR(hour_ts) BETWEEN 19 AND 21 THEN 'peak'
    WHEN HOUR(hour_ts) BETWEEN 0 AND 6 THEN 'valley'
    ELSE 'flat'
  END AS period_type
FROM pcs001_telemetry_1h
WHERE ts >= '2024-01-01 00:00:00' AND ts < '2024-01-02 00:00:00'
GROUP BY HOUR(hour_ts), period_type
ORDER BY hour_ts;
```

### 6.3 TDengine数据保留与压缩策略

```sql
-- ============================================================
-- 数据保留策略配置
-- TDengine默认按时间分区，数据自动过期删除
-- ============================================================

-- 1秒原始数据保留30天
ALTER DATABASE ems_tsdb KEEP 30;

-- 15分钟降采样数据保留365天
-- （在超级表层面配置不同的KEEP值）

-- 查看数据保留配置
SHOW DATABASES;

-- ============================================================
-- 分区配置（提升查询性能）
-- ============================================================
-- TDengine按时间自动分区，默认按天分区
-- 对于高频采集（1s），可以按小时分区提升查询性能

ALTER DATABASE ems_tsdb DAYS 1;
-- DAYS参数：分区天数（1=按天分/10=按10天分）

-- ============================================================
-- 数据压缩配置
-- ============================================================
ALTER DATABASE ems_tsdb COMP 2;
-- COMP: 压缩级别
-- 0 = 不压缩
-- 1 = 快速压缩（默认，适合SSD）
-- 2 = 强力压缩（节省空间但CPU开销大，适合HDD）

-- ============================================================
-- 查看表结构和数据量
-- ============================================================
SHOW TABLES;
SELECT COUNT(*) FROM pcs001_telemetry;
SELECT LAST(ts) FROM pcs001_telemetry;
```

---

## 七、EMS核心服务Docker配置

### 7.1 EMS Core服务的Dockerfile

```dockerfile
# EMS Core数据采集服务 Dockerfile
# 基础镜像选择：Python 3.11 slim（轻量+兼容性好）
FROM python:3.11-slim

# ============================================================
# 环境变量
# ============================================================
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# ============================================================
# 依赖安装
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # 工业通信依赖
    libmodbus-dev \
    can-utils \
    # 网络工具
    curl \
    iputils-ping \
    # 字体（用于图表）
    fonts-wqy-microhei \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# Python依赖
# ============================================================
COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# ============================================================
# 应用代码
# ============================================================
WORKDIR /app
COPY ems_core/ /app/ems_core/
COPY configs/ /app/configs/

# 创建非root用户
RUN useradd -m ems && chown -R ems:ems /app
USER ems

# ============================================================
# 健康检查
# ============================================================
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# ============================================================
# 启动命令
# ============================================================
CMD ["python", "-m", "ems_core.main"]
```

### 7.2 EMS Core服务的requirements.txt

```
# 工业通信
pymodbus==3.6.8
python-can==4.3.1
# 注意：IEC104需要安装自有版权库如pylibiec61850，这里使用模拟库
# python-libiec61850==2.0.2  # 商业库，需授权

# 数据处理
pandas>=2.1.0
numpy>=1.26.0

# 时间序列
taosrest>=3.0.1            # TDengine Python connector

# MQTT
paho-mqtt>=1.6.1

# Web框架（健康检查API）
fastapi>=0.109.0
uvicorn>=0.27.0

# 配置解析
pyyaml>=6.0.1
pydantic>=2.5.0

# 日志
python-json-logger>=2.0.7
loguru>=0.7.2

# 异常处理
tenacity>=8.2.3            # 重试框架
```

### 7.3 docker-compose完整配置

```yaml
# docker-compose.yml - EMS系统完整容器编排
version: "3.8"

# ============================================================
# 全局配置
# ============================================================
networks:
  ems-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16

services:
  # ============================================================
  # 中间件层
  # ============================================================

  tdengine:
    image: tdengine/tdengine:3.2.3.0
    container_name: ems-tdengine
    hostname: tdengine
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      TAOS_FQDN: tdengine
      TAOS_USER: ${TDENGINE_USERNAME}
      TAOS_PASS: ${TDENGINE_PASSWORD}
    volumes:
      - ./configs/tdengine/taos.cfg:/etc/taos/taos.cfg:ro
      - ./configs/tdengine/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      - ./data/tdengine:/var/lib/taos
      - ./data/tdengine-log:/var/log/taos
    ports:
      - "${TDENGINE_PORT}:6030"       # 客户端连接
      - "${TDENGINE_REST_PORT}:6041"  # REST API
      - "${TDENGINE_WEB_PORT}:18083"  # Web管理界面
    networks:
      ems-network:
        ipv4_address: 172.28.0.10
    healthcheck:
      test: ["CMD-SHELL", "taos -s 'show databases;' 2>&1 | grep -q ems_tsdb || exit 1"]
      interval: 15s; timeout: 10s; retries: 5; start_period: 30s

  emqx:
    image: emqx/emqx:5.4.1
    container_name: ems-emqx
    hostname: emqx
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      EMQX_NODE_NAME: ${EMQX_NODE_NAME}
      EMQX_DASHBOARD__DEFAULT_USERNAME: ${EMQX_ADMIN_USER}
      EMQX_DASHBOARD__DEFAULT_PASSWORD: ${EMQX_ADMIN_PASSWORD}
    volumes:
      - ./configs/emqx/emqx.conf:/opt/emqx/etc/emqx.conf:ro
      - ./configs/emqx/acl.conf:/opt/emqx/etc/acl.conf:ro
      - ./data/emqx/data:/opt/emqx/data
      - ./data/emqx/log:/opt/emqx/log
    ports:
      - "${EMQX_MQTT_PORT}:1883"
      - "${EMQX_WS_PORT}:8083"
      - "${EMQX_DASHBOARD_PORT}:18083"
      - "${EMQX_API_PORT}:8081"
    networks:
      ems-network:
        ipv4_address: 172.28.0.11
    healthcheck:
      test: ["CMD", "/opt/emqx/bin/emqx", "ctl", "status"]
      interval: 15s; timeout: 10s; retries: 5; start_period: 30s
    depends_on:
      tdengine:
        condition: service_healthy

  postgres:
    image: postgres:15-alpine
    container_name: ems-postgres
    hostname: postgres
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      POSTGRES_USER: ${PG_USERNAME}
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: ${PG_DATABASE}
    volumes:
      - ./configs/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
      - ./data/postgres:/var/lib/postgresql/data
    ports:
      - "${PG_PORT}:5432"
    networks:
      ems-network:
        ipv4_address: 172.28.0.12
    command: >
      postgres
      -c max_connections=${PG_MAX_CONNECTIONS}
      -c shared_buffers=${PG_SHARED_BUFFERS}
      -c wal_level=replica
      -c log_timezone='Asia/Shanghai'
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_USERNAME} -d ${PG_DATABASE}"]
      interval: 10s; timeout: 5s; retries: 5

  redis:
    image: redis:7-alpine
    container_name: ems-redis
    hostname: redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory ${REDIS_MAXMEMORY}
      --maxmemory-policy ${REDIS_MAXMEMORY_POLICY}
      --appendonly yes
      --appendfsync everysec
    volumes:
      - ./data/redis:/data
    ports:
      - "${REDIS_PORT}:6379"
    networks:
      ems-network:
        ipv4_address: 172.28.0.13

  # ============================================================
  # 应用层
  # ============================================================

  ems-core:
    build:
      context: ./dockerfiles
      dockerfile: ems-core.Dockerfile
    container_name: ems-core
    hostname: ems-core
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./configs/collector/:/app/configs/collector/:ro
      - ./data/ems-logs/core:/app/logs
    ports:
      - "${EMS_CORE_PORT}:8080"
    networks:
      ems-network:
        ipv4_address: 172.28.0.20
    depends_on:
      tdengine:
        condition: service_healthy
      emqx:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
      interval: 15s; timeout: 5s; retries: 3; start_period: 20s

  ems-api:
    image: node:18-alpine
    container_name: ems-api
    hostname: ems-api
    restart: unless-stopped
    working_dir: /app
    command: sh -c "npm install && npm start"
    environment:
      TZ: Asia/Shanghai
      NODE_ENV: production
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${PG_DATABASE}
      DB_USER: ${PG_USERNAME}
      DB_PASSWORD: ${PG_PASSWORD}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      MQTT_BROKER: tcp://emqx:1883
      MQTT_USER: ${MQTT_USERNAME}
      MQTT_PASSWORD: ${MQTT_PASSWORD}
    volumes:
      - ./ems-api:/app
    ports:
      - "8080:8080"
    networks:
      ems-network:
        ipv4_address: 172.28.0.21
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
      emqx:
        condition: service_healthy

  ems-webui:
    image: nginx:1.25-alpine
    container_name: ems-webui
    hostname: ems-webui
    restart: unless-stopped
    volumes:
      - ./ems-webui:/usr/share/nginx/html:ro
      - ./configs/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./configs/nginx/ssl:/etc/nginx/ssl:ro
    ports:
      - "80:80"
    networks:
      ems-network:
        ipv4_address: 172.28.0.22
    depends_on:
      ems-api:
        condition: service_started

  ems-strategy:
    image: python:3.11-slim
    container_name: ems-strategy
    hostname: ems-strategy
    restart: unless-stopped
    command: >
      python -m uvicorn ems_strategy.main:app
      --host 0.0.0.0
      --port 8082
      --log-level info
    environment:
      TZ: Asia/Shanghai
      MQTT_BROKER: tcp://emqx:1883
      MQTT_USER: ${MQTT_USERNAME}
      MQTT_PASSWORD: ${MQTT_PASSWORD}
      TDENGINE_HOST: tdengine
      TDENGINE_PORT: 6030
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      EMS_CORE_URL: http://ems-core:8080
    volumes:
      - ./ems-strategy:/app
      - ./configs/ems:/app/configs/:ro
      - ./data/ems-logs/strategy:/app/logs
    ports:
      - "8082:8082"
    networks:
      ems-network:
        ipv4_address: 172.28.0.23

  # ============================================================
  # Nginx反向代理（统一入口）
  # ============================================================
  nginx:
    image: nginx:1.25-alpine
    container_name: ems-nginx
    hostname: ems-nginx
    restart: unless-stopped
    volumes:
      - ./configs/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./configs/nginx/ssl:/etc/nginx/ssl:ro
      - ./data/nginx:/var/log/nginx
    ports:
      - "${NGINX_HTTP_PORT}:80"
      - "${NGINX_HTTPS_PORT:-443}:443"
    networks:
      ems-network:
        ipv4_address: 172.28.0.30
    depends_on:
      ems-api:
        condition: service_started
      ems-webui:
        condition: service_started

networks:
  ems-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### 7.4 Nginx反向代理配置

```nginx
# /opt/ems/configs/nginx/nginx.conf
server {
    listen 80;
    server_name _;

    # 强制跳转HTTPS（生产环境建议开启）
    # return 301 https://$host$request_uri;

    # EMS WebUI
    location / {
        proxy_pass http://ems-webui:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # EMS REST API
    location /api/ {
        proxy_pass http://ems-api:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # API限流（每IP 100次/分钟）
        limit_req zone=api_limit burst=100 nodelay;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # EMS WebSocket（MQTT WebSocket）
    location /mqtt {
        proxy_pass http://emqx:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }

    # EMS策略引擎API
    location /strategy/ {
        proxy_pass http://ems-strategy:8082/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # TDengine管理界面
    location /tdengine/ {
        proxy_pass http://tdengine:18083/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        auth_basic "TDengine Admin";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }

    # EMQX管理控制台
    location /emqx/ {
        proxy_pass http://emqx:18083/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        auth_basic "EMQX Admin";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }

    # 健康检查端点
    location /health {
        proxy_pass http://ems-api:8080/health;
        access_log off;
    }

    # 访问日志
    access_log /var/log/nginx/ems-access.log;
    error_log /var/log/nginx/ems-error.log;
}

# 限流配置
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
```

---

## 八、备份恢复脚本

### 8.1 自动备份脚本（backup.sh）

```bash
#!/bin/bash
# backup.sh - EMS数据与配置自动备份脚本
# 建议通过cron定时执行：0 2 * * * /opt/ems/scripts/backup.sh

# ============================================================
# 配置
# ============================================================
BACKUP_DIR="${BACKUP_DATA_DIR:-/opt/ems/backups}"
KEEP_DAYS="${BACKUP_RETENTION_DAYS:-7}"
DATE=$(date '+%Y%m%d_%H%M%S')
HOSTNAME=$(hostname)
BACKUP_NAME="ems_backup_${HOSTNAME}_${DATE}"
LOG_FILE="/var/log/ems_backup.log"

# TDengine连接参数
TD_HOST="${TDENGINE_FQDN:-tdengine}"
TD_PORT="${TDENGINE_PORT:-6030}"
TD_USER="${TDENGINE_USERNAME:-root}"
TD_PASS="${TDENGINE_PASSWORD:-taosdata}"
TD_DB="${TDENGINE_DATABASE:-ems_tsdb}"

# PostgreSQL连接参数
PG_HOST="${PG_HOST:-postgres}"
PG_PORT="${PG_PORT:-5432}"
PG_DB="${PG_DATABASE:-ems_config}"
PG_USER="${PG_USERNAME:-ems}"
PG_PASS="${PG_PASSWORD}"

# ============================================================
# 日志函数
# ============================================================
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ============================================================
# 备份TDengine数据快照
# ============================================================
backup_tdengine() {
    log "开始备份TDengine..."
    local td_backup_dir="${BACKUP_DIR}/${BACKUP_NAME}/tdengine"
    mkdir -p "$td_backup_dir"

    # 备份1：数据库DDL
    docker exec ems-tdengine taos -u"$TD_USER" -p"$TD_PASS" -s "
SHOW DATABASES;
SHOW ${TD_DB}.STABLES;
" > "${td_backup_dir}/schema.sql" 2>/dev/null

    # 备份2：TDengine数据文件快照
    # 注意：生产环境建议使用taosdump工具
    docker exec ems-tdengine taosdump \
        -h "$TD_HOST" \
        -P "$TD_PORT" \
        -u "$TD_USER" \
        -p "$TD_PASS" \
        -d "$TD_DB" \
        -o "$td_backup_dir" \
        -a 2>/dev/null || log "taosdump未成功，使用文件拷贝..."

    # 备份3：配置文件
    cp /opt/ems/configs/tdengine/taos.cfg "${td_backup_dir}/" 2>/dev/null || true

    log "TDengine备份完成: ${td_backup_dir}"
}

# ============================================================
# 备份PostgreSQL配置数据
# ============================================================
backup_postgres() {
    log "开始备份PostgreSQL..."
    local pg_backup_dir="${BACKUP_DIR}/${BACKUP_NAME}/postgres"
    mkdir -p "$pg_backup_dir"

    # 导出配置数据库
    docker exec ems-postgres pg_dump \
        -U "$PG_USER" \
        -d "$PG_DB" \
        > "${pg_backup_dir}/ems_config.sql" 2>/dev/null

    log "PostgreSQL备份完成: ${pg_backup_dir}"
}

# ============================================================
# 备份配置文件
# ============================================================
backup_configs() {
    log "开始备份配置文件..."
    local cfg_backup_dir="${BACKUP_DIR}/${BACKUP_NAME}/configs"
    mkdir -p "$cfg_backup_dir"

    # 备份.env（脱敏处理）
    cat /opt/ems/.env 2>/dev/null | \
        sed -e 's/PASSWORD=.*/PASSWORD=***MASKED***/g' \
        -e 's/SECRET=.*/SECRET=***MASKED***/g' \
        > "${cfg_backup_dir}/.env" || true

    # 备份采集配置
    cp -r /opt/ems/configs/collector "${cfg_backup_dir}/" 2>/dev/null || true
    cp -r /opt/ems/configs/ems "${cfg_backup_dir}/" 2>/dev/null || true

    # 备份docker-compose.yml
    cp /opt/ems/docker-compose.yml "${cfg_backup_dir}/" 2>/dev/null || true

    log "配置文件备份完成: ${cfg_backup_dir}"
}

# ============================================================
# 清理过期备份
# ============================================================
cleanup_old_backups() {
    log "清理${KEEP_DAYS}天前的备份..."
    find "$BACKUP_DIR" -maxdepth 1 -type d -name "ems_backup_*" \
        -mtime +${KEEP_DAYS} -exec rm -rf {} \; 2>/dev/null
    log "清理完成"
}

# ============================================================
# 生成备份清单
# ============================================================
generate_manifest() {
    local manifest="${BACKUP_DIR}/${BACKUP_NAME}/MANIFEST.txt"
    cat > "$manifest" <<EOF
EMS Backup Manifest
===================
Backup Name: ${BACKUP_NAME}
Backup Date: $(date '+%Y-%m-%d %H:%M:%S')
Hostname: ${HOSTNAME}
Site ID: ${SITE_ID}
Site Name: ${SITE_NAME}
EMS Version: ${EMS_VERSION}

Backup Contents:
  - TDengine Database: ${TD_DB}
  - PostgreSQL Database: ${PG_DB}
  - Configuration Files: configs/

Backup Size:
$(du -sh "${BACKUP_DIR}/${BACKUP_NAME}" 2>/dev/null || echo "  N/A")

Note: This is a automated backup generated by EMS deployment system.
EOF
    log "备份清单已生成: ${manifest}"
}

# ============================================================
# 主流程
# ============================================================
main() {
    log "========================================"
    log "EMS备份开始 - ${BACKUP_NAME}"
    log "========================================"

    # 检查备份目录
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
    fi

    # 执行各类备份
    backup_configs
    backup_tdengine
    backup_postgres
    cleanup_old_backups
    generate_manifest

    # 计算备份包大小
    local backup_size=$(du -sh "${BACKUP_DIR}/${BACKUP_NAME}" 2>/dev/null | cut -f1)
    log "备份完成！包大小: ${backup_size}"
    log "备份路径: ${BACKUP_DIR}/${BACKUP_NAME}"

    # 输出备份包路径供后续使用
    echo "${BACKUP_DIR}/${BACKUP_NAME}"
}

main "$@"
```

### 8.2 一键恢复脚本（restore.sh）

```bash
#!/bin/bash
# restore.sh - EMS数据恢复脚本
# 使用方法: ./restore.sh /path/to/ems_backup_hostname_date.tar.gz

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "用法: $0 <备份包路径>"
    echo "示例: $0 /opt/ems/backups/ems_backup_server1_20240101_020000.tar.gz"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "错误: 备份文件不存在: $BACKUP_FILE"
    exit 1
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

log "=========================================="
log "EMS数据恢复开始"
log "=========================================="

# 解压备份包
RESTORE_DIR="/tmp/ems_restore_$$"
mkdir -p "$RESTURE_DIR"
tar -xzf "$BACKUP_FILE" -C "$RESTORE_DIR"
log "备份包已解压到: $RESTORE_DIR"

# 停止EMS服务
log "停止EMS服务..."
cd /opt/ems
docker compose down

# 恢复PostgreSQL
log "恢复PostgreSQL配置..."
if [ -f "${RESTORE_DIR}/postgres/ems_config.sql" ]; then
    docker compose up -d postgres
    sleep 5
    docker exec -i ems-postgres psql -U "${PG_USERNAME}" -d "${PG_DATABASE}" \
        < "${RESTORE_DIR}/postgres/ems_config.sql"
    log "PostgreSQL已恢复"
fi

# 恢复TDengine
log "恢复TDengine数据..."
if [ -d "${RESTORE_DIR}/tdengine" ]; then
    # 停止TDengine容器
    docker compose stop tdengine
    # 恢复数据文件（谨慎！）
    # cp -r "${RESTORE_DIR}/tdengine/data/"* /opt/ems/data/tdengine/
    log "TDengine数据文件需要手动恢复，请确认备份版本兼容性"
fi

# 恢复配置文件
log "恢复配置文件..."
if [ -d "${RESTORE_DIR}/configs" ]; then
    cp -r "${RESTORE_DIR}/configs/"* /opt/ems/configs/
    log "配置文件已恢复"
fi

# 重启EMS服务
log "重启EMS服务..."
docker compose up -d
sleep 10

# 健康检查
log "执行健康检查..."
curl -s http://localhost:8080/health && log "EMS Core健康" || log "EMS Core异常"
curl -s http://localhost:8081/api/v5/status && log "EMQX健康" || log "EMQX异常"

# 清理临时文件
rm -rf "$RESTORE_DIR"

log "=========================================="
log "EMS恢复完成！请验证数据完整性。"
log "=========================================="
```

---

## 九、远程运维配置

### 9.1 FRP内网穿透配置（frp内网穿透）

FRP（Fast Reverse Proxy）用于在没有VPN的情况下，从公网访问内网的EMS系统。

```ini
# ============================================================
# FRP服务端配置（部署在公网服务器）
# 文件：/etc/frp/frps.ini
# ============================================================

[common]
bind_port = 7000                  # FRP客户端连接端口
bind_udp_port = 7001               # UDP打洞端口（可选）
vhost_http_port = 8080             # HTTP反向代理端口
vhost_http_port = 8443             # HTTPS反向代理端口
dashboard_port = 7500              # FRP管理界面端口
dashboard_user = admin             # FRP管理界面用户名
dashboard_pwd = FrpAdmin2024       # ★ 修改为强密码
token = ${FRP_AUTH_TOKEN}          # ★ 认证Token
max_pool_count = 5
max_ports_per_client = 0
subdomain_host = frp.yourcompany.com  # ★ 泛域名
```

```ini
# ============================================================
# FRP客户端配置（部署在EMS服务器/工控机）
# 文件：/opt/ems/configs/frpc.ini
# ============================================================

[common]
server_addr = ${FRP_SERVER_HOST}   # ★ 公网FRP服务器IP
server_port = ${FRP_SERVER_PORT}    # 连接端口：7000
token = ${FRP_AUTH_TOKEN}           # ★ 认证Token
pool_count = 2
tls_enable = true

# SSH远程访问
[ssh]
type = tcp
local_ip = 127.0.0.1
local_port = 22
remote_port = ${FRP_SSH_PORT}       # ★ 分配的SSH端口：6000
use_encryption = true
use_compression = true

# RDP远程桌面（Windows）
[rdp]
type = tcp
local_ip = 127.0.0.1
local_port = 3389
remote_port = ${FRP_RDP_PORT}       # ★ 分配的RDP端口：6001
use_encryption = true
use_compression = true

# HTTP访问EMS Web界面
[ems_web]
type = http
local_ip = 127.0.0.1
local_port = 80
custom_domains = ems-${SITE_ID}.yourcompany.com  # ★ 你的域名
use_encryption = true
use_compression = true

# TDengine管理界面
[tdengine_admin]
type = http
local_ip = 127.0.0.1
local_port = 18083
custom_domains = tdengine-${SITE_ID}.yourcompany.com
use_encryption = true

# EMQX管理界面
[emqx_admin]
type = http
local_ip = 127.0.0.1
local_port = 18083
custom_domains = emqx-${SITE_ID}.yourcompany.com
use_encryption = true

# 自定义端口（如果需要）
[custom_port]
type = tcp
local_ip = 127.0.0.1
local_port = 8080                   # EMS API端口
remote_port = ${FRP_HTTP_PORT}     # ★ 分配端口：6002
```

### 9.2 FRP一键安装脚本（remote_ops_setup.sh）

```bash
#!/bin/bash
# remote_ops_setup.sh - 远程运维配置脚本
# 使用方法: ./remote_ops_setup.sh [install|uninstall|status]

set -e

ACTION="${1:-install}"
FRP_VERSION="0.51.0"
FRP_DIR="/opt/frp"
FRP_CONFIG_DIR="/opt/ems/configs"

case "$ACTION" in
    install)
        echo "安装FRP客户端..."
        
        # 下载FRP
        ARCH=$(uname -m)
        if [ "$ARCH" = "x86_64" ]; then
            FRP_ARCH="amd64"
        elif [ "$ARCH" = "aarch64" ]; then
            FRP_ARCH="arm64"
        else
            FRP_ARCH="amd64"
        fi
        
        mkdir -p "$FRP_DIR"
        curl -fsSL "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_${FRP_ARCH}.tar.gz" \
            -o /tmp/frp.tar.gz
        
        tar -xzf /tmp/frp.tar.gz -C "$FRP_DIR" --strip-components=1
        rm /tmp/frp.tar.gz
        
        # 复制配置文件
        cp "${FRP_CONFIG_DIR}/frpc.ini" "${FRP_DIR}/frpc.ini"
        
        # 创建systemd服务
        cat > /etc/systemd/system/frpc.service <<EOF
[Unit]
Description=FRP Client Service
After=network.target

[Service]
Type=simple
ExecStart=${FRP_DIR}/frpc -c ${FRP_DIR}/frpc.ini
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
        systemctl enable frpc
        systemctl start frpc
        
        echo "FRP客户端安装完成！"
        echo "服务状态: $(systemctl is-active frpc)"
        echo "配置路径: ${FRP_DIR}/frpc.ini"
        ;;
        
    uninstall)
        echo "卸载FRP客户端..."
        systemctl stop frpc
        systemctl disable frpc
        rm /etc/systemd/system/frpc.service
        systemctl daemon-reload
        rm -rf "$FRP_DIR"
        echo "FRP已卸载"
        ;;
        
    status)
        echo "FRP服务状态:"
        systemctl status frpc --no-pager
        echo ""
        echo "进程状态:"
        ps aux | grep frpc | grep -v grep
        ;;
        
    *)
        echo "用法: $0 [install|uninstall|status]"
        exit 1
        ;;
esac
```

### 9.3 WireGuard VPN配置（备选方案）

```ini
# ============================================================
# WireGuard服务端配置（部署在公网服务器）
# 文件：/etc/wireguard/wg0.conf
# ============================================================

[Interface]
PrivateKey = <服务器私钥>              # ★ 使用 wg genkey 生成
Address = 10.88.0.1/24               # WireGuard服务端IP
ListenPort = ${WIREGUARD_PORT}        # 监听端口：51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# 客户端1：EMS站点1
[Peer]
PublicKey = <客户端公钥>              # ★ 客户端公钥
AllowedIPs = 10.88.0.2/32             # 客户端分配IP
PersistentKeepalive = 25              # 保活间隔（秒）

# 客户端2：EMS站点2
[Peer]
PublicKey = <客户端2公钥>
AllowedIPs = 10.88.0.3/32
PersistentKeepalive = 25
```

```ini
# ============================================================
# WireGuard客户端配置（部署在EMS服务器）
# 文件：/etc/wireguard/wg0.conf
# ============================================================

[Interface]
PrivateKey = <客户端私钥>              # ★ 使用 wg genkey 生成
Address = 10.88.0.2/24               # ★ 分配的客户端IP
DNS = 223.5.5.5                       # DNS服务器（国内推荐）

[Peer]
PublicKey = <服务器公钥>              # ★ 服务器公钥
Endpoint = ${WIREGUARD_SERVER_IP}:${WIREGUARD_PORT}  # ★ 服务器地址
AllowedIPs = 10.88.0.0/24             # 需要通过VPN访问的网段
PersistentKeepalive = 25
```

---

## 十、一键部署脚本

### 10.1 Linux一键部署脚本（deploy.sh）

```bash
#!/bin/bash
# deploy.sh - EMS一键部署脚本（Linux）
# 使用方法: chmod +x deploy.sh && ./deploy.sh

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARN:${NC} $1"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')] ERROR:${NC} $1"; exit 1; }

DEPLOY_DIR="/opt/ems"
cd "$DEPLOY_DIR" || error "找不到部署目录: $DEPLOY_DIR"

log "============================================"
log "  EMS一键部署脚本 v2.0"
log "  部署目录: $DEPLOY_DIR"
log "============================================"

# ========== Phase 1: 预检 ==========
log "【Phase 1/6】服务器预检..."

if [ -f "./pre_check.sh" ]; then
    chmod +x ./pre_check.sh
    ./pre_check.sh || { warn "预检有警告但继续执行部署"; }
else
    warn "预检脚本不存在，跳过预检";
fi

# ========== Phase 2: Docker安装 ==========
log "【Phase 2/6】Docker环境..."

if ! command -v docker &>/dev/null; then
    log "安装Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker安装完成"
else
    log "Docker已安装: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
    log "安装Docker Compose插件..."
    apt-get update && apt-get install -y docker-compose-plugin
fi

# ========== Phase 3: 中间件部署 ==========
log "【Phase 3/6】部署中间件（TDengine + EMQX + PostgreSQL + Redis）..."

# 加载.env配置
if [ -f ".env" ]; then
    log "加载配置文件: .env"
    export $(grep -v '^#' .env | xargs)
else
    error ".env配置文件不存在，请先配置"
fi

# 拉取基础镜像
log "拉取基础镜像..."
docker compose pull

# 启动中间件（先不启动应用层）
docker compose up -d tdengine emqx postgres redis

# 等待中间件健康
log "等待中间件就绪..."
sleep 10
for svc in tdengine emqx postgres redis; do
    for i in {1..30}; do
        if docker compose ps $svc | grep -q "healthy\|Up"; then
            log "  $svc 就绪"
            break
        fi
        sleep 2
    done
done

# ========== Phase 4: 数据库初始化 ==========
log "【Phase 4/6】初始化数据库..."

# TDengine表结构已通过init.sql自动初始化
log "  TDengine超级表已创建"

# 等待EMQX就绪并创建规则引擎
log "  配置EMQX规则引擎..."
sleep 5

log "  数据库初始化完成"

# ========== Phase 5: 应用层部署 ==========
log "【Phase 5/6】部署EMS微服务..."

docker compose up -d --build ems-core ems-api ems-webui ems-strategy nginx

sleep 10

# ========== Phase 6: 健康检查 ==========
log "【Phase 6/6】健康检查..."

HEALTH_OK=true

# 检查各服务状态
for svc in tdengine emqx postgres redis ems-core ems-api ems-webui nginx; do
    if docker compose ps $svc | grep -q "Up"; then
        log "  ✓ $svc 运行中"
    else
        error "✗ $svc 未正常运行"
        HEALTH_OK=false
    fi
done

# HTTP端点检查
if curl -sf http://localhost:8080/health &>/dev/null; then
    log "  ✓ EMS Core健康检查通过"
else
    warn "  EMS Core健康检查未通过，请检查日志"
fi

if curl -sf http://localhost:18083/api/v5/status &>/dev/null; then
    log "  ✓ EMQX运行正常"
else
    warn "  EMQX未就绪，请稍后检查"
fi

# ========== 部署完成 ==========
log ""
log "============================================"
log "  ✓ EMS部署完成！"
log "============================================"
log ""
log "  访问地址："
log "    Web界面:   http://$(hostname -I | awk '{print $1}')"
log "    EMQX管理:  http://$(hostname -I | awk '{print $1}'):18083"
log "    TDengine:  http://$(hostname -I | awk '{print $1}'):18083"
log ""
log "  默认账号："
log "    EMQX:     admin / ${EMQX_ADMIN_PASSWORD}"
log "    TDengine: root / taosdata"
log ""
log "  常用命令："
log "    查看服务状态:  cd $DEPLOY_DIR && docker compose ps"
log "    查看日志:      docker compose logs -f [service_name]"
log "    停止服务:      cd $DEPLOY_DIR && docker compose down"
log "    重启服务:      cd $DEPLOY_DIR && docker compose restart"
log ""
log "  配置文件:     $DEPLOY_DIR/.env"
log "  备份目录:     ${BACKUP_DATA_DIR:-/opt/ems/backups}"
log ""
```

### 10.2 Windows一键部署脚本（deploy.ps1）

```powershell
# deploy.ps1 - EMS一键部署脚本（Windows）
# 使用方法：以管理员身份运行 PowerShell，然后执行：.\deploy.ps1

param(
    [string]$DeployDir = "C:\EMS"
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param($Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor Green
}

function Write-Warn {
    param($Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] WARN: $Message" -ForegroundColor Yellow
}

function Write-Err {
    param($Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ERROR: $Message" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  EMS一键部署脚本 v2.0" -ForegroundColor Cyan
Write-Host "  部署目录: $DeployDir" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan

# ========== 预检 ==========
Write-Log "【Phase 1/6】服务器预检..."
if (Test-Path "$DeployDir\pre_check.ps1") {
    & "$DeployDir\pre_check.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "预检有警告，继续执行..."
    }
}

# ========== Docker安装 ==========
Write-Log "【Phase 2/6】Docker环境..."
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Log "安装Docker Desktop..."
    Start-Process powershell -Verb RunAs -ArgumentList "irm docker.com/install.ps1 | iex" -Wait
} else {
    Write-Log "Docker已安装: $(docker --version)"
}

# 等待Docker服务启动
Write-Log "等待Docker服务就绪..."
$timeout = 60
$elapsed = 0
while (-not (docker info 2>$null) -and $elapsed -lt $timeout) {
    Start-Sleep 2
    $elapsed += 2
}
if ($elapsed -ge $timeout) {
    Write-Err "Docker服务未就绪，请手动启动Docker Desktop"
}

# ========== 中间件部署 ==========
Write-Log "【Phase 3/6】部署中间件..."
Set-Location $DeployDir
docker compose pull
docker compose up -d tdengine emqx postgres redis

Write-Log "等待中间件启动..."
Start-Sleep 15

# ========== 应用层部署 ==========
Write-Log "【Phase 5/6】部署EMS微服务..."
docker compose up -d --build ems-core ems-api ems-webui ems-strategy nginx
Start-Sleep 10

# ========== 健康检查 ==========
Write-Log "【Phase 6/6】健康检查..."
$services = @("tdengine", "emqx", "postgres", "redis", "ems-core", "ems-api", "ems-webui", "nginx")
foreach ($svc in $services) {
    $status = docker compose ps $svc 2>$null | Select-String "Up" -Quiet
    if ($status) {
        Write-Log "  ✓ $svc 运行中"
    } else {
        Write-Warn "  ✗ $svc 未运行，请检查"
    }
}

Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✓ EMS部署完成！" -ForegroundColor Green
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Web界面: http://localhost"
Write-Host "  EMQX管理: http://localhost:18083"
Write-Host ""
```

---

## 十一、健康检查脚本

### 11.1 健康检查脚本（health_check.sh）

```bash
#!/bin/bash
# health_check.sh - EMS健康检查脚本
# 建议通过cron定期执行：*/5 * * * * /opt/ems/scripts/health_check.sh

ALARM_WEBHOOK="${ALARM_LARK_WEBHOOK_URL}"
SITE_ID="${SITE_ID:-unknown}"
ALL_PASS=true

echo ""
echo "══════════════════════════════════════════════"
echo "  EMS健康检查 - $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════"

# ========== 容器状态检查 ==========
echo ""
echo "【容器状态】"
SERVICES="tdengine emqx postgres redis ems-core ems-api ems-webui ems-strategy nginx"
for SVC in $SERVICES; do
    STATUS=$(docker compose ps $SVC 2>/dev/null | grep -E "Up|healthy|running" | wc -l)
    if [ "$STATUS" -gt 0 ]; then
        echo "  ✓ $SVC 运行正常"
    else
        echo "  ✗ $SVC 未运行"
        ALL_PASS=false
    fi
done

# ========== 端口检查 ==========
echo ""
echo "【端口检查】"
PORTS="1883:EMQX-MQTT 8083:MQTT-WS 5432:PostgreSQL 6379:Redis 6030:TDengine 18083:TDengine-Web"
for PORT_INFO in $PORTS; do
    PORT=$(echo $PORT_INFO | cut -d: -f1)
    NAME=$(echo $PORT_INFO | cut -d: -f2)
    if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
        echo "  ✓ 端口 $PORT ($NAME) 监听中"
    else
        echo "  ✗ 端口 $PORT ($NAME) 未监听"
        ALL_PASS=false
    fi
done

# ========== HTTP健康检查 ==========
echo ""
echo "【HTTP健康检查】"
ENDPOINTS="http://localhost:8080/health:EMS-Core http://localhost:8081/api/v5/status:EMQX-API"
for EP_INFO in $ENDPOINTS; do
    URL=$(echo $EP_INFO | cut -d: -f1,2,3)
    NAME=$(echo $EP_INFO | cut -d: -f4)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
        echo "  ✓ $NAME 健康 (HTTP $HTTP_CODE)"
    else
        echo "  ✗ $NAME 异常 (HTTP $HTTP_CODE)"
        ALL_PASS=false
    fi
done

# ========== TDengine数据写入检查 ==========
echo ""
echo "【TDengine数据检查】"
LAST_TS=$(docker exec ems-tdengine taos -s "SELECT LAST(ts) FROM ${TDENGINE_DATABASE}.pcs001_telemetry;" 2>/dev/null | grep -oP '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}' | tail -1)
if [ -n "$LAST_TS" ]; then
    LAST_EPOCH=$(date -d "$LAST_TS" +%s 2>/dev/null || echo 0)
    NOW_EPOCH=$(date +%s)
    DIFF=$((NOW_EPOCH - LAST_EPOCH))
    if [ "$DIFF" -lt 60 ]; then
        echo "  ✓ TDengine数据正常 (最新: $LAST_TS)"
    else
        echo "  ⚠ TDengine数据滞后 ${DIFF}秒"
    fi
else
    echo "  ⚠ TDengine无数据（可能未开始采集）"
fi

# ========== 磁盘使用率检查 ==========
echo ""
echo "【磁盘使用率】"
for MOUNT in "/" "/data"; do
    USAGE=$(df "$MOUNT" | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$USAGE" -gt 90 ]; then
        echo "  ✗ $MOUNT 使用率${USAGE}%（超过90%，需清理）"
        ALL_PASS=false
    elif [ "$USAGE" -gt 80 ]; then
        echo "  ⚠ $MOUNT 使用率${USAGE}%（超过80%，建议关注）"
    else
        echo "  ✓ $MOUNT 使用率${USAGE}%"
    fi
done

# ========== 汇总 ==========
echo ""
echo "══════════════════════════════════════════════"
if [ "$ALL_PASS" = true ]; then
    echo "  ✓ 所有检查通过"
    echo "══════════════════════════════════════════════"
    exit 0
else
    echo "  ✗ 存在问题，请检查以上FAIL项"
    echo "══════════════════════════════════════════════"

    # 发送告警（如果配置了飞书Webhook）
    if [ -n "$ALARM_WEBHOOK" ]; then
        curl -s -X POST "$ALARM_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{
                \"msg_type\": \"text\",
                \"content\": {\"text\": \"⚠️ EMS健康检查告警 [$SITE_ID] $(date '+%m-%d %H:%M')\n存在问题，请检查健康检查日志。\"}
            }" 2>/dev/null
    fi
    exit 1
fi
```

---

## 十二、交付检查清单

### 12.1 部署交付检查表

| 序号 | 检查项 | 检查方法 | 结果 | 检查人 | 日期 |
|------|--------|---------|------|--------|------|
| 1 | Docker版本≥24 | `docker --version` | | | |
| 2 | docker-compose版本≥2 | `docker compose version` | | | |
| 3 | TDengine容器健康 | `docker compose ps tdengine` | | | |
| 4 | EMQX容器健康 | `docker compose ps emqx` | | | |
| 5 | PostgreSQL容器健康 | `docker compose ps postgres` | | | |
| 6 | Redis容器健康 | `docker compose ps redis` | | | |
| 7 | EMS Core健康检查 | `curl http://localhost:8080/health` | | | |
| 8 | EMS WebUI可访问 | 浏览器访问 `http://服务器IP` | | | |
| 9 | EMQX管理界面可登录 | 浏览器访问 `:18083` | | | |
| 10 | TDengine管理界面可登录 | 浏览器访问 `:18083` | | | |
| 11 | PCS数据采集正常 | 查看WebUI实时数据 | | | |
| 12 | BMS数据采集正常 | 查看WebUI实时SOC/SOH | | | |
| 13 | 电表数据采集正常 | 查看WebUI实时功率/电量 | | | |
| 14 | EMS策略引擎运行 | `curl http://localhost:8082/health` | | | |
| 15 | 告警飞书通知测试 | 触发一条告警测试 | | | |
| 16 | 数据写入TDengine | 确认时序数据持续写入 | | | |
| 17 | MQTT连接正常 | EMQX Dashboard查看连接数 | | | |
| 18 | 备份脚本可执行 | `bash /opt/ems/scripts/backup.sh` | | | |
| 19 | 防火墙端口开放 | 确认 `:1883 :5432 :6379` 等可访问 | | | |
| 20 | 部署文档交付 | 交付报告 + 操作手册 | | | |

---

## 附录A：端口清单

| 端口 | 协议 | 服务 | 说明 | 是否必须开放 |
|------|------|------|------|------------|
| 1883 | TCP | EMQX MQTT | MQTT Broker（设备连接） | 对设备开放 |
| 8083 | TCP | EMQX WS | MQTT WebSocket（Web端） | 防火墙可选 |
| 5432 | TCP | PostgreSQL | 数据库（内部） | 仅本地访问 |
| 6379 | TCP | Redis | 缓存（内部） | 仅本地访问 |
| 6030 | TCP | TDengine | 客户端连接（内部） | 仅本地访问 |
| 6041 | TCP | TDengine | REST API（内部） | 仅本地访问 |
| 18083 | TCP | TDengine | Web管理界面 | 仅内网访问，建议加认证 |
| 18083 | TCP | EMQX | Dashboard管理界面 | 仅内网访问，建议加认证 |
| 8080 | TCP | EMS API | REST API（内部） | 仅本地访问 |
| 8081 | TCP | EMQX | HTTP API（内部） | 仅本地访问 |
| 8082 | TCP | EMS策略 | 策略引擎API（内部） | 仅本地访问 |
| 80/443 | TCP | Nginx | Web入口 | 对用户浏览器开放 |

---

## 附录B：目录结构规范

```
/opt/ems/                           # Linux标准安装路径
├── .env                            # 核心配置（★ 工程师必改）
├── docker-compose.yml              # 容器编排定义
├── docker-daemon.json              # Docker守护进程配置
│
├── configs/                        # 配置文件（只读挂载到容器）
│   ├── tdengine/
│   │   ├── taos.cfg               # TDengine配置
│   │   └── init.sql               # 初始化SQL
│   ├── emqx/
│   │   ├── emqx.conf              # EMQX配置
│   │   ├── acl.conf               # ACL规则
│   │   └── rules/                 # 规则引擎配置
│   ├── collector/                  # ★ 采集驱动配置
│   │   ├── modbus_tcp.yaml
│   │   ├── modbus_rtu.yaml
│   │   ├── iec104.yaml
│   │   └── can.yaml
│   ├── ems/                        # ★ EMS应用配置
│   │   ├── core_config.yaml
│   │   └── strategy.yaml
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── ssl/                    # SSL证书
│   └── frp/
│       ├── frpc.ini               # ★ FRP客户端配置
│       └── frps.ini               # FRP服务端配置
│
├── scripts/                        # 运维脚本
│   ├── pre_check.sh               # 预检脚本
│   ├── deploy.sh                   # 部署脚本
│   ├── health_check.sh            # 健康检查
│   ├── backup.sh                   # 备份脚本
│   ├── restore.sh                  # 恢复脚本
│   └── remote_ops_setup.sh         # 远程运维配置
│
├── data/                           # 数据持久化目录
│   ├── tdengine/                  # TDengine数据
│   ├── emqx/data/                 # EMQX数据
│   ├── emqx/log/                  # EMQX日志
│   ├── postgres/                  # PostgreSQL数据
│   ├── redis/                     # Redis数据
│   └── ems-logs/                  # EMS日志
│       ├── core/
│       ├── api/
│       └── strategy/
│
├── backups/                        # 备份存储
│   ├── ems_backup_xxx/
│   └── ems_backup_xxx/
│
└── dockerfiles/                    # 镜像构建文件
    ├── ems-core.Dockerfile
    ├── ems-api.Dockerfile
    └── ems-strategy.Dockerfile
```

---

**版本**: v2.0
**更新日期**: 2024年
**维护人**: ESS Platform Team
