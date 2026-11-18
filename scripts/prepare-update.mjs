import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const release = JSON.parse(await readFile("release.json"));
const localName = `${release.appName}-${release.version}.apk`;
const name = `${release.assetPrefix}-${release.version}.apk`;
const apk = await readFile("artifacts/" + localName);
await mkdir(".tooling/releases", { recursive: true });
await copyFile("artifacts/" + localName, ".tooling/releases/" + name);
const manifest = {
  versionCode: release.versionCode,
  versionName: release.version,
  releaseDate: release.releaseDate,
  apkName: name,
  apkUrl: `https://github.com/${release.repository}/releases/download/v${release.version}/${encodeURIComponent(name)}`,
  sha256: createHash("sha256").update(apk).digest("hex"),
  bytes: apk.length,
  notes: release.notes,
};
await writeFile(
  "artifacts/update.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Prepared update manifest for ${release.repository} v${release.version}`,
);
