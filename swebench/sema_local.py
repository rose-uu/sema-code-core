"""
sema_local: 使用本地 SemaCore (Node.js) 生成 patch。

流程：
  1. git clone 目标 repo 到临时目录，checkout 到 base_commit
  2. 调用 sema_runner.js 让 SemaCore 自动修复代码
  3. 执行 git diff HEAD 获取修改内容并返回
"""
import os
import subprocess
from pathlib import Path

import config as cfg

SWEBENCH_DIR = Path(__file__).parent
RUNNER_JS = SWEBENCH_DIR / "sema" / "sema_runner.js"
PROJECT_ROOT = SWEBENCH_DIR.parent

_PATCH_PROMPT = """\
Please fix the following issue in this repository. The repository has already \
been checked out to the correct commit.

{problem_statement}

Requirements:
- Analyze the issue and locate the relevant source code
- Make the minimum necessary changes to fix the problem
- Do NOT add new test files or modify existing test files
- Do NOT run the test suite
"""


def generate_patch(instance: dict) -> str:
    """使用本地 SemaCore 为给定 instance 生成 patch。"""
    repo = instance["repo"]             # e.g. "django/django"
    base_commit = instance["base_commit"]
    problem_statement = instance["problem_statement"]
    instance_id = instance["instance_id"]

    repo_dir = cfg.REPOS_DIR / instance_id
    cfg.REPOS_DIR.mkdir(parents=True, exist_ok=True)

    if repo_dir.exists():
        print(f"  已有目录 {repo_dir}，重置到 {base_commit[:8]} ...")
        _reset_to_commit(base_commit, str(repo_dir))
    else:
        print(f"  克隆 {repo} @ {base_commit[:8]} ...")
        _clone_and_checkout(repo, base_commit, str(repo_dir))

    # 将 prompt 写入 repo 目录，避免命令行传参长度限制
    problem_file = str(repo_dir / "_problem.txt")
    with open(problem_file, "w", encoding="utf-8") as f:
        f.write(_PATCH_PROMPT.format(problem_statement=problem_statement))

    print(f"  运行 SemaCore ...")
    result = subprocess.run(
        ["node", str(RUNNER_JS), str(repo_dir), problem_file],
        cwd=str(PROJECT_ROOT),
        timeout=900,  # 15 分钟超时
    )
    if result.returncode != 0:
        print(f"  警告: sema_runner 退出码 {result.returncode}")

    # 获取工作区相对于 HEAD 的全部变更
    diff = subprocess.run(
        ["git", "diff", "HEAD"],
        cwd=str(repo_dir),
        capture_output=True,
        text=True,
        check=True,
    )
    return diff.stdout


def _clone_and_checkout(repo: str, base_commit: str, target_dir: str) -> None:
    """从 GitHub clone repo 并 checkout 到指定 commit。"""
    url = f"https://github.com/{repo}.git"
    subprocess.run(
        ["git", "clone", "--quiet", url, target_dir],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "checkout", "--quiet", base_commit],
        cwd=target_dir,
        check=True,
        capture_output=True,
    )


def _reset_to_commit(base_commit: str, repo_dir: str) -> None:
    """将已有 repo 重置到指定 commit，清除所有本地修改。"""
    subprocess.run(
        ["git", "checkout", "--quiet", base_commit],
        cwd=repo_dir,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "reset", "--hard", base_commit],
        cwd=repo_dir,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "clean", "-fdq"],
        cwd=repo_dir,
        check=True,
        capture_output=True,
    )
