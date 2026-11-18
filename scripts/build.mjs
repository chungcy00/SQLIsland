import { build } from "esbuild";
import {
  mkdir,
  cp,
  readFile,
  writeFile,
  readdir,
  stat,
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
  filter: (p) => !p.endsWith(".svg") && !p.endsWith(".md"),
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
await writeFile(
  "dist/content.json",
  JSON.stringify({
    contentVersion: contentManifest.auditRelease,
    chapters,
    questions,
    cards,
  }),
);
await cp(contentSource + "/question_resource/fixtures", "dist/fixtures", {
  recursive: true,
});
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
