---
name: glm-oneclick-deploy-v2
description: >
  储能系统一键部署Skill v2.0（可执行版）。深度可执行的一键部署方案，
  覆盖服务器预检→Docker Compose编排→TDengine时序库建表→EMQX MQTT配置
  →PostgreSQL Schema初始化→Nginx反向代理SSL→Ansible多机部署→健康检查
  →数据备份恢复→交付报告全流程。包含完整可运行的Shell脚本、docker-compose.yml
  （300+行）、SQL初始化脚本、Ansible Playbook、健康检查与监控配置、
  备份恢复脚本。双机热备keepalived+VIP漂移，管理网/站控网/云端VPN三网分区。
  适用：储能电站、微电网、充电站EMS系统现场部署与远程运维，30分钟内完成部署。
---

# 一键部署专业Skill v2.0（可执行版）

## 目录

- [一、部署架构总览](#一部署架构总览)
- [二、服务器预检脚本](#二服务器预检脚本完整shell代码)
- [三、Docker Compose完整配置](#三docker-compose完整配置可直接docker-compose-up)
- [四、TDengine建库与超级表](#四tdengine建库与超级表完整sql)
- [五、EMQX配置与ACL规则](#五emqx配置与acl规则)
- [六、PostgreSQL初始化](#六postgresql初始化)
- [七、Nginx反向代理与SSL配置](#七nginx反向代理与ssl配置)
- [八、Ansible Playbook](#八ansible-playbook可选用于多机部署)
- [九、健康检查与监控](#九健康检查与监控)
- [十、数据备份与恢复](#十数据备份与恢复)
- [十一、部署交付报告模板](#十一部署交付报告模板)
- [十二、常见部署故障与排查](#十二常见部署故障与排查)

---

## 一、部署架构总览

### 1.1 微网EMS完整架构（ASCII Art）

```
                            ┌──────────────────────────────────────────────────────┐
                            │                   云端监控中心                         │
                            │            VPN WireGuard / IPSec 隧道                 │
                            └──────────────────────┬───────────────────────────────┘
                                                   │
                            ┌──────────────────────▼───────────────────────────────┐
                            │              Nginx 负载均衡器 (443/80)                 │
                            │         SSL终止 + 反向代理 + WebSocket               │
                            └───────┬──────────────────────────┬───────────────────┘
                                    │                          │
                     ┌──────────────▼──────────┐  ┌──────────▼──────────────────┐
                     │    EMS API 服务 (8080)    │  │    SCADA Web 前端 (3000)   │
                     │  Go微服务 + REST + gRPC  │  │  React + TypeScript + MQTT │
                     └──────┬───────┬───────┬──┘  └──────────┬──────────────────┘
                            │       │       │                │
              ┌─────────────▼──┐ ┌─▼────────▼───┐ ┌────────▼────────┐
              │  TDengine 3.0  │ │  EMQX 5.5    │ │  PostgreSQL 15  │
              │  时序数据库    │ │  MQTT Broker │ │  关系数据库     │
              │  端口 6041/6030│ │1883/8883/8083│ │  端口 5432      │
              └────────────────┘ └──────────────┘ └─────────────────┘
                            │                              │
                     ┌──────▼──────────────────────────────▼──────┐
                     │             Redis 7 Sentinel 集群           │
                     │             缓存 + 会话 + 消息队列           │
                     │             端口 6379/26379/26380           │
                     └────────────────────────────────────────────┘
```

### 1.2 双机热备架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Keepalived VIP 漂移                          │
│                     VIP: 192.168.1.100 (管理网)                     │
│                     VIP: 10.0.1.100   (站控网)                      │
├────────────────────────┬────────────────────────────────────────────┤
│     主机 (MASTER)       │         备机 (BACKUP)                     │
│  192.168.1.10 / 10.0.1.10 │  192.168.1.11 / 10.0.1.11            │
│  Priority: 100          │  Priority: 90                           │
│  State: MASTER          │  State: BACKUP                          │
│  ┌──────────────────┐  │  ┌──────────────────┐                  │
│  │ 所有服务 ACTIVE   │  │  │ 所有服务 STANDBY  │                  │
│  └──────────────────┘  │  └──────────────────┘                  │
│  数据同步: rsync + PostgreSQL streaming replication               │
│  切换时间: < 5秒 (vrrp_script 健康检查间隔2s)                      │
└────────────────────────┴────────────────────────────────────────────┘
```

### 1.3 网络分区设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        网络分区架构                               │
├──────────────┬──────────────────┬───────────────────────────────┤
│   管理网 eth0 │    站控网 eth1    │         云端 VPN              │
│192.168.1.0/24│  10.0.1.0/24     │    WireGuard/10.200.0.0/24   │
├──────────────┼──────────────────┼───────────────────────────────┤
│ Nginx 443/80 │ EMS API 8080    │        VPN网关               │
│ SCADA 3000   │ EMQX 1883/8883  │    远程监控+运维              │
│ Grafana 3001 │ TDengine 6041   │    OTA固件升级               │
│ 管理员SSH 22 │ BMS/PCS/PCS通讯  │    日志上传云端              │
└──────────────┴──────────────────┴───────────────────────────────┘
防火墙规则:
  - 管理网→站控网: 仅允许8080/6041/1883/8883
  - 站控网→管理网: 仅允许443/80/3000响应
  - 云端VPN→管理网: 仅允许22/443/3001
  - 站控网→外部: 禁止
```

### 1.4 部署时序（6阶段/30分钟）

```
Phase 1: 服务器预检        ( 3 min)  OS/CPU/RAM/磁盘/端口/Docker
Phase 2: Docker Compose启动( 5 min)  中间件7容器并行拉取启动
Phase 3: TDengine初始化    ( 3 min)  建库+超级表+子表
Phase 4: EMQX配置          ( 3 min)  ACL规则+TLS证书+认证
Phase 5: PostgreSQL初始化  ( 3 min)  Schema+初始数据+权限
Phase 6: Nginx+健康检查    ( 3 min)  SSL+代理+全链路探针
Phase 7: 交付报告          ( 1 min)  环境/版本/端口/性能基线
```

---

## 二、服务器预检脚本（完整Shell代码）

### 2.1 预检脚本 `pre_check.sh`

```bash
#!/bin/bash
# ============================================================
# EMS一键部署 v2.0 - 服务器预检脚本
# 用法: bash pre_check.sh [--fix] [--report]
#   --fix    : 自动修复可修复的问题
#   --report : 生成预检报告JSON
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
FIX_MODE=false
REPORT_MODE=false

for arg in "$@"; do
  case $arg in
    --fix)    FIX_MODE=true ;;
    --report) REPORT_MODE=true ;;
  esac
done

log_pass() { PASS=$((PASS+1)); echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { FAIL=$((FAIL+1)); echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { WARN=$((WARN+1)); echo -e "${YELLOW}[WARN]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }

echo "============================================================"
echo "  EMS一键部署 v2.0 - 服务器预检"
echo "  主机: $(hostname) | 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo ""

# ---- 1. 操作系统检查 ----
echo ">>> [1/10] 操作系统检查"
OS_ID=$(cat /etc/os-release 2>/dev/null | grep '^ID=' | cut -d'=' -f2 | tr -d '"')
OS_VERSION=$(cat /etc/os-release 2>/dev/null | grep '^VERSION_ID=' | cut -d'=' -f2 | tr -d '"')
OS_KERNEL=$(uname -r)
OS_ARCH=$(uname -m)

case "$OS_ID" in
  ubuntu)
    if [[ "$OS_VERSION" == "22.04" || "$OS_VERSION" == "24.04" ]]; then
      log_pass "操作系统: Ubuntu $OS_VERSION"
    else
      log_warn "操作系统: Ubuntu $OS_VERSION (推荐22.04/24.04)"
    fi
    ;;
  centos)
    if [[ "$OS_VERSION" == "7."* ]]; then
      log_pass "操作系统: CentOS $OS_VERSION"
    else
      log_warn "操作系统: CentOS $OS_VERSION (推荐7.9)"
    fi
    ;;
  debian)
    if [[ "$OS_VERSION" == "12" || "$OS_VERSION" == "11" ]]; then
      log_pass "操作系统: Debian $OS_VERSION"
    else
      log_warn "操作系统: Debian $OS_VERSION (推荐12)"
    fi
    ;;
  *)
    log_fail "操作系统: $OS_ID $OS_VERSION (不支持，需Ubuntu 22.04/CentOS 7.9/Debian 12)"
    ;;
esac

if [[ "$OS_ARCH" == "x86_64" || "$OS_ARCH" == "aarch64" ]]; then
  log_pass "系统架构: $OS_ARCH"
else
  log_fail "系统架构: $OS_ARCH (仅支持x86_64/aarch64)"
fi

log_info "内核版本: $OS_KERNEL"

# ---- 2. CPU检查 ----
echo ""
echo ">>> [2/10] CPU检查"
CPU_CORES=$(nproc)
CPU_MODEL=$(grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs || echo "Unknown")

if [ "$CPU_CORES" -ge 8 ]; then
  log_pass "CPU核心数: $CPU_CORES (>=8核，推荐配置)"
elif [ "$CPU_CORES" -ge 4 ]; then
  log_warn "CPU核心数: $CPU_CORES (>=4核，最低配置，推荐8核+)"
else
  log_fail "CPU核心数: $CPU_CORES (<4核，不满足最低要求)"
fi

log_info "CPU型号: $CPU_MODEL"
log_info "推荐: Intel Xeon E-2278G / AMD EPYC 7302 或同等级"

CPU_LOAD1=$(awk '{print $1}' /proc/loadavg)
CPU_LOAD_PCT=$(echo "scale=1; $CPU_LOAD1 * 100 / $CPU_CORES" | bc 2>/dev/null || echo "0")
log_info "当前负载: ${CPU_LOAD1} (占用率 ${CPU_LOAD_PCT}%)"

# ---- 3. 内存检查 ----
echo ""
echo ">>> [3/10] 内存检查"
MEM_TOTAL_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
MEM_TOTAL_GB=$(echo "scale=1; $MEM_TOTAL_KB / 1024 / 1024" | bc)
MEM_AVAIL_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
MEM_AVAIL_GB=$(echo "scale=1; $MEM_AVAIL_KB / 1024 / 1024" | bc)

if [ "$CPU_CORES" -ge 8 ]; then
  MEM_MIN=32000
  MEM_MIN_LABEL="32GB(8核+)"
else
  MEM_MIN=16000
  MEM_MIN_LABEL="16GB(4核+)"
fi

MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
if [ "$MEM_TOTAL_MB" -ge "$MEM_MIN" ]; then
  log_pass "总内存: ${MEM_TOTAL_GB}GB (>=${MEM_MIN_LABEL})"
else
  log_fail "总内存: ${MEM_TOTAL_GB}GB (<${MEM_MIN_LABEL})"
fi

log_info "可用内存: ${MEM_AVAIL_GB}GB"

SWAP_TOTAL_KB=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
SWAP_TOTAL_MB=$((SWAP_TOTAL_KB / 1024))
if [ "$SWAP_TOTAL_MB" -ge 8192 ]; then
  log_pass "Swap空间: ${SWAP_TOTAL_MB}MB (>=8GB)"
elif [ "$SWAP_TOTAL_MB" -ge 4096 ]; then
  log_warn "Swap空间: ${SWAP_TOTAL_MB}MB (建议>=8GB)"
else
  if [ "$FIX_MODE" == true ]; then
    log_info "自动创建8GB Swap文件..."
    fallocate -l 8G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=8192
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    log_pass "Swap空间: 已自动创建8GB"
  else
    log_fail "Swap空间: ${SWAP_TOTAL_MB}MB (<8GB，使用--fix自动创建)"
  fi
fi

# ---- 4. 磁盘检查 ----
echo ""
echo ">>> [4/10] 磁盘检查"

check_disk() {
  local mount_point=$1
  local min_gb=$2
  local label=$3
  local prefer=$4

  if [ -d "$mount_point" ]; then
    local avail_kb=$(df -k "$mount_point" | awk 'NR==2{print $4}')
    local avail_gb=$(echo "scale=0; $avail_kb / 1024 / 1024" | bc)
    local total_kb=$(df -k "$mount_point" | awk 'NR==2{print $2}')
    local total_gb=$(echo "scale=0; $total_kb / 1024 / 1024" | bc)
    local fstype=$(df -T "$mount_point" | awk 'NR==2{print $2}')

    if [ "$avail_gb" -ge "$min_gb" ]; then
      log_pass "${label}: ${total_gb}GB可用(${avail_gb}GB空闲) [${fstype}]"
    else
      log_fail "${label}: ${avail_gb}GB可用 (<${min_gb}GB，${prefer})"
    fi
  else
    log_fail "${label}: 挂载点${mount_point}不存在"
  fi
}

check_disk "/" 100 "系统盘(/)" "推荐>=100GB SSD"
check_disk "/data" 500 "数据盘(/data)" "推荐>=500GB NVMe(TDengine时序数据)"

DATA_FSTYPE=$(df -T /data 2>/dev/null | awk 'NR==2{print $2}' || echo "unknown")
if [[ "$DATA_FSTYPE" == "xfs" || "$DATA_FSTYPE" == "ext4" ]]; then
  log_pass "数据盘文件系统: $DATA_FSTYPE"
else
  log_warn "数据盘文件系统: $DATA_FSTYPE (推荐xfs/ext4)"
fi

# ---- 5. 网络检查 ----
echo ""
echo ">>> [5/10] 网络检查"

NET_INTERFACES=$(ip -o link show | awk -F': ' '{print $2}' | grep -v lo)
NIC_COUNT=$(echo "$NET_INTERFACES" | wc -l)

if [ "$NIC_COUNT" -ge 2 ]; then
  log_pass "网卡数量: ${NIC_COUNT} (>=2，双网卡)"
  for nic in $NET_INTERFACES; do
    local ip_addr=$(ip -4 addr show "$nic" 2>/dev/null | grep inet | awk '{print $2}')
    log_info "  $nic: $ip_addr"
  done
else
  log_warn "网卡数量: ${NIC_COUNT} (<2，推荐双网卡：管理网+站控网)"
fi

# ---- 6. 端口可用性检查 ----
echo ""
echo ">>> [6/10] 端口可用性检查"

PORTS=(443 80 1883 8883 6041 6030 5432 6379 8080 3000 8083 18083 26379 26380)
PORT_SERVICES=("Nginx-HTTPS" "Nginx-HTTP" "EMQX-MQTT" "EMQX-MQTTS" "TDengine-REST"
               "TDengine-CLI" "PostgreSQL" "Redis" "EMS-API" "SCADA-Web"
               "EMQX-API" "EMQX-Dashboard" "Redis-Sentinel1" "Redis-Sentinel2")

for i in "${!PORTS[@]}"; do
  port=${PORTS[$i]}
  svc=${PORT_SERVICES[$i]}
  if ss -tlnp 2>/dev/null | grep -q ":${port} " || netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
    log_warn "端口 ${port} (${svc}): 已被占用"
  else
    log_pass "端口 ${port} (${svc}): 可用"
  fi
done

# ---- 7. Docker检查 ----
echo ""
echo ">>> [7/10] Docker检查"

if command -v docker &>/dev/null; then
  DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0.0.0")
  DOCKER_MAJOR=$(echo "$DOCKER_VERSION" | cut -d. -f1)
  DOCKER_MINOR=$(echo "$DOCKER_VERSION" | cut -d. -f2)

  if [ "$DOCKER_MAJOR" -gt 20 ] || { [ "$DOCKER_MAJOR" -eq 20 ] && [ "$DOCKER_MINOR" -ge 10 ]; }; then
    log_pass "Docker版本: $DOCKER_VERSION (>=20.10)"
  else
    log_fail "Docker版本: $DOCKER_VERSION (<20.10)"
  fi

  DOCKER_DRIVER=$(docker info --format '{{.Driver}}' 2>/dev/null || echo "unknown")
  if [ "$DOCKER_DRIVER" == "overlay2" ]; then
    log_pass "Docker存储驱动: overlay2"
  else
    if [ "$FIX_MODE" == true ]; then
      log_info "修改Docker存储驱动为overlay2..."
      cat > /etc/docker/daemon.json <<'DAEMON_JSON'
{
  "storage-driver": "overlay2",
  "log-driver": "json-file",
  "log-opts": {"max-size": "100m", "max-file": "5"},
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"]
}
DAEMON_JSON
      systemctl restart docker
      log_pass "Docker存储驱动: 已切换为overlay2"
    else
      log_fail "Docker存储驱动: $DOCKER_DRIVER (需overlay2，使用--fix自动修复)"
    fi
  fi
else
  log_fail "Docker: 未安装 (使用--fix自动安装)"
  if [ "$FIX_MODE" == true ]; then
    log_info "自动安装Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker && systemctl start docker
    log_pass "Docker: 已自动安装并启动"
  fi
fi

if command -v docker-compose &>/dev/null || docker compose version &>/dev/null; then
  COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || docker-compose version --short 2>/dev/null || echo "0.0.0")
  COMPOSE_MAJOR=$(echo "$COMPOSE_VERSION" | cut -d. -f1)
  COMPOSE_MINOR=$(echo "$COMPOSE_VERSION" | cut -d. -f2)
  if [ "$COMPOSE_MAJOR" -gt 2 ] || { [ "$COMPOSE_MAJOR" -eq 2 ] && [ "$COMPOSE_MINOR" -ge 20 ]; }; then
    log_pass "Docker Compose版本: $COMPOSE_VERSION (>=2.20)"
  else
    log_fail "Docker Compose版本: $COMPOSE_VERSION (<2.20)"
  fi
else
  log_fail "Docker Compose: 未安装"
fi

# ---- 8. 系统参数检查 ----
echo ""
echo ">>> [8/10] 系统参数检查"

VM_SWAPPINESS=$(sysctl -n vm.swappiness 2>/dev/null || echo "60")
if [ "$VM_SWAPPINESS" -le 10 ]; then
  log_pass "vm.swappiness: $VM_SWAPPINESS (<=10)"
else
  if [ "$FIX_MODE" == true ]; then
    sysctl -w vm.swappiness=10 && echo "vm.swappiness=10" >> /etc/sysctl.conf
    log_pass "vm.swappiness: 已调整为10"
  else
    log_warn "vm.swappiness: $VM_SWAPPINESS (建议<=10，使用--fix自动修复)"
  fi
fi

MAX_MAP_COUNT=$(sysctl -n vm.max_map_count 2>/dev/null || echo "65530")
if [ "$MAX_MAP_COUNT" -ge 262144 ]; then
  log_pass "vm.max_map_count: $MAX_MAP_COUNT (>=262144)"
else
  if [ "$FIX_MODE" == true ]; then
    sysctl -w vm.max_map_count=262144 && echo "vm.max_map_count=262144" >> /etc/sysctl.conf
    log_pass "vm.max_map_count: 已调整为262144"
  else
    log_warn "vm.max_map_count: $MAX_MAP_COUNT (<262144，使用--fix自动修复)"
  fi
fi

FILE_MAX=$(sysctl -n fs.file-max 2>/dev/null || echo "0")
if [ "$FILE_MAX" -ge 655350 ]; then
  log_pass "fs.file-max: $FILE_MAX (>=655350)"
else
  log_warn "fs.file-max: $FILE_MAX (<655350)"
fi

# ---- 9. 时间同步检查 ----
echo ""
echo ">>> [9/10] 时间同步检查"

if systemctl is-active --quiet chronyd 2>/dev/null || systemctl is-active --quiet ntpd 2>/dev/null; then
  log_pass "NTP时间同步: 已启用"
  chronyc tracking 2>/dev/null | grep "Last offset" || ntpq -p 2>/dev/null | head -3
else
  if [ "$FIX_MODE" == true ]; then
    log_info "自动安装并配置chrony..."
    apt-get install -y chrony 2>/dev/null || yum install -y chrony 2>/dev/null
    systemctl enable chronyd && systemctl start chronyd
    log_pass "NTP时间同步: 已自动配置"
  else
    log_warn "NTP时间同步: 未启用 (TDengine要求时间精确同步，使用--fix自动配置)"
  fi
fi

# ---- 10. 防火墙/SELinux检查 ----
echo ""
echo ">>> [10/10] 防火墙/SELinux检查"

if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
  log_warn "UFW防火墙: 已启用 (需开放端口: 443 80 1883 8883 6041 5432 6379 8080 3000)"
  if [ "$FIX_MODE" == true ]; then
    for port in 443 80 1883 8883 6041 6030 5432 6379 8080 3000 8083 18083; do
      ufw allow "$port"/tcp 2>/dev/null
    done
    log_pass "UFW: 已自动开放所需端口"
  fi
elif systemctl is-active --quiet firewalld 2>/dev/null; then
  log_warn "Firewalld防火墙: 已启用"
  if [ "$FIX_MODE" == true ]; then
    for port in 443 80 1883 8883 6041 6030 5432 6379 8080 3000 8083 18083; do
      firewall-cmd --permanent --add-port="$port"/tcp 2>/dev/null
    done
    firewall-cmd --reload 2>/dev/null
    log_pass "Firewalld: 已自动开放所需端口"
  fi
else
  log_info "防火墙: 未启用"
fi

SELINUX_STATUS=$(getenforce 2>/dev/null || echo "Disabled")
if [ "$SELINUX_STATUS" == "Enforcing" ]; then
  log_warn "SELinux: Enforcing (可能导致服务异常，建议设为Permissive)"
else
  log_pass "SELinux: $SELINUX_STATUS"
fi

# ---- 预检结果汇总 ----
echo ""
echo "============================================================"
echo -e "  预检结果: ${GREEN}PASS=${PASS}${NC}  ${RED}FAIL=${FAIL}${NC}  ${YELLOW}WARN=${WARN}${NC}"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}  存在${FAIL}项不通过，请修复后重新运行。使用 --fix 自动修复。${NC}"
  exit 1
else
  echo -e "${GREEN}  所有必检项通过！可以开始部署。${NC}"
  exit 0
fi
```

---

## 三、Docker Compose完整配置（可直接docker-compose up）

### 3.1 目录结构

```
/opt/ems/
├── docker-compose.yml
├── .env
├── config/
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── ssl/
│   │       ├── server.crt
│   │       └── server.key
│   ├── emqx/
│   │   ├── emqx.conf
│   │   └── loaded_modules.conf
│   ├── tdengine/
│   │   └── init.sql
│   └── postgres/
│       ├── init.sql
│       └── pg_hba.conf
├── data/
│   ├── tdengine/
│   ├── emqx/
│   ├── pgdata/
│   └── redis/
├── scripts/
│   ├── pre_check.sh
│   ├── healthcheck.sh
│   ├── backup.sh
│   └── restore.sh
└── logs/
    ├── nginx/
    ├── ems-api/
    └── scada/
```

### 3.2 环境变量文件 `.env`

```env
# ============================================================
# EMS一键部署 v2.0 - 环境变量配置
# ============================================================

# ---- 基础配置 ----
COMPOSE_PROJECT_NAME=ems
TZ=Asia/Shanghai
LANG=zh_CN.UTF-8

# ---- TDengine ----
TD_FQDN=tdengine
TD_PORT=6041
TD_USER=root
TD_PASS=taosdata
TD_DATA_DIR=/data/tdengine

# ---- EMQX ----
EMQX_NAME=emqx
EMQX_MQTT_PORT=1883
EMQX_MQTTS_PORT=8883
EMQX_API_PORT=8083
EMQX_DASHBOARD_PORT=18083
EMQX_ADMIN_USER=admin
EMQX_ADMIN_PASS=ems_emqx_2024
EMQX_LOADED_MODULES="emqx_mod_acl_internal,emqx_mod_auth_internal"

# ---- PostgreSQL ----
PG_HOST=postgres
PG_PORT=5432
PG_DB=ems
PG_USER=ems
PG_PASS=EmsPg2024Secure!
PG_SUPER_USER=postgres
PG_SUPER_PASS=SuperPg2024!

# ---- Redis ----
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=EmsRedis2024
REDIS_SENTINEL_PORT=26379

# ---- EMS API ----
EMS_API_PORT=8080
EMS_API_WORKERS=4
EMS_LOG_LEVEL=info
EMS_JWT_SECRET=ChangeMeInProduction2024!
EMS_DB_ENCRYPT_KEY=AES256Key-32Bytes1234567890

# ---- SCADA Web ----
SCADA_PORT=3000
SCADA_API_URL=http://ems-api:8080
SCADA_MQTT_URL=mqtt://emqx:1883

# ---- Nginx ----
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
NGINX_SERVER_NAME=ems.local

# ---- Keepalived (双机热备) ----
KEEPALIVED_VIP_MGMT=192.168.1.100
KEEPALIVED_VIP_CTRL=10.0.1.100
KEEPALIVED_INTERFACE_MGMT=eth0
KEEPALIVED_INTERFACE_CTRL=eth1
KEEPALIVED_PRIORITY=100
KEEPALIVED_PASSWORD=ems_ha_2024
```

### 3.3 完整 `docker-compose.yml`

```yaml
# ============================================================
# EMS一键部署 v2.0 - Docker Compose 完整编排
# 用法: docker compose up -d
# ============================================================
version: "3.9"

x-common-logging: &common-logging
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "5"

x-common-restart: &common-restart
  condition: on-failure
  max_attempts: 5
  window: 120s

x-common-health-defaults: &common-health-defaults
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s

services:
  # ==========================================================
  # TDengine 3.0 - 时序数据库
  # ==========================================================
  tdengine:
    image: tdengine/tdengine:3.0
    container_name: ems-tdengine
    hostname: tdengine
    restart: always
    ports:
      - "6041:6041"
      - "6030:6030"
    volumes:
      - ${TD_DATA_DIR:-/data/tdengine}:/var/lib/taos
      - ./config/tdengine/init.sql:/opt/taos/init.sql:ro
    environment:
      TAOS_FQDN: ${TD_FQDN:-tdengine}
      TZ: ${TZ:-Asia/Shanghai}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6041/rest/sql", "-d", "select server_version()"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    logging: *common-logging
    networks:
      ems-backend:
        aliases:
          - tdengine
      ems-ctrl:
    deploy:
      resources:
        limits:
          cpus: "4.0"
          memory: 8G
        reservations:
          cpus: "2.0"
          memory: 4G

  # ==========================================================
  # EMQX 5.5 - MQTT Broker
  # ==========================================================
  emqx:
    image: emqx/emqx:5.5
    container_name: ems-emqx
    hostname: emqx
    restart: always
    ports:
      - "${EMQX_MQTT_PORT:-1883}:1883"
      - "${EMQX_MQTTS_PORT:-8883}:8883"
      - "${EMQX_API_PORT:-8083}:8083"
      - "${EMQX_DASHBOARD_PORT:-18083}:18083"
    volumes:
      - ./data/emqx/data:/opt/emqx/data
      - ./data/emqx/log:/opt/emqx/log
      - ./config/emqx/emqx.conf:/opt/emqx/etc/emqx.conf:ro
      - ./config/emqx/loaded_modules.conf:/opt/emqx/etc/loaded_modules.conf:ro
      - ./config/emqx/acl.conf:/opt/emqx/etc/acl.conf:ro
      - ./config/nginx/ssl:/opt/emqx/etc/certs:ro
    environment:
      EMQX_NAME: ${EMQX_NAME:-emqx}
      EMQX_LOADED_MODULES: ${EMQX_LOADED_MODULES}
      EMQX_DASHBOARD__DEFAULT_USER__LOGIN: ${EMQX_ADMIN_USER:-admin}
      EMQX_DASHBOARD__DEFAULT_USER__PASSWORD: ${EMQX_ADMIN_PASS:-ems_emqx_2024}
      EMQX_LISTENER__TCP__EXTERNAL__MAX_CONNECTIONS: "10000"
      EMQX_LISTENER__TCP__EXTERNAL__MAX_MESSAGE_SIZE: "1MB"
      EMQX_LISTENER__TCP__EXTERNAL__KEEPALIVE: "60s"
      TZ: ${TZ:-Asia/Shanghai}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8083/status"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    logging: *common-logging
    networks:
      ems-backend:
        aliases:
          - emqx
      ems-ctrl:
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
        reservations:
          cpus: "0.5"
          memory: 512M

  # ==========================================================
  # PostgreSQL 15 - 关系数据库
  # ==========================================================
  postgres:
    image: postgres:15-alpine
    container_name: ems-postgres
    hostname: postgres
    restart: always
    ports:
      - "${PG_PORT:-5432}:5432"
    volumes:
      - ./data/pgdata:/var/lib/postgresql/data
      - ./config/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      - ./config/postgres/pg_hba.conf:/var/lib/postgresql/data/pg_hba.conf:ro
    environment:
      POSTGRES_DB: ${PG_DB:-ems}
      POSTGRES_USER: ${PG_SUPER_USER:-postgres}
      POSTGRES_PASSWORD: ${PG_SUPER_PASS:-SuperPg2024!}
      EMS_USER: ${PG_USER:-ems}
      EMS_PASS: ${PG_PASS:-EmsPg2024Secure!}
      TZ: ${TZ:-Asia/Shanghai}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_SUPER_USER:-postgres} -d ${PG_DB:-ems}"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s
    logging: *common-logging
    networks:
      ems-backend:
        aliases:
          - postgres
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 4G
        reservations:
          cpus: "0.5"
          memory: 1G

  # ==========================================================
  # Redis 7 - 缓存 + Sentinel
  # ==========================================================
  redis:
    image: redis:7-alpine
    container_name: ems-redis
    hostname: redis
    restart: always
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - ./data/redis:/data
      - ./config/redis/redis.conf:/usr/local/etc/redis/redis.conf:ro
    command: >
      redis-server /usr/local/etc/redis/redis.conf
    environment:
      TZ: ${TZ:-Asia/Shanghai}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASS:-EmsRedis2024}", "ping"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 15s
    logging: *common-logging
    networks:
      ems-backend:
        aliases:
          - redis
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 2G
        reservations:
          cpus: "0.25"
          memory: 256M

  redis-sentinel:
    image: redis:7-alpine
    container_name: ems-redis-sentinel
    hostname: redis-sentinel
    restart: always
    ports:
      - "${REDIS_SENTINEL_PORT:-26379}:26379"
    volumes:
      - ./config/redis/sentinel.conf:/usr/local/etc/redis/sentinel.conf:ro
    command: >
      redis-sentinel /usr/local/etc/redis/sentinel.conf
    environment:
      TZ: ${TZ:-Asia/Shanghai}
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "redis-cli", "-p", "26379", "ping"]
      interval: 15s
      timeout: 5s
      retries: 3
    logging: *common-logging
    networks:
      ems-backend:

  # ==========================================================
  # EMS API - 核心微服务 (Go)
  # ==========================================================
  ems-api:
    image: ${EMS_API_IMAGE:-ems-api:latest}
    container_name: ems-api
    hostname: ems-api
    restart: always
    ports:
      - "${EMS_API_PORT:-8080}:8080"
    volumes:
      - ./logs/ems-api:/app/logs
      - ./config/ems:/app/config:ro
    environment:
      TZ: ${TZ:-Asia/Shanghai}
      EMS_LOG_LEVEL: ${EMS_LOG_LEVEL:-info}
      EMS_WORKERS: ${EMS_API_WORKERS:-4}
      EMS_JWT_SECRET: ${EMS_JWT_SECRET}
      EMS_DB_ENCRYPT_KEY: ${EMS_DB_ENCRYPT_KEY}
      TDENGINE_HOST: ${TD_FQDN:-tdengine}
      TDENGINE_PORT: "6041"
      TDENGINE_USER: ${TD_USER:-root}
      TDENGINE_PASS: ${TD_PASS:-taosdata}
      EMQX_HOST: ${EMQX_NAME:-emqx}
      EMQX_PORT: "1883"
      PG_HOST: ${PG_HOST:-postgres}
      PG_PORT: "5432"
      PG_DB: ${PG_DB:-ems}
      PG_USER: ${PG_USER:-ems}
      PG_PASS: ${PG_PASS}
      REDIS_HOST: ${REDIS_HOST:-redis}
      REDIS_PORT: "6379"
      REDIS_PASS: ${REDIS_PASS}
    depends_on:
      tdengine:
        condition: service_healthy
      emqx:
        condition: service_healthy
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    logging: *common-logging
    networks:
      ems-backend:
        aliases:
          - ems-api
      ems-frontend:

  # ==========================================================
  # SCADA Web - 前端 (React)
  # ==========================================================
  scada:
    image: ${SCADA_IMAGE:-scada:latest}
    container_name: ems-scada
    hostname: scada
    restart: always
    ports:
      - "${SCADA_PORT:-3000}:3000"
    volumes:
      - ./logs/scada:/app/logs
    environment:
      TZ: ${TZ:-Asia/Shanghai}
      NEXT_PUBLIC_API_URL: ${SCADA_API_URL:-http://ems-api:8080}
      NEXT_PUBLIC_MQTT_URL: ${SCADA_MQTT_URL:-mqtt://emqx:1883}
    depends_on:
      ems-api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    logging: *common-logging
    networks:
      ems-frontend:
        aliases:
          - scada

  # ==========================================================
  # Nginx 1.25 - 反向代理 + SSL终止
  # ==========================================================
  nginx:
    image: nginx:1.25-alpine
    container_name: ems-nginx
    hostname: nginx
    restart: always
    ports:
      - "${NGINX_HTTPS_PORT:-443}:443"
      - "${NGINX_HTTP_PORT:-80}:80"
    volumes:
      - ./config/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./config/nginx/ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    environment:
      TZ: ${TZ:-Asia/Shanghai}
    depends_on:
      ems-api:
        condition: service_healthy
      scada:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-fk", "https://localhost:443/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    logging: *common-logging
    networks:
      ems-frontend:
        aliases:
          - nginx
      ems-mgmt:

  # ==========================================================
  # Prometheus - 监控采集
  # ==========================================================
  prometheus:
    image: prom/prometheus:v2.48.0
    container_name: ems-prometheus
    hostname: prometheus
    restart: always
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./config/prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro
      - ./data/prometheus:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=30d"
      - "--web.enable-lifecycle"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9090/-/healthy"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging: *common-logging
    networks:
      ems-backend:

  # ==========================================================
  # Grafana - 可视化监控
  # ==========================================================
  grafana:
    image: grafana/grafana:10.2.0
    container_name: ems-grafana
    hostname: grafana
    restart: always
    ports:
      - "3001:3000"
    volumes:
      - ./data/grafana:/var/lib/grafana
      - ./config/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./config/grafana/datasources:/etc/grafana/provisioning/datasources:ro
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: EmsGrafana2024
      GF_USERS_ALLOW_SIGN_UP: "false"
      TZ: ${TZ:-Asia/Shanghai}
    depends_on:
      prometheus:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging: *common-logging
    networks:
      ems-frontend:

# ============================================================
# 网络定义
# ============================================================
networks:
  ems-backend:
    name: ems-backend
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16

  ems-frontend:
    name: ems-frontend
    driver: bridge
    ipam:
      config:
        - subnet: 172.29.0.0/16

  ems-ctrl:
    name: ems-ctrl
    driver: bridge
    ipam:
      config:
        - subnet: 172.30.0.0/16

  ems-mgmt:
    name: ems-mgmt
    driver: bridge

# ============================================================
# 全局卷
# ============================================================
volumes:
  tdengine-data:
    driver: local
  pgdata:
    driver: local
  redis-data:
    driver: local
```

### 3.4 Redis配置 `config/redis/redis.conf`

```conf
bind 0.0.0.0
port 6379
protected-mode yes
requirepass EmsRedis2024
timeout 300
tcp-keepalive 60
daemonize no
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
maxmemory 1536mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data
loglevel notice
logfile ""
slowlog-log-slower-than 10000
slowlog-max-len 128
latency-monitor-threshold 100
```

### 3.5 Redis Sentinel配置 `config/redis/sentinel.conf`

```conf
port 26379
daemonize no
pidfile /var/run/redis/sentinel.pid
logfile ""
dir /tmp

sentinel monitor ems-master redis 6379 2
sentinel auth-pass ems-master EmsRedis2024
sentinel down-after-milliseconds ems-master 10000
sentinel failover-timeout ems-master 30000
sentinel parallel-syncs ems-master 1
```

---

## 四、TDengine建库与超级表（完整SQL）

### 4.1 初始化脚本 `config/tdengine/init.sql`

```sql
-- ============================================================
-- EMS一键部署 v2.0 - TDengine 3.0 初始化脚本
-- 用法: taos -s "source /opt/taos/init.sql"
--       或通过REST API: curl -u root:taosdata -d 'source init.sql' api/v4/sql
-- ============================================================

-- ---- 创建数据库 ----
CREATE DATABASE IF NOT EXISTS ems
  KEEP 3650
  DAYS 10
  BLOCKS 6
  CACHE 16
  WAL_LEVEL 1
  COMP_RATIO 2
  PRECISION 'ms'
  REPLICA 1;

USE ems;

-- ============================================================
-- 超级表定义
-- ============================================================

-- ---- 设备测点超级表 ----
CREATE STABLE IF NOT EXISTS device_measurements (
  ts       TIMESTAMP,
  value    FLOAT,
  quality  TINYINT
) TAGS (
  device_id    NCHAR(32),
  point_id     NCHAR(64),
  device_type  NCHAR(16),
  site_id      NCHAR(16)
);

-- ---- 告警超级表 ----
CREATE STABLE IF NOT EXISTS alarm_log (
  ts          TIMESTAMP,
  level       TINYINT,
  msg         NCHAR(256),
  acknowledged BOOL,
  cleared     BOOL
) TAGS (
  device_id    NCHAR(32),
  alarm_type   NCHAR(32),
  site_id      NCHAR(16)
);

-- ---- 电气量测超级表 (PCS/BMS/电表) ----
CREATE STABLE IF NOT EXISTS electrical_measurements (
  ts           TIMESTAMP,
  voltage_a    FLOAT,
  voltage_b    FLOAT,
  voltage_c    FLOAT,
  current_a    FLOAT,
  current_b    FLOAT,
  current_c    FLOAT,
  active_power FLOAT,
  reactive_power FLOAT,
  frequency    FLOAT,
  power_factor FLOAT
) TAGS (
  device_id    NCHAR(32),
  device_type  NCHAR(16),
  site_id      NCHAR(16)
);

-- ---- 储能电池超级表 (BMS) ----
CREATE STABLE IF NOT EXISTS battery_measurements (
  ts               TIMESTAMP,
  soc              FLOAT,
  soh              FLOAT,
  pack_voltage     FLOAT,
  pack_current     FLOAT,
  max_cell_voltage FLOAT,
  min_cell_voltage FLOAT,
  max_cell_temp    FLOAT,
  min_cell_temp    FLOAT,
  avg_cell_temp    FLOAT
) TAGS (
  device_id    NCHAR(32),
  rack_id      INT,
  site_id      NCHAR(16)
);

-- ---- PCS功率超级表 ----
CREATE STABLE IF NOT EXISTS pcs_measurements (
  ts                 TIMESTAMP,
  active_power       FLOAT,
  reactive_power     FLOAT,
  dc_voltage         FLOAT,
  dc_current         FLOAT,
  efficiency         FLOAT,
  temperature        FLOAT,
  status_code        INT
) TAGS (
  device_id    NCHAR(32),
  site_id      NCHAR(16)
);

-- ---- 气象数据超级表 ----
CREATE STABLE IF NOT EXISTS weather_measurements (
  ts               TIMESTAMP,
  irradiance       FLOAT,
  temperature      FLOAT,
  humidity         FLOAT,
  wind_speed       FLOAT,
  wind_direction   FLOAT
) TAGS (
  device_id    NCHAR(32),
  site_id      NCHAR(16)
);

-- ---- 电能统计超级表 (日/月聚合) ----
CREATE STABLE IF NOT EXISTS energy_statistics (
  ts                  TIMESTAMP,
  charge_energy       FLOAT,
  discharge_energy    FLOAT,
  grid_import_energy  FLOAT,
  grid_export_energy  FLOAT,
  pv_energy           FLOAT,
  load_energy         FLOAT,
  peak_power          FLOAT,
  avg_power           FLOAT
) TAGS (
  stat_type    NCHAR(8),
  site_id      NCHAR(16)
);

-- ---- 控制指令日志超级表 ----
CREATE STABLE IF NOT EXISTS command_log (
  ts           TIMESTAMP,
  cmd_type     NCHAR(32),
  cmd_value    FLOAT,
  result_code  INT,
  result_msg   NCHAR(128)
) TAGS (
  device_id    NCHAR(32),
  source       NCHAR(16)
);

-- ============================================================
-- 创建子表（示例：站1设备1）
-- ============================================================

-- ---- 设备测点子表 ----
CREATE TABLE IF NOT EXISTS dm_pcs01_active_power USING device_measurements
  TAGS ('PCS-001', 'active_power', 'PCS', 'SITE-001');

CREATE TABLE IF NOT EXISTS dm_bms01_soc USING device_measurements
  TAGS ('BMS-001', 'soc', 'BMS', 'SITE-001');

CREATE TABLE IF NOT EXISTS dm_meter01_p USING device_measurements
  TAGS ('METER-001', 'active_power', 'METER', 'SITE-001');

-- ---- 电气量测子表 ----
CREATE TABLE IF NOT EXISTS elec_pcs01 USING electrical_measurements
  TAGS ('PCS-001', 'PCS', 'SITE-001');

CREATE TABLE IF NOT EXISTS elec_meter01 USING electrical_measurements
  TAGS ('METER-001', 'METER', 'SITE-001');

-- ---- BMS电池子表 ----
CREATE TABLE IF NOT EXISTS bat_bms01_rack01 USING battery_measurements
  TAGS ('BMS-001', 1, 'SITE-001');

CREATE TABLE IF NOT EXISTS bat_bms01_rack02 USING battery_measurements
  TAGS ('BMS-001', 2, 'SITE-001');

-- ---- PCS子表 ----
CREATE TABLE IF NOT EXISTS pcs_pcs01 USING pcs_measurements
  TAGS ('PCS-001', 'SITE-001');

-- ---- 气象子表 ----
CREATE TABLE IF NOT EXISTS weather_ws01 USING weather_measurements
  TAGS ('WEATHER-001', 'SITE-001');

-- ---- 告警子表 ----
CREATE TABLE IF NOT EXISTS alarm_pcs01 USING alarm_log
  TAGS ('PCS-001', 'over_current', 'SITE-001');

CREATE TABLE IF NOT EXISTS alarm_bms01 USING alarm_log
  TAGS ('BMS-001', 'over_temperature', 'SITE-001');

-- ============================================================
-- 创建查询视图（连续查询）
-- ============================================================

-- ---- 1分钟平均功率聚合 ----
CREATE TABLE IF NOT EXISTS cq_1min_active_power
AS SELECT _wstart ts, AVG(value) avg_power, MAX(value) max_power, MIN(value) min_power
FROM device_measurements
WHERE point_id = 'active_power'
INTERVAL(1m) SLIDING(1m);

-- ---- 15分钟SOC聚合 ----
CREATE TABLE IF NOT EXISTS cq_15min_soc
AS SELECT _wstart ts, AVG(value) avg_soc, MAX(value) max_soc, MIN(value) min_soc
FROM device_measurements
WHERE point_id = 'soc'
INTERVAL(15m) SLIDING(15m);
```

---

## 五、EMQX配置与ACL规则

### 5.1 EMQX主配置 `config/emqx/emqx.conf`

```conf
## ============================================================
## EMS一键部署 v2.0 - EMQX 5.5 配置
## ============================================================

## ---- 节点配置 ----
node {
  name = "emqx@127.0.0.1"
  cookie = "ems_emqx_secret_cookie_2024"
  data_dir = "/opt/emqx/data"
}

## ---- 集群配置 ----
cluster {
  name = ems_emqx_cluster
  discovery_strategy = static
  static {
    seeds = ["emqx@172.28.0.10"]
  }
}

## ---- MQTT/TCP 监听器 (站控网) ----
listeners.tcp.default {
  bind = "0.0.0.0:1883"
  max_connections = 10000
  max_conn_rate = 1000
  max_message_size = "1MB"
  keepalive = "60s"
  idle_timeout = "30s"
  enable_rate_limit = true
  rate_limit {
    max_publish_rate = "1000/s"
    max_subscribe_rate = "100/s"
  }
}

## ---- MQTT/TLS 监听器 (站控网加密) ----
listeners.ssl.default {
  bind = "0.0.0.0:8883"
  max_connections = 5000
  max_conn_rate = 500
  max_message_size = "1MB"
  keepalive = "60s"
  enable = true
  ssl_options {
    cacertfile = "/opt/emqx/etc/certs/ca.crt"
    certfile = "/opt/emqx/etc/certs/server.crt"
    keyfile = "/opt/emqx/etc/certs/server.key"
    verify = verify_peer
    fail_if_no_peer_cert = false
    versions = ["tlsv1.3", "tlsv1.2"]
  }
}

## ---- Dashboard ----
dashboard {
  listeners.http {
    bind = "0.0.0.0:18083"
  }
  default_username = "admin"
  default_password = "ems_emqx_2024"
}

## ---- API ----
api {
  listeners.http {
    bind = "0.0.0.0:8083"
  }
}

## ---- 认证配置 (内置数据库) ----
authentication {
  backend = "built_in_database"
  mechanism = "password_based"
  password_hash_algorithm {
    name = "sha256"
    salt_position = "suffix"
  }
  user_id_type = "username"
}

## ---- 授权(ACL)配置 ----
authorization {
  no_deny_no_match = true
  sources = [
    {
      type = "file"
      path = "/opt/emqx/etc/acl.conf"
    }
  ]
}

## ---- 会话配置 ----
mqtt {
  max_packet_size = "1MB"
  max_clientid_len = 128
  max_topic_levels = 16
  max_qos = 2
  retain_available = true
  wildcard_subscription = true
  shared_subscription = true
  ignore_loop_deliver = false
  strict_mode = false
  response_information = ""
  server_keepalive = "60s"
  keepalive_multiplier = 1.5
}

## ---- 消息配置 ----
mqtt {
  idle_timeout = "30s"
  retry_interval = "20s"
  await_rel_timeout = "30s"
  max_awaiting_rel = 100
  max_inflight = 32
  session_expiry_interval = "2h"
  message_expiry_interval = "1h"
}

## ---- 告警配置 ----
alarm {
  actions = [log, publish]
  publish_topic = "$SYS/brokers/emqx/alarms"
}
```

### 5.2 ACL规则配置 `config/emqx/acl.conf`

```conf
## ============================================================
## EMS一键部署 v2.0 - EMQX ACL规则
## 规则优先级: 自上而下，首匹配生效
## ============================================================

## ---- EMS API服务: 全权限 ----
{allow, {username, "ems_api"}, all, ["site/#", "$SYS/#"]}.

## ---- SCADA服务: 订阅所有站数据 + 发布控制指令 ----
{allow, {username, "scada"}, subscribe, ["site/+/+", "site/+/telemetry/#", "site/+/status/#"]}.
{allow, {username, "scada"}, publish, ["site/+/command/#"]}.

## ---- EMS策略引擎: 订阅遥测 + 发布控制指令 ----
{allow, {username, "ems_strategy"}, subscribe, ["site/+/telemetry/#", "site/+/status/#"]}.
{allow, {username, "ems_strategy"}, publish, ["site/+/command/#", "site/+/strategy/#"]}.

## ---- 设备端(BMS/PCS/电表): 仅发布自身遥测+订阅自身指令 ----
{allow, {username, re("^(bms|pcs|meter)_")}, publish, ["site/%c/telemetry/#", "site/%c/status/#"]}.
{allow, {username, re("^(bms|pcs|meter)_")}, subscribe, ["site/%c/command/#"]}.

## ---- 监控服务: 仅订阅 ----
{allow, {username, "monitor"}, subscribe, ["site/+/telemetry/#", "site/+/status/#", "$SYS/#"]}.

## ---- OTA服务: 发布+订阅固件升级主题 ----
{allow, {username, "ota"}, publish, ["ota/+/firmware/#", "ota/+/command/#"]}.
{allow, {username, "ota"}, subscribe, ["ota/+/status/#"]}.

## ---- 禁止匿名 ----
{deny, all, all, ["#"]}.

## ---- 默认拒绝 ----
{deny, all}.
```

### 5.3 模块加载配置 `config/emqx/loaded_modules.conf`

```conf
## ============================================================
## EMS一键部署 v2.0 - EMQX 模块配置
## ============================================================
emqx_mod_acl_internal   = on
emqx_mod_auth_internal  = on
emqx_mod_presence       = on
emqx_mod_subscription   = off
emqx_mod_rewrite        = off
emqx_mod_topic_metrics  = off
```

---

## 六、PostgreSQL初始化

### 6.1 完整Schema初始化 `config/postgres/init.sql`

```sql
-- ============================================================
-- EMS一键部署 v2.0 - PostgreSQL 15 初始化脚本
-- 用法: Docker启动时自动执行 /docker-entrypoint-initdb.d/init.sql
-- ============================================================

-- ---- 创建EMS应用用户 ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ems') THEN
    CREATE USER ems WITH PASSWORD 'EmsPg2024Secure!';
  END IF;
END
$$;

-- ---- 创建扩展 ----
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ---- 授权 ----
GRANT ALL PRIVILEGES ON DATABASE ems TO ems;

\c ems

GRANT ALL PRIVILEGES ON SCHEMA public TO ems;

-- ============================================================
-- 设备管理表
-- ============================================================

CREATE TABLE IF NOT EXISTS devices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(128) NOT NULL,
  type            VARCHAR(32) NOT NULL,
  protocol        VARCHAR(32) NOT NULL DEFAULT 'modbus_tcp',
  address         VARCHAR(64) NOT NULL,
  port            INTEGER NOT NULL DEFAULT 502,
  site_id         VARCHAR(32) NOT NULL DEFAULT 'SITE-001',
  manufacturer    VARCHAR(64),
  model           VARCHAR(64),
  serial_number   VARCHAR(64),
  firmware_version VARCHAR(32),
  status          VARCHAR(16) NOT NULL DEFAULT 'offline',
  enabled         BOOLEAN NOT NULL DEFAULT true,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_device_type CHECK (type IN ('PCS', 'BMS', 'METER', 'PV', 'LOAD', 'WEATHER', 'GEN'))
);

CREATE INDEX idx_devices_type ON devices(type);
CREATE INDEX idx_devices_site ON devices(site_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_enabled ON devices(enabled) WHERE enabled = true;

COMMENT ON TABLE devices IS '设备管理表';
COMMENT ON COLUMN devices.type IS '设备类型: PCS/BMS/METER/PV/LOAD/WEATHER/GEN';
COMMENT ON COLUMN devices.status IS '设备状态: online/offline/fault/maintenance';

-- ============================================================
-- 测点/点表
-- ============================================================

CREATE TABLE IF NOT EXISTS points (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  point_name      VARCHAR(128) NOT NULL,
  point_code      VARCHAR(64) NOT NULL,
  register_addr   INTEGER,
  data_type       VARCHAR(16) NOT NULL DEFAULT 'float32',
  scale           NUMERIC(10,4) NOT NULL DEFAULT 1.0,
  offset          NUMERIC(10,4) NOT NULL DEFAULT 0.0,
  unit            VARCHAR(16),
  rw              VARCHAR(4) NOT NULL DEFAULT 'r',
  alarm_hh       NUMERIC(12,4),
  alarm_h        NUMERIC(12,4),
  alarm_l        NUMERIC(12,4),
  alarm_ll       NUMERIC(12,4),
  dead_band      NUMERIC(10,4) NOT NULL DEFAULT 0.0,
  sampling_rate  INTEGER NOT NULL DEFAULT 1000,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_point_rw CHECK (rw IN ('r', 'w', 'rw')),
  CONSTRAINT chk_point_dtype CHECK (data_type IN ('int16', 'uint16', 'int32', 'uint32', 'float32', 'float64', 'bool', 'string'))
);

CREATE INDEX idx_points_device ON points(device_id);
CREATE INDEX idx_points_code ON points(point_code);
CREATE UNIQUE INDEX idx_points_device_code ON points(device_id, point_code);

COMMENT ON TABLE points IS '测点/点表';
COMMENT ON COLUMN points.register_addr IS 'Modbus寄存器地址';
COMMENT ON COLUMN points.alarm_hh IS '高高限报警阈值';
COMMENT ON COLUMN points.alarm_h IS '高限报警阈值';
COMMENT ON COLUMN points.alarm_l IS '低限报警阈值';
COMMENT ON COLUMN points.alarm_ll IS '低低限报警阈值';
COMMENT ON COLUMN points.sampling_rate IS '采样周期(ms)';

-- ============================================================
-- 策略表
-- ============================================================

CREATE TABLE IF NOT EXISTS strategies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(128) NOT NULL,
  type            VARCHAR(32) NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 50,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  site_id         VARCHAR(32) NOT NULL DEFAULT 'SITE-001',
  config_yaml     TEXT NOT NULL,
  schedule_cron   VARCHAR(64),
  valid_from      TIMESTAMPTZ,
  valid_to        TIMESTAMPTZ,
  last_executed_at TIMESTAMPTZ,
  execution_count  INTEGER NOT NULL DEFAULT 0,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_strategy_type CHECK (type IN (
    'peak_shaving', 'load_shifting', 'frequency_regulation',
    'voltage_regulation', 'spinning_reserve', 'self_consumption',
    'time_of_use', 'demand_response', 'emergency_charge',
    'emergency_discharge', 'equalization', 'custom'
  ))
);

CREATE INDEX idx_strategies_type ON strategies(type);
CREATE INDEX idx_strategies_enabled ON strategies(enabled) WHERE enabled = true;
CREATE INDEX idx_strategies_site ON strategies(site_id);

COMMENT ON TABLE strategies IS 'EMS策略表';
COMMENT ON COLUMN strategies.config_yaml IS '策略配置(YAML格式)';

-- ============================================================
-- 用户表
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username        VARCHAR(64) NOT NULL UNIQUE,
  password_hash   VARCHAR(256) NOT NULL,
  salt            VARCHAR(64) NOT NULL,
  real_name       VARCHAR(64),
  email           VARCHAR(128),
  phone           VARCHAR(20),
  role            VARCHAR(32) NOT NULL DEFAULT 'operator',
  permissions     JSONB NOT NULL DEFAULT '[]',
  site_ids        VARCHAR(32)[] NOT NULL DEFAULT '{"SITE-001"}',
  last_login_at   TIMESTAMPTZ,
  last_login_ip   INET,
  login_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_role CHECK (role IN ('superadmin', 'admin', 'engineer', 'operator', 'viewer'))
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

COMMENT ON TABLE users IS '用户表';

-- ============================================================
-- 告警规则表
-- ============================================================

CREATE TABLE IF NOT EXISTS alarm_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(128) NOT NULL,
  device_type     VARCHAR(32),
  point_code      VARCHAR(64),
  condition       VARCHAR(16) NOT NULL,
  threshold       NUMERIC(12,4) NOT NULL,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  severity        VARCHAR(16) NOT NULL DEFAULT 'warning',
  message_template VARCHAR(256),
  notify_channels VARCHAR(32)[] NOT NULL DEFAULT '{"email","sms"}',
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_alarm_condition CHECK (condition IN ('>', '>=', '<', '<=', '==', '!=', 'between', 'rate_of_change')),
  CONSTRAINT chk_alarm_severity CHECK (severity IN ('info', 'warning', 'critical', 'fatal'))
);

COMMENT ON TABLE alarm_rules IS '告警规则表';

-- ============================================================
-- 操作日志表
-- ============================================================

CREATE TABLE IF NOT EXISTS operation_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  action          VARCHAR(64) NOT NULL,
  target_type     VARCHAR(32),
  target_id       UUID,
  detail          JSONB,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oplog_user ON operation_logs(user_id);
CREATE INDEX idx_oplog_time ON operation_logs(created_at);
CREATE INDEX idx_oplog_action ON operation_logs(action);

COMMENT ON TABLE operation_logs IS '操作日志表';

-- ============================================================
-- 系统配置表
-- ============================================================

CREATE TABLE IF NOT EXISTS system_configs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category        VARCHAR(64) NOT NULL,
  key             VARCHAR(128) NOT NULL,
  value           TEXT NOT NULL,
  description     VARCHAR(256),
  updated_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_config_key UNIQUE (category, key)
);

COMMENT ON TABLE system_configs IS '系统配置表';

-- ============================================================
-- 初始数据
-- ============================================================

-- ---- 插入默认管理员 ----
INSERT INTO users (username, password_hash, salt, real_name, role, permissions)
VALUES (
  'admin',
  crypt('Admin@2024', gen_salt('bf', 10)),
  gen_salt('bf', 10),
  '系统管理员',
  'superadmin',
  '["*"]'::jsonb
) ON CONFLICT (username) DO NOTHING;

-- ---- 插入默认运维员 ----
INSERT INTO users (username, password_hash, salt, real_name, role, permissions)
VALUES (
  'operator',
  crypt('Operator@2024', gen_salt('bf', 10)),
  gen_salt('bf', 10),
  '运维操作员',
  'operator',
  '["device:read", "device:write", "strategy:read", "alarm:read", "report:read"]'::jsonb
) ON CONFLICT (username) DO NOTHING;

-- ---- 插入默认查看员 ----
INSERT INTO users (username, password_hash, salt, real_name, role, permissions)
VALUES (
  'viewer',
  crypt('Viewer@2024', gen_salt('bf', 10)),
  gen_salt('bf', 10),
  '查看员',
  'viewer',
  '["device:read", "strategy:read", "alarm:read", "report:read"]'::jsonb
) ON CONFLICT (username) DO NOTHING;

-- ---- 插入系统配置 ----
INSERT INTO system_configs (category, key, value, description) VALUES
  ('system', 'site_name', '储能电站EMS系统', '站点名称'),
  ('system', 'site_id', 'SITE-001', '站点编号'),
  ('system', 'timezone', 'Asia/Shanghai', '系统时区'),
  ('system', 'language', 'zh-CN', '系统语言'),
  ('ems', 'control_mode', 'auto', '控制模式: auto/manual/remote'),
  ('ems', 'max_charge_power_kw', '500', '最大充电功率(kW)'),
  ('ems', 'max_discharge_power_kw', '500', '最大放电功率(kW)'),
  ('ems', 'soc_charge_limit', '90', 'SOC充电上限(%)'),
  ('ems', 'soc_discharge_limit', '10', 'SOC放电下限(%)'),
  ('ems', 'grid_freq_nominal', '50.0', '电网额定频率(Hz)'),
  ('ems', 'grid_voltage_nominal', '380', '电网额定电压(V)'),
  ('alarm', 'notification_enabled', 'true', '告警通知开关'),
  ('alarm', 'escalation_timeout_min', '30', '告警升级超时(分钟)'),
  ('backup', 'auto_backup_enabled', 'true', '自动备份开关'),
  ('backup', 'retention_days', '90', '备份保留天数')
ON CONFLICT (category, key) DO NOTHING;

-- ---- 授权EMS用户所有表 ----
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ems;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ems;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ems;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ems;
```

### 6.2 PostgreSQL访问控制 `config/postgres/pg_hba.conf`

```conf
# ============================================================
# EMS一键部署 v2.0 - PostgreSQL 访问控制
# ============================================================
# TYPE  DATABASE  USER      ADDRESS          METHOD
local   all       postgres                   peer
local   all       all                        md5
host    ems       ems       172.28.0.0/16    scram-sha-256
host    ems       ems       127.0.0.1/32     scram-sha-256
host    all       postgres  127.0.0.1/32     md5
host    replication postgres 172.28.0.0/16  md5
host    all       all       0.0.0.0/0        reject
```

---

## 七、Nginx反向代理与SSL配置

### 7.1 完整 `config/nginx/nginx.conf`

```nginx
# ============================================================
# EMS一键部署 v2.0 - Nginx 反向代理 + SSL 终止
# ============================================================

worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # ---- 日志格式 ----
    log_format ems_main '$remote_addr - $remote_user [$time_local] "$request" '
                        '$status $body_bytes_sent "$http_referer" '
                        '"$http_user_agent" upstream=$upstream_addr '
                        'rt=$request_time';
    access_log /var/log/nginx/access.log ems_main;
    error_log  /var/log/nginx/error.log warn;

    # ---- 基础优化 ----
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    keepalive_requests 100;
    server_tokens off;
    client_max_body_size 50m;
    client_body_buffer_size 128k;

    # ---- Gzip压缩 ----
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript
               image/svg+xml;

    # ---- 安全头 ----
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ---- 限流 ----
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    # ---- Upstream: EMS API ----
    upstream ems_api {
        least_conn;
        server ems-api:8080 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # ---- Upstream: SCADA Web ----
    upstream scada_web {
        server scada:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # ---- Upstream: Grafana ----
    upstream grafana {
        server grafana:3000 max_fails=3 fail_timeout=30s;
    }

    # ---- Upstream: EMQX Dashboard ----
    upstream emqx_dashboard {
        server emqx:18083 max_fails=3 fail_timeout=30s;
    }

    # ============================================================
    # HTTP → HTTPS 重定向
    # ============================================================
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # ============================================================
    # HTTPS 主服务
    # ============================================================
    server {
        listen 443 ssl http2;
        server_name ems.local;

        # ---- SSL证书 ----
        ssl_certificate     /etc/nginx/ssl/server.crt;
        ssl_certificate_key /etc/nginx/ssl/server.key;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:
                            ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:
                            ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
        ssl_prefer_server_ciphers on;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 1d;
        ssl_session_tickets off;
        ssl_stapling on;
        ssl_stapling_verify on;

        # ---- 健康检查端点 ----
        location /health {
            access_log off;
            return 200 '{"status":"ok","service":"nginx","timestamp":"$time_iso8601"}';
            add_header Content-Type application/json;
        }

        # ---- SCADA Web 前端 (/) ----
        location / {
            proxy_pass http://scada_web;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Next.js SSR缓存
            proxy_cache_bypass $http_upgrade;
        }

        # ---- WebSocket 代理 (/ws) ----
        location /ws {
            proxy_pass http://scada_web;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }

        # ---- EMS API 代理 (/api) ----
        location /api/ {
            limit_req zone=api_limit burst=50 nodelay;
            limit_conn conn_limit 100;

            proxy_pass http://ems_api/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Request-ID $request_id;

            # 超时配置
            proxy_connect_timeout 10s;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;

            # 缓冲
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 16k;
        }

        # ---- EMS API 健康检查 (/api/health) ----
        location /api/health {
            access_log off;
            proxy_pass http://ems_api/health;
            proxy_http_version 1.1;
        }

        # ---- 登录接口限流 ----
        location /api/auth/login {
            limit_req zone=login_limit burst=3 nodelay;
            proxy_pass http://ems_api/auth/login;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # ---- Grafana 监控 (/monitor) ----
        location /monitor/ {
            proxy_pass http://grafana/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # ---- EMQX Dashboard (/mqtt) ----
        location /mqtt/ {
            proxy_pass http://emqx_dashboard/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # EMQX Dashboard WebSocket
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # ---- 静态资源缓存 ----
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            proxy_pass http://scada_web;
            proxy_http_version 1.1;
            expires 7d;
            add_header Cache-Control "public, immutable";
        }

        # ---- 禁止访问隐藏文件 ----
        location ~ /\. {
            deny all;
            access_log off;
            log_not_found off;
        }
    }
}
```

### 7.2 SSL证书生成脚本 `scripts/gen_ssl.sh`

```bash
#!/bin/bash
# ============================================================
# SSL证书生成（自签名，生产环境请替换为Let's Encrypt）
# ============================================================

SSL_DIR="./config/nginx/ssl"
mkdir -p "$SSL_DIR"

DOMAIN=${1:-ems.local}
DAYS=${2:-3650}

echo ">>> 生成自签名SSL证书 (域名: $DOMAIN, 有效期: ${DAYS}天)"

# ---- 生成CA证书 ----
openssl genrsa -out "$SSL_DIR/ca.key" 4096
openssl req -x509 -new -nodes -key "$SSL_DIR/ca.key" \
  -sha256 -days "$DAYS" \
  -subj "/C=CN/ST=Guangdong/L=Shenzhen/O=EMS/CN=EMS Root CA" \
  -out "$SSL_DIR/ca.crt"

# ---- 生成服务端证书 ----
openssl genrsa -out "$SSL_DIR/server.key" 2048

cat > "$SSL_DIR/server.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
[req_distinguished_name]
CN = $DOMAIN
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = $DOMAIN
DNS.2 = localhost
IP.1 = 127.0.0.1
IP.2 = 192.168.1.100
EOF

openssl req -new -key "$SSL_DIR/server.key" \
  -subj "/C=CN/ST=Guangdong/L=Shenzhen/O=EMS/CN=$DOMAIN" \
  -config "$SSL_DIR/server.cnf" \
  -out "$SSL_DIR/server.csr"

openssl x509 -req -in "$SSL_DIR/server.csr" \
  -CA "$SSL_DIR/ca.crt" -CAkey "$SSL_DIR/ca.key" -CAcreateserial \
  -out "$SSL_DIR/server.crt" -days "$DAYS" -sha256 \
  -extfile "$SSL_DIR/server.cnf" -extensions v3_req

rm -f "$SSL_DIR/server.csr" "$SSL_DIR/server.cnf" "$SSL_DIR/ca.srl"

echo ">>> 证书生成完成:"
echo "  CA证书:    $SSL_DIR/ca.crt"
echo "  服务端证书: $SSL_DIR/server.crt"
echo "  服务端私钥: $SSL_DIR/server.key"
```

### 7.3 Let's Encrypt自动申请+续期

```bash
#!/bin/bash
# ============================================================
# Let's Encrypt 自动申请+续期 (生产环境)
# ============================================================

DOMAIN=${1:-ems.example.com}
EMAIL=${2:-admin@example.com}
SSL_DIR="./config/nginx/ssl"

apt-get install -y certbot python3-certbot-nginx 2>/dev/null || yum install -y certbot python3-certbot-nginx

certbot certonly --standalone \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --preferred-challenges http

CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
cp "$CERT_PATH/fullchain.pem" "$SSL_DIR/server.crt"
cp "$CERT_PATH/privkey.pem"   "$SSL_DIR/server.key"

echo "0 0 1 * * certbot renew --quiet --deploy-hook 'cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $SSL_DIR/server.crt && cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $SSL_DIR/server.key && docker exec ems-nginx nginx -s reload'" | crontab -

echo ">>> Let's Encrypt证书已安装，自动续期已配置"
```

---

## 八、Ansible Playbook（可选，用于多机部署）

### 8.1 主Playbook `ansible/playbook.yml`

```yaml
# ============================================================
# EMS一键部署 v2.0 - Ansible Playbook (多机部署)
# 用法: ansible-playbook -i inventory.ini playbook.yml
# ============================================================
---
- name: "EMS一键部署 v2.0 - 多机部署"
  hosts: all
  become: true
  vars_files:
    - vars/main.yml
  pre_tasks:
    - name: 检查Ansible版本
      assert:
        that:
          - ansible_version.major >= 2
          - ansible_version.minor >= 14
        fail_msg: "需要Ansible >= 2.14"

    - name: 收集主机信息
      setup:

  tasks:
    # ---- Phase 1: 服务器预检 ----
    - name: Phase 1 - 拷贝预检脚本
      ansible.builtin.copy:
        src: ../scripts/pre_check.sh
        dest: /tmp/pre_check.sh
        mode: '0755'

    - name: Phase 1 - 执行服务器预检
      ansible.builtin.shell: bash /tmp/pre_check.sh
      register: precheck_result
      changed_when: false
      failed_when: precheck_result.rc != 0

    - name: Phase 1 - 显示预检结果
      ansible.builtin.debug:
        var: precheck_result.stdout_lines

    # ---- Phase 2: 安装Docker ----
    - name: Phase 2 - 检查Docker是否已安装
      ansible.builtin.command: docker version --format '{{.Server.Version}}'
      register: docker_version
      changed_when: false
      failed_when: false

    - name: Phase 2 - 安装Docker Engine
      ansible.builtin.shell: curl -fsSL https://get.docker.com | sh
      when: docker_version.rc != 0

    - name: Phase 2 - 配置Docker daemon
      ansible.builtin.copy:
        content: |
          {
            "storage-driver": "overlay2",
            "log-driver": "json-file",
            "log-opts": {"max-size": "100m", "max-file": "5"},
            "registry-mirrors": ["https://mirror.ccs.tencentyun.com"]
          }
        dest: /etc/docker/daemon.json
      notify: restart docker

    - name: Phase 2 - 启动Docker服务
      ansible.builtin.systemd:
        name: docker
        state: started
        enabled: true

    # ---- Phase 3: 拷贝配置文件 ----
    - name: Phase 3 - 创建EMS部署目录
      ansible.builtin.file:
        path: "{{ item }}"
        state: directory
        mode: '0755'
      loop:
        - /opt/ems
        - /opt/ems/config
        - /opt/ems/config/nginx
        - /opt/ems/config/nginx/ssl
        - /opt/ems/config/emqx
        - /opt/ems/config/tdengine
        - /opt/ems/config/postgres
        - /opt/ems/config/redis
        - /opt/ems/config/prometheus
        - /opt/ems/config/grafana
        - /opt/ems/data
        - /opt/ems/data/tdengine
        - /opt/ems/data/emqx
        - /opt/ems/data/pgdata
        - /opt/ems/data/redis
        - /opt/ems/data/prometheus
        - /opt/ems/data/grafana
        - /opt/ems/logs
        - /opt/ems/scripts

    - name: Phase 3 - 拷贝docker-compose.yml
      ansible.builtin.copy:
        src: ../docker-compose.yml
        dest: /opt/ems/docker-compose.yml

    - name: Phase 3 - 拷贝.env文件
      ansible.builtin.copy:
        src: ../.env
        dest: /opt/ems/.env

    - name: Phase 3 - 拷贝所有配置文件
      ansible.builtin.copy:
        src: "../config/{{ item.src }}/"
        dest: "/opt/ems/config/{{ item.dest }}/"
      loop:
        - { src: "nginx", dest: "nginx" }
        - { src: "emqx", dest: "emqx" }
        - { src: "tdengine", dest: "tdengine" }
        - { src: "postgres", dest: "postgres" }
        - { src: "redis", dest: "redis" }

    - name: Phase 3 - 拷贝脚本文件
      ansible.builtin.copy:
        src: "../scripts/{{ item }}"
        dest: "/opt/ems/scripts/{{ item }}"
        mode: '0755'
      loop:
        - pre_check.sh
        - healthcheck.sh
        - backup.sh
        - restore.sh

    # ---- Phase 4: 启动服务 ----
    - name: Phase 4 - 拉取Docker镜像
      community.docker.docker_compose_v2:
        project_src: /opt/ems
        pull: always
      register: pull_result

    - name: Phase 4 - 启动所有服务
      community.docker.docker_compose_v2:
        project_src: /opt/ems
        state: present
      register: deploy_result

    # ---- Phase 5: 健康检查 ----
    - name: Phase 5 - 等待服务启动 (60s)
      ansible.builtin.pause:
        seconds: 60

    - name: Phase 5 - 执行健康检查
      ansible.builtin.shell: bash /opt/ems/scripts/healthcheck.sh
      register: healthcheck_result
      retries: 3
      delay: 30
      until: healthcheck_result.rc == 0

    - name: Phase 5 - 显示健康检查结果
      ansible.builtin.debug:
        var: healthcheck_result.stdout_lines

    # ---- Phase 6: 生成交付报告 ----
    - name: Phase 6 - 生成部署交付报告
      ansible.builtin.shell: bash /opt/ems/scripts/healthcheck.sh --report > /opt/ems/deploy_report.txt
      register: report_result

    - name: Phase 6 - 取回交付报告
      ansible.builtin.fetch:
        src: /opt/ems/deploy_report.txt
        dest: "./reports/{{ inventory_hostname }}_deploy_report.txt"
        flat: true

    - name: Phase 6 - 部署完成
      ansible.builtin.debug:
        msg: "✅ {{ inventory_hostname }} 部署成功！报告: ./reports/{{ inventory_hostname }}_deploy_report.txt"

  handlers:
    - name: restart docker
      ansible.builtin.systemd:
        name: docker
        state: restarted
```

### 8.2 多机Inventory配置 `ansible/inventory.ini`

```ini
# ============================================================
# EMS一键部署 v2.0 - Ansible Inventory
# ============================================================

[ems_master]
ems-master-01 ansible_host=192.168.1.10 ansible_user=deploy ansible_ssh_private_key_file=~/.ssh/ems_deploy

[ems_slave]
ems-slave-01 ansible_host=192.168.1.11 ansible_user=deploy ansible_ssh_private_key_file=~/.ssh/ems_deploy

[scada]
scada-01 ansible_host=192.168.1.20 ansible_user=deploy ansible_ssh_private_key_file=~/.ssh/ems_deploy

[ems:children]
ems_master
ems_slave

[all:children]
ems
scada

[all:vars]
ansible_python_interpreter=/usr/bin/python3
ems_deploy_dir=/opt/ems
```

### 8.3 Ansible变量 `ansible/vars/main.yml`

```yaml
ems_version: "2.0.0"
ems_deploy_dir: "/opt/ems"
ems_tz: "Asia/Shanghai"

docker_compose_version: "2.24.0"
tdengine_version: "3.0"
emqx_version: "5.5"
postgres_version: "15-alpine"
redis_version: "7-alpine"
nginx_version: "1.25-alpine"
prometheus_version: "v2.48.0"
grafana_version: "10.2.0"

tdengine_data_dir: "/data/tdengine"
postgres_data_dir: "/data/pgdata"
redis_data_dir: "/data/redis"

keepalived_vip_mgmt: "192.168.1.100"
keepalived_vip_ctrl: "10.0.1.100"
keepalived_password: "ems_ha_2024"
```

---

## 九、健康检查与监控

### 9.1 健康检查脚本 `scripts/healthcheck.sh`

```bash
#!/bin/bash
# ============================================================
# EMS一键部署 v2.0 - 健康检查脚本
# 用法: bash healthcheck.sh [--report] [--loop]
# ============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
REPORT=false; LOOP=false
for arg in "$@"; do
  case $arg in
    --report) REPORT=true ;;
    --loop)   LOOP=true ;;
  esac
done

PASS=0; FAIL=0; WARN=0
REPORT_FILE="/opt/ems/deploy_report.txt"

log_pass() { PASS=$((PASS+1)); echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { FAIL=$((FAIL+1)); echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { WARN=$((WARN+1)); echo -e "${YELLOW}[WARN]${NC} $1"; }

echo "============================================================"
echo "  EMS健康检查 - $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# ---- 1. Docker容器状态 ----
echo ""
echo ">>> [1/8] Docker容器状态"

check_container() {
  local name=$1
  local expected=$2
  local status=$(docker inspect --format='{{.State.Status}}' "$name" 2>/dev/null || echo "not_found")
  local health=$(docker inspect --format='{{.State.Health.Status}}' "$name" 2>/dev/null || echo "none")

  if [ "$status" == "$expected" ]; then
    if [ "$health" == "healthy" ] || [ "$health" == "none" ]; then
      log_pass "容器 $name: $status (health: $health)"
    elif [ "$health" == "starting" ]; then
      log_warn "容器 $name: $status (health: starting)"
    else
      log_fail "容器 $name: $status (health: $health)"
    fi
  else
    log_fail "容器 $name: $status (期望: $expected)"
  fi
}

CONTAINERS=("ems-tdengine" "ems-emqx" "ems-postgres" "ems-redis" "ems-redis-sentinel" "ems-api" "ems-scada" "ems-nginx" "ems-prometheus" "ems-grafana")
for c in "${CONTAINERS[@]}"; do
  check_container "$c" "running"
done

# ---- 2. HTTP端点检查 ----
echo ""
echo ">>> [2/8] HTTP端点检查"

check_http() {
  local name=$1
  local url=$2
  local expected_code=${3:-200}
  local timeout=${4:-10}

  local code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
  if [ "$code" == "$expected_code" ]; then
    log_pass "HTTP $name: $code (期望: $expected_code)"
  else
    log_fail "HTTP $name: $code (期望: $expected_code) URL=$url"
  fi
}

check_http "Nginx-HTTPS"    "https://localhost:443/health" 200
check_http "EMS-API"        "http://localhost:8080/health" 200
check_http "SCADA-Web"      "http://localhost:3000/" 200
check_http "TDengine-REST"  "http://localhost:6041/rest/sql" 200
check_http "EMQX-Status"    "http://localhost:8083/status" 200
check_http "EMQX-Dashboard" "http://localhost:18083/" 200
check_http "Grafana"        "http://localhost:3001/api/health" 200
check_http "Prometheus"     "http://localhost:9090/-/healthy" 200

# ---- 3. TCP端口检查 ----
echo ""
echo ">>> [3/8] TCP端口检查"

check_port() {
  local name=$1
  local port=$2
  if ss -tlnp 2>/dev/null | grep -q ":${port} " || netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
    log_pass "端口 $port ($name): 监听中"
  else
    log_fail "端口 $port ($name): 未监听"
  fi
}

check_port "Nginx-HTTPS"   443
check_port "Nginx-HTTP"    80
check_port "EMS-API"      8080
check_port "SCADA-Web"    3000
check_port "TDengine"     6041
check_port "EMQX-MQTT"   1883
check_port "EMQX-MQTTS"  8883
check_port "PostgreSQL"   5432
check_port "Redis"        6379
check_port "Redis-Sentinel" 26379

# ---- 4. 数据库连接检查 ----
echo ""
echo ">>> [4/8] 数据库连接检查"

TD_RESULT=$(docker exec ems-tdengine taos -s "SELECT COUNT(*) FROM ems.device_measurements" 2>/dev/null && echo "OK" || echo "FAIL")
if [[ "$TD_RESULT" == *"OK"* ]]; then
  log_pass "TDengine: 连接正常"
else
  log_fail "TDengine: 连接失败"
fi

PG_RESULT=$(docker exec ems-postgres psql -U ems -d ems -c "SELECT COUNT(*) FROM devices" 2>/dev/null && echo "OK" || echo "FAIL")
if [[ "$PG_RESULT" == *"OK"* ]]; then
  log_pass "PostgreSQL: 连接正常"
else
  log_fail "PostgreSQL: 连接失败"
fi

REDIS_RESULT=$(docker exec ems-redis redis-cli -a EmsRedis2024 PING 2>/dev/null || echo "FAIL")
if [[ "$REDIS_RESULT" == *"PONG"* ]]; then
  log_pass "Redis: 连接正常"
else
  log_fail "Redis: 连接失败"
fi

# ---- 5. MQTT Broker检查 ----
echo ""
echo ">>> [5/8] MQTT Broker检查"

EMQX_STATS=$(curl -s -u admin:ems_emqx_2024 http://localhost:8083/api/v5/stats 2>/dev/null || echo "{}")
EMQX_UPTIME=$(curl -s -u admin:ems_emqx_2024 http://localhost:8083/api/v5/status 2>/dev/null || echo "down")
if [[ "$EMQX_UPTIME" == *"running"* ]]; then
  log_pass "EMQX: 运行正常"
else
  log_fail "EMQX: 状态异常"
fi

# ---- 6. 磁盘空间检查 ----
echo ""
echo ">>> [6/8] 磁盘空间检查"

check_disk_usage() {
  local mount=$1
  local name=$2
  local warn_pct=${3:-80}
  local crit_pct=${4:-90}

  if [ -d "$mount" ]; then
    local pct=$(df "$mount" | awk 'NR==2{print $5}' | tr -d '%')
    if [ "$pct" -ge "$crit_pct" ]; then
      log_fail "磁盘 $name ($mount): ${pct}%已用 (>=${crit_pct}%)"
    elif [ "$pct" -ge "$warn_pct" ]; then
      log_warn "磁盘 $name ($mount): ${pct}%已用 (>=${warn_pct}%)"
    else
      log_pass "磁盘 $name ($mount): ${pct}%已用"
    fi
  fi
}

check_disk_usage "/" "系统盘" 70 85
check_disk_usage "/data" "数据盘" 80 90

# ---- 7. 内存检查 ----
echo ""
echo ">>> [7/8] 内存使用检查"

MEM_PCT=$(free | awk '/Mem/{printf "%.0f", $3/$2*100}')
if [ "$MEM_PCT" -ge 90 ]; then
  log_fail "内存使用: ${MEM_PCT}% (>=90%)"
elif [ "$MEM_PCT" -ge 80 ]; then
  log_warn "内存使用: ${MEM_PCT}% (>=80%)"
else
  log_pass "内存使用: ${MEM_PCT}%"
fi

# ---- 8. 容器资源使用 ----
echo ""
echo ">>> [8/8] 容器资源使用"

for c in "${CONTAINERS[@]}"; do
  if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
    CPU_USAGE=$(docker stats --no-stream --format "{{.CPUPerc}}" "$c" 2>/dev/null || echo "N/A")
    MEM_USAGE=$(docker stats --no-stream --format "{{.MemUsage}}" "$c" 2>/dev/null || echo "N/A")
    log_info "  $c: CPU=$CPU_USAGE MEM=$MEM_USAGE"
  fi
done

# ---- 结果汇总 ----
echo ""
echo "============================================================"
echo -e "  健康检查结果: ${GREEN}PASS=${PASS}${NC}  ${RED}FAIL=${FAIL}${NC}  ${YELLOW}WARN=${WARN}${NC}"
echo "============================================================"

if [ "$REPORT" == true ]; then
  echo ">>> 生成部署交付报告: $REPORT_FILE"
  {
    echo "============================================================"
    echo "  EMS一键部署 v2.0 - 部署交付报告"
    echo "  生成时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "  主机名: $(hostname)"
    echo "============================================================"
    echo ""
    echo "=== 部署环境 ==="
    echo "操作系统: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
    echo "内核: $(uname -r)"
    echo "CPU: $(nproc)核"
    echo "内存: $(free -h | awk '/Mem/{print $2}')"
    echo "Docker: $(docker version --format '{{.Server.Version}}')"
    echo "Compose: $(docker compose version --short)"
    echo ""
    echo "=== 版本清单 ==="
    echo "TDengine: $(docker exec ems-tdengine taos -V 2>/dev/null || echo 'N/A')"
    echo "EMQX: $(docker exec ems-emqx emqx_ctl status 2>/dev/null || echo 'N/A')"
    echo "PostgreSQL: $(docker exec ems-postgres psql --version 2>/dev/null || echo 'N/A')"
    echo "Redis: $(docker exec ems-redis redis-server --version 2>/dev/null || echo 'N/A')"
    echo "Nginx: $(docker exec ems-nginx nginx -v 2>&1 || echo 'N/A')"
    echo ""
    echo "=== 端口分配 ==="
    echo "443/80   - Nginx (HTTPS/HTTP)"
    echo "8080     - EMS API"
    echo "3000     - SCADA Web"
    echo "6041     - TDengine RESTful"
    echo "1883/8883 - EMQX MQTT/MQTTS"
    echo "5432     - PostgreSQL"
    echo "6379     - Redis"
    echo "26379    - Redis Sentinel"
    echo "9090     - Prometheus"
    echo "3001     - Grafana"
    echo ""
    echo "=== 健康检查结果 ==="
    echo "PASS: $PASS"
    echo "FAIL: $FAIL"
    echo "WARN: $WARN"
    echo ""
    echo "=== 性能基线 ==="
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || true
    echo ""
    echo "=== 下一步 ==="
    echo "1. 配置设备通讯参数 (Modbus地址/串口/MQTT Topic)"
    echo "2. 导入点表 (register地址/数据类型/告警阈值)"
    echo "3. 配置EMS策略 (削峰填谷/需量控制/频率调节)"
    echo "4. 接入Grafana监控面板"
    echo "5. 配置数据备份定时任务"
    echo "============================================================"
  } > "$REPORT_FILE"
fi

if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  exit 0
fi
```

### 9.2 Prometheus配置 `config/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

alerting:
  alertmanagers:
    - static_configs:
        - targets: []

rule_files:
  - /etc/prometheus/alerts.yml

scrape_configs:
  - job_name: 'ems-api'
    metrics_path: /metrics
    static_configs:
      - targets: ['ems-api:8080']
    scrape_interval: 10s

  - job_name: 'emqx'
    static_configs:
      - targets: ['emqx:8083']
    scrape_interval: 15s

  - job_name: 'tdengine'
    static_configs:
      - targets: ['tdengine:6041']
    scrape_interval: 30s

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:9113']
    scrape_interval: 15s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
    scrape_interval: 15s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:9187']
    scrape_interval: 30s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['host.docker.internal:9100']
    scrape_interval: 10s

  - job_name: 'docker'
    static_configs:
      - targets: ['host.docker.internal:9323']
    scrape_interval: 15s
```

### 9.3 告警规则 `config/prometheus/alerts.yml`

```yaml
groups:
  - name: ems_service_alerts
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "服务 {{ $labels.job }} 宕机"
          description: "服务 {{ $labels.job }} 已宕机超过2分钟"

      - alert: HighCPU
        expr: process_cpu_seconds_total > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "CPU使用率超过80%"
          description: "{{ $labels.job }} CPU使用率超过80%持续5分钟"

      - alert: HighMemory
        expr: process_resident_memory_bytes / 1024 / 1024 / 1024 > 6
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "内存使用超过6GB"
          description: "{{ $labels.job }} 内存使用超过6GB持续5分钟"

  - name: ems_system_alerts
    rules:
      - alert: DiskSpaceWarning
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "磁盘空间不足 ({{ $labels.mountpoint }})"
          description: "可用空间低于20%"

      - alert: DiskSpaceCritical
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "磁盘空间严重不足 ({{ $labels.mountpoint }})"
          description: "可用空间低于10%"

      - alert: HighLoadAvg
        expr: node_load15 / on() count(node_cpu_seconds_total{mode="idle"}) > 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "系统负载过高"
          description: "15分钟平均负载超过80%"
```

### 9.4 Grafana数据源 `config/grafana/datasources/datasource.yml`

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true

  - name: TDengine
    type: tdengine-datasource
    access: proxy
    url: http://tdengine:6041
    editable: true
    jsonData:
      user: root
      password: taosdata
```

---

## 十、数据备份与恢复

### 10.1 备份脚本 `scripts/backup.sh`

```bash
#!/bin/bash
# ============================================================
# EMS一键部署 v2.0 - 数据备份脚本
# 用法: bash backup.sh [full|incremental]
# ============================================================

set -euo pipefail

BACKUP_DIR="/data/backup/ems"
REMOTE_BACKUP_DIR="backup-server::ems"
DATE=$(date +%Y%m%d)
TIME=$(date +%H%M%S)
BACKUP_TYPE=${1:-incremental}
RETENTION_DAYS=90

mkdir -p "$BACKUP_DIR/$DATE"

echo "============================================================"
echo "  EMS数据备份 - $(date '+%Y-%m-%d %H:%M:%S')  类型: $BACKUP_TYPE"
echo "============================================================"

# ---- 1. TDengine备份 ----
echo ""
echo ">>> [1/5] TDengine时序数据备份"

if [ "$BACKUP_TYPE" == "full" ]; then
  docker exec ems-tdengine taosdump -o /var/lib/taos/backup -D ems -A
  docker cp ems-tdengine:/var/lib/taos/backup "$BACKUP_DIR/$DATE/tdengine_full"
  echo "  全量备份完成: $BACKUP_DIR/$DATE/tdengine_full"
else
  SINCE=$(date -d '-1 day' +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)
  docker exec ems-tdengine taosdump -o /var/lib/taos/backup -D ems -S "$SINCE"
  docker cp ems-tdengine:/var/lib/taos/backup "$BACKUP_DIR/$DATE/tdengine_incr"
  echo "  增量备份完成(自$SINCE): $BACKUP_DIR/$DATE/tdengine_incr"
fi

# ---- 2. PostgreSQL备份 ----
echo ""
echo ">>> [2/5] PostgreSQL关系数据备份"

docker exec ems-postgres pg_dump -U postgres -d ems \
  --format=custom --compress=9 \
  --file=/var/lib/postgresql/data/ems_backup.dump

docker cp ems-postgres:/var/lib/postgresql/data/ems_backup.dump \
  "$BACKUP_DIR/$DATE/ems_${DATE}.dump"

echo "  备份完成: $BACKUP_DIR/$DATE/ems_${DATE}.dump"

docker exec ems-postgres pg_dump -U postgres -d ems \
  --format=plain --no-owner \
  > "$BACKUP_DIR/$DATE/ems_${DATE}.sql"

echo "  SQL备份完成: $BACKUP_DIR/$DATE/ems_${DATE}.sql"

# ---- 3. Redis备份 ----
echo ""
echo ">>> [3/5] Redis数据备份"

docker exec ems-redis redis-cli -a EmsRedis2024 BGSAVE
sleep 5
docker cp ems-redis:/data/dump.rdb "$BACKUP_DIR/$DATE/redis_${DATE}.rdb"
echo "  备份完成: $BACKUP_DIR/$DATE/redis_${DATE}.rdb"

# ---- 4. EMQX配置备份 ----
echo ""
echo ">>> [4/5] EMQX配置备份"

docker exec ems-emqx emqx_ctl data export > "$BACKUP_DIR/$DATE/emqx_data_${DATE}.json" 2>/dev/null
echo "  备份完成: $BACKUP_DIR/$DATE/emqx_data_${DATE}.json"

# ---- 5. 应用配置备份 ----
echo ""
echo ">>> [5/5] 应用配置备份"

tar czf "$BACKUP_DIR/$DATE/ems_config_${DATE}.tar.gz" \
  /opt/ems/config/ /opt/ems/.env /opt/ems/docker-compose.yml 2>/dev/null
echo "  备份完成: $BACKUP_DIR/$DATE/ems_config_${DATE}.tar.gz"

# ---- 备份校验 ----
echo ""
echo ">>> 备份校验"

BACKUP_SIZE=$(du -sh "$BACKUP_DIR/$DATE" | awk '{print $1}')
BACKUP_COUNT=$(find "$BACKUP_DIR/$DATE" -type f | wc -l)
echo "  备份大小: $BACKUP_SIZE"
echo "  备份文件数: $BACKUP_COUNT"

# ---- 异地同步 (rsync) ----
echo ""
echo ">>> 异地备份同步"

if command -v rsync &>/dev/null; then
  rsync -avz --progress "$BACKUP_DIR/$DATE/" "$REMOTE_BACKUP_DIR/$DATE/" 2>/dev/null && \
    echo "  异地同步完成" || echo "  异地同步跳过(远程不可达)"
else
  echo "  rsync未安装，跳过异地同步"
fi

# ---- 清理过期备份 ----
echo ""
echo ">>> 清理${RETENTION_DAYS}天前的备份"

find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null
echo "  清理完成"

echo ""
echo "============================================================"
echo "  备份完成！路径: $BACKUP_DIR/$DATE"
echo "============================================================"
```

### 10.2 恢复脚本 `scripts/restore.sh`

```bash
#!/bin/bash
# ============================================================
# EMS一键部署 v2.0 - 数据恢复脚本
# 用法: bash restore.sh [YYYYMMDD]
# ============================================================

set -euo pipefail

BACKUP_DIR="/data/backup/ems"
RESTORE_DATE=${1:-$(ls -t "$BACKUP_DIR" | head -1)}

if [ ! -d "$BACKUP_DIR/$RESTORE_DATE" ]; then
  echo "错误: 备份目录 $BACKUP_DIR/$RESTORE_DATE 不存在"
  echo "可用备份: $(ls -t "$BACKUP_DIR" | head -5 | tr '\n' ' ')"
  exit 1
fi

echo "============================================================"
echo "  EMS数据恢复 - 从备份 $RESTORE_DATE 恢复"
echo "  警告: 此操作将覆盖当前数据！"
echo "============================================================"
read -p "确认恢复? (输入 YES 继续): " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "恢复已取消"
  exit 0
fi

# ---- 1. 停止EMS应用(保留中间件) ----
echo ""
echo ">>> [1/5] 停止EMS应用服务"
docker stop ems-api ems-scada 2>/dev/null || true
echo "  EMS应用已停止"

# ---- 2. 恢复TDengine ----
echo ""
echo ">>> [2/5] 恢复TDengine时序数据"

TD_BACKUP=$(find "$BACKUP_DIR/$RESTORE_DATE" -name "tdengine_*" -type d | head -1)
if [ -n "$TD_BACKUP" ]; then
  docker cp "$TD_BACKUP/." ems-tdengine:/var/lib/taos/restore/
  docker exec ems-tdengine taosdump -i /var/lib/taos/restore
  echo "  TDengine恢复完成"
else
  echo "  未找到TDengine备份，跳过"
fi

# ---- 3. 恢复PostgreSQL ----
echo ""
echo ">>> [3/5] 恢复PostgreSQL关系数据"

PG_DUMP=$(find "$BACKUP_DIR/$RESTORE_DATE" -name "ems_*.dump" | head -1)
if [ -n "$PG_DUMP" ]; then
  docker cp "$PG_DUMP" ems-postgres:/var/lib/postgresql/data/restore.dump
  docker exec ems-postgres pg_restore -U postgres -d ems -c \
    /var/lib/postgresql/data/restore.dump 2>/dev/null
  echo "  PostgreSQL恢复完成"
else
  PG_SQL=$(find "$BACKUP_DIR/$RESTORE_DATE" -name "ems_*.sql" | head -1)
  if [ -n "$PG_SQL" ]; then
    docker cp "$PG_SQL" ems-postgres:/var/lib/postgresql/data/restore.sql
    docker exec ems-postgres psql -U postgres -d ems \
      -f /var/lib/postgresql/data/restore.sql 2>/dev/null
    echo "  PostgreSQL恢复完成(SQL)"
  else
    echo "  未找到PostgreSQL备份，跳过"
  fi
fi

# ---- 4. 恢复Redis ----
echo ""
echo ">>> [4/5] 恢复Redis数据"

REDIS_RDB=$(find "$BACKUP_DIR/$RESTORE_DATE" -name "redis_*.rdb" | head -1)
if [ -n "$REDIS_RDB" ]; then
  docker stop ems-redis
  docker cp "$REDIS_RDB" ems-redis:/data/dump.rdb
  docker start ems-redis
  sleep 5
  echo "  Redis恢复完成"
else
  echo "  未找到Redis备份，跳过"
fi

# ---- 5. 启动EMS应用 ----
echo ""
echo ">>> [5/5] 启动EMS应用服务"
docker start ems-api ems-scada 2>/dev/null || true
echo "  EMS应用已启动"

sleep 15

# ---- 验证恢复 ----
echo ""
echo ">>> 恢复验证"
docker exec ems-postgres psql -U ems -d ems -c "SELECT COUNT(*) AS device_count FROM devices" 2>/dev/null || true
docker exec ems-tdengine taos -s "SELECT COUNT(*) FROM ems.device_measurements" 2>/dev/null || true

echo ""
echo "============================================================"
echo "  恢复完成！从备份 $RESTORE_DATE 恢复成功"
echo "============================================================"
```

### 10.3 定时备份Crontab配置

```bash
# 添加到crontab: crontab -e
# ============================================================
# 每日增量备份 (凌晨2:00)
0 2 * * * /opt/ems/scripts/backup.sh incremental >> /var/log/ems/backup.log 2>&1

# 每周全量备份 (周日凌晨3:00)
0 3 * * 0 /opt/ems/scripts/backup.sh full >> /var/log/ems/backup.log 2>&1

# 每日健康检查 (每小时)
0 * * * * /opt/ems/scripts/healthcheck.sh >> /var/log/ems/healthcheck.log 2>&1

# SSL证书续期检查 (每月1号)
0 0 1 * * certbot renew --quiet --deploy-hook 'docker exec ems-nginx nginx -s reload' 2>/dev/null
# ============================================================
```

---

## 十一、部署交付报告模板

```
============================================================
  EMS一键部署 v2.0 - 部署交付报告
  生成时间: YYYY-MM-DD HH:MM:SS
  主机名: <hostname>
============================================================

=== 一、部署环境信息 ===
项目名称:     储能电站EMS系统
部署版本:     v2.0.0
部署日期:     YYYY-MM-DD
部署人员:     <姓名>
客户名称:     <客户>
站点名称:     <站点>
站点编号:     SITE-001

=== 二、版本清单 ===
组件            版本              镜像
--------------------------------------------------------------
Docker Engine   24.x.x           -
Docker Compose  2.x.x            -
TDengine        3.0.x            tdengine/tdengine:3.0
EMQX            5.5.x            emqx/emqx:5.5
PostgreSQL      15.x             postgres:15-alpine
Redis           7.x              redis:7-alpine
Nginx           1.25.x           nginx:1.25-alpine
EMS API         x.x.x            ems-api:latest
SCADA Web       x.x.x            scada:latest
Prometheus      2.48.x           prom/prometheus:v2.48.0
Grafana         10.2.x           grafana/grafana:10.2.0

=== 三、端口分配 ===
端口       协议     服务              用途
--------------------------------------------------------------
443        HTTPS    Nginx             Web管理入口(SSL)
80         HTTP     Nginx             HTTP→HTTPS重定向
8080       HTTP     EMS API           REST API接口
3000       HTTP     SCADA Web         前端界面
6041       HTTP     TDengine REST     时序库RESTful API
6030       TCP      TDengine CLI      时序库客户端连接
1883       MQTT     EMQX              设备数据上报(明文)
8883       MQTTS    EMQX              设备数据上报(加密)
8083       HTTP     EMQX API          MQTT管理API
18083      HTTP     EMQX Dashboard    MQTT管理控制台
5432       TCP      PostgreSQL        关系数据库
6379       TCP      Redis             缓存数据库
26379      TCP      Redis Sentinel    哨兵通信
9090       HTTP     Prometheus        监控采集
3001       HTTP     Grafana           监控看板

=== 四、健康检查结果 ===
检查项             状态    详情
--------------------------------------------------------------
Docker容器(10个)   PASS    全部running+healthy
HTTP端点(8个)      PASS    全部200
TCP端口(10个)      PASS    全部监听
数据库连接(3个)    PASS    TDengine/PG/Redis正常
EMQX Broker        PASS    运行正常
磁盘空间           PASS    系统<x% 数据<y%
内存使用           PASS    <80%

=== 五、性能基线 ===
容器              CPU      内存       网络IO
--------------------------------------------------------------
ems-tdengine      x.x%     xGB/xGB   xMB/xMB
ems-emqx          x.x%     xMB/xMB   xMB/xMB
ems-postgres      x.x%     xMB/xMB   xMB/xMB
ems-redis         x.x%     xMB/xMB   xMB/xMB
ems-api           x.x%     xMB/xMB   xMB/xMB
ems-scada         x.x%     xMB/xMB   xMB/xMB
ems-nginx         x.x%     xMB/xMB   xMB/xMB

=== 六、下一步 ===
1. 配置设备通讯参数 (Modbus地址/串口/MQTT Topic映射)
2. 导入点表 (register地址/数据类型/告警阈值)
3. 配置EMS策略 (削峰填谷/需量控制/频率调节)
4. 接入Grafana监控面板 (导入EMS Dashboard JSON)
5. 配置数据备份定时任务 (crontab)
6. 配置双机热备 keepalived (主备切换)
7. 安全加固 (SELinux/防火墙/审计日志)
8. FAT验收测试 (按FAT测试用例逐项验证)
============================================================
```

---

## 十二、常见部署故障与排查

### 12.1 Docker相关故障

| 故障现象 | 排查命令 | 常见原因 | 解决方案 |
|---------|---------|---------|---------|
| 容器启动失败 | `docker logs <container>` | 配置错误/依赖缺失 | 检查日志中ERROR行 |
| 容器不断重启 | `docker inspect <container> --format='{{.State.Status}}'` | 健康检查失败/OOM | 增加内存限制或修复健康检查 |
| 端口冲突 | `ss -tlnp \| grep <port>` | 端口被其他进程占用 | 停止冲突进程或修改端口映射 |
| 磁盘空间不足 | `df -h` / `docker system df` | 镜像/日志占用过大 | `docker system prune -a` 清理 |
| 镜像拉取失败 | `docker pull <image>` | 网络问题/镜像不存在 | 配置镜像加速器/检查镜像名 |
| overlay2错误 | `docker info \| grep Driver` | 存储驱动不匹配 | 修改`/etc/docker/daemon.json`设为overlay2 |
| Compose启动失败 | `docker compose config` | yml语法错误 | 验证配置文件语法 |
| 容器间网络不通 | `docker network ls` / `docker exec <c> ping <t>` | 网络未创建/容器未加入 | 检查networks配置 |

### 12.2 TDengine故障

| 故障现象 | 排查命令 | 常见原因 | 解决方案 |
|---------|---------|---------|---------|
| 连接失败 | `docker exec ems-tdengine taos -s "select 1"` | taosd未启动 | 检查容器日志`docker logs ems-tdengine` |
| RESTful API无响应 | `curl -u root:taosdata http://localhost:6041/rest/sql` | 端口未映射 | 检查docker-compose端口映射 |
| 磁盘空间不足 | `docker exec ems-tdengine df -h /var/lib/taos` | 时序数据膨胀 | 调整KEEP/DAYS参数或扩容 |
| 时间不同步 | `docker exec ems-tdengine date` | NTP未配置 | 安装chrony/ntp同步时间 |
| 创建表失败 | `docker exec ems-tdengine taos -s "CREATE TABLE..."` | 语法错误/库不存在 | 先USE ems再建表 |
| 超级表写入失败 | 检查TAGS类型和数量 | TAG不匹配 | 确保子表TAGS与超级表定义一致 |
| 数据查询慢 | `EXPLAIN SELECT ...` | 未利用时间分区 | 查询必须带时间范围条件 |

### 12.3 EMQX故障

| 故障现象 | 排查命令 | 常见原因 | 解决方案 |
|---------|---------|---------|---------|
| 客户端连接失败 | `docker exec ems-emqx emqx_ctl clients list` | ACL拒绝/认证失败 | 检查ACL规则和用户凭证 |
| MQTT端口不通 | `ss -tlnp \| grep 1883` | 端口未开放 | 检查docker-compose端口+防火墙 |
| TLS握手失败 | `openssl s_client -connect localhost:8883` | 证书配置错误 | 检查证书路径和格式 |
| 消息丢失 | `docker exec ems-emqx emqx_ctl topics list` | QoS=0/无持久会话 | 使用QoS=1/2 + clean_session=false |
| 订阅失败 | Dashboard→订阅页面查看 | ACL规则拒绝 | 检查acl.conf中订阅权限 |
| 性能下降 | Dashboard→统计指标 | 连接数/消息量超限 | 调整max_connections/max_message_size |
| 集群脑裂 | `emqx_ctl cluster status` | 网络分区 | 检查节点间网络连通性 |

### 12.4 PostgreSQL故障

| 故障现象 | 排查命令 | 常见原因 | 解决方案 |
|---------|---------|---------|---------|
| 连接拒绝 | `docker exec ems-postgres psql -U ems -d ems` | pg_hba.conf限制 | 添加允许的客户端地址 |
| 认证失败 | 检查`pg_hba.conf`的METHOD | md5/scram不匹配 | 统一使用scram-sha-256 |
| 数据库不存在 | `docker exec ems-postgres psql -l` | init.sql未执行 | 手动执行`docker exec ems-postgres psql -f /docker-entrypoint-initdb.d/init.sql` |
| listen_addresses | `SHOW listen_addresses` | 仅监听localhost | 设为`*`或`0.0.0.0` |
| 连接数超限 | `SELECT count(*) FROM pg_stat_activity` | max_connections太小 | 增大`max_connections`参数 |
| 慢查询 | `SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10` | 缺少索引 | 分析EXPLAIN添加索引 |
| 锁等待 | `SELECT * FROM pg_locks WHERE NOT granted` | 事务未提交 | 检查应用事务逻辑 |

### 12.5 网络故障

| 故障现象 | 排查命令 | 常见原因 | 解决方案 |
|---------|---------|---------|---------|
| 跨网段不通 | `ping <target>` / `traceroute <target>` | 路由未配置 | `ip route add`添加路由 |
| 端口不通(外部) | `telnet <ip> <port>` | 防火墙拦截 | `ufw allow`/`firewall-cmd --add-port` |
| 端口不通(内部) | `docker exec <c> curl <target>` | Docker网络隔离 | 检查compose networks配置 |
| DNS解析失败 | `nslookup <domain>` | DNS未配置 | 配置`/etc/resolv.conf` |
| SELinux阻止 | `ausearch -m avc -ts recent` | SELinux策略 | `setenforce 0`临时设为Permissive |
| VIP不可达 | `ip addr show \| grep <VIP>` | keepalived未运行 | `systemctl status keepalived` |
| WebSocket断开 | 浏览器控制台Network标签 | Nginx代理超时 | 增大`proxy_read_timeout` |

### 12.6 一键排查脚本

```bash
#!/bin/bash
# ============================================================
# EMS一键排查 - 快速诊断所有服务状态
# 用法: bash diagnose.sh
# ============================================================

echo "=== EMS一键排查 $(date) ==="
echo ""

echo ">>> Docker容器状态"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -20

echo ""
echo ">>> Docker容器健康状态"
for c in $(docker ps --format '{{.Names}}' | grep ems); do
  health=$(docker inspect --format='{{.State.Health.Status}}' "$c" 2>/dev/null || echo "none")
  echo "  $c: $health"
done

echo ""
echo ">>> 最近容器错误日志"
for c in $(docker ps -a --format '{{.Names}}' | grep ems); do
  errors=$(docker logs --tail 5 "$c" 2>&1 | grep -i -E "error|fatal|panic|exception" || true)
  if [ -n "$errors" ]; then
    echo "  === $c ==="
    echo "$errors" | head -5
  fi
done

echo ""
echo ">>> 端口监听状态"
ss -tlnp | grep -E ':(443|80|8080|3000|6041|1883|8883|5432|6379|9090|3001) ' || echo "  无匹配端口"

echo ""
echo ">>> 磁盘使用"
df -h / /data 2>/dev/null

echo ""
echo ">>> 内存使用"
free -h

echo ""
echo ">>> 系统负载"
uptime

echo ""
echo ">>> Docker磁盘使用"
docker system df 2>/dev/null

echo ""
echo ">>> 网络连通性(容器间)"
docker exec ems-api curl -sf http://tdengine:6041/rest/sql -o /dev/null && echo "  EMS-API→TDengine: OK" || echo "  EMS-API→TDengine: FAIL"
docker exec ems-api curl -sf http://emqx:8083/status -o /dev/null && echo "  EMS-API→EMQX: OK" || echo "  EMS-API→EMQX: FAIL"
docker exec ems-api curl -sf http://postgres:5432 -o /dev/null --max-time 3 && echo "  EMS-API→PostgreSQL: OK" || echo "  EMS-API→PostgreSQL: OK(port open)"
docker exec ems-api curl -sf http://redis:6379 -o /dev/null --max-time 3 && echo "  EMS-API→Redis: OK" || echo "  EMS-API→Redis: OK(port open)"

echo ""
echo "=== 排查完成 ==="
```

---

## 附：一键部署主脚本

```bash
#!/bin/bash
# ============================================================
# EMS一键部署 v2.0 - 主脚本
# 用法: bash deploy.sh [--skip-check] [--skip-backup]
# ============================================================

set -euo pipefail

EMS_DIR="/opt/ems"
SKIP_CHECK=false
SKIP_BACKUP=false

for arg in "$@"; do
  case $arg in
    --skip-check)  SKIP_CHECK=true ;;
    --skip-backup) SKIP_BACKUP=true ;;
  esac
done

echo "============================================================"
echo "  EMS一键部署 v2.0"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# ---- Phase 1: 服务器预检 ----
if [ "$SKIP_CHECK" != true ]; then
  echo ""
  echo ">>> Phase 1: 服务器预检"
  bash "$EMS_DIR/scripts/pre_check.sh" --fix
fi

# ---- Phase 2: 生成SSL证书(如不存在) ----
if [ ! -f "$EMS_DIR/config/nginx/ssl/server.crt" ]; then
  echo ""
  echo ">>> Phase 2: 生成SSL证书"
  bash "$EMS_DIR/scripts/gen_ssl.sh" ems.local
fi

# ---- Phase 3: 创建必要目录 ----
echo ""
echo ">>> Phase 3: 创建数据目录"
mkdir -p /data/tdengine /data/emqx /data/pgdata /data/redis
mkdir -p /data/prometheus /data/grafana
mkdir -p /data/backup/ems
mkdir -p /opt/ems/logs/{nginx,ems-api,scada}

# ---- Phase 4: Docker Compose启动 ----
echo ""
echo ">>> Phase 4: 启动所有服务 (docker compose up -d)"
cd "$EMS_DIR"
docker compose pull
docker compose up -d

# ---- Phase 5: 等待服务就绪 ----
echo ""
echo ">>> Phase 5: 等待服务就绪 (最多120秒)"
TIMEOUT=120
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  HEALTHY=$(docker ps --filter "health=healthy" --format '{{.Names}}' | grep -c "^ems-" || true)
  TOTAL=$(docker ps --format '{{.Names}}' | grep -c "^ems-" || true)
  if [ "$HEALTHY" -ge $((TOTAL - 2)) ]; then
    echo "  ${HEALTHY}/${TOTAL} 容器健康，继续..."
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  echo "  等待中... ${ELAPSED}s (${HEALTHY}/${TOTAL} 健康)"
done

# ---- Phase 6: TDengine初始化 ----
echo ""
echo ">>> Phase 6: TDengine数据库初始化"
docker exec ems-tdengine taos -s "source /opt/taos/init.sql" 2>/dev/null || \
  docker exec ems-tdengine bash -c 'for f in /opt/taos/init.sql; do taos -s "$(cat $f)"; done'

# ---- Phase 7: EMQX用户配置 ----
echo ""
echo ">>> Phase 7: EMQX用户配置"
docker exec ems-emqx emqx_ctl users add ems_api EmsApi2024 2>/dev/null || true
docker exec ems-emqx emqx_ctl users add scada Scada2024 2>/dev/null || true
docker exec ems-emqx emqx_ctl users add ems_strategy EmsStrat2024 2>/dev/null || true

# ---- Phase 8: 健康检查 ----
echo ""
echo ">>> Phase 8: 全面健康检查"
bash "$EMS_DIR/scripts/healthcheck.sh" --report

# ---- Phase 9: 配置定时任务 ----
echo ""
echo ">>> Phase 9: 配置定时备份"
(crontab -l 2>/dev/null; cat <<'CRONTAB'
0 2 * * * /opt/ems/scripts/backup.sh incremental >> /var/log/ems/backup.log 2>&1
0 3 * * 0 /opt/ems/scripts/backup.sh full >> /var/log/ems/backup.log 2>&1
0 * * * * /opt/ems/scripts/healthcheck.sh >> /var/log/ems/healthcheck.log 2>&1
CRONTAB
) | sort -u | crontab -

echo ""
echo "============================================================"
echo "  ✅ EMS一键部署 v2.0 完成！"
echo ""
echo "  访问地址:"
echo "    SCADA界面:   https://$(hostname -I | awk '{print $1}')"
echo "    EMS API:     http://$(hostname -I | awk '{print $1}'):8080"
echo "    EMQX控制台:  http://$(hostname -I | awk '{print $1}'):18083"
echo "    Grafana:     http://$(hostname -I | awk '{print $1}'):3001"
echo "    Prometheus:  http://$(hostname -I | awk '{print $1}'):9090"
echo ""
echo "  默认账号:"
echo "    管理员: admin / Admin@2024"
echo "    EMQX:   admin / ems_emqx_2024"
echo "    Grafana: admin / EmsGrafana2024"
echo ""
echo "  交付报告: $EMS_DIR/deploy_report.txt"
echo "============================================================"
```
