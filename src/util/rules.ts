import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd, getAgentDataDir } from './cwd'
import { PROJECT_FILE } from '../constants/product'
import { getGlobalAgentMdPath } from '../util/savePath'
import { getConfManager } from '../manager/ConfManager'

/**
 * 读取 agentDataDir 下的人设文件（SOUL.md 优先，次之 AGENT.md / CLAUDE.md）
 * 这是 Agent 的"灵魂文件"，存储人设、长期记忆指令等。
 * 文件不存在时返回空内容（不强制加载）。
 */
function readPersonaFile(): { content: string; filePath: string } {
  try {
    const dir = getAgentDataDir()
    const candidates = [
      path.join(dir, 'SOUL.md'),
      path.join(dir, PROJECT_FILE),
      path.join(dir, 'CLAUDE.md'),
    ]

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return { content: fs.readFileSync(p, 'utf8'), filePath: p }
      }
    }

    return { content: '', filePath: '' }
  } catch (error) {
    return { content: '', filePath: '' }
  }
}

/**
 * 读取 workingDir 下的项目上下文文件（AGENT.md 优先，次之 CLAUDE.md）
 * 仅当 workingDir ≠ agentDataDir 时才有意义（双目录模式）。
 */
function readProjectConfigFile(): { content: string; filePath: string } {
  try {
    const workingDir = getOriginalCwd()
    const agentDataDir = getAgentDataDir()

    // 若 workingDir == agentDataDir，无需重复加载（避免重复注入）
    if (workingDir === agentDataDir) {
      return { content: '', filePath: '' }
    }

    const agentPath = path.join(workingDir, PROJECT_FILE)
    const claudePath = path.join(workingDir, 'CLAUDE.md')

    if (fs.existsSync(agentPath)) {
      return { content: fs.readFileSync(agentPath, 'utf8'), filePath: agentPath }
    }

    if (fs.existsSync(claudePath)) {
      return { content: fs.readFileSync(claudePath, 'utf8'), filePath: claudePath }
    }

    // 文件不存在 → 不注入项目上下文
    return { content: '', filePath: '' }
  } catch (error) {
    return { content: '', filePath: '' }
  }
}

/**
 * 读取全局~/.sema/AGENT.md 加上customRules
 */
function readGlobalAgentFile(): string {
  try {
    const agentPath = getGlobalAgentMdPath()
    let content = ''

    if (fs.existsSync(agentPath)) {
      content = fs.readFileSync(agentPath, 'utf8')
    }

    // 尝试从配置管理器中获取自定义的 customRules
    const configManager = getConfManager()
    const coreConfig = configManager.getCoreConfig()

    if (coreConfig?.customRules) {
      content = content ? `${content}\n\n${coreConfig.customRules}` : coreConfig.customRules
    }

    return content
  } catch (error) {
    return ''
  }
}

/**
 * 生成 rules 相关的系统提醒信息
 *
 * 当 agentDataDir ≠ workingDir（双目录模式）时，注入两段上下文：
 *   - agentMd：人设文件（agentDataDir/CLAUDE.md）
 *   - claudeMd：项目上下文（workingDir/CLAUDE.md）
 * 单目录模式下与原行为相同。
 */
export function generateRulesReminders(): Anthropic.ContentBlockParam[] {
  const globalContent = readGlobalAgentFile()
  const persona = readPersonaFile()
  const project = readProjectConfigFile()

  const hasGlobal = !!globalContent
  const hasPersona = !!persona.content
  const hasProject = !!project.content

  if (!hasGlobal && !hasPersona && !hasProject) {
    return []
  }

  let body = ''

  if (hasGlobal) {
    body += `Contents of ${getGlobalAgentMdPath()} (user's private global instructions for all projects): ${globalContent}\n\n`
  }

  if (hasPersona) {
    body += `# agentMd\nCodebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.\n\nContents of ${persona.filePath} (agent persona & long-term instructions): ${persona.content}\n\n`
  }

  if (hasProject) {
    body += `# claudeMd\nContents of ${project.filePath} (current project context — follow if relevant to the task): ${project.content}\n\n`
  }

  const rulesReminder = `<system-reminder>
As you answer the user's questions, you can use the following context:
${body.trimEnd()}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.\n</system-reminder>`

  return [{
    type: 'text' as const,
    text: rulesReminder
  }]
}
