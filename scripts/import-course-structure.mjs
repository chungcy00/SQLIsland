// Imports already reviewed structured content. It does not split or rewrite prose.
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {root, hash, readJson} from './course-structure-resources.mjs';
import {validateStructuredLesson} from '../src/lesson-structure.js';
import {refreshCourseIntegrity} from './refresh-course-integrity.mjs';
const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) throw Error('Usage: node scripts/import-course-structure.mjs FILE.json [--replace]');
const value = await readJson(args[0]);
const chapter = await readJson(path.join(root, 'courses', 'ch' + value.id.slice(2, 4) + '.json'));
const lesson = chapter.knowledgePoints.find(k => k.id === value.id);
if (!lesson) throw Error('Unknown lesson');
validateStructuredLesson(lesson, value);
const sourcePath = path.resolve(root, value.sourcePath);
if (!sourcePath.startsWith(root + path.sep)) throw Error('Source must be archived inside course resources');
const bytes = await fs.readFile(sourcePath);
if (hash(bytes) !== value.sourceSha256 || !isDeepStrictEqual(JSON.parse(bytes), lesson)) throw Error('Source snapshot mismatch');
const manifestPath = path.join(root, 'structured/manifest.json');
const manifest = await readJson(manifestPath);
if (!manifest.sourceBatches.some(batch => batch.id === value.sourceBatch)) throw Error('Archive/register the original source batch first');
const destination = path.join(root, 'structured/lessons', value.id + '.json');
const output = JSON.stringify(value, null, 2) + '\n';
const old = manifest.lessons.find(item => item.id === value.id);
if (old) {
  const previous = await fs.readFile(destination, 'utf8');
  if (previous === output) { console.log(value.id + ': unchanged; skipped'); process.exit(0); }
  if (!args.includes('--replace')) throw Error('Already converted; explicit --replace is required');
}
await fs.writeFile(destination, output);
const entry = {id:value.id, path:'lessons/' + value.id + '.json', sha256:hash(output)};
if (old) Object.assign(old, entry); else manifest.lessons.push(entry);
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await refreshCourseIntegrity();
console.log(value.id + ': imported. Run structure/browser checks and update HANDOFF.md before completing the batch.');
