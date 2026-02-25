# 环境

## 安装 docker

安装后验证

```Bash
docker --version
```

## 安装 swebench

```Bash
# 创建虚拟环境
python -m venv ~/.venvs/swebench
source ~/.venvs/swebench/bin/activate

# 安装swebench
git clone https://github.com/princeton-nlp/SWE-bench
cd SWE-bench
pip install -e .
```

# 运行

```Bash
# 在项目根目录执行即可（脚本内部自动激活虚拟环境）
bash swebench/run.sh
```