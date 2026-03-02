/**
 * 上下文长度超限异常
 * 由各 adapter 在识别到 provider 返回的 context length 错误时抛出，
 * 上层通过 instanceof 判断，不依赖字符串匹配。
 */
export class ContextLengthError extends Error {
  constructor(message = 'Context length exceeded') {
    super(message)
    this.name = 'ContextLengthError'
  }
}

export function isContextLengthError(error: unknown): error is ContextLengthError {
  return error instanceof ContextLengthError
}

/**
 * 用户中断操作异常
 * 当用户主动中断操作时抛出此异常，区别于系统错误
 */
export class InterruptedException extends Error {
  constructor(message = 'Operation was interrupted by user') {
    super(message)
    this.name = 'InterruptedException'
  }
}

/**
 * 检查中断信号并抛出中断异常
 * @param abortController 中断控制器
 */
export function checkAbortSignal(abortController: AbortController): void {
  if (abortController.signal.aborted) {
    throw new InterruptedException()
  }
}

/**
 * 判断是否为中断异常
 * @param error 错误对象
 */
export function isInterruptedException(error: unknown): error is InterruptedException {
  return error instanceof InterruptedException
}