"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { CommunityLedger, createServer } = require("./server");

function request(port, method, pathname, payload) {
  return new Promise(function (resolve, reject) {
    const body = payload ? JSON.stringify(payload) : "";
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}
    }, function (res) {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", function (chunk) { data += chunk; });
      res.on("end", function () { resolve({ status: res.statusCode, body: JSON.parse(data) }); });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "suiro-ledger-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const ledger = new CommunityLedger(ledgerPath);
  const first = ledger.record(12500, "delivery-1-abcdefghijkl", 1);
  const duplicate = ledger.record(12500, "delivery-1-abcdefghijkl", 1);
  assert.strictEqual(first.totalRevenue, 12500);
  assert.strictEqual(first.recorded, true);
  assert.strictEqual(duplicate.deliveries, 1);
  assert.strictEqual(duplicate.recorded, false);
  assert.strictEqual(Object.hasOwn(first, "recentCompletionIds"), false);
  assert.strictEqual(new CommunityLedger(ledgerPath).snapshot().totalRevenue, 12500);
  const originalSave = ledger.save;
  ledger.save = function () { throw new Error("disk unavailable"); };
  assert.throws(() => ledger.record(1000, "delivery-save-failure", 1));
  assert.strictEqual(ledger.snapshot().totalRevenue, 12500, "Failed storage must not change the aggregate");
  ledger.save = originalSave;

  [
    [0, "delivery-2-abcdefghijkl", 1],
    [15501, "delivery-2-abcdefghijkl", 1],
    [10000, "bad id", 1],
    [10000, "delivery-2-abcdefghijkl", 9]
  ].forEach(function (values) {
    assert.throws(function () { ledger.record(values[0], values[1], values[2]); });
  });

  const apiLedgerPath = path.join(directory, "api-ledger.json");
  const server = createServer(apiLedgerPath);
  await new Promise(function (resolve) { server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  try {
    const initial = await request(port, "GET", "/api/community-revenue");
    const posted = await request(port, "POST", "/api/community-revenue", {
      revenue: 23000,
      completionId: "delivery-3-abcdefghijkl",
      stageId: 3
    });
    const repeated = await request(port, "POST", "/api/community-revenue", {
      revenue: 23000,
      completionId: "delivery-3-abcdefghijkl",
      stageId: 3
    });
    assert.deepStrictEqual(initial.body.totalRevenue, 0);
    assert.strictEqual(posted.status, 200);
    assert.strictEqual(posted.body.totalRevenue, 23000);
    assert.strictEqual(repeated.body.recorded, false);
    assert.strictEqual(repeated.body.deliveries, 1);
    assert.strictEqual((await request(port, "GET", "/data/community-revenue.json")).status, 404);
    assert.strictEqual((await request(port, "GET", "/server.js")).status, 404);
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log("Server tests passed: persistent aggregate, validation, API GET/POST, and idempotent delivery writes.");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
