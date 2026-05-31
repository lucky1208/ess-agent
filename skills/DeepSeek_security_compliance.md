---
name: DeepSeek_security_compliance
description: >
  储能电站EMS/SCADA网络安全加固与合规映射专业Skill。覆盖SSH安全加固
  (禁止口令+密钥认证+强加密套件)、TLS/SSL证书配置(nginx HTTPS+安全头)、
  iptables/nftables防火墙端口白名单策略、WireGuard VPN远程运维隧道、
  rsyslog中央日志+auditd审计规则、账号权限最小化与MFA多因素认证、
  NIST CSF/IEC 62443/GB/T 22239(等保2.0三级)合规映射矩阵、
  电力监控系统"安全分区"三层纵深防御架构(生产控制大区I/II+管理信息大区III)、
  储能站VLAN分割与安全域通信控制、自动化安全检查脚本。
  适用场景：储能电站网络安全建设、等保2.0合规、EMS/SCADA安全评估、
  变电站网络防护、电力监控系统安防。参考标准：GB/T 22239(等保2.0)、
  IEC 62443、NIST CSF 1.1、国家能源局《电力监控系统安全防护规定》(2024)。
---

# 储能电站网络安全加固与合规映射 v2.0 (DeepSeek Edition)

## 目录

- [一、电力监控系统安全法规框架](#一电力监控系统安全法规框架)
- [二、安全分区与纵深防御架构](#二安全分区与纵深防御架构)
- [三、SSH安全加固(配置+脚本)](#三ssh安全加固配置脚本)
- [四、TLS/SSL证书配置规范](#四tlsssl证书配置规范)
- [五、防火墙端口清单与封闭策略(iptables/nftables)](#五防火墙端口清单与封闭策略iptablesnftables)
- [六、WireGuard VPN远程运维配置](#六wireguard-vpn远程运维配置)
- [七、日志审计配置(rsyslog+auditd+fail2ban)](#七日志审计配置rsyslogauditdfail2ban)
- [八、账号与权限安全审计(最小权限+MFA)](#八账号与权限安全审计最小权限mfa)
- [九、网络分区与VLAN安全域设计](#九网络分区与vlan安全域设计)
- [十、安全基线对比表(加固前后)](#十安全基线对比表加固前后)
- [十一、GB/T 22239等保2.0三级合规映射](#十一gbt-22239等保20三级合规映射)
- [十二、NIST CSF合规映射](#十二nist-csf合规映射)
- [十三、IEC 62443工控安全合规参考](#十三iec-62443工控安全合规参考)
- [十四、自动化安全检查脚本(Linux+Powershell)](#十四自动化安全检查脚本linuxpowershell)
- [十五、安全加固实施流程与回滚预案](#十五安全加固实施流程与回滚预案)
- [附录A：储能系统端口矩阵速查](#附录a储能系统端口矩阵速查)
- [附录B：等保2.0三级控制点速查](#附录b等保20三级控制点速查)

---

## 一、电力监控系统安全法规框架

### 1.1 法规与标准体系

```text
【中国电力监控系统安全法规框架】

国家层面：
  《网络安全法》(2017.6.1)
  《关键信息基础设施安全保护条例》(2021.9.1)
  《数据安全法》(2021.9.1)
  《个人信息保护法》(2021.11.1)

电力行业专项：
  国家能源局《电力监控系统安全防护规定》(2024修订版)
  国家能源局《电力监控系统安全防护总体方案》
  《电力二次系统安全防护规定》
  《电力行业网络安全等级保护管理办法》

技术标准：
  GB/T 22239-2019 信息安全技术 网络安全等级保护基本要求(等保2.0)
  GB/T 28448-2019 网络安全等级保护测评要求
  GB/T 25070-2019 网络安全等级保护安全设计技术要求
  GB/T 39786-2021 信息系统密码应用基本要求
  IEC 62443 系列 工业自动化和控制系统网络安全
  NIST Cybersecurity Framework (CSF 1.1)
  NISTIR 7628 智能电网网络安全指南

储能项目适用等级：
  □ 接入10kV及以上电网的储能站 → 等保三级
  □ 接入0.4kV的独立工商业储能 → 等保二级
  □ 用户侧微网储能 → 根据《定级指南》判定
```

### 1.2 电力监控系统"安全分区"原则

```text
【电力监控系统安全分区（纵深防御第一层）】

安全区I (生产控制大区 - 控制区)
  ├── EMS/SCADA实时控制系统
  ├── PCS直接控制接口
  ├── 保护装置通信
  ├── AGC/AVC控制系统
  └── BMS控制层
  │
  │ ←─── 物理隔离/正向隔离装置(GAP/网闸)
  │
安全区II (生产控制大区 - 非控制区)
  ├── 电能量采集系统
  ├── 水情/气象监测
  ├── 故障录波系统
  └── 生产报表/数据分析
  │
  │ ←─── 电力专用横向单向安全隔离装置(正反向隔离)
  │
安全区III (管理信息大区)
  ├── 生产管理系统(PMIS)
  ├── ERP/物资管理
  └── 办公网络
  │
  │ ←─── 防火墙/VPN
  │
外网/Internet
  └── 运维远程接入(VPN加密)
```

---

## 二、安全分区与纵深防御架构

### 2.1 储能站纵深防御示意图

```text
【储能站纵深防御架构】

                    ┌─────────────────────────────────┐
                    │        外网/Internet              │
                    └──────────────┬──────────────────┘
                                   │
                          ┌────────▼────────┐
                          │   防火墙/VPN     │ (WireGuard/IPSec)
                          └────────┬────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │         管理信息大区(安全区III)           │
              │  运维工作站 │ 视频监控NVR │ 云平台MQTTS   │
              └────────────────────┬────────────────────┘
                                   │
                          ┌────────▼────────┐
                          │  电力专用横向    │ (正向隔离装置/GAP)
                          │  单向隔离装置    │
                          └────────┬────────┘
                                   │
       ┌───────────────────────────┴───────────────────────────┐
       │              生产控制大区(安全区I+II)                  │
       │                                                        │
       │   EMS服务器 │ BAMU/BMS站控 │ PCS控制器 │ 保护装置       │
       │   时间同步   │ 电能量采集    │ 故障录波   │ AGC/AVC控制   │
       └────────────────────────────────────────────────────────┘

安全区I/II ↔ 安全区III → 必须通过电力专用正向隔离装置
安全区III ↔ 外部网络 → 防火墙+VPN
安全区I/II内通信 → 专用VLAN, 严格限制跨区通信
```

### 2.2 安全域通信矩阵

```text
┌──────────┬─────┬─────┬─────┬─────┬──────────┐
│ 从→到     │区I  │区II │区III│外网  │日常说明    │
├──────────┼─────┼─────┼─────┼─────┼──────────┤
│ 区I(控制) │ 放开 │ 放开 │ 禁止 │ 禁止 │ 根本不出区  │
│ 区II(监)  │ 放开 │ 放开 │正向GAP│禁止 │ 采集单向出  │
│ 区III(MGT)│ 禁止 │反向GAP│放开 │防火墙│ 严格管控    │
│ 外网      │ 禁止 │ 禁止 │ VPN │ 禁止 │ 仅VPN入口   │
└──────────┴─────┴─────┴─────┴─────┴──────────┘

说明：
  区I/II间通信：允许（同为生产控制大区内部）
  区I/II→区III：禁止（最高安全要求, 不允许控制区对管理区开放）
  区III→区I/II：仅通过反向隔离装置（数据单向传输）
  实时控制指令不允许通过区III进行
```

### 2.3 储能站VLAN划分设计

```text
VLAN 10 — 生产控制大区(I/II) - 控制与采集
  设备：EMS服务器(双网卡)、BAMU/BMS站控、PCS控制器、
        电表/多功能仪表、保护装置、GPS/NTP服务器
  安全规则：禁止主动发起外部连接, 不路由到VLAN20/VLAN30

VLAN 20 — 运维管理区(III区)
  设备：运维工作站、视频监控NVR与摄像头、门禁控制器、环境监测
  安全规则：允许从跳板机(堡垒机)访问EMS

VLAN 30 — 远端接入区
  设备：VPN网关(VLAN10和VLAN20的边界)
  安全规则：仅允许经过VPN认证的运维人员, 不允许直接内部通信

VLAN 100 — 管理区
  设备：网络设备管理IP
  安全规则：仅运维管理员经VPN访问
```

---

## 三、SSH安全加固(配置+脚本)

### 3.1 SSH Server安全配置检查表(Linux — /etc/ssh/sshd_config)

| 配置参数 | 加固要求 | 默认风险 | 状态 |
|---------|---------|---------|------|
| PermitRootLogin no | 强制禁止root远程登录 | 高危-暴力破解目标 | □ |
| PasswordAuthentication no | 仅允许密钥认证 | 高危-弱密码风险 | □ |
| PubkeyAuthentication yes | 是 | 推荐 | □ |
| Protocol 2 | 仅Protocol 2 | SSH v1不安全 | □ |
| Port XXXX | 改为非22自定义端口 | 减少扫描探测 | □ |
| AllowUsers \<user1\> \<user2\> | 白名单 | 限制登录用户 | □ |
| MaxAuthTries 3 | ≤3次 | 防止暴力破解 | □ |
| ClientAliveInterval 300 / ClientAliveCountMax 0 | 超时断开 | 防止闲置会话 | □ |
| LoginGraceTime 30 | 30秒 | 防止阻塞 | □ |
| X11Forwarding no | 禁止X11 | 无图形需要 | □ |
| PermitEmptyPasswords no | 禁止空密码 | 高危 | □ |
| HostbasedAuthentication no | 禁止 | 安全性低 | □ |
| Ciphers aes256-ctr,aes192-ctr,aes128-ctr | 强加密套件 | 禁止弱加密 | □ |
| MACs hmac-sha2-512,hmac-sha2-256 | 强MAC | 禁止sha1/MD5 | □ |
| KexAlgorithms curve25519-sha256,diffie-hellman-group-exchange-sha256 | 强密钥交换 | 禁止弱Kex | □ |
| Banner /etc/issue.net | 法律警告横幅 | 推荐 | □ |

### 3.2 SSH强化自动脚本(bash)

```bash
#!/bin/bash
# =============================================
# SSH安全加固脚本 - 储能EMS/SCADA Linux服务器
# 适用：Ubuntu 20.04+ / CentOS 7+/ Rocky 8+
# =============================================

SSH_CONFIG="/etc/ssh/sshd_config"
BACKUP="${SSH_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

echo "=== SSH安全加固脚本 ==="

# Step 1: 备份原配置
cp "$SSH_CONFIG" "$BACKUP"
echo "[OK] 已备份SSH配置到 $BACKUP"

# Step 2: 应用安全配置
echo "应用SSH安全配置..."

# 禁用root登录
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' "$SSH_CONFIG"
grep -q "^PermitRootLogin" "$SSH_CONFIG" || echo "PermitRootLogin no" >> "$SSH_CONFIG"

# 仅协议2
sed -i 's/^#*Protocol.*/Protocol 2/' "$SSH_CONFIG"
grep -q "^Protocol" "$SSH_CONFIG" || echo "Protocol 2" >> "$SSH_CONFIG"

# 禁用密码认证（强制密钥）
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "$SSH_CONFIG"
grep -q "^PasswordAuthentication" "$SSH_CONFIG" || \
  echo "PasswordAuthentication no" >> "$SSH_CONFIG"

# 启用公钥认证
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' "$SSH_CONFIG"

# 最大认证尝试次数为3
sed -i 's/^#*MaxAuthTries.*/MaxAuthTries 3/' "$SSH_CONFIG"
grep -q "^MaxAuthTries" "$SSH_CONFIG" || echo "MaxAuthTries 3" >> "$SSH_CONFIG"

# 空闲超时
sed -i 's/^#*ClientAliveInterval.*/ClientAliveInterval 300/' "$SSH_CONFIG"
grep -q "^ClientAliveInterval" "$SSH_CONFIG" || \
  echo "ClientAliveInterval 300" >> "$SSH_CONFIG"
sed -i 's/^#*ClientAliveCountMax.*/ClientAliveCountMax 0/' "$SSH_CONFIG"
grep -q "^ClientAliveCountMax" "$SSH_CONFIG" || \
  echo "ClientAliveCountMax 0" >> "$SSH_CONFIG"

# 登录宽限时间
sed -i 's/^#*LoginGraceTime.*/LoginGraceTime 30/' "$SSH_CONFIG"
grep -q "^LoginGraceTime" "$SSH_CONFIG" || echo "LoginGraceTime 30" >> "$SSH_CONFIG"

# 禁止空密码
sed -i 's/^#*PermitEmptyPasswords.*/PermitEmptyPasswords no/' "$SSH_CONFIG"

# 禁止X11转发
sed -i 's/^#*X11Forwarding.*/X11Forwarding no/' "$SSH_CONFIG"

# 强加密算法
cat >> "$SSH_CONFIG" << 'EOF'

# === 安全加固: 强加密套件 ===
Ciphers aes256-ctr,aes192-ctr,aes128-ctr
MACs hmac-sha2-512,hmac-sha2-256
KexAlgorithms curve25519-sha256,diffie-hellman-group-exchange-sha256
EOF

# Step 3: 验证配置语法并重载
echo "检查SSH配置语法..."
sshd -t
if [ $? -eq 0 ]; then
    echo "[OK] SSH配置语法正确"
    systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null
    echo "[OK] SSH服务已重新加载"
    echo "=== SSH加固完成 ==="
else
    echo "[FAIL] SSH配置语法错误! 恢复备份..."
    cp "$BACKUP" "$SSH_CONFIG"
    systemctl reload sshd 2>/dev/null
    echo "[RESTORED] 已恢复到原配置"
    exit 1
fi
```

### 3.3 SSH密钥管理规范

```text
密钥类型选择：
  √ Ed25519 (推荐, 安全且快速)
  √ RSA 4096-bit
  ✗ RSA 1024-bit (不安全)
  ✗ DSA (已弃用)
  ✗ ECDSA (有理论弱点)

密钥存放：
  - 私钥权限：chmod 600 ~/.ssh/id_ed25519
  - 公钥权限：chmod 644 ~/.ssh/id_ed25519.pub
  - 私钥绝不允许离开授权运维人员的受控终端
  - 定期轮换(每6个月)SSH密钥

authorized_keys管理：
  - 每个运维人员独立的公钥
  - 员工离职/换岗后立即从所有系统删除其公钥
  - 用Ansible/Puppet等集中管理authorized_keys
```

---

## 四、TLS/SSL证书配置规范

### 4.1 Web服务TLS配置(Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name ems.station-name.local;

    # TLS 1.3推荐, 最小TLS 1.2
    ssl_protocols TLSv1.2 TLSv1.3;

    # 强加密套件 (Mozilla Modern)
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';
    ssl_prefer_server_ciphers on;

    # DH参数 (openssl dhparam -out dhparam.pem 2048)
    ssl_dhparam /etc/nginx/certs/dhparam.pem;

    # 证书
    ssl_certificate     /etc/nginx/certs/ems_fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/ems_privkey.pem;

    # 安全头
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/certs/ems_fullchain.pem;

    # 会话复用
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1h;
    ssl_session_tickets off;

    # 禁止不安全的HTTP方法
    if ($request_method !~ ^(GET|HEAD|POST)$) {
        return 405;
    }

    location / {
        proxy_pass http://localhost:8080;
    }
}

# HTTP强制跳转到HTTPS
server {
    listen 80;
    server_name ems.station-name.local;
    return 301 https://$host$request_uri;
}
```

### 4.2 证书生命周期管理

```text
证书类型选择：
  □ 自签名证书 (Self-Signed)
    适用：站内局域网、安全区I/II内部通信
    有效期：可设长(如5~10年)
  
  □ 企业CA签发的内部证书
    适用：内部管理域内多个系统之间的TLS
    CA服务器必须安全（离线长期最好）
    有效期：1~2年

  □ 商用CA签发的证书
    适用：面向公网的云平台、VPN入口
    推荐：Let's Encrypt(免费)或DigiCert
    有效期：90天(LE)~1年(商业CA)

证书生命周期事项：
  □ 部署时配置自动续期脚本(Let's Encrypt certbot或ACME)
  □ 监控证书过期(提前30天告警)
  □ 内部CA的CRL/OCSP部署
```

---

## 五、防火墙端口清单与封闭策略(iptables/nftables)

### 5.1 储能站完整端口矩阵

```text
原则：默认全部端口关闭, 仅开放业务必需端口

┌───────┬──────────┬──────────┬─────────────┬──────────┬──────────┐
│ 端口   │ 协议      │ 服务       │ 源→目的       │ 用途       │ 建议      │
├───────┼──────────┼──────────┼─────────────┼──────────┼──────────┤
│ 22    │ TCP      │ SSH      │ 管理终端→EMS  │ 远程管理   │ 必开(改端口)│
│ 443   │ TCP      │ HTTPS    │ 用户→EMS     │ Web/HMI   │ 必开      │
│ 502   │ TCP      │ ModbusTCP│ EMS→PCS/BMS/ │ PLC通信   │ 区I/II内  │
│       │          │          │ 电表         │           │ 严格隔离  │
│ 161   │ UDP      │ SNMP     │ NMS→交换机    │ 网络监控   │ 可开      │
│ 123   │ UDP      │ NTP      │ NTP→所有设备  │ 时间同步   │ 必开      │
│ 514   │ UDP/TCP  │ Syslog   │ 设备→日志服务器│ 日志收集   │ 必开      │
│ 2404  │ TCP      │ IEC104   │ 调度→EMS     │ 调度通信   │ 必开      │
│ 1883  │ TCP      │ MQTT     │ EMS→云平台    │ 云平台通信  │ 需TLS    │
│ 8883  │ TCP      │ MQTTS    │ EMS→云平台    │ 安全MQTT   │ 推荐      │
│ 3306  │ TCP      │ MySQL    │ App→DB       │ 数据库     │ 仅本地   │
│ 5432  │ TCP      │ PostgreSQL│ App→DB       │ 数据库     │ 仅本地   │
│ 6379  │ TCP      │ Redis    │ App→Cache    │ 缓存       │ 仅本地   │
│ 51820 │ UDP      │ WireGuard│ 远程运维     │ 现代VPN    │ 推荐      │
├───────┼──────────┼──────────┼─────────────┼──────────┼──────────┤
│ 以下端口一律关闭：                                                      │
│ 21     │ FTP明文   │ 不安全     │ ✗                                    │
│ 23     │ Telnet明文│ 不安全     │ ✗                                    │
│ 80     │ HTTP明文  │ 不安全     │ ✗ (仅用于HTTPS重定向)                │
│ 53     │ DNS      │ 自身不做DNS │ ✗                                   │
│ 137-139│ NetBIOS  │ 不存在     │ ✗                                    │
│ 445    │ SMB      │ 不安全     │ ✗                                    │
│ 3389   │ TCP      │ RDP       │ 不安全     │ ✗                                    │
└───────┴──────────┴──────────┴─────────────┴──────────┴──────────┘
```

### 5.2 nftables防火墙脚本(推荐, Linux 4.18+)

```bash
#!/bin/bash
# ===========================================
# 储能站EMS防火墙脚本 (nftables版本)
# 策略：默认全部DROP, 白名单放行
# ===========================================

# 清空现有规则
nft flush ruleset

# 基础表
nft add table inet filter
nft add chain inet filter input { type filter hook input priority 0; policy drop; }
nft add chain inet filter forward { type filter hook forward priority 0; policy drop; }
nft add chain inet filter output { type filter hook output priority 0; policy accept; }

# === INPUT链规则 ===

# 允许loopback
nft add rule inet filter input iif lo accept

# 允许已建立/相关连接
nft add rule inet filter input ct state established,related accept

# SSH管理端口 (改为实际custom端口)
nft add rule inet filter input tcp dport 2222 ct state new \
  ip saddr {192.168.10.0/24, 10.100.0.0/16} accept comment "SSH from management network"

# HTTPS (Web/HMI)
nft add rule inet filter input tcp dport 443 accept comment "HTTPS"

# Modbus TCP (仅区I/II内, 不允许外部)
nft add rule inet filter input tcp dport 502 \
  ip saddr 192.168.10.0/24 accept comment "ModbusTCP from Zone I/II only"

# NTP
nft add rule inet filter input udp dport 123 accept comment "NTP"

# Syslog
nft add rule inet filter input udp dport 514 accept comment "Syslog UDP"
nft add rule inet filter input tcp dport 514 accept comment "Syslog TCP"

# WireGuard VPN
nft add rule inet filter input udp dport 51820 accept comment "WireGuard VPN"

# IEC104 调度通信
nft add rule inet filter input tcp dport 2404 \
  ip saddr {调度IP} accept comment "IEC104 from dispatch"

# ICMP (可选, 用于排障)
nft add rule inet filter input icmp type echo-request limit rate 10/second accept

# 拒绝所有ICMP
nft add rule inet filter input icmp type echo-request drop

# 记录并丢弃
nft add rule inet filter input log prefix "FW-DROP: " drop

# 保存规则
if [ -d /etc/nftables ]; then
    nft list ruleset > /etc/nftables/rules-save.nft
    echo "规则已保存到 /etc/nftables/rules-save.nft"
fi

echo "防火墙规则已应用"
```

### 5.3 防火墙验证命令

```text
# 查看当前活动规则
nft list ruleset

# 检查端口是否在监听
ss -tlnp    # TCP端口
ss -ulnp    # UDP端口

# 检查端口能否从外部访问
nmap -sT -p 22,443,502,2404,8080 <EMS_IP>

# 检查不应开放的端口是否确实关闭
nmap -sT -p 21,23,80,445,3389 <EMS_IP>
# 应返回：port is closed 或 filtered
```

---

## 六、WireGuard VPN远程运维配置

### 6.1 WireGuard服务端配置(/etc/wireguard/wg0.conf)

```ini
[Interface]
Address = 10.200.200.1/24
ListenPort = 51820
PrivateKey = <server-private-key>

# 开启IP转发
PostUp = sysctl -w net.ipv4.ip_forward=1
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT

# 运维工程师1
[Peer]
PublicKey = <peer1-public-key>
AllowedIPs = 10.200.200.10/32
# 限定该节点只能访问EMS和管理网段

# 运维工程师2
[Peer]
PublicKey = <peer2-public-key>
AllowedIPs = 10.200.200.11/32
```

**特点**：内核级(Linux 5.6+)、极简配置、高性能、通过简单密钥交换实现安全

**生成密钥对**：
```bash
wg genkey | tee server-private.key | wg pubkey > server-public.key
wg genkey | tee peer1-private.key | wg pubkey > peer1-public.key
```

**启动与检查**：
```bash
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
wg show
```

### 6.2 VPN安全注意事项

```text
□ 禁止使用PPTP (已知不安全达数十年)
□ IPSec优先IKEv2, 不用IKEv1
□ 配置强加密套件(AES-256, SHA-256, DH 2048+)
□ VPN回话在不使用时自动断开
□ 运维人员证书有期限(如1年), 定期更新
□ VPN被攻破的应急程序
□ 每位运维人员独立密钥对, 可单独撤销
```

---

## 七、日志审计配置(rsyslog+auditd+fail2ban)

### 7.1 rsyslog中央日志服务器配置

```text
【客户端配置(EMS/SCADA/BMS等) — /etc/rsyslog.conf 末尾添加】

$ModLoad imuxsock   # 本地系统日志
$ModLoad imklog     # 内核日志

# 将认证日志发送到远程服务器
authpriv.*  @@192.168.10.199:514

# 使用TCP以防丢失(用@@代替@)
local7.*    @@192.168.10.199:514
kern.*;*.emerg  @@192.168.10.199:514

【日志服务器配置 — /etc/rsyslog.conf】

$ModLoad imudp
$UDPServerRun 514
$ModLoad imtcp
$InputTCPServerRun 514

# 按主机名分文件夹存储日志
$template RemoteLogs,"/var/log/remote/%HOSTNAME%/%$YEAR%-%$MONTH%-%$DAY%.log"
*.* ?RemoteLogs

# logrotate保留策略：daily, rotate 90, compress
```

### 7.2 auditd审计规则配置

```text
# /etc/audit/rules.d/audit.rules

-D
-b 8192

# 系统文件修改
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k sudoers

# SSH配置
-w /etc/ssh/sshd_config -p wa -k sshd

# 防火墙配置
-w /etc/nftables/ -p wa -k firewall

# 时间和系统修改
-w /etc/localtime -p wa -k time-change
-a always,exit -F arch=b64 -S clock_settime -S settimeofday -S stime -k time-change

# 监控EMS配置文件
-w /etc/ems/config.yaml -p wa -k ems_config
-w /etc/ems/strategies/ -p wa -k ems_strategy

# 监控Modbus/通信配置文件
-w /etc/modbus/ -p wa -k comm_config

# 登录事件
-w /var/log/lastlog -p wa -k logins
-w /var/run/faillock/ -p wa -k logins

# 使规则生效
augenrules --load
systemctl enable auditd
systemctl restart auditd
```

### 7.3 fail2ban防暴力破解配置

```text
# /etc/fail2ban/jail.local

[sshd]
enabled = true
port = ssh,2222
filter = sshd
maxretry = 3
findtime = 10m
bantime = 1h

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
maxretry = 5
bantime = 30m
```

### 7.4 日志监控查询命令

```bash
# 过去24h的SSH认证失败
grep "Failed password" /var/log/auth.log | tail -50

# 今天谁登录了
grep "Accepted publickey" /var/log/auth.log | grep $(date +%b)

# auditd用户修改
ausearch -k identity --format text | tail -20

# 防火墙丢弃记录
dmesg | grep "FW-DROP" | tail -20
```

---

## 八、账号与权限安全审计(最小权限+MFA)

### 8.1 账号权限矩阵(最小权限原则)

| 角色 | 最小权限要求 |
|------|-------------|
| 运维管理员(operator) | sudo权限(限特定命令)、查看日志、执行预定义脚本、查看修改EMS参数、不允许修改系统/内核参数 |
| 区域值班员(viewer) | 仅EMS/HMI界面查看权限、无修改权限、无SSH权限 |
| root | 仅Emergency使用、禁用SSH远程登录、仅物理控制台可用 |
| 应用账户(service) | 各自只访问自己数据目录、禁止交互式登录(/sbin/nologin)、密码存储在Vault中 |

### 8.2 sudo权限配置

```text
# visudo 添加：
%operator ALL=(ALL) /usr/bin/systemctl restart ems, /usr/bin/systemctl status ems, /usr/bin/journalctl -u ems, /usr/bin/tail -f /var/log/ems/*, /usr/local/bin/ems_maintenance.sh

# 不允许操作员运行shell或su
%operator ALL=!/bin/bash, !/bin/sh, !/usr/bin/su, !/usr/bin/passwd
```

### 8.3 强密码策略(PAM)

```text
# /etc/security/pwquality.conf
minlen = 12              # 最小长度12
dcredit = -1             # 至少1个数字
ucredit = -1             # 至少1个大写
lcredit = -1             # 至少1个小写
ocredit = -1             # 至少1个特殊字符
minclass = 4             # 至少4类字符
maxrepeat = 3            # 不允许连续重复3次
maxsequence = 4          # 不允许连续序列(如abcd,1234)
enforce_for_root         # 对root也强制执行

# /etc/login.defs
PASS_MAX_DAYS   90       # 密码最长90天后必须更改
PASS_MIN_DAYS   1        # 最短1天才能再次更改
PASS_WARN_AGE   7        # 到期前7天警告
UMASK           027      # 默认umask加强

# 账户锁定策略(pam_faillock)
# 连续错误登录5次后锁定30分钟
auth required pam_faillock.so preauth silent audit deny=5 unlock_time=1800
```

### 8.4 MFA多因素认证配置

```text
【MFA配置 (Google Authenticator / TOTP)】

# 安装
apt install libpam-google-authenticator

# 每个用户生成TOTP密钥
google-authenticator -t -d -r 3 -R 30 -W

# 修改 /etc/pam.d/sshd
auth required pam_google_authenticator.so

# SSH配置中需要：
ChallengeResponseAuthentication yes
AuthenticationMethods publickey,keyboard-interactive
# (使SSH先验证公钥, 再验证TOTP二次认证)

【MFA方案备选】
  - 硬件Token (YubiKey) + pam_u2f (FIDO2)
  - 企业级MFA (FortiAuthenticator/Duo Security)
```

### 8.5 权限审计脚本

```bash
#!/bin/bash
echo "=== 账号和权限审计报告 ==="
echo "生成时间: $(date)"

echo "--- 最近登录记录 ---"
last -n 20

echo "--- 当前登录用户 ---"
who

echo "--- 失败的登录尝试 ---"
lastb -n 20

echo "--- 特权用户检查 (UID=0) ---"
awk -F: '$3 == 0 {print $1, $3}' /etc/passwd | grep -v root

echo "--- 可登录用户检查(排除nologin) ---"
grep -v "/nologin\|/false\|/sync\|/halt\|/shutdown" /etc/passwd | \
  awk -F: '{print $1, $NF}'

echo "--- 无密码sudo用户 ---"
grep -r "NOPASSWD" /etc/sudoers /etc/sudoers.d/ 2>/dev/null

echo "--- 审计完成 ---"
```

---

## 九、网络分区与VLAN安全域设计

### 9.1 储能站交换机VLAN配置

```text
VLAN 10 — 生产控制大区(I/II)
  设备：EMS服务器、BAMU/BMS站控、PCS控制器、电表、保护装置、GPS/NTP
  安全规则：禁止主动发起外部连接、仅允许EMS/BAMU间通信

VLAN 20 — 运维管理区(III区)
  设备：运维工作站、视频监控NVR、门禁控制器、环境监测
  安全规则：允许从跳板机(堡垒机)访问EMS

VLAN 30 — 远端接入区
  设备：VPN网关
  安全规则：仅允许经过VPN认证的运维人员、不允许直接内部通信

VLAN 100 — 管理区
  设备：网络设备管理IP
  安全规则：仅运维管理员经VPN访问
```

### 9.2 交换机ACL简例

```text
interface VLAN 10
  ip address 192.168.10.1 255.255.255.0
    ! 禁止VLAN10设备访问VLAN20
    ip access-group ZONE_I_ISOLATION in
    ip access-group ZONE_I_ISOLATION out
```

---

## 十、安全基线对比表(加固前后)

### 10.1 EMS安全加固前后对比表

| 安全检查项 | 加固前(默认) | 加固后(目标) | 符合 |
|----------|-------------|-------------|------|
| SSH root登录 | 允许 | 禁止 | ✓ |
| SSH密码认证 | 允许 | 仅公钥认证 | ✓ |
| SSH默认端口22 | 使用22 | 改为非标准端口 | ✓ |
| SSH加密套件 | 不定(含弱加密) | 强加密(aes256-ctr) | ✓ |
| Web界面HTTPS | HTTP可用 | HTTPS强制+HTTP重定向 | ✓ |
| TLS版本 | TLSv1.0/1.1/1.2 | TLSv1.2+1.3仅 | ✓ |
| 证书 | 自签名未管理 | 内部CA或托管证书 | ✓ |
| 安全头 | 无 | HSTS/X-Frame等 | ✓ |
| 端口开放 | 各种服务按需打开 | 最小化(仅业务端口) | ✓ |
| 防火墙策略 | 默认接受 | 默认拒绝(白名单) | ✓ |
| 远程运维访问 | 直接SSH开放 | VPN加密+堡垒机 | ✓ |
| VPN加密 | 未部署/PPTP | WireGuard/IPSec | ✓ |
| 日志集中 | 各设备独立 | 中央日志服务器 | ✓ |
| 审计日志(auditd) | 未启用 | 启用 | ✓ |
| 密码策略 | 无/弱 | 12位+4类+90天 | ✓ |
| 账号锁定 | 无 | 5次失败锁定30min | ✓ |
| MFA | 无 | TOTP/YubiKey | ✓ |
| 网络分区 | 扁平网络 | 多VLAN隔离 | ✓ |
| 区I/II和区III隔离 | 通过防火墙 | GAP+防火墙 | ✓ |
| 操作系统已打补丁 | 遗漏补丁 | 全部最新安全补丁 | ✓ |
| USB/外设控制 | 允许 | BIOS+系统禁用 | ✓ |

### 10.2 基线检查脚本(简化版)

```bash
#!/bin/bash
echo "=== EMS安全基线检查脚本 ==="
PASS=0; FAIL=0

check() {
    desc="$1"; cmd="$2"; expected="$3"
    actual=$(eval "$cmd" 2>/dev/null)
    if echo "$actual" | grep -q "$expected"; then
        echo "[✓] $desc"; ((PASS++))
    else
        echo "[✗] $desc (实际: $actual)"; ((FAIL++))
    fi
}

check "Root SSH禁止" \
  "grep '^PermitRootLogin' /etc/ssh/sshd_config" "no"
check "密码认证禁止" \
  "grep '^PasswordAuthentication' /etc/ssh/sshd_config" "no"
check "HTTP自动重定向到HTTPS" \
  "grep 'return 301 https' /etc/nginx/sites-enabled/*" "301"
check "防火墙默认策略=拒绝" \
  "nft list ruleset | grep policy" "drop"
check "auditd运行中" \
  "systemctl is-active auditd" "active"

echo "=== 结果: ✓=$PASS  ✗=$FAIL ==="
```

---

## 十一、GB/T 22239等保2.0三级合规映射

### 11.1 等保2.0三级 — 储能站合规映射

| 等保要求领域 | 安全控制 | 对应本方案 |
|------------|---------|-----------|
| **安全物理环境** | 空调/防水/防雷/温湿度/电力供应 | 安全分区设计 |
| **安全通信网络** | 网络分区/线缆标识/通信加密(生产控制大区访问控制、VLAN划分) | 2章、9章、5章 |
| **安全区域边界** | 防火墙/IPS/边界完整性检查/入侵检测(区I/II边界) | 2章、5章 |
| **安全计算环境** | 身份验证/访问控制/安全审计/入侵防范/数据完整性/恶意代码防范 | 3章、8章、7章 |
| **安全管理中心** | 集中安全管理(堡垒机+日志服务器)/安全事件管理(SIEM) | 7章、8章 |
| **安全管理制度** | 安全策略/安全管理规范/操作规程(SOP) | 15章 |
| **安全运维管理** | 巡检/变更/备份/应急/演练 | 15章 |

### 11.2 等保2.0三级安全计算环境要求速查

```text
a) 身份鉴别
   □ 对登录的用户进行身份标识和鉴别
   □ 管理多个用户账号和复杂密码策略
   □ 配置MFA或验证码
   □ 限制连续登录失败次数(锁定/延长间隔)
   □ 远程管理加密
   □ 重新认证(超时/锁屏后)

b) 访问控制
   □ 赋予不同的角色权限(RBAC)
   □ 限制默认账号权限最小
   □ 及时删除过期/多余账号
   □ 操作系统和数据库采用强制访问控制(SELinux等)
   □ 重要主体/客体设置安全标记

c) 安全审计
   □ 启用审计功能和事件记录
   □ 审计记录含日期/时间/用户/事件/IP
   □ 保护审计记录不被修改/删除
   □ 审计进程失败时自动中断/告警

d) 入侵防范
   □ 遵循最小安装原则(仅必要组件)
   □ 禁止不安全的TCP/UDP端口
   □ 限制终端登录方式
   □ 漏洞扫描与补丁管理

e) 恶意代码防范
   □ 安装防恶意代码软件/主机加固
   □ 保持更新

f) 可信验证
   □ 检测固件/OS Boot的完整性
   □ 检查关键配置文件的Hash
```

---

## 十二、NIST CSF合规映射

```text
【NIST Cybersecurity Framework 储能站点映射】

CSF 功能       │ 关键控制点         │ 储能实现
──────────────┼───────────────────┼──────────
IDENTIFY       │ 资产清单           │ EMS资产发现+端口扫描
(识别)         │ 风险评估           │ 安全评估工具
                │ 风险管理策略        │ 网络安全政策文档

PROTECT        │ 网络分区/分段      │ 安全区I/II/III设计
(防护)         │ 身份验证和访问控制  │ SSH/MFA/PAM策略
                │ 数据安全(加密)     │ TLS+VPN加密
                │ 安全配置基线       │ 安全加固脚本

DETECT         │ 日志审计           │ rsyslog+auditd+SIEM
(检测)         │ 入侵检测           │ Fail2ban/IDS
                │ 持续监控          │ 告警+仪表盘

RESPOND        │ 事件响应计划        │ 应急响应手册
(响应)         │ 事件分析           │ 日志分析+correlation
                │ 事件沟通           │ 通知流程

RECOVER        │ 恢复计划           │ 备份+测试恢复+回滚
(恢复)         │ 事后审查           │ 改进计划+Review
```

---

## 十三、IEC 62443工控安全合规参考

```text
【IEC 62443 储能适用部分】

IEC 62443-2-1: 工控安全管理系统
  □ 安全管理程序
  □ 风险评估
  □ 安全意识培训

IEC 62443-3-3: 工控系统安全要求
  
  基础要求(FR):
  FR1 - 识别与认证: 强密码+MFA+审计
  FR2 - 使用控制: RBAC+权限最小+设备锁
  FR3 - 系统完整性: 校验和+配置管理+防篡改
  FR4 - 数据机密性: TLS+VPN+存储加密
  FR5 - 受限数据流: VLAN+ACL+分段
  FR6 - 及时响应: 告警+日志+SIEM
  FR7 - 资源可用性: 备份+冗余+DoS防护

IEC 62443-4-2: 工控设备安全要求
  应用于PCS、BMS、EMS等工控设备的固件和硬件安全
```

---

## 十四、自动化安全检查脚本(Linux+Powershell)

### 14.1 Linux全量安全巡检脚本(bash)

```bash
#!/bin/bash
# ================================================
# EMS安全巡检脚本 (Linux版)
# 用于每日/每周自动安全检查, 生成报告
# ================================================

REPORT_FILE="/tmp/ems-security-audit-$(date +%Y%m%d).txt"
exec > >(tee -a "$REPORT_FILE") 2>&1

echo "=== EMS安全巡检报告 ==="
echo "时间: $(date)"
echo "主机: $(hostname)"
echo ""

PASS=0; FAIL=0

check() {
    desc="$1"; shift
    if "$@"; then
        echo "[PASS] $desc"; ((PASS++))
    else
        echo "[FAIL] $desc"; ((FAIL++))
    fi
}

# 1. SSH安全
check "SSH root禁止远程登录" grep -q "^PermitRootLogin no" /etc/ssh/sshd_config
check "SSH密码认证已禁用" grep -q "^PasswordAuthentication no" /etc/ssh/sshd_config
check "SSH仅Protocol 2" grep -q "^Protocol 2" /etc/ssh/sshd_config

# 2. 操作系统
check "auditd运行中" systemctl is-active auditd | grep -q "active"
check "rsyslog运行中" systemctl is-active rsyslog | grep -q "active"

# 3. 防火墙
check "nftables/iptables已加载" { nft list ruleset 2>/dev/null | grep -q "drop" || iptables -L 2>/dev/null | grep -q "DROP"; }

# 4. 端口
echo "--- 监听端口 ---"
ss -tlnp | grep LISTEN

# 5. 用户
echo "--- 特权用户 (UID=0) ---"
awk -F: '($3 == 0) {print $1}' /etc/passwd

# 6. 密码策略
echo "--- 密码到期设置 ---"
grep "^PASS_MAX_DAYS" /etc/login.defs
grep "^PASS_MIN_DAYS" /etc/login.defs

# 7. NTP同步
check "NTP时间同步活动" { timedatectl status 2>/dev/null | grep -q "synchronized: yes" || ntpq -p 2>/dev/null | grep -q "\*"; }

# 8. 磁盘
echo "--- 磁盘使用 ---"
df -h | grep -v tmpfs

echo ""
echo "=== 检查完成 ==="
echo "通过: $PASS  失败: $FAIL"
echo "完整报告: $REPORT_FILE"
```

### 14.2 Windows安全检查脚本(PowerShell)

```powershell
<#
.SYNOPSIS
  储能站EMS网络安全检查脚本 (Windows)
  适用于基于Windows的EMS/HMI系统或Windows运维工作站
#>

Write-Host "=== EMS Windows 安全基线检查 ===" -ForegroundColor Cyan
$pass = 0
$fail = 0

function Check ($Desc, $Condition) {
    if ($Condition) {
        Write-Host "[PASS] $Desc" -ForegroundColor Green
        $global:pass++
    } else {
        Write-Host "[FAIL] $Desc" -ForegroundColor Red
        $global:fail++
    }
}

# 防火墙状态
$fw = Get-NetFirewallProfile -Profile Domain,Public,Private
Check "Windows防火墙启用(域)" ($fw | Where-Object Name -eq "Domain").Enabled
Check "Windows防火墙启用(专用)" ($fw | Where-Object Name -eq "Private").Enabled

# RDP安全
Check "RDP允许NLA认证" (Get-ItemProperty "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name UserAuthentication).UserAuthentication -eq 1

# 密码策略
Check "密码长度≥12" ((net accounts | Select-String "Minimum password length").ToString() -match "\d+" -and [int]($matches[0]) -ge 12)
Check "密码最长使用期≤90天" ((net accounts | Select-String "Maximum password age").ToString() -match "\d+" -and [int]($matches[0]) -le 90)

# 禁用SMB v1
$smb1 = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol
Check "SMBv1已禁用" ($smb1.State -eq "Disabled")

# 开放端口审计
Write-Host "--- 开放TCP端口 ---" -ForegroundColor Yellow
netstat -an | Select-String "LISTENING" | ForEach-Object { $_ }

Write-Host "=== 结果: 通过=$pass  未通过=$fail ===" -ForegroundColor Cyan
```

---

## 十五、安全加固实施流程与回滚预案

### 15.1 安全加固三步走流程

```text
【储能站EMS安全加固标准化流程】

Phase 1: 评估与充分准备
  ├── 1. 确定当前基线(执行基线检查脚本)
  ├── 2. 识别所有网络端口和服务
  ├── 3. 识别所有账号和相关权限
  ├── 4. 收集当前网络拓扑和设备清单
  ├── 5. 制作备份（所有配置/数据库/证书）
  ├── 6. 制定回滚计划
  └── 7. 获取变更审批

Phase 2: 加固实施 (按优先级执行)
  ├── Priority 1 (影响最大)
  │   ├── 修改SSH配置(禁止root+密钥)
  │   ├── 配置防火墙(默认拒绝)
  │   └── 关闭不必要端口和服务
  ├── Priority 2
  │   ├── 配置HTTPS/TLS (禁用HTTP)
  │   ├── 部署VPN远程访问
  │   ├── 配置网络分区VLAN
  │   └── 配置日志集中
  ├── Priority 3
  │   ├── 账号/密码强化
  │   ├── 启用MFA
  │   ├── 配置auditd审计
  │   └── 配置IDS/防暴力破解
  └── Priority 4
      ├── 配置堡垒机/安全管理平台
      ├── 部署补丁管理
      └── 建立应急响应手册

Phase 3: 验证与持续
  ├── 重新执行全量安全基线检查
  ├── 做功能验证（确保EMS/BMS/PCS正常工作）
  ├── 记录加固后基线
  ├── 设置定期复查(每月)
  ├── 更新O&M规程
  └── 团队安全培训
```

### 15.2 回滚应急预案

```text
【安全加固回滚方案】

如果加固后系统出现异常：

1. SSH加密问题 → 控制台本地登录恢复配置
   cp /etc/ssh/sshd_config.bak /etc/ssh/sshd_config
   systemctl restart sshd

2. 防火墙过严 → 本地控制台清空规则
   nft flush ruleset          # nftables
   iptables -F; iptables -X   # iptables

3. HTTPS证书问题 → 临时用HTTP (仅调试期间)
   # 很快恢复证书, 不超过30min

4. 完全无法本地管理 → 物理Console
   (串口/显示器和键盘) 在BIOS恢复模式

5. 远程无法连接 → 通知现场人员
   提供远程支持或现场操作
```

---

## 附录A：储能系统端口矩阵速查

```text
【快速端口参考表】

设备          │ 端口类型   │ 端口号  │ 方向(源→目的)
─────────────┼──────────┼───────┼──────────
EMS          │ SSH       │ 2222  │ 运维→EMS
EMS          │ HTTPS     │ 443   │ 用户→EMS
EMS→PCS     │ ModbusTCP │ 502   │ EMS→PCS
EMS→BAMU    │ ModbusTCP │ 502   │ EMS→BAMU
EMS→电表     │ ModbusRTU(485)│/dev/tty│ EMS→电表
EMS→调度     │ IEC104    │ 2404  │ 调度→EMS
EMS→云平台   │ MQTTS    │ 8883  │ EMS→云
日志收集      │ Syslog    │ 514   │ 所有→日志服务器
VPN         │ WireGuard │ 51820 │ 远程→VPN
NTP         │ NTP       │ 123   │ NTP→所有

其他：
  数据库(MySQL/Postgres/Redis): 本地/lo访问, 不开放远程
  ICCP协议: 通常变电站, 储能涉及较少
```

---

## 附录B：等保2.0三级控制点速查

```text
【GB/T 22239-2019 第三级 — 安全通用要求速查】

安全物理环境：空调、防水、防雷、温湿度、电力供应

安全通信网络：
  □ 网络架构安全分区
  □ 通信传输加密与完整性
  □ 可信验证

安全区域边界：
  □ 边界防护(防火墙/网闸)
  □ 访问控制策略
  □ 入侵防范(IDS/IPS)
  □ 恶意代码防范

安全计算环境：
  □ 身份鉴别(见8.1)
  □ 访问控制(见8.1)
  □ 安全审计(见7章)
  □ 入侵防范(见7.3/5章)
  □ 数据完整性/保密性

安全管理中心：
  □ 系统管理
  □ 审计管理
  □ 安全管理
  □ 集中管控

管理制度、管理机构、管理人员、建设管理、运维管理
```

---

*版本: v2.0 (DeepSeek Edition)*
*适用范围: 储能电站网络安全加固、等保2.0合规、SCADA/EMS安全评估、变电站网络防护*
