/**
 * Engine Context - AsyncLocalStorage-based per-engine isolation
 *
 * Solves the singleton problem for multi-tenant SemaCore instances.
 * Each SemaEngine runs its operations inside a `runWithEngine()` context,
 * making getEventBus() / getStateManager() / getMCPManager() / getCoreConfig()
 * return the per-engine instance automatically without changing any callsites.
 *
 * Usage:
 *   const engine = new SemaEngine(instanceId, coreConfig, mcpManager);
 *   await engine.createSession(sessionId);   // internally wrapped in runWithEngine
 *   engine.processUserInput(input);          // internally wrapped in runWithEngine
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-engine isolated resources.
 * Using `any` for complex types to avoid circular imports.
 */
export interface EngineStore {
  instanceId: string;
  workingDir: string;
  /** Agent 人设/配置目录（CLAUDE.md、.sema/）。未提供时等于 workingDir。 */
  agentDataDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  coreConfig: any;       // SemaCoreConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus: any;         // EventBus instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateManager: any;     // StateManager instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpManager: any;       // MCPManager instance
}

export const engineStorage = new AsyncLocalStorage<EngineStore>();

/**
 * Run a function within the given engine's context.
 * All calls to getEventBus() / getStateManager() / getMCPManager() / getOriginalCwd()
 * inside `fn` (including through async boundaries) will return engine-specific instances.
 */
export function runWithEngine<T>(
  store: EngineStore,
  fn: () => T | Promise<T>,
): Promise<T> {
  return Promise.resolve(engineStorage.run(store, fn as () => Promise<T>));
}

/**
 * Get the current engine's store if inside runWithEngine(), otherwise undefined.
 */
export function getEngineStore(): EngineStore | undefined {
  return engineStorage.getStore();
}
