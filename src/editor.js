import { tokens } from "./engine.js";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const keywords = new Set(
  "SELECT FROM WHERE GROUP BY HAVING ORDER ASC DESC LIMIT OFFSET JOIN LEFT RIGHT INNER OUTER CROSS ON AS DISTINCT WITH RECURSIVE UNION ALL CASE WHEN THEN ELSE END AND OR NOT IN IS NULL BETWEEN LIKE OVER PARTITION ROWS RANGE UNBOUNDED PRECEDING CURRENT ROW INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX PRIMARY KEY FOREIGN REFERENCES CHECK DEFAULT UNIQUE BEGIN TRANSACTION COMMIT ROLLBACK SAVEPOINT RELEASE".split(
    " ",
  ),
);
const controllers = new Map();

function highlight(sql) {
  const list = tokens(sql);
  return (
    list
      .map((token, index) => {
        let kind = "";
        if (token.type === "comment") kind = "comment";
        else if (token.type === "quoted" && token.value[0] !== "`")
          kind = "string";
        else if (keywords.has(token.value.toUpperCase())) kind = "keyword";
        else if (/^\d$/.test(token.value)) kind = "number";
        else if (
          token.type === "code" &&
          /^[a-z_]\w*$/i.test(token.value) &&
          list.slice(index + 1).find((t) => t.type !== "space")?.value === "("
        )
          kind = "function";
        return kind
          ? `<span class="sql-${kind}">${escape(token.value)}</span>`
          : escape(token.value);
      })
      .join("") + "\n"
  );
}
export function editorBody(id, value, settings, toolbar) {
  return `<section class="sql-editor ${settings.editorDark ? "dark" : ""}" style="--editor-font:${settings.fontSize}px" data-editor="${escape(id)}"><div class="sql-editor-toolbar"><small>SQL <span id="editor-line-count">${value.split("\n").length}</span> 行</small><div class="editor-controls">${toolbar}</div></div><div class="editor-body"><div class="editor-gutter" aria-hidden="true"><div id="editor-lines"></div></div><div class="editor-content"><pre id="editor-highlight" aria-hidden="true"></pre><textarea id="sql-editor" class="code-input" data-id="${escape(id)}" inputmode="${settings.customKeyboard ? "none" : "text"}" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="SQL 代码编辑器">${escape(value)}</textarea></div></div></section>`;
}
export function mountEditor(root, onChange) {
  const input = root.querySelector("#sql-editor");
  if (!input) return;
  const id = input.dataset.id;
  const controller = controllers.get(id) || {
    undo: [],
    redo: [],
    current: { text: input.value, start: 0, end: 0 },
  };
  if (controller.current.text !== input.value)
    controller.current = {
      text: input.value,
      start: input.value.length,
      end: input.value.length,
    };
  controllers.set(id, controller);
  function snapshot() {
    return {
      text: input.value,
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  }
  function sync() {
    root.querySelector("#editor-highlight").innerHTML = highlight(input.value);
    const count = input.value.split("\n").length;
    root.querySelector(".editor-body").style.height =
      Math.max(120, count * 24 + 28) + "px";
    root.querySelector("#editor-lines").textContent = Array.from(
      { length: count },
      (_, i) => i + 1,
    ).join("\n");
    root.querySelector("#editor-line-count").textContent = count;
    root.querySelector("[data-action=editorUndo]").disabled =
      !controller.undo.length;
    root.querySelector("[data-action=editorRedo]").disabled =
      !controller.redo.length;
    scroll();
  }
  function scroll() {
    root.querySelector("#editor-highlight").style.transform =
      `translate(${-input.scrollLeft}px,${-input.scrollTop}px)`;
    root.querySelector("#editor-lines").style.transform =
      `translateY(${-input.scrollTop}px)`;
  }
  function publish(previous) {
    if (previous.text !== input.value) {
      controller.undo.push(previous);
      if (controller.undo.length > 100) controller.undo.shift();
      controller.redo = [];
    }
    controller.current = snapshot();
    sync();
    onChange(input);
  }
  function replace(text, start, end, selection) {
    const previous = snapshot();
    input.setRangeText(text, start, end, "end");
    if (selection !== undefined) input.setSelectionRange(selection, selection);
    publish(previous);
  }
  input.addEventListener("input", () => publish(controller.current));
  input.addEventListener("select", () => {
    controller.current = snapshot();
  });
  input.addEventListener("scroll", scroll);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      editorCommand(event.shiftKey ? "redo" : "undo");
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      replace("  ", input.selectionStart, input.selectionEnd);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const start = input.selectionStart;
      const line = input.value.slice(0, start).split("\n").pop();
      const indent = line.match(/^\s*/)[0];
      const extra = line.trimEnd().endsWith("(") ? "  " : "";
      replace("\n" + indent + extra, start, input.selectionEnd);
    } else if (
      ["(", "'", '"', "`"].includes(event.key) &&
      input.selectionStart === input.selectionEnd
    ) {
      const next = input.value[input.selectionStart];
      if (event.key !== "(" && next === event.key) {
        event.preventDefault();
        input.setSelectionRange(
          input.selectionStart + 1,
          input.selectionStart + 1,
        );
        return;
      }
      const before = input.value.slice(0, input.selectionStart);
      const inComment = before.split("\n").pop().includes("--");
      const openQuotes = before.split("'").length % 2 === 0;
      if (!inComment && !openQuotes) {
        event.preventDefault();
        const pos = input.selectionStart;
        replace(
          event.key + (event.key === "(" ? ")" : event.key),
          pos,
          pos,
          pos + 1,
        );
      }
    }
  });
  input._editor = { controller, snapshot, sync, replace, publish };
  sync();
}
export function editorCommand(command, text) {
  const input = document.querySelector("#sql-editor");
  if (!input?._editor) return;
  const api = input._editor,
    controller = api.controller;
  if (command === "undo" || command === "redo") {
    const source = command === "undo" ? controller.undo : controller.redo;
    const target = command === "undo" ? controller.redo : controller.undo;
    const previous = source.pop();
    if (!previous) return;
    target.push(api.snapshot());
    input.value = previous.text;
    input.setSelectionRange(previous.start, previous.end);
    controller.current = api.snapshot();
    api.sync();
    input.dispatchEvent(new Event("editorchange", { bubbles: true }));
  } else if (command === "replace") api.replace(text, 0, input.value.length);
  else api.replace(text, input.selectionStart, input.selectionEnd);
  input.focus({ preventScroll: true });
}
