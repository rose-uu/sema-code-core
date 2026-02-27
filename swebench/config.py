"""
SWE-bench 配置加载模块。
- 作为模块导入：暴露配置常量和 resolve_instance_ids()。
- 直接运行：输出 shell 变量赋值，供 run.sh 通过 eval 使用。
"""
import shlex
import yaml
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent


def _load_raw() -> dict:
    with open(SCRIPT_DIR / "config.yaml") as f:
        return yaml.safe_load(f)


_cfg = _load_raw()

DATASET_NAME: str = _cfg["DATASET_NAME"]
DATASET_SPLIT: str = _cfg["DATASET_SPLIT"]
_cache_raw = _cfg.get("DATASET_CACHE_DIR") or None
if _cache_raw:
    _cache_path = Path(_cache_raw)
    if not _cache_path.is_absolute():
        raise ValueError(f"DATASET_CACHE_DIR 必须使用绝对路径，当前值: {_cache_raw}")
    DATASET_CACHE_DIR: Path | None = _cache_path
else:
    DATASET_CACHE_DIR: Path | None = None
_repos_raw = _cfg.get("REPOS_DIR", "")
if not _repos_raw:
    raise ValueError("REPOS_DIR 未配置")
_repos_path = Path(_repos_raw)
if not _repos_path.is_absolute():
    raise ValueError(f"REPOS_DIR 必须使用绝对路径，当前值: {_repos_raw}")
REPOS_DIR: Path = _repos_path

PREDICTIONS_PATH: Path = (SCRIPT_DIR / _cfg.get("PREDICTIONS_PATH", "predictions.json")).resolve()
RUN_ID: str = _cfg.get("RUN_ID", "run")
_report_raw = _cfg.get("REPORT_DIR", "")
if not _report_raw:
    raise ValueError("REPORT_DIR 未配置")
_report_path = Path(_report_raw)
if not _report_path.is_absolute():
    raise ValueError(f"REPORT_DIR 必须使用绝对路径，当前值: {_report_raw}")
REPORT_DIR: Path = _report_path
TARGET_INSTANCE_IDS_CFG = _cfg.get("TARGET_INSTANCE_IDS", [])


def resolve_instance_ids() -> list[str]:
    """将 TARGET_INSTANCE_IDS 配置解析为实例 ID 字符串列表。"""
    if isinstance(TARGET_INSTANCE_IDS_CFG, list):
        return list(TARGET_INSTANCE_IDS_CFG)
    if isinstance(TARGET_INSTANCE_IDS_CFG, dict):
        from datasets import load_dataset  # 延迟导入，仅在需要时加载
        start = int(TARGET_INSTANCE_IDS_CFG.get("start", 0))
        count = int(TARGET_INSTANCE_IDS_CFG.get("count", 1))
        ds = load_dataset(DATASET_NAME, split=DATASET_SPLIT, cache_dir=DATASET_CACHE_DIR)
        total = len(ds)
        end = min(start + count, total)
        if start >= total:
            return []
        return [row["instance_id"] for row in ds.select(range(start, end))]
    return []


if __name__ == "__main__":
    # 供 run.sh 通过 eval "$(python3 config.py)" 使用
    q = shlex.quote
    ids = resolve_instance_ids()
    cache = str(DATASET_CACHE_DIR) if DATASET_CACHE_DIR else ""
    print(f"DATASET_NAME={q(DATASET_NAME)}")
    print(f"DATASET_SPLIT={q(DATASET_SPLIT)}")
    print(f"DATASET_CACHE_DIR={q(cache)}")
    print(f"PREDICTIONS_PATH={q(str(PREDICTIONS_PATH))}")
    print(f"RUN_ID={q(RUN_ID)}")
    print(f"REPORT_DIR={q(str(REPORT_DIR))}")
    print(f"REPOS_DIR={q(str(REPOS_DIR))}")
    print(f"INSTANCE_IDS=({' '.join(q(i) for i in ids)})")
