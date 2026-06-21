# OCPP CSMS 部署指南

## 前置条件

- Railway 账号（https://railway.app）
- ess-agent.com 域名 DNS 管理权限
- Git 环境

---

## Step 1: Railway 项目创建

### 方式A：GitHub 仓库连接
1. 登录 Railway Dashboard → New Project → Deploy from GitHub repo
2. 选择 `lucky1208/ess-platform` 仓库
3. Root Directory 设置为 `/ocpp-csms-server`
4. Railway 自动检测 Node.js 项目并构建

### 方式B：CLI 部署
```bash
npm install -g @railway/cli
railway login
cd ocpp-csms-server
railway init
railway up
```

---

## Step 2: 环境变量配置

在 Railway 项目 Settings → Variables 中添加：

| 变量名 | 生产推荐值 | 说明 |
|--------|-----------|------|
| `PORT` | （Railway自动分配，无需设置） | HTTP 端口 |
| `WS_PATH` | `/ocpp` | WebSocket 路径前缀 |
| `CORS_ORIGIN` | `https://www.ess-agent.com,https://ess-agent.com` | 允许的前端域名 |
| `ALLOWED_CP_IDS` | （留空=允许全部，或填前缀如 `CP_,2023`） | 充电桩ID白名单前缀 |
| `API_KEYS` | （可选，留空=不校验） | API Key 白名单，逗号分隔 |
| `HEARTBEAT_INTERVAL` | `30000` | 心跳间隔(毫秒) |
| `HEARTBEAT_TIMEOUT` | `60000` | 心跳超时(毫秒) |
| `REQUEST_TIMEOUT` | `30000` | 请求超时(毫秒) |

---

## Step 3: 域名配置（方案A：子域名 CNAME，推荐）

1. 在 Railway 项目 Settings → Networking → Generate Domain，获取 Railway 分配的域名（如 `ocpp-csms-production.up.railway.app`）
2. 在域名 DNS 管理面板添加 CNAME 记录：
   - 主机记录：`ocpp`
   - 记录值：`ocpp-csms-production.up.railway.app`（替换为你的 Railway 域名）
   - TTL：3600
3. 在 Railway 项目 Settings → Variables 中添加：
   - `RAILWAY_WWW_DOMAIN=ocpp.ess-agent.com`
4. 等待 DNS 传播（5-30 分钟）
5. 验证：`nslookup ocpp.ess-agent.com` 应解析到 Railway 域名

### 方案B：Cloudflare Workers 反向代理
- 适用于需要 Cloudflare CDN 加速的场景
- 创建 Worker 脚本将 `/ocpp/*` 请求代理到 Railway 后端
- WebSocket 需要确保 Cloudflare 不中断长连接

### 方案C：端口直连
- 充电桩直接连接 `wss://ess-agent.com:3000/ocpp/{chargePointId}`
- 需要在服务器防火墙开放 3000 端口
- 不推荐：端口可能被运营商封锁

### 方案对比

| 方案 | URL格式 | SSL | 配置难度 | 推荐度 |
|------|---------|-----|---------|--------|
| A 子域名CNAME | `wss://ocpp.ess-agent.com/ocpp/{id}` | Railway自动 | 简单 | ★★★ |
| B Cloudflare代理 | `wss://ocpp.ess-agent.com/ocpp/{id}` | Cloudflare | 中等 | ★★ |
| C 端口直连 | `wss://ess-agent.com:3000/ocpp/{id}` | 需自配 | 简单 | ★ |

---

## Step 4: SSL 证书配置

- **方案A**：Railway 自动提供 SSL/TLS 证书，无需手动配置
- **方案B**：Cloudflare 代理模式下由 Cloudflare 提供证书
- 确保充电桩使用 `wss://`（加密）而非 `ws://`（明文）

---

## Step 5: 前端 CSMS 地址配置

1. 打开 https://www.ess-agent.com
2. 进入 充电方案智能体 → 通信协议 → OCPP 1.6J/2.0.1
3. 在 CSMS 地址输入框中输入 `https://ocpp.ess-agent.com`
4. 点击"保存"按钮
5. 确认 WSS URL 显示为 `wss://ocpp.ess-agent.com/ocpp/{chargePointId}`
6. 此 URL 即为充电桩需要配置的 CSMS 连接地址

---

## Step 6: 验证检查清单

### 健康检查
```bash
curl https://ocpp.ess-agent.com/api/health
# 期望返回: {"status":"ok","uptime":...,"connections":0,"version":"1.0.0"}
```

### 充电桩 WebSocket 连接测试
```bash
# 安装 wscat
npm install -g wscat

# 模拟充电桩连接
wscat -c wss://ocpp.ess-agent.com/ocpp/CP_TEST_001 -s "ocpp1.6"

# 发送 BootNotification
> [2,"uid001","BootNotification",{"chargePointModel":"TestModel","chargePointVendor":"TestVendor"}]
# 期望收到: [3,"uid001",{"status":"Accepted","currentTime":"...","interval":300}]
```

### 前端 API 调用测试
1. 在 Debug Center 选择充电桩 CP_TEST_001
2. 选择动作 Reset，点击 Call
3. 确认 Response 区域显示真实 CALLRESULT

---

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| DNS 解析失败 | CNAME 记录未生效 | 等待 DNS 传播，检查 DNS 管理面板 |
| SSL 证书不匹配 | Railway 域名未绑定自定义域名 | 在 Railway 设置自定义域名 |
| WebSocket 连接超时 | 防火墙/CDN 阻断 WSS | 检查 Cloudflare WebSocket 设置 |
| CORS 拒绝 | CORS_ORIGIN 未配置前端域名 | 在 Railway 环境变量中添加 `CORS_ORIGIN` |
| Railway 服务休眠 | 免费额度用尽或无流量 | 升级 Railway 套餐或添加健康检查 ping |
| 充电桩连接被拒 | ALLOWED_CP_IDS 白名单限制 | 检查环境变量或留空允许全部 |