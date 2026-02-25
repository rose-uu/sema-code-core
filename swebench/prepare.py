"""
1. 从 HuggingFace 加载 SWE-bench Verified 数据集
2. 对每个目标 instance 生成 patch（目前用 gold patch 作为示例）
3. 写出 predictions.json 供 Docker 验证使用
"""
import argparse
import json

from datasets import load_dataset

import config as cfg


def load_instances(instance_id: str | None = None) -> list[dict]:
    print(f"加载数据集 {cfg.DATASET_NAME} ...")
    ds = load_dataset(cfg.DATASET_NAME, split=cfg.DATASET_SPLIT, cache_dir=cfg.DATASET_CACHE_DIR)

    if instance_id:
        id_set = {instance_id}
    else:
        id_set = set(cfg.resolve_instance_ids())

    instances = [row for row in ds if row["instance_id"] in id_set]
    if not instances:
        raise ValueError("未找到任何 instance，请检查 instance_id 是否正确")
    print(f"找到 {len(instances)} 个 instance")
    return instances


def generate_patch(instance: dict) -> str:
    """
    TODO: 替换成你自己的 patch 生成逻辑。
    目前直接返回 gold patch，用于验证整条流水线是否跑通。
    """
    return instance["patch"]


def inspect_instance(instance: dict):
    """打印 instance 关键信息，方便调试"""
    print("\n" + "=" * 60)
    print(f"instance_id : {instance['instance_id']}")
    print(f"repo        : {instance['repo']}")
    print(f"problem     :\n{instance['problem_statement'][:300]}...")
    print(f"FAIL_TO_PASS: {instance['FAIL_TO_PASS']}")
    print(f"PASS_TO_PASS: {instance['PASS_TO_PASS']}")
    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--instance_id", default=None, help="指定单个 instance ID（覆盖 config）")
    args = parser.parse_args()

    instances = load_instances(args.instance_id)

    predictions = []
    for inst in instances:
        inspect_instance(inst)
        patch = generate_patch(inst)
        predictions.append({
            "instance_id": inst["instance_id"],
            "model_patch": patch,
            "model_name_or_path": "my_model",
        })

    with open(cfg.PREDICTIONS_PATH, "w") as f:
        json.dump(predictions, f, indent=2)

    print(f"已写出 {cfg.PREDICTIONS_PATH}，共 {len(predictions)} 条")


if __name__ == "__main__":
    main()
