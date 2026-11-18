"""Summarize actual WASM timings and offline footprint against the captured baseline."""

from pathlib import Path
import json
import statistics

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/task-reaudit-20261118"
BASE = ROOT / ".tooling/task-reaudit-20261118"
wasm = json.loads((OUT / "wasm-validation.json").read_text())
old_inventory = BASE / "offline-before.json"
if not old_inventory.exists():
    candidate = ROOT / ".tooling/source-check/dist/resources.json"
    previous = json.loads(candidate.read_text())
    assert (
        previous["version"] == "0.3.1"
    ), "Capture the baseline offline inventory before rebuilding the clean checkout"
    old_inventory.write_bytes(candidate.read_bytes())
previous = json.loads(old_inventory.read_text())
current = json.loads((ROOT / "dist/resources.json").read_text())
public = [
    r["elapsedMs"]
    for q in wasm["questions"]
    for f in q["fixtures"]
    if f["visibility"] == "public"
    for r in f["references"]
]
full = [q["fullSubmissionMs"] for q in wasm["questions"]]
report = {
    "environment": "本机Node.js sql.js WASM完整取数；实体手机耗时待验证",
    "publicQueryMedianMs": statistics.median(public),
    "publicQueryMaxMs": max(public),
    "fullSubmissionMedianMs": statistics.median(full),
    "fullSubmissionMaxMs": max(full),
    "previousOfflineBytes": sum(entry["bytes"] for entry in previous["files"]),
    "offlineBytes": sum(entry["bytes"] for entry in current["files"]),
    "offlineFiles": len(current["files"]),
    "databaseBytes": sum(
        path.stat().st_size
        for path in (ROOT / "resources/CONTENT/question_resource/databases").glob(
            "*/*.sqlite"
        )
    ),
}
(OUT / "performance.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n"
)
