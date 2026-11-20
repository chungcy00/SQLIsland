import { loadCourseStructures } from "./course-structure-resources.mjs";
import { build } from "esbuild";
import { normalizeCards } from "../src/flashcard-model.mjs";
import { addDataSets } from "./flashcard-data.mjs";
import {
  mkdir,
  cp,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const assetSource = path.resolve("resources/ASSETS");
const contentSource = path.resolve("resources/CONTENT");
const appRelease = JSON.parse(await readFile("release.json"));
const contentManifest = JSON.parse(
  await readFile(path.join(contentSource, "manifest.json")),
);
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/app.js", "src/sql-worker.js"],
  bundle: true,
  outdir: "dist",
  format: "iife",
  external: ["fs", "path", "crypto"],
  target: "chrome80",
  minify: false,
  loader: { ".svg": "text" }, // 首页数据岛内联 milestone.svg
});
await cp("src/index.html", "dist/index.html");
await cp("src/style.css", "dist/style.css");
await cp("node_modules/sql.js/dist/sql-wasm.wasm", "dist/sql-wasm.wasm");
await cp(assetSource, "dist/assets", {
  recursive: true,
  // B10 白名单：v2/illustrations 只打包 final/ 顶层的 PNG（不含 final/source、business、tools、milestone；里程碑 SVG 由 esbuild 内联），
  // 避免 APK 带入约 28MB 原图与分层素材及试验图。
  filter: (p) => {
    const norm = p.split(path.sep).join("/");
    if (norm.endsWith(".svg") || norm.endsWith(".md")) return false;
    const i = norm.indexOf("/v2/illustrations");
    if (i < 0) return true;
    const rest = norm.slice(i + "/v2/illustrations".length);
    return rest === "" || rest === "/final" || /^\/final\/[^/]+\.png$/.test(rest);
  },
});
const chapters = [],
  questions = [],
  cards = [];
for (let i = 1; i <= 20; i++) {
  const file = `ch${String(i).padStart(2, "0")}.json`;
  chapters.push(
    JSON.parse(
      await readFile(`${contentSource}/courses_resource/courses/${file}`),
    ),
  );
  questions.push(
    ...JSON.parse(
      await readFile(`${contentSource}/question_resource/questions/${file}`),
    ).questions,
  );
}
// 闪卡：以 332 张统一数据为唯一内容来源（旧 200 张不再打包）；原始 JSON 不改，打包副本去掉 examples 的 actual。
cards.push(
  ...addDataSets(
    normalizeCards(
      JSON.parse(await readFile(`${contentSource}/flashcard_v2/cards.json`)),
      JSON.parse(await readFile(`${contentSource}/flashcard_v2/illustration-map.json`)),
      { slim: true },
    ),
  ),
);
// 教学图解：独立文件，按卡号挂到 card.teach；不改原始卡片 JSON。
{
  const teaching = JSON.parse(await readFile(`${contentSource}/flashcard_v2/teaching-figures.json`));
  for (const card of cards) if (teaching.figures?.[card.id]) card.teach = teaching.figures[card.id];
}
const courseStructureStatus = await loadCourseStructures(chapters);
const integerPolicies = JSON.parse(await readFile("src/integer-column-policy.json"));
for (const question of questions) {
  const policy = integerPolicies[question.id];
  if (!policy) continue;
  for (const fixture of question.testFixtures) {
    const bytes = await readFile(path.join(contentSource, "question_resource", fixture.path));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== policy.fixtureHashes[fixture.path]) {
      throw new Error(`Integer policy requires regeneration for ${question.id}`);
    }
  }
  question.numericTolerance = {
    ...question.numericTolerance,
    exactColumns: policy.exactColumns,
  };
}
await writeFile(
  "dist/content.json",
  JSON.stringify({
    contentVersion: contentManifest.auditRelease,
    chapters,
    courseStructureStatus,
    curriculumMigration: JSON.parse(await readFile(contentSource + "/courses_resource/curriculum-migration.json")),
    questions,
    cards,
  }),
);
const fixtures = path.join(contentSource, "question_resource/fixtures");
const activeIds = new Set(questions.map(question => question.id));
for (const root of ["dist", "android/app/src/main/assets"]) {
  const destination = path.join(root, "fixtures");
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(destination, { withFileTypes: true })) {
    if (entry.isDirectory() && /^q\d{4}$/.test(entry.name) && !activeIds.has(entry.name)) {
      await rm(path.join(destination, entry.name), { recursive: true });
    }
  }
}
for (const entry of await readdir(fixtures, { withFileTypes: true })) {
  if (!/^q\d{4}$/.test(entry.name) || activeIds.has(entry.name)) {
    await cp(path.join(fixtures, entry.name), path.join("dist/fixtures", entry.name), { recursive: true });
  }
}
const databases = JSON.parse(
  await readFile(contentSource + "/question_resource/databases/manifest.json"),
);
for (const d of databases.datasets) {
  d.schemaPath = path.posix.join(path.posix.dirname(d.path), "schema.json");
  const schemaFile = path.join(
    contentSource,
    "question_resource",
    d.schemaPath,
  );
  const schemaBytes = await readFile(schemaFile);
  d.schemaSha256 = createHash("sha256").update(schemaBytes).digest("hex");
  await mkdir(path.dirname(path.join("dist", d.schemaPath)), {
    recursive: true,
  });
  await cp(schemaFile, path.join("dist", d.schemaPath));
  await mkdir(path.dirname("dist/" + d.path), { recursive: true });
  await cp(contentSource + "/question_resource/" + d.path, "dist/" + d.path);
}
await writeFile("dist/databases.json", JSON.stringify(databases));
// Preserve cross-resource result links used by the lessons.
await cp(
  contentSource + "/enterprise_reference/business_tasks",
  "dist/enterprise_reference/business_tasks",
  { recursive: true },
);
const files = [];
async function scan(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await scan(p);
    else if (e.name !== "resources.json") {
      const data = await readFile(p);
      files.push({
        path: path.relative("dist", p),
        bytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      });
    }
  }
}
await scan("dist");
await writeFile(
  "dist/resources.json",
  JSON.stringify({
    version: appRelease.version,
    contentVersion: contentManifest.auditRelease,
    files,
  }),
);
await mkdir("android/app/src/main/assets", { recursive: true });
await cp("dist", "android/app/src/main/assets", { recursive: true });
console.log(
  `Built ${chapters.length} chapters, ${questions.length} questions, ${cards.length} cards, ${files.length} offline files.`,
);
