import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAppServer } from "../server.js";

async function startServer(env = {}) {
  const distDir = await fs.mkdtemp(path.join(os.tmpdir(), "xiomn-site-"));
  await fs.writeFile(path.join(distDir, "index.html"), "<h1>Home works</h1>");

  const server = createAppServer({
    distDir,
    env: {
      SYSTEM_PORTAL_TOKEN: "test-password-123456",
      SESSION_SECRET: "test-session-secret-123456",
      SYSTEM_SESSION_HOURS: "12",
      TRUST_PROXY: "false",
      ...env,
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
    distDir,
  };
}

test("serves the built Astro homepage", async (t) => {
  const app = await startServer();
  t.after(async () => {
    app.server.close();
    await fs.rm(app.distDir, { recursive: true, force: true });
  });

  const response = await fetch(`${app.baseUrl}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Home works/);
});

test("system page requires login", async (t) => {
  const app = await startServer();
  t.after(async () => {
    app.server.close();
    await fs.rm(app.distDir, { recursive: true, force: true });
  });

  const response = await fetch(`${app.baseUrl}/system`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /系统管理入口/);
});

test("correct password creates a protected session", async (t) => {
  const app = await startServer();
  t.after(async () => {
    app.server.close();
    await fs.rm(app.distDir, { recursive: true, force: true });
  });

  const login = await fetch(`${app.baseUrl}/system/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "test-password-123456" }),
  });

  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), "/system");

  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  assert.match(cookie, /^xiomn_system_session=/);

  const dashboard = await fetch(`${app.baseUrl}/system`, {
    headers: { cookie },
  });

  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert.match(html, /系统管理中心/);
  assert.match(html, /node\.xiomn\.com/);
  assert.match(html, /panel\.xiomn\.com:2053/);
});

test("wrong password is rejected", async (t) => {
  const app = await startServer();
  t.after(async () => {
    app.server.close();
    await fs.rm(app.distDir, { recursive: true, force: true });
  });

  const response = await fetch(`${app.baseUrl}/system/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "wrong" }),
  });

  assert.equal(response.status, 401);
  assert.match(await response.text(), /密码不正确/);
});

test("system check API rejects unauthenticated users", async (t) => {
  const app = await startServer();
  t.after(async () => {
    app.server.close();
    await fs.rm(app.distDir, { recursive: true, force: true });
  });

  const response = await fetch(`${app.baseUrl}/system/api/check`);
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, "UNAUTHORIZED");
});

test("missing system password does not expose the dashboard", async (t) => {
  const app = await startServer({
    SYSTEM_PORTAL_TOKEN: "",
    SESSION_SECRET: "",
  });
  t.after(async () => {
    app.server.close();
    await fs.rm(app.distDir, { recursive: true, force: true });
  });

  const response = await fetch(`${app.baseUrl}/system`);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /尚未配置/);
});
