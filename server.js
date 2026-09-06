"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const DEFAULT_LEDGER = path.join(ROOT, "data", "community-revenue.json");
const COMPLETION_ID = /^[A-Za-z0-9_-]{12,100}$/;
const MAX_REVENUE_BY_STAGE = { 1: 15500, 2: 26500, 3: 40500, 4: 39100, 5: 75600 };
const MAX_REQUEST_BYTES = 8192;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

class CommunityLedger {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.load();
  }

  empty() {
    return { totalRevenue: 0, deliveries: 0, updatedAt: null, recentCompletionIds: [] };
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        totalRevenue: Math.max(0, Number.parseInt(raw.totalRevenue, 10) || 0),
        deliveries: Math.max(0, Number.parseInt(raw.deliveries, 10) || 0),
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
        recentCompletionIds: Array.isArray(raw.recentCompletionIds)
          ? raw.recentCompletionIds.filter((item) => typeof item === "string")
          : []
      };
    } catch (error) {
      if (error.code === "ENOENT") return this.empty();
      throw error;
    }
  }

  snapshot() {
    return {
      totalRevenue: this.data.totalRevenue,
      deliveries: this.data.deliveries,
      updatedAt: this.data.updatedAt
    };
  }

  record(revenue, completionId, stageId) {
    if (typeof revenue !== "number" || !Number.isFinite(revenue)) throw new Error("revenue must be a number");
    const amount = Math.round(revenue);
    if (typeof completionId !== "string" || !COMPLETION_ID.test(completionId)) throw new Error("completionId is invalid");
    if (!Number.isInteger(stageId) || stageId < 1 || stageId > 5) throw new Error("stageId is invalid");
    if (amount <= 0 || amount > MAX_REVENUE_BY_STAGE[stageId]) throw new Error("revenue is outside the accepted range for this stage");

    if (this.data.recentCompletionIds.includes(completionId)) {
      return Object.assign(this.snapshot(), { recorded: false });
    }
    const previous = this.data;
    this.data = Object.assign({}, previous, { recentCompletionIds: previous.recentCompletionIds.slice() });
    this.data.totalRevenue += amount;
    this.data.deliveries += 1;
    this.data.updatedAt = new Date().toISOString();
    this.data.recentCompletionIds.push(completionId);
    try { this.save(); } catch (error) { this.data = previous; throw error; }
    return Object.assign(this.snapshot(), { recorded: true });
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = this.filePath + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2) + "\n", "utf8");
    fs.renameSync(temporary, this.filePath);
  }
}

function securityHeaders(extra) {
  return Object.assign({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin"
  }, extra || {});
}

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  }));
  response.end(body);
}

function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "method not allowed" });
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    sendJson(response, 400, { error: "invalid path" });
    return;
  }
  const requested = decoded === "/" ? "/index.html" : decoded;
  // Serve only public game assets, never the ledger, source server or workspace files.
  if (!/^\/(?:index\.html|(?:css|js|assets)\/[A-Za-z0-9_./-]+)$/.test(requested) || requested.split("/").some(part => part.startsWith("."))) {
    sendJson(response, 404, { error: "not found" });
    return;
  }
  const filePath = path.resolve(ROOT, "." + requested);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }
  fs.stat(filePath, function (statError, stat) {
    if (statError || !stat.isFile()) {
      sendJson(response, 404, { error: "not found" });
      return;
    }
    const headers = securityHeaders({
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache"
    });
    response.writeHead(200, headers);
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
}

function createServer(ledgerPath) {
  const ledger = new CommunityLedger(ledgerPath || DEFAULT_LEDGER);
  return http.createServer(function (request, response) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/api/community-revenue") {
      serveStatic(request, response, url.pathname);
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 200, ledger.snapshot());
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "method not allowed" });
      return;
    }
    if (!(request.headers["content-type"] || "").includes("application/json")) {
      sendJson(response, 400, { error: "Content-Type must be application/json" });
      return;
    }

    let body = "";
    let rejected = false;
    request.setEncoding("utf8");
    request.on("data", function (chunk) {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
        rejected = true;
        sendJson(response, 413, { error: "request is too large" });
        request.destroy();
      }
    });
    request.on("end", function () {
      if (rejected) return;
      try {
        const payload = JSON.parse(body);
        if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error("request body must be an object");
        sendJson(response, 200, ledger.record(payload.revenue, payload.completionId, payload.stageId));
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
    });
  });
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

if (require.main === module) {
  const host = option("--host", "127.0.0.1");
  const port = Number.parseInt(option("--port", "8000"), 10);
  const ledgerPath = path.resolve(option("--ledger", DEFAULT_LEDGER));
  const server = createServer(ledgerPath);
  server.listen(port, host, function () {
    console.log("SUIRO site: http://" + host + ":" + port);
    console.log("Community ledger: " + ledgerPath);
  });
}

module.exports = { CommunityLedger, createServer };
