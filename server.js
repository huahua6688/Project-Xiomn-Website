import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COOKIE_NAME = "xiomn_system_session";
const DEFAULT_SESSION_HOURS = 12;
const MAX_BODY_BYTES = 16 * 1024;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function secureEqual(left, right) {
  const leftDigest = crypto.createHash("sha256").update(String(left)).digest();
  const rightDigest = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function parseCookies(header = "") {
  const cookies = {};
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

function signValue(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSession(secret, sessionHours) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iat: now,
      exp: now + sessionHours * 60 * 60,
      nonce: crypto.randomBytes(16).toString("base64url"),
    }),
  ).toString("base64url");

  return `${payload}.${signValue(payload, secret)}`;
}

function verifySession(session, secret) {
  if (!session || !secret) return false;

  const [payload, signature, ...rest] = session.split(".");
  if (!payload || !signature || rest.length > 0) return false;

  const expected = signValue(payload, secret);
  if (!secureEqual(signature, expected)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return Number.isFinite(data.exp) && Number.isFinite(data.iat) && data.iat <= now + 60 && data.exp > now;
  } catch {
    return false;
  }
}

function getClientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0].trim();
    }
  }
  return req.socket.remoteAddress || "unknown";
}

function isHttps(req, trustProxy) {
  if (req.socket.encrypted) return true;
  if (!trustProxy) return false;
  return String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase() === "https";
}

function securityHeaders(contentType = "") {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

function send(res, status, body, contentType, extraHeaders = {}) {
  res.writeHead(status, {
    ...securityHeaders(contentType),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function sendHtml(res, status, html, extraHeaders = {}) {
  send(res, status, html, "text/html; charset=utf-8", extraHeaders);
}

function sendJson(res, status, data, extraHeaders = {}) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8", extraHeaders);
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(303, {
    ...securityHeaders(),
    "Cache-Control": "no-store",
    Location: location,
    ...extraHeaders,
  });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", reject);
  });
}

function pageShell({ title, body, script = "" }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="robots" content="noindex,nofollow">
  <style>
    :root {
      color-scheme: dark;
      --bg: #07080d;
      --card: rgba(255,255,255,.07);
      --card-strong: rgba(255,255,255,.1);
      --line: rgba(255,255,255,.13);
      --text: rgba(255,255,255,.95);
      --muted: rgba(255,255,255,.65);
      --cyan: #7fffe0;
      --blue: #75a7ff;
      --purple: #b69cff;
      --green: #70ffb5;
      --yellow: #ffd36e;
      --red: #ff8c9b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
      background:
        radial-gradient(circle at 10% 0%, rgba(117,167,255,.2), transparent 32rem),
        radial-gradient(circle at 90% 10%, rgba(182,156,255,.16), transparent 30rem),
        linear-gradient(180deg, #07080d, #090b12 55%, #05060a);
    }
    a { color: inherit; text-decoration: none; }
    button, input { font: inherit; }
    .shell { width: min(1080px, calc(100% - 28px)); margin: 0 auto; padding: 20px 0 56px; }
    .nav {
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
      padding: 12px 14px; border: 1px solid var(--line); border-radius: 24px;
      background: rgba(7,8,13,.78); backdrop-filter: blur(20px);
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 850; }
    .mark {
      display: grid; place-items: center; width: 36px; height: 36px; border-radius: 13px;
      background: linear-gradient(135deg, var(--blue), var(--purple));
    }
    .nav-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .link, .button {
      display: inline-flex; align-items: center; justify-content: center; min-height: 42px;
      padding: 0 15px; border: 1px solid var(--line); border-radius: 999px;
      background: rgba(255,255,255,.04); color: var(--text); cursor: pointer;
    }
    .button.primary { background: #fff; color: #07080d; font-weight: 800; }
    .hero { padding: 68px 0 38px; }
    .kicker { color: var(--cyan); font-size: 12px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 12px 0 0; font-size: clamp(42px, 7vw, 76px); letter-spacing: -.065em; line-height: 1; }
    h2, h3, p { margin-top: 0; }
    .lead { max-width: 760px; margin-top: 22px; color: var(--muted); font-size: 18px; line-height: 1.75; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .card, .panel {
      border: 1px solid var(--line); border-radius: 24px; padding: 22px;
      background: var(--card); backdrop-filter: blur(18px);
    }
    .card p, .panel p { color: var(--muted); line-height: 1.7; }
    .card-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
    .icon {
      display: grid; place-items: center; width: 46px; height: 46px; border-radius: 15px;
      background: rgba(255,255,255,.08); font-size: 22px;
    }
    .actions { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 18px; }
    .status { font-size: 13px; font-weight: 800; color: var(--muted); }
    .status.ok { color: var(--green); }
    .status.warn { color: var(--yellow); }
    .status.bad { color: var(--red); }
    .section { padding: 28px 0; }
    .section-title { font-size: clamp(28px, 4vw, 44px); letter-spacing: -.045em; }
    .notice { border-left: 3px solid var(--yellow); padding: 15px 17px; background: rgba(255,211,110,.08); border-radius: 14px; color: var(--muted); }
    .login-wrap { min-height: calc(100vh - 110px); display: grid; place-items: center; }
    .login { width: min(480px, 100%); }
    label { display: block; margin-bottom: 8px; color: var(--muted); font-weight: 700; }
    input {
      width: 100%; min-height: 50px; border: 1px solid var(--line); border-radius: 15px;
      background: rgba(255,255,255,.06); color: var(--text); padding: 0 15px; outline: none;
    }
    input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(117,167,255,.15); }
    .error { color: var(--red); margin-bottom: 14px; }
    code { color: var(--cyan); overflow-wrap: anywhere; }
    .footer { margin-top: 28px; color: var(--muted); font-size: 13px; }
    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      .nav { align-items: flex-start; }
      .nav-actions { justify-content: flex-end; }
    }
  </style>
</head>
<body>
  ${body}
  ${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}

function renderLogin({ error = "", configured = true } = {}) {
  const body = `<main class="shell">
    <nav class="nav">
      <a class="brand" href="/"><span class="mark">X</span><span>Project Xiomn</span></a>
      <div class="nav-actions"><a class="link" href="/">返回首页</a></div>
    </nav>
    <section class="login-wrap">
      <form class="panel login" method="post" action="/system/login" autocomplete="on">
        <p class="kicker">SYSTEM ACCESS</p>
        <h1 style="font-size:clamp(36px,7vw,58px)">系统管理入口</h1>
        <p class="lead">输入网站服务的管理密码后，才能查看开发环境、3X-UI 面板、节点域名和 Bot 运维入口。</p>
        ${configured ? "" : `<p class="error">尚未配置 <code>SYSTEM_PORTAL_TOKEN</code>。请先在网站服务的 Zeabur 环境变量中添加。</p>`}
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
        <label for="password">管理密码</label>
        <input id="password" name="password" type="password" required minlength="8" autocomplete="current-password" ${configured ? "" : "disabled"}>
        <div class="actions">
          <button class="button primary" type="submit" ${configured ? "" : "disabled"}>登录系统中心</button>
        </div>
      </form>
    </section>
  </main>`;

  return pageShell({ title: "系统登录 · Project Xiomn", body });
}

function renderSystem() {
  const body = `<main class="shell">
    <nav class="nav">
      <a class="brand" href="/"><span class="mark">X</span><span>Project Xiomn</span></a>
      <div class="nav-actions">
        <a class="link" href="/docs/services-and-domains">查看架构文档</a>
        <form method="post" action="/system/logout"><button class="link" type="submit">退出登录</button></form>
      </div>
    </nav>

    <section class="hero">
      <p class="kicker">PRIVATE SYSTEM CENTER</p>
      <h1>系统管理中心。</h1>
      <p class="lead">管理入口统一放在这里。页面不保存面板密码、节点 UUID、Private Key、API Key 或 Bot Token。</p>
      <div class="actions">
        <button class="button primary" id="run-checks" type="button">检测域名与服务</button>
        <span class="status" id="check-summary">尚未检测</span>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">管理工具</h2>
      <div class="grid">
        <article class="card">
          <div class="card-head"><div><p class="kicker">DEVELOPMENT</p><h3>Web VS Code</h3></div><div class="icon">💻</div></div>
          <p><code>code.xiomn.com</code> 是浏览器远程开发环境，用于查看和修改项目代码。</p>
          <div class="status" data-status="code">等待检测</div>
          <div class="actions"><a class="button" href="https://code.xiomn.com" target="_blank" rel="noreferrer">打开开发环境</a></div>
        </article>

        <article class="card">
          <div class="card-head"><div><p class="kicker">SERVER PANEL</p><h3>3X-UI 面板</h3></div><div class="icon">🛡️</div></div>
          <p><code>panel.xiomn.com:2053</code> 是 Xray / Reality 节点管理面板，进入后仍需使用 3X-UI 自己的账号密码。</p>
          <div class="status" data-status="panel">等待检测</div>
          <div class="actions"><a class="button" href="https://panel.xiomn.com:2053" target="_blank" rel="noreferrer">打开 3X-UI</a></div>
        </article>

        <article class="card">
          <div class="card-head"><div><p class="kicker">XRAY NODE</p><h3>节点域名</h3></div><div class="icon">🌐</div></div>
          <p><code>node.xiomn.com</code> 是代理客户端连接节点时使用的域名，不是普通网页，浏览器打不开并不代表节点一定故障。</p>
          <div class="status" data-status="node">等待检测</div>
          <div class="actions"><button class="button" type="button" data-copy="node.xiomn.com">复制节点域名</button></div>
        </article>

        <article class="card">
          <div class="card-head"><div><p class="kicker">TELEGRAM BOT</p><h3>Bot 状态</h3></div><div class="icon">🤖</div></div>
          <p><code>bot.xiomn.com/status</code> 是给人看的状态页；Bot 根地址和内部 API 可能显示 JSON，这是正常的程序接口。</p>
          <div class="status" data-status="bot">等待检测</div>
          <div class="actions"><a class="button" href="https://bot.xiomn.com/status" target="_blank" rel="noreferrer">查看 Bot 状态</a></div>
        </article>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">项目与记录</h2>
      <div class="grid">
        <article class="card">
          <div class="card-head"><div><p class="kicker">WEBSITE REPOSITORY</p><h3>个人主页仓库</h3></div><div class="icon">🏠</div></div>
          <p>Project Xiomn 的个人主页、文档中心和当前系统入口。</p>
          <div class="actions"><a class="button" href="https://github.com/huahua6688/Project-Xiomn-Website" target="_blank" rel="noreferrer">打开 GitHub</a></div>
        </article>
        <article class="card">
          <div class="card-head"><div><p class="kicker">BOT REPOSITORY</p><h3>Telegram AI Bot 仓库</h3></div><div class="icon">📦</div></div>
          <p>Telegram-AI-Bot-Pro 的代码、部署说明和环境变量记录。</p>
          <div class="actions"><a class="button" href="https://github.com/huahua6688/Telegram-AI-Bot-Pro" target="_blank" rel="noreferrer">打开 GitHub</a></div>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="notice">
        <strong>控制台无权限为什么？</strong><br>
        <code>bot.xiomn.com/app</code> 是 Telegram Mini App，必须从 Telegram 机器人菜单进入。普通 Safari 直接打开时没有 Telegram 身份信息，因此会显示无权限。
      </div>
      <p class="footer">管理密码只保存在 Zeabur 环境变量中，不写入 GitHub，也不会显示在网页源码里。</p>
    </section>
  </main>`;

  const script = `
    const summary = document.getElementById("check-summary");
    const button = document.getElementById("run-checks");

    function setStatus(id, item) {
      const element = document.querySelector('[data-status="' + id + '"]');
      if (!element) return;
      element.className = "status " + (item.ok ? "ok" : "bad");
      const details = item.details ? " · " + item.details : "";
      element.textContent = (item.ok ? "正常" : "异常") + details;
    }

    async function runChecks() {
      button.disabled = true;
      summary.className = "status warn";
      summary.textContent = "检测中…";

      try {
        const response = await fetch("/system/api/check", { credentials: "same-origin" });
        if (response.status === 401) {
          window.location.href = "/system";
          return;
        }
        const data = await response.json();
        data.items.forEach((item) => setStatus(item.id, item));
        const okCount = data.items.filter((item) => item.ok).length;
        summary.className = "status " + (okCount === data.items.length ? "ok" : "warn");
        summary.textContent = okCount + "/" + data.items.length + " 项正常";
      } catch {
        summary.className = "status bad";
        summary.textContent = "检测请求失败";
      } finally {
        button.disabled = false;
      }
    }

    button.addEventListener("click", runChecks);

    document.querySelectorAll("[data-copy]").forEach((copyButton) => {
      copyButton.addEventListener("click", async () => {
        const value = copyButton.getAttribute("data-copy") || "";
        try {
          await navigator.clipboard.writeText(value);
          copyButton.textContent = "已复制";
        } catch {
          window.prompt("复制下面的内容", value);
        }
      });
    });
  `;

  return pageShell({ title: "系统管理 · Project Xiomn", body, script });
}

function renderNotConfigured() {
  return pageShell({
    title: "系统中心未配置 · Project Xiomn",
    body: `<main class="shell">
      <nav class="nav"><a class="brand" href="/"><span class="mark">X</span><span>Project Xiomn</span></a></nav>
      <section class="login-wrap">
        <article class="panel login">
          <p class="kicker">CONFIGURATION REQUIRED</p>
          <h1 style="font-size:clamp(36px,7vw,58px)">系统中心尚未配置。</h1>
          <p class="lead">请在 <strong>Project-Xiomn-Website 对应的 Zeabur 网站服务</strong>添加环境变量：</p>
          <p><code>SYSTEM_PORTAL_TOKEN=你的长密码</code></p>
          <p><code>SESSION_SECRET=另一串随机字符</code></p>
          <div class="actions"><a class="button" href="/docs/services-and-domains">查看配置文档</a></div>
        </article>
      </section>
    </main>`,
  });
}

async function dnsCheck(id, hostname) {
  const started = Date.now();
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    const unique = [...new Set(addresses.map((item) => item.address))];
    return {
      id,
      ok: unique.length > 0,
      durationMs: Date.now() - started,
      details: unique.length ? `DNS → ${unique.slice(0, 2).join(", ")}` : "没有解析结果",
    };
  } catch (error) {
    return {
      id,
      ok: false,
      durationMs: Date.now() - started,
      details: error?.code || "DNS 查询失败",
    };
  }
}

async function httpCheck(id, url) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "Project-Xiomn-System-Check/1.0" },
    });

    return {
      id,
      ok: response.status >= 200 && response.status < 500,
      durationMs: Date.now() - started,
      details: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      id,
      ok: false,
      durationMs: Date.now() - started,
      details: error?.name === "AbortError" ? "连接超时" : "连接失败",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSystemChecks() {
  return Promise.all([
    dnsCheck("code", "code.xiomn.com"),
    dnsCheck("panel", "panel.xiomn.com"),
    dnsCheck("node", "node.xiomn.com"),
    httpCheck("bot", "https://bot.xiomn.com/status"),
  ]);
}

function safeStaticPath(distDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relative = decoded.replace(/^\/+/, "");
  const normalized = path.posix.normalize(relative);

  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("\0")) {
    return null;
  }

  let candidate;
  if (!normalized) {
    candidate = path.join(distDir, "index.html");
  } else if (path.extname(normalized)) {
    candidate = path.join(distDir, normalized);
  } else {
    candidate = path.join(distDir, normalized, "index.html");
  }

  const resolvedDist = path.resolve(distDir);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedCandidate !== resolvedDist && !resolvedCandidate.startsWith(`${resolvedDist}${path.sep}`)) {
    return null;
  }

  return resolvedCandidate;
}

function serveFile(req, res, filePath, distDir) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      const fallback = path.join(distDir, "404.html");
      fs.readFile(fallback, (fallbackError, fallbackData) => {
        if (!fallbackError) {
          res.writeHead(404, {
            ...securityHeaders("text/html; charset=utf-8"),
            "Cache-Control": "no-cache",
          });
          if (req.method !== "HEAD") res.end(fallbackData);
          else res.end();
          return;
        }

        sendHtml(
          res,
          404,
          pageShell({
            title: "页面不存在 · Project Xiomn",
            body: `<main class="shell"><section class="login-wrap"><article class="panel login"><h1 style="font-size:52px">404</h1><p class="lead">没有找到这个页面。</p><div class="actions"><a class="button" href="/">返回首页</a></div></article></section></main>`,
          }),
        );
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, {
      ...securityHeaders(type),
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    if (req.method !== "HEAD") res.end(data);
    else res.end();
  });
}

export function createAppServer(options = {}) {
  const env = options.env || process.env;
  const distDir = options.distDir || env.DIST_DIR || path.join(__dirname, "dist");
  const systemToken = String(env.SYSTEM_PORTAL_TOKEN || "");
  const sessionSecret = String(env.SESSION_SECRET || systemToken || "");
  const sessionHours = Math.min(
    72,
    Math.max(1, Number.parseInt(env.SYSTEM_SESSION_HOURS || String(DEFAULT_SESSION_HOURS), 10) || DEFAULT_SESSION_HOURS),
  );
  const trustProxy = String(env.TRUST_PROXY || "true").toLowerCase() !== "false";
  const failedLogins = new Map();

  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;
    const clientIp = getClientIp(req, trustProxy);
    const cookies = parseCookies(req.headers.cookie || "");
    const authenticated = verifySession(cookies[COOKIE_NAME], sessionSecret);

    if (pathname === "/system" && req.method === "GET") {
      if (!systemToken || !sessionSecret) {
        sendHtml(res, 503, renderNotConfigured());
        return;
      }
      sendHtml(res, 200, authenticated ? renderSystem() : renderLogin());
      return;
    }

    if (pathname === "/system/login" && req.method === "POST") {
      if (!systemToken || !sessionSecret) {
        sendHtml(res, 503, renderNotConfigured());
        return;
      }

      const now = Date.now();
      const current = failedLogins.get(clientIp);
      if (current?.blockedUntil && current.blockedUntil > now) {
        sendHtml(res, 429, renderLogin({ error: "尝试次数过多，请稍后再试。" }), {
          "Retry-After": String(Math.ceil((current.blockedUntil - now) / 1000)),
        });
        return;
      }

      try {
        const body = await readBody(req);
        const password = new URLSearchParams(body).get("password") || "";

        if (!secureEqual(password, systemToken)) {
          const attempts = (current?.attempts || 0) + 1;
          const blockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_WINDOW_MS : 0;
          failedLogins.set(clientIp, { attempts, blockedUntil });

          sendHtml(
            res,
            attempts >= MAX_LOGIN_ATTEMPTS ? 429 : 401,
            renderLogin({
              error:
                attempts >= MAX_LOGIN_ATTEMPTS
                  ? "密码错误次数过多，已暂时限制登录。"
                  : "密码不正确。",
            }),
          );
          return;
        }

        failedLogins.delete(clientIp);
        const session = createSession(sessionSecret, sessionHours);
        const cookie = [
          `${COOKIE_NAME}=${session}`,
          "Path=/system",
          "HttpOnly",
          "SameSite=Strict",
          `Max-Age=${sessionHours * 60 * 60}`,
          ...(isHttps(req, trustProxy) ? ["Secure"] : []),
        ].join("; ");

        redirect(res, "/system", { "Set-Cookie": cookie });
      } catch (error) {
        sendHtml(
          res,
          error?.message === "BODY_TOO_LARGE" ? 413 : 400,
          renderLogin({ error: "登录请求无效，请重新输入。" }),
        );
      }
      return;
    }

    if (pathname === "/system/logout" && req.method === "POST") {
      redirect(res, "/system", {
        "Set-Cookie": `${COOKIE_NAME}=; Path=/system; HttpOnly; SameSite=Strict; Max-Age=0${
          isHttps(req, trustProxy) ? "; Secure" : ""
        }`,
      });
      return;
    }

    if (pathname === "/system/api/check" && req.method === "GET") {
      if (!authenticated) {
        sendJson(res, 401, { ok: false, error: "UNAUTHORIZED" });
        return;
      }

      const items = await runSystemChecks();
      sendJson(res, 200, {
        ok: items.every((item) => item.ok),
        checkedAt: new Date().toISOString(),
        items,
      });
      return;
    }

    if (pathname.startsWith("/system/")) {
      sendHtml(
        res,
        404,
        pageShell({
          title: "系统页面不存在 · Project Xiomn",
          body: `<main class="shell"><section class="login-wrap"><article class="panel login"><h1 style="font-size:48px">没有这个系统页面。</h1><div class="actions"><a class="button" href="/system">返回系统中心</a></div></article></section></main>`,
        }),
      );
      return;
    }

    if (!["GET", "HEAD"].includes(req.method || "")) {
      sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" }, { Allow: "GET, HEAD" });
      return;
    }

    const filePath = safeStaticPath(distDir, pathname);
    if (!filePath) {
      sendJson(res, 403, { ok: false, error: "FORBIDDEN" });
      return;
    }

    serveFile(req, res, filePath, distDir);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Project Xiomn website running on port ${port}`);
  });
}
