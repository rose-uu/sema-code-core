/**
 * sema_runner.js
 * 使用 SemaCore 自动修复代码问题，供 sema_local.py 调用。
 * 用法: node sema_runner.js <workingDir> <problemFile>
 */

import { SemaCore } from 'sema-core';
import fs from 'fs';

const workingDir = process.argv[2];
const problemFile = process.argv[3];

if (!workingDir || !problemFile) {
  console.error('Usage: node sema_runner.js <workingDir> <problemFile>');
  process.exit(1);
}

const problemPrompt = fs.readFileSync(problemFile, 'utf-8');

const core = new SemaCore({
  workingDir,
  logLevel: 'info',
  thinking: false,
  skipFileEditPermission: true,
  skipBashExecPermission: true,
  skipSkillPermission: true,
  skipMCPToolPermission: true,
  useTools: ['Bash', 'TodoWrite', 'Glob', 'Grep', 'Read', 'Edit', 'Write', 'Task', 'NotebookEdit'],
});

async function run() {
  // 等待 session 创建完成
  await new Promise((resolve) => {
    core.once('session:ready', () => resolve());
    core.createSession();
  });

  // 发送问题，等待 AI 处理完成
  await new Promise((resolve, reject) => {
    core.once('session:error', (data) => {
      reject(new Error(`session:error: ${data.error?.message || JSON.stringify(data)}`));
    });

    let processing = false;
    core.on('state:update', (data) => {
      if (data.state === 'processing') {
        processing = true;
      } else if (data.state === 'idle' && processing) {
        resolve();
      }
    });

    core.processUserInput(problemPrompt);
  });

  await core.dispose();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('sema_runner error:', err.message);
    process.exit(1);
  });
