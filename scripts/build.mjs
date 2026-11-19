import { loadCourseStructures } from "./course-structure-resources.mjs";
import { build } from "esbuild";
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
});
await cp("src/index.html", "dist/index.html");
await cp("src/style.css", "dist/style.css");
await cp("node_modules/sql.js/dist/sql-wasm.wasm", "dist/sql-wasm.wasm");
await cp(assetSource, "dist/assets", {
  recursive: true,
  // v2/illustrations 尚未接入界面（B10 再做白名单），暂不打包，避免 APK 增加约 36MB 未使用资源。
  filter: (p) => !p.endsWith(".svg") && !p.endsWith(".md") && !p.split(path.sep).join("/").includes("/v2/illustrations"),
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
  cards.push(
    ...JSON.parse(
      await readFile(`${contentSource}/flashcard_resource/flashcards/${file}`),
    ).cards,
  );
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
