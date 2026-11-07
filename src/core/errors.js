// Thrown by the rules engine when an action is illegal. `code` is a stable key for i18n.
export class RuleError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RuleError';
    this.code = code;
  }
}

export function assert(cond, code, detail) {
  if (!cond) throw new RuleError(code, detail);
}
