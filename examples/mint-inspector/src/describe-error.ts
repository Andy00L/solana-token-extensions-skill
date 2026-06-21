/** Convert an unknown thrown value into a readable message without using any. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
