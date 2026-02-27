#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 初始化 sema 目录（安装 sema-core）──────────────────────────
(
  cd "$SCRIPT_DIR/sema"
  if [[ ! -f package.json ]]; then
    npm init -y
    # sema_runner.js 使用 ES module，需声明 type=module
    node -e "const p=require('./package.json'); p.type='module'; require('fs').writeFileSync('./package.json', JSON.stringify(p,null,2))"
  fi
  if [[ ! -d node_modules/sema-core ]]; then
    npm install sema-core
  fi
)
echo "sema-core 初始化完成"

# 激活虚拟环境
source ~/.venvs/swebench/bin/activate
echo "激活虚拟环境 swebench"

# ── 解析 config.yaml，输出 shell 变量赋值 ──────────────────────────
eval "$(python3 "$SCRIPT_DIR/config.py")"

# ── 概要 ───────────────────────────────────────────────────────────
mkdir -p "$REPORT_DIR"

echo "============================================"
echo "Dataset  : $DATASET_NAME ($DATASET_SPLIT)"
echo "Cache    : $DATASET_CACHE_DIR"
echo "Run ID   : $RUN_ID"
echo "Report   : $REPORT_DIR"
echo "Instances: ${INSTANCE_IDS[*]:-（空）}"
echo "============================================"

# ── 遍历每个 instance ─────────────────────────────────────────────
FAILED=()

for INSTANCE_ID in "${INSTANCE_IDS[@]}"; do
  echo ""
  echo ">>> [$INSTANCE_ID] 一、生成 patch"

  if ! python3 "$SCRIPT_DIR/patch.py" --instance_id "$INSTANCE_ID"; then
    echo ">>> [$INSTANCE_ID] patch.py 失败，跳过本实例"
    FAILED+=("$INSTANCE_ID")
    continue
  fi

  echo ""
  echo ">>> [$INSTANCE_ID] 二、验证结果"

  ARCH="$(uname -m)"
  INSTANCE_ID_LOWER="$(echo "$INSTANCE_ID" | tr '[:upper:]' '[:lower:]')"
  echo ">>> [$INSTANCE_ID] 实例镜像: sweb.eval.${ARCH}.${INSTANCE_ID_LOWER}:latest"
  echo ">>> [$INSTANCE_ID] 环境镜像: sweb.env.py.${ARCH}.*:latest"

  # 运行评估时抑制所有日志输出；--cache_level instance 保留实例镜像，避免每次重建
  if ! (cd "$REPORT_DIR" && \
        PYTHONWARNINGS=ignore \
        python3 -m swebench.harness.run_evaluation \
          --dataset_name     "$DATASET_NAME"              \
          --split            "$DATASET_SPLIT"             \
          --predictions_path "$PREDICTIONS_PATH"          \
          --run_id           "${RUN_ID}_${INSTANCE_ID}"   \
          --instance_ids     "$INSTANCE_ID"               \
          --report_dir       "$REPORT_DIR"                \
          --cache_level      instance                     \
          --max_workers      1 2>&1 | grep -v "httpx" || true); then
      echo ">>> [$INSTANCE_ID] 评估失败，跳过本实例"
      FAILED+=("$INSTANCE_ID")
      continue
  fi

  echo ">>> [$INSTANCE_ID] 结果文件: $REPORT_DIR/my_model.${RUN_ID}_${INSTANCE_ID}.json"
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