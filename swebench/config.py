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
DATASET_CACHE_DIR: str | None = _cfg.get("DATASET_CACHE_DIR") or None
PREDICTIONS_PATH: Path = (SCRIPT_DIR / _cfg.get("PREDICTIONS_PATH", "predictions.json")).resolve()
RUN_ID: str = _cfg.get("RUN_ID", "run")
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
    print(f"INSTANCE_IDS=({' '.join(q(i) for i in ids)})")
