// Keep the former IDs in backups and derive the initial status of the consolidated lesson.
export function lessonHistorySources(migration, target) {
  return Object.entries(migration.targets)
    .filter(([source, targets]) => (migration.historyTargets[source]
      ? migration.historyTargets[source] === target
      : targets.includes(target)))
    .map(([source]) => source);
}

export function lessonComplete(state, migration, id) {
  const sources = lessonHistorySources(migration, id);
  return state.consolidatedCompleted?.includes(id) ||
    [id, ...sources].every((source) => state.completed.includes(source));
}

export function lessonNoteKey(migration, id) {
  return lessonHistorySources(migration, id).length ? 'curriculum:' + id : id;
}

export function lessonNote(state, migration, id) {
  const key = lessonNoteKey(migration, id);
  if (Object.prototype.hasOwnProperty.call(state.notes, key)) return state.notes[key];
  const notes = [state.notes[id]];
  for (const source of lessonHistorySources(migration, id)) {
    if (state.notes[source]?.trim()) {
      notes.push('【' + migration.sourceTitles[source] + '】\n' + state.notes[source]);
    }
  }
  return notes.filter(Boolean).join('\n\n');
}

export function migrateLessonBookmarks(state, migration) {
  if (state.curriculumBookmarksMigrated) return false;
  const favorites = new Set(state.favorites);
  for (const id of state.favorites) {
    for (const target of migration.targets[id] || []) favorites.add(target);
  }
  state.favorites = [...favorites];
  const from = state.lastLesson;
  state.lastLesson = migration.historyTargets[from] || migration.targets[from]?.[0] ||
    (migration.removed.includes(from) ? null : from);
  state.curriculumBookmarksMigrated = true;
  return true;
}
