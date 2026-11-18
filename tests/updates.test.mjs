import test from "node:test";
import assert from "node:assert/strict";
import { fetchLatestUpdate } from "../src/updates.js";
const response = (data, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => data,
});
test("an empty release repository stays unpublished", async () =>
  assert.equal(await fetchLatestUpdate(async () => response({}, 404)), null));
test("a server failure is not reported as the latest version", async () =>
  assert.rejects(
    fetchLatestUpdate(async () => response({}, 403)),
    /403/,
  ));
test("update manifests require checksum and version metadata", async () => {
  const asset = response({
    assets: [
      {
        name: "update.json",
        browser_download_url: "https://example.com/update.json",
      },
    ],
  });
  let count = 0;
  await assert.rejects(
    fetchLatestUpdate(async () =>
      count++ === 0
        ? asset
        : response({
            versionCode: 2,
            versionName: "0.2.0",
            apkUrl: "https://example.com/app.apk",
          }),
    ),
    /SHA-256/,
  );
});
test("a complete published update is returned unchanged", async () => {
  const manifest = {
    versionCode: 3,
    versionName: "0.2.1",
    sha256: "a".repeat(64),
    apkUrl: "https://example.com/app.apk",
  };
  let count = 0;
  const result = await fetchLatestUpdate(async () =>
    count++ === 0
      ? response({
          assets: [
            {
              name: "update.json",
              browser_download_url: "https://example.com/update.json",
            },
          ],
        })
      : response(manifest),
  );
  assert.deepEqual(result, manifest);
});
