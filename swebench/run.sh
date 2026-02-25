#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 激活虚拟环境
source ~/.venvs/swebench/bin/activate

# ── 解析 config.yaml，输出 shell 变量赋值 ──────────────────────────
eval "$(python3 "$SCRIPT_DIR/config.py")"

# ── 概要 ───────────────────────────────────────────────────────────
echo "============================================"
echo "Dataset  : $DATASET_NAME ($DATASET_SPLIT)"
echo "Cache    : ${DATASET_CACHE_DIR:-（未设置）}"
echo "Run ID   : $RUN_ID"
echo "Instances: ${INSTANCE_IDS[*]:-（空）}"
echo "============================================"

# ── 遍历每个 instance ─────────────────────────────────────────────
FAILED=()

for INSTANCE_ID in "${INSTANCE_IDS[@]}"; do
  echo ""
  echo ">>> [$INSTANCE_ID] 一、生成 patch"

  if ! python3 "$SCRIPT_DIR/prepare.py" --instance_id "$INSTANCE_ID"; then
    echo ">>> [$INSTANCE_ID] prepare.py 失败，跳过本实例"
    FAILED+=("$INSTANCE_ID")
    continue
  fi

  echo ""
  echo ">>> [$INSTANCE_ID] 二、验证结果"

  if ! python3 -m swebench.harness.run_evaluation \
        --dataset_name     "$DATASET_NAME"              \
        --split            "$DATASET_SPLIT"             \
        --cache_dir        "${DATASET_CACHE_DIR:-}"     \
        --predictions_path "$PREDICTIONS_PATH"          \
        --run_id           "${RUN_ID}_${INSTANCE_ID}"   \
        --instance_ids     "$INSTANCE_ID"               \
        --max_workers      1; then
    echo ">>> [$INSTANCE_ID] 评估失败，跳过本实例"
    FAILED+=("$INSTANCE_ID")
    continue
  fi

  echo ">>> [$INSTANCE_ID] 结果目录: $SCRIPT_DIR/${RUN_ID}_${INSTANCE_ID}/"
done

# ── 汇总 ───────────────────────────────────────────────────────────
echo ""
echo "============================================"
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "全部完成 ✓"
else
  echo "完成，但以下实例失败："
  for id in "${FAILED[@]}"; do
    echo "  - $id"
  done
  exit 1
fi
echo "============================================"
