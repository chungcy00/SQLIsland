import fs from 'node:fs/promises';
import path from 'node:path';
import {root, hash, readJson} from './course-structure-resources.mjs';
export async function refreshCourseIntegrity() {
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = await readJson(manifestPath);
  for (const chapter of manifest.chapters) chapter.sha256 = hash(await fs.readFile(path.join(root, chapter.path)));
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const contentRoot = path.dirname(root);
  const contentManifestPath = path.join(contentRoot, 'manifest.json');
  const contentManifest = await readJson(contentManifestPath);
  const files = [];
  async function walk(dir) {
    for (const item of await fs.readdir(dir, {withFileTypes:true})) {
      if (item.name === '__pycache__' || item.name === '.DS_Store') continue;
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await walk(file);
      else if (file !== contentManifestPath) {
        const bytes = await fs.readFile(file);
        files.push({path:path.relative(contentRoot, file), bytes:bytes.length, sha256:hash(bytes)});
      }
    }
  }
  await walk(contentRoot);
  contentManifest.files = files.sort((a,b) => a.path.localeCompare(b.path, 'en'));
  await fs.writeFile(contentManifestPath, JSON.stringify(contentManifest, null, 2) + '\n');
}
if (process.argv[1]?.endsWith('/refresh-course-integrity.mjs')) await refreshCourseIntegrity();
