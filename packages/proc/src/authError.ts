export class AuthExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

// name-based so it survives the package/dist boundary
export function isAuthExpired(err: unknown): err is AuthExpiredError {
  return err instanceof Error && err.name === 'AuthExpiredError';
}
