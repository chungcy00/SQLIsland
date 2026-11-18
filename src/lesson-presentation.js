// Split display blocks without changing or summarizing the original teaching text.
export function requirementSections(text = "") {
  const labels = ["输出字段名称及顺序", "输出列名称及顺序", "输出顺序（含决胜键）", "输出顺序", "参考排序键"];
  const pattern = new RegExp(`(${labels.join("|")})[：:]`, "g");
  const sections = [];
  let start = 0;
  let label = "任务要求";
  for (const match of text.matchAll(pattern)) {
    if (match.index > start) sections.push({ label, text: text.slice(start, match.index) });
    label = match[1];
    start = match.index + match[0].length;
  }
  if (start < text.length) sections.push({ label, text: text.slice(start) });
  return sections;
}

export function readingChunks(text = "", includeSemicolons = false) {
  if (text.length < 120) return [text];
  return text.match(includeSemicolons ? /[^；。]+[；。]?|[；。]/g : /[^。]+。?|。/g) || [text];
}
