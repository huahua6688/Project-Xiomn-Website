# Project Xiomn Website

Project Xiomn 的个人技术主页、统一服务入口和运维文档中心。

网站用于集中展示和记录：

- Telegram AI Bot
- Zeabur 云端部署
- Web VS Code / code-server
- 3X-UI 管理面板
- Xray / Reality 节点
- 域名与服务绑定关系
- 备份、迁移和故障排查
- 密码保护的系统管理中心

## 在线入口

| 地址 | 用途 |
| --- | --- |
| `https://xiomn.com` | Project Xiomn 个人主页 |
| `https://xiomn.com/services` | 公开服务入口 |
| `https://xiomn.com/docs` | 文档中心 |
| `https://xiomn.com/status` | 公开状态页 |
| `https://xiomn.com/system` | 密码保护的系统管理中心 |
| `https://bot.xiomn.com/status` | Telegram AI Bot 可视化状态 |
| `https://code.xiomn.com` | Web VS Code 开发环境 |
| `https://panel.xiomn.com:2053` | 3X-UI 管理面板 |
| `node.xiomn.com` | Xray / Reality 节点域名，不是普通网页 |

## 当前结构

```text
Project-Xiomn-Website
├─ xiomn.com
├─ /services
├─ /docs
├─ /status
└─ /system（密码保护）

独立服务
├─ code.xiomn.com       code-server / Coder
├─ panel.xiomn.com:2053 3X-UI 管理面板
├─ node.xiomn.com       Xray / Reality 节点域名
└─ bot.xiomn.com        Telegram AI Bot 后端
```

## 页面说明

### 首页

展示 Project Xiomn 的整体定位、核心项目、当前服务结构和后续路线。

### 服务中心

公开展示适合普通浏览器访问的入口：

- Telegram AI Bot 项目介绍
- Bot 状态页面
- 文档中心
- `/system` 管理入口

`code.xiomn.com`、3X-UI 和节点信息放在密码保护的 `/system` 中。

### 系统管理中心

`/system` 由 `server.js` 在服务端验证密码，不是前端假密码框。

登录后可以查看：

- Web VS Code
- 3X-UI 管理面板
- `node.xiomn.com` 节点说明与 DNS 检测
- Telegram AI Bot 状态
- GitHub 项目入口

系统中心不会保存或显示：

- API Key
- Bot Token
- 3X-UI 密码
- code-server 密码
- 节点 UUID
- Private Key
- Short ID

### 文档中心

重点文档：

- `/docs/services-and-domains`：每个网页、域名和服务是怎么来的
- `/docs/current-infrastructure`：当前基础设施结构
- `/docs/domain-routing`：域名与服务绑定规则
- `/docs/operations-playbook`：总运维手册
- `/docs/zeabur-troubleshooting`：Zeabur 部署排错
- `/docs/telegram-ai-bot`：Telegram AI Bot 记录

## Telegram Mini App 说明

`https://bot.xiomn.com/app` 是 Telegram Mini App。

直接使用 Safari 或普通浏览器打开时，由于没有 Telegram WebApp 身份数据，可能显示“无权限”。正确方式是从 Telegram 机器人菜单进入。

`/health`、`/ready` 和 `/api/...` 是程序接口，浏览器打开时显示 JSON 属于正常现象。

## node.xiomn.com 说明

`node.xiomn.com` 是给 Shadowrocket、V2RayN 等客户端连接 Xray / Reality 节点使用的域名，不是网站。

浏览器打不开并不代表节点一定故障。应检查：

1. DNS 是否解析到正确 VPS
2. 节点端口是否开放
3. 3X-UI 入站是否运行
4. 客户端端口、UUID、Public Key、Short ID 和 SNI 是否匹配

## 技术栈

- Astro
- Node.js
- GitHub
- Zeabur
- Docker
- code-server
- 3X-UI
- Xray / Reality

## 本地运行

需要 Node.js 22.12 或更高版本。

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```

生产运行：

```bash
npm start
```

自动测试：

```bash
node --test
```

## Zeabur 环境变量

将下面变量添加到 **Project-Xiomn-Website 网站服务**，不要添加到 Telegram Bot 服务。

```env
PORT=3000
SYSTEM_PORTAL_TOKEN=填写自己的长密码
SESSION_SECRET=填写另一串随机字符
SYSTEM_SESSION_HOURS=12
TRUST_PROXY=true
```

### 环境变量说明

| 变量 | 用途 |
| --- | --- |
| `PORT` | Zeabur 网站服务监听端口 |
| `SYSTEM_PORTAL_TOKEN` | `/system` 登录密码 |
| `SESSION_SECRET` | 签名登录 Cookie 的随机密钥 |
| `SYSTEM_SESSION_HOURS` | 登录有效时间，默认 12 小时 |
| `TRUST_PROXY` | 信任 Zeabur 转发的 HTTPS 和客户端地址信息 |

真实密码不得提交到 GitHub。

## 部署流程

```text
修改代码
→ npm run build
→ node --test
→ git commit
→ git push
→ Zeabur 自动重新构建
→ xiomn.com 更新
```

## 安全规则

- 密码、API Key、Bot Token 和节点密钥只放环境变量或服务器受保护配置
- 不把真实密钥提交到 GitHub
- `/system` 使用服务端验证和 HttpOnly Cookie
- 3X-UI 和 code-server 保留各自的登录保护
- Telegram Mini App 不取消 Telegram 身份验证
- 同一个域名只绑定一个服务
- 有数据库、用户设置和上传文件的服务必须挂载持久化 Volume

## 相关仓库

- Project Xiomn Website：`huahua6688/Project-Xiomn-Website`
- Telegram AI Bot：`huahua6688/Telegram-AI-Bot-Pro`

## License

当前仓库未声明开源许可证。未经许可，不代表允许复制、修改或重新分发。
