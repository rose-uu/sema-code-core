import { SemaCoreConfig, ModelConfig, TaskConfig, FetchModelsParams, FetchModelsResult, ApiTestParams, ApiTestResult, ModelUpdateData, UpdatableCoreConfigKeys, UpdatableCoreConfig } from '../types';
import { FileReferenceInfo, ToolInfo } from '../types/index';
import { MCPServerConfig, MCPScopeType, MCPServerInfo } from '../types/mcp';
import { SkillInfo } from '../types/skill';
import { AgentInfo, AgentConfig } from '../types/agent';
import { ToolPermissionResponse, AskQuestionResponseData, PlanExitResponseData } from '../events/types';
import { fetchModels, testApiConnection } from '../services/api/apiUtil';
import { createMCPManagerForDir, MCPManager } from '../services/mcp/MCPManager';
import { getSkillsInfo } from '../services/skill/skillRegistry';
import { getAgentsInfo, addAgentConf } from '../services/agents/agentsManager';
import { getCachedCustomCommands, reloadCustomCommands as reloadCustomCommandsImpl } from '../services/plugins/customCommands';
import { CustomCommand } from '../types/command';
import { SemaEngine } from './SemaEngine';
import { getConfManager } from '../manager/ConfManager';
import { getModelManager } from '../manager/ModelManager';
import { getToolInfos } from '../tools/base/tools';
import { logInfo } from '../util/log';
import { getCwd, setWorkingDirOverride, clearWorkingDirOverride } from '../util/cwd';

/**
 * Sema 核心 API 类
 * 提供简洁的公共接口，内部委托给 SemaEngine 处理业务逻辑
 *
 * 多租户改造：每个 SemaCore 实例持有独立的 instanceId 和 MCPManager，
 * SemaEngine 通过 AsyncLocalStorage 隔离 EventBus / StateManager / config。
 */
export class SemaCore {
  private readonly engine: SemaEngine;
  private readonly instanceMCPManager: MCPManager;
  private readonly instanceId: string;
  private configPromise: Promise<void> | null = null;

  constructor(config?: SemaCoreConfig) {
    const resolvedConfig = config || {};

    // instanceId：优先使用 config 中提供的，否则生成唯一 ID
    const instanceId = resolvedConfig.instanceId ?? `engine-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.instanceId = instanceId;

    // 为此引擎创建独立的 MCPManager（projectConfigPath 绑定到 agentDataDir）
    const workingDir = resolvedConfig.workingDir || getCwd();
    const agentDataDir = resolvedConfig.agentDataDir || workingDir;
    this.instanceMCPManager = createMCPManagerForDir(agentDataDir);

    // 创建 per-engine SemaEngine（携带 MCPManager）
    this.engine = new SemaEngine(instanceId, resolvedConfig, this.instanceMCPManager);

    // 向全局 ConfManager 注册项目配置（主要为了 project history 等持久化）
    this.configPromise = getConfManager().setCoreConfig(resolvedConfig);

    // 初始化 per-engine MCPManager（读取 workingDir/.sema/mcp.json + 全局配置）
    this.configPromise = this.configPromise.then(async () => {
      await this.instanceMCPManager.init();
    });

    logInfo(`初始化SemaCore [${instanceId}]: ${JSON.stringify(resolvedConfig, null, 2)}`);
  }

  // ==================== 工作目录 ====================

  /**
   * 动态切换工作目录（WorkspaceTool 调用后生效）。
   * 通过 workingDirOverrides Map 跨越 AsyncLocalStorage 边界持久化，
   * 下次 getOriginalCwd() 即返回新路径。
   */
  setWorkingDir(newDir: string): void {
    setWorkingDirOverride(this.instanceId, newDir);
  }

  /** 清除工作目录覆盖，回到初始 workingDir（实例销毁时调用） */
  clearWorkingDir(): void {
    clearWorkingDirOverride(this.instanceId);
  }

  // ==================== 事件接口 ====================
  // 监听事件接口 - 暴露所有监听能力
  on = <T>(event: string, listener: (data: T) => void) => (this.engine.on(event, listener), this);
  once = <T>(event: string, listener: (data: T) => void) => (this.engine.once(event, listener), this);
  off = <T>(event: string, listener: (data: T) => void) => (this.engine.off(event, listener), this);

  // 权限响应接口 - 只暴露必要的发送能力
  respondToToolPermission = (response: ToolPermissionResponse) =>
    this.engine.emit('tool:permission:response', response);
  respondToAskQuestion = (response: AskQuestionResponseData) =>
    this.engine.emit('ask:question:response', response);
  respondToPlanExit = (response: PlanExitResponseData) =>
    this.engine.emit('plan:exit:response', response);

  // ==================== 会话 ====================
  // 异步操作，通过事件通知结果
  createSession = async (sessionId?: string) => {
    // 等待配置设置完成
    if (this.configPromise) {
      await this.configPromise;
      this.configPromise = null;
    }
    return this.engine.createSession(sessionId);
  };
  processUserInput = (input: string, originalInput?: string): void => this.engine.processUserInput(input, originalInput);

  // ==================== 中断 ====================
  // 同步操作，立即执行
  interruptSession = () => this.engine.interruptSession();

  // ==================== 模型管理 ====================
  // 异步操作，返回结果并通过 model:update 事件通知
  addModel = (config: ModelConfig, skipValidation?: boolean): Promise<ModelUpdateData> => getModelManager().addNewModel(config, skipValidation);
  delModel = (ModelName: string): Promise<ModelUpdateData> => getModelManager().deleteModel(ModelName);
  switchModel = (ModelName: string): Promise<ModelUpdateData> => getModelManager().switchCurrentModel(ModelName);
  applyTaskModel = (config: TaskConfig): Promise<ModelUpdateData> => getModelManager().applyTaskModelConfig(config);
  getModelData = (): Promise<ModelUpdateData> => getModelManager().getModelData();

  // ==================== 配置管理 ====================
  // 更新核心配置
  updateCoreConfByKey = <K extends UpdatableCoreConfigKeys>(key: K, value: SemaCoreConfig[K]): void => getConfManager().updateCoreConfByKey(key, value);
  updateCoreConfig = (config: UpdatableCoreConfig): void => getConfManager().updateCoreConfig(config);
  updateUseTools = (toolNames: string[] | null): void => getConfManager().updateUseTools(toolNames);
  updateAgentMode = (mode: 'Agent' | 'Plan'): void => this.engine.updateAgentMode(mode);
  getToolInfos = (): ToolInfo[] => getToolInfos();

  // ==================== 工具API ====================
  // 独立的工具函数，不依赖会话状态
  fetchAvailableModels = (params: FetchModelsParams): Promise<FetchModelsResult> => fetchModels(params);
  testApiConnection = (params: ApiTestParams): Promise<ApiTestResult> => testApiConnection(params);

  // ==================== MCP 管理（使用 per-engine MCPManager）====================
  addOrUpdateMCPServer = (config: MCPServerConfig, scope: MCPScopeType): Promise<MCPServerInfo> =>
    this.instanceMCPManager.addOrUpdateServer(config, scope);
  removeMCPServer = (name: string, scope: MCPScopeType): Promise<boolean> =>
    this.instanceMCPManager.removeServer(name, scope);
  getMCPServerConfigs = (): Map<MCPScopeType, MCPServerInfo[]> =>
    this.instanceMCPManager.getMCPServerConfigs();
  connectMCPServer = (name: string): Promise<MCPServerInfo> =>
    this.instanceMCPManager.connectMCPServer(name);
  updateMCPUseTools = (name: string, toolNames: string[] | null): boolean =>
    this.instanceMCPManager.updateMCPUseTools(name, toolNames);

  // ==================== Skill 管理 ====================
  getSkillsInfo = (): SkillInfo[] => getSkillsInfo();

  // ==================== Agents 管理 ====================
  // getAgentsConfs = (): AgentConfig[] => getAgentsConfs();
  getAgentsInfo = (): AgentInfo[] => getAgentsInfo();
  addAgentConf = (agentConf: AgentConfig): Promise<boolean> => addAgentConf(agentConf);

  // ==================== Custom Commands 管理 ====================
  getCustomCommands = (): Promise<CustomCommand[]> => getCachedCustomCommands();
  reloadCustomCommands = (): void => reloadCustomCommandsImpl();

  // ==================== 资源管理 ====================
  // 清理所有资源并停止 Sema 核心服务
  dispose = async () => {
    await this.instanceMCPManager.dispose();
    this.engine.dispose();
  };

}
