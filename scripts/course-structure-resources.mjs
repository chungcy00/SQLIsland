import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateStructuredLesson} from '../src/lesson-structure.js';
export const root = path.resolve('resources/CONTENT/courses_resource');
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
export async function loadCourseStructures(chapters) {
  const manifest = await readJson(path.join(root, 'structured/manifest.json'));
  if (manifest.schemaVersion !== 1) throw Error('Unsupported course structure manifest');
  const lessons = new Map(chapters.flatMap(c => c.knowledgePoints).map(k => [k.id, k]));
  const converted = new Set();
  for (const batch of manifest.sourceBatches) {
    for (const entry of batch.files) {
      if (hash(await fs.readFile(path.join(root, entry.path))) !== entry.sha256) throw Error('Original source checksum changed: ' + entry.path);
    }
  }
  for (const entry of manifest.lessons) {
    const lesson = lessons.get(entry.id);
    if (!lesson || converted.has(entry.id)) throw Error('Invalid or duplicated converted ID: ' + entry.id);
    const bytes = await fs.readFile(path.join(root, 'structured', entry.path));
    if (hash(bytes) !== entry.sha256) throw Error('Structure checksum changed: ' + entry.id);
    const presentation = JSON.parse(bytes);
    const sourceBytes = await fs.readFile(path.join(root, presentation.sourcePath));
    if (hash(sourceBytes) !== presentation.sourceSha256) throw Error('Source snapshot checksum changed: ' + entry.id);
    const source = JSON.parse(sourceBytes);
    const {presentation: ignored, ...current} = lesson;
    if (JSON.stringify(source) !== JSON.stringify(current)) throw Error('Course source changed; explicit structure update needed: ' + entry.id);
    validateStructuredLesson(lesson, presentation);
    lesson.presentation = presentation;
    converted.add(entry.id);
  }
  return {resourceVersion: manifest.resourceVersion, converted: [...converted], pending: [...lessons.keys()].filter(id => !converted.has(id))};
}
