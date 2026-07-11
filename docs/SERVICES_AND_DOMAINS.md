# Project Xiomn 服务与域名来源记录

最后更新：2026-07-12

这份文档用来回答三个问题：

1. 这个域名是做什么的？
2. 当时是怎么部署出来的？
3. 以后打不开先检查哪里？

> 本文不保存真实密码、API Key、Bot Token、节点 UUID、Private Key 或 Short ID。

## 当前总结构

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
└─ bot.xiomn.com        Telegram AI Bot
```

## 域名说明

### xiomn.com

- 用途：Project Xiomn 个人主页、项目入口、服务入口和文档中心。
- 代码仓库：`huahua6688/Project-Xiomn-Website`
- 技术：Astro + Node 静态文件服务器。
- 部署：GitHub 推送后由 Zeabur 构建和运行。
- 正常表现：浏览器打开个人主页。
- 排错：检查域名是否绑定到 Project-Xiomn-Website 的 Zeabur 网站服务。

### xiomn.com/system

- 用途：密码保护的系统管理中心。
- 来源：由个人主页仓库中的 `server.js` 动态提供，不是单独服务。
- 内容：code-server、3X-UI、节点域名、Bot 状态和 GitHub 入口。
- 登录变量：
  - `SYSTEM_PORTAL_TOKEN`
  - `SESSION_SECRET`
  - `SYSTEM_SESSION_HOURS`
- 安全：密码只放 Zeabur 环境变量，登录后使用 HttpOnly Cookie。
- 不保存：3X-UI 密码、code-server 密码、节点 UUID、Private Key、Short ID、Bot Token。

### code.xiomn.com

- 用途：浏览器中的远程 VS Code 开发环境。
- 来源：之前单独部署的 code-server / Coder 服务。
- 正常表现：打开登录页或工作区。
- 排错：
  1. 检查 DNS。
  2. 检查 Zeabur 中 code-server 服务是否运行。
  3. 检查服务端口。
  4. 检查 code-server 自己的密码配置。

### panel.xiomn.com:2053

- 用途：3X-UI 管理面板。
- 来源：在 VPS 上安装 3X-UI，用于管理 Xray / Reality 入站和客户端配置。
- 正常表现：打开 3X-UI 登录页。
- 端口：HTTPS `2053`。
- 排错：
  1. 检查 `panel.xiomn.com` DNS。
  2. 检查 VPS 防火墙是否允许 2053。
  3. 检查 `x-ui` 服务状态。
  4. 检查面板端口和证书。
- 安全：进入 `/system` 只提供入口，3X-UI 仍需自己的账号密码。

### node.xiomn.com

- 用途：Shadowrocket、V2RayN 等客户端连接 Xray / Reality 节点时使用。
- 来源：DNS 解析到运行节点的 VPS。
- 重要：它不是普通网站。
- 正常表现：
  - Safari 可能打不开。
  - 没有网页不代表节点必然故障。
  - 应在代理客户端里测试延迟和连接。
- 排错：
  1. 检查 DNS 是否解析到正确 VPS。
  2. 检查节点端口是否开放。
  3. 检查 3X-UI 入站是否运行。
  4. 检查客户端端口、UUID、Public Key、Short ID 和 SNI 是否匹配。
- 规则：节点域名通常应直接连接 VPS；是否启用 DNS 代理要以实际节点协议和当前网络架构为准。

### bot.xiomn.com

- 用途：Telegram-AI-Bot-Pro 后端与 Mini App。
- 代码仓库：`huahua6688/Telegram-AI-Bot-Pro`
- 部署：独立 Zeabur 服务。
- 页面区别：
  - `/status`：给人看的状态页。
  - `/app`：Telegram Mini App，必须从 Telegram 机器人菜单进入。
  - `/health`、`/ready`、`/api/...`：程序接口，可能显示 JSON。
  - 根地址：可能是健康信息，不一定是普通首页。
- “无权限”的原因：普通浏览器没有 Telegram WebApp 身份数据。
- 排错：检查 Zeabur 服务状态、域名绑定、PORT、Bot Token 和 BotFather Mini App 配置。

## 网站服务的 Zeabur 环境变量

```env
PORT=3000
SYSTEM_PORTAL_TOKEN=填写自己的长密码
SESSION_SECRET=填写另一串随机字符
SYSTEM_SESSION_HOURS=12
TRUST_PROXY=true
```

这些变量添加在 **Project-Xiomn-Website 网站服务**，不是 Telegram Bot 服务。

## 恢复顺序

看到某个地址打不开时，按以下顺序检查：

1. 先确认它是网页、面板、节点域名还是 API。
2. 检查 DNS 是否存在、是否指向正确位置。
3. 检查 Zeabur 域名绑定是否绑到了正确服务。
4. 检查服务是否运行、端口是否读取环境变量。
5. 检查 HTTPS 证书和防火墙。
6. 有登录保护的服务，再检查各自账号密码。
7. 节点连接最后检查 UUID、Public Key、Short ID、SNI 等客户端参数。

## 安全规则

- 不把真实密码、Key、Token、UUID 或私钥提交到 GitHub。
- 同一个域名只绑定一个服务。
- `/system` 的密码不能写在 Astro 前端页面中。
- 3X-UI 和 code-server 继续保留自己的登录保护。
- Bot Mini App 不改成公开无验证页面。
- 数据库、上传文件和用户设置必须使用持久化 Volume。
