import assert from "node:assert/strict";
import test from "node:test";

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail("Queue did not reach the expected state");
}

for (const concurrency of [1, 2]) {
  test(`forced retry survives an active attempt at concurrency ${concurrency}`, async (t) => {
    const records = new Map(["a", "b"].map((id) => [id, {
      id, isActive: true, sourceType: "MODEL_UPLOAD", status: "UPLOADED"
    }]));
    const calls = { a: 0, b: 0 };
    let failFirst;
    const first = new Promise((resolve, reject) => { failFirst = reject; });
    const prisma = { foodModel: {
      findUnique: async ({ where }) => ({ ...records.get(where.id) }),
      update: async ({ where, data }) => {
        Object.assign(records.get(where.id), data);
        return { ...records.get(where.id) };
      }
    } };
    t.mock.module("../src/lib/prisma.js", { namedExports: { prisma } });
    t.mock.module("../src/config/env.js", { namedExports: { env: { processingConcurrency: concurrency } } });
    t.mock.module("../src/services/workerService.js", { namedExports: {
      processAsset: async (model) => {
        calls[model.id] += 1;
        if (model.id === "a" && calls.a === 1) await first;
        records.get(model.id).status = "PROCESSED";
      },
      markModelFailed: async (id) => { records.get(id).status = "FAILED"; }
    } });
    const queue = await import(`../src/services/processingQueue.js?concurrency=${concurrency}`);
    await queue.enqueueModelProcessing("a");
    await until(() => calls.a === 1);
    await queue.enqueueModelProcessing("a", { force: true });
    await queue.enqueueModelProcessing("a", { force: true });
    // Let a drain run with spare capacity while the first attempt is pending.
    await tick();
    await tick();
    await queue.enqueueModelProcessing("b");
    if (concurrency === 2) await until(() => calls.b === 1);
    failFirst(new Error("synthetic first-attempt failure"));
    await until(() => queue.getQueueSnapshot().active === 0 && queue.getQueueSnapshot().queued === 0);
    assert.equal(calls.a, 2, "coalesced forced requests must cause one retry");
    assert.equal(calls.b, 1, "other eligible work must not be lost or starved");
    assert.equal(records.get("a").status, "PROCESSED");
    assert.equal(records.get("b").status, "PROCESSED");
  });
}
