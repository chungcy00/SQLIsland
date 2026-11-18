import { format } from "sql-formatter";
import { tokens } from "./engine.js";

// Keep small statements and clause arguments together within a mobile-friendly width.
function compactLayout(formatted) {
  const parts = tokens(formatted);
  if (parts.some((part) => part.type === "comment" ||
      (part.type === "quoted" && part.value.includes("\n")))) return formatted;
  const lines = formatted.split("\n");
  const output = [];
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index];
    const clause = line.match(/^(\s*)(SELECT(?: DISTINCT)?|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|SET|VALUES|PARTITION BY)$/);
    if (clause) {
      const indent = clause[1].length;
      let next = lines[index + 1];
      // Indented expressions belong to the clause. Structural blocks keep their layout.
      while (next && (next.length - next.trimStart().length > indent ||
            (clause[2] === "FROM" && /^TABLE;?$/.test(next.trim()))) &&
          !/^(SELECT|WITH|CASE|WHEN|ELSE|END)\b/.test(next.trim()) &&
          !next.trimEnd().endsWith("(") &&
          line.length + 1 + next.trim().length <= 64) {
        line += " " + next.trim();
        index++;
        if (!line.endsWith(",")) break;
        next = lines[index + 1];
      }
    }
    output.push(line);
  }
  return output.join("\n");
}

/** Format the presentation without changing the bundled teaching resources. */
export function formatSqlForDisplay(value) {
  const sql = String(value ?? "").trim();
  if (!sql) return "";
  try {
    const formatted = compactLayout(format(sql, {
      language: "mysql",
      tabWidth: 2,
      keywordCase: "upper",
      dataTypeCase: "upper",
      functionCase: "upper",
      expressionWidth: 42,
      linesBetweenQueries: 1,
      denseOperators: false,
      newlineBeforeSemicolon: false,
      paramTypes: { custom: [{ regex: String.raw`\{\{\w+\}\}` }] },
    }));
    const meaningful = tokens(formatted).filter(
      (token) => token.type !== "space" && token.type !== "comment",
    );
    const statements = [
      "SELECT",
      "WITH",
      "INSERT",
      "UPDATE",
      "DELETE",
      "CREATE",
      "ALTER",
      "DROP",
      "START",
      "BEGIN",
      "COMMIT",
      "ROLLBACK",
      "SAVEPOINT",
      "RELEASE",
      "EXPLAIN",
    ];
    if (
      statements.includes(meaningful[0]?.value.toUpperCase()) &&
      meaningful[meaningful.length - 1]?.value !== ";"
    ) {
      const visibleTokens = tokens(formatted).filter(
        (token) => token.type !== "space",
      );
      const last = visibleTokens[visibleTokens.length - 1];
      return formatted + (last?.type === "comment" ? "\n;" : ";");
    }
    return formatted;
  } catch {
    // Incomplete templates and intentionally erroneous examples retain their text.
    return sql;
  }
}
