// Only explicitly authored diagnostics are safe to return from MCP handlers.
export class ServiceError extends Error {
  constructor(code, message, action, status = 400) {
    super(message); this.code = code; this.action = action; this.status = status;
  }
}
export function toolError(error) {
  return error instanceof ServiceError
    ? { error: error.message, code: error.code, action: error.action }
    : { error: 'The operation could not be completed.', code: 'operation_failed', action: 'Retry once. If it fails again, report the tool name and this error without manuscript content.' };
}
