#!/usr/bin/env node
/**
 * GitHub push webhook → run scripts/deploy.sh on main branch updates.
 *
 * Env:
 *   GITHUB_WEBHOOK_SECRET  (required) shared secret from GitHub webhook settings
 *   WEBHOOK_PORT           (optional) default 9876
 *   WEBHOOK_BIND           (optional) default 127.0.0.1
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEPLOY_SCRIPT = join(ROOT, "scripts", "deploy.sh");
const HOOK_PATH = "/hooks/github-deploy";
const PORT = Number(process.env.WEBHOOK_PORT ?? "9876");
const BIND = process.env.WEBHOOK_BIND?.trim() || "127.0.0.1";
const SECRET = process.env.GITHUB_WEBHOOK_SECRET?.trim();
const REPO = "SamiulH25/YorkLanes";

let deploying = false;

function log(message) {
  console.log(`[webhook ${new Date().toISOString()}] ${message}`);
}

function verifySignature(body, signature) {
  if (!SECRET || !signature?.startsWith("sha256=")) {
    return false;
  }

  const expected =
    "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

function shouldDeploy(payload) {
  if (payload.ref !== "refs/heads/main") {
    return false;
  }
  if (payload.deleted) {
    return false;
  }
  return payload.repository?.full_name === REPO;
}

function runDeploy() {
  if (deploying) {
    log("Deploy already in progress — skipping.");
    return;
  }

  deploying = true;
  log("Starting deploy...");

  const proc = spawn("bash", [DEPLOY_SCRIPT], {
    cwd: ROOT,
    stdio: "inherit",
  });

  proc.on("close", (code) => {
    deploying = false;
    if (code === 0) {
      log("Deploy finished successfully.");
    } else {
      log(`Deploy failed with exit code ${code}.`);
    }
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

if (!SECRET) {
  console.error("GITHUB_WEBHOOK_SECRET is required.");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", deploying }));
    return;
  }

  if (req.method !== "POST" || req.url !== HOOK_PATH) {
    res.writeHead(404).end();
    return;
  }

  const event = req.headers["x-github-event"];
  const signature = req.headers["x-hub-signature-256"];
  const body = await readBody(req);

  if (!verifySignature(body, signature)) {
    log("Rejected request: invalid signature.");
    res.writeHead(401).end("invalid signature");
    return;
  }

  if (event === "ping") {
    log("Received ping.");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: "pong" }));
    return;
  }

  if (event !== "push") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true, event }));
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    res.writeHead(400).end("invalid json");
    return;
  }

  if (!shouldDeploy(payload)) {
    log(`Ignored push to ${payload.ref ?? "unknown ref"}.`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true, ref: payload.ref }));
    return;
  }

  log(`Accepted push ${payload.after?.slice(0, 7) ?? "unknown"} to main.`);
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, deploying: !deploying }));

  setImmediate(() => runDeploy());
});

server.listen(PORT, BIND, () => {
  log(`Listening on http://${BIND}:${PORT}${HOOK_PATH}`);
});
