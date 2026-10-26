export type ExecutionMode = 'paper' | 'live';

/**
 * Deterministic fallback is allowed only for paper simulations configured in
 * 'confirm' mode. Live entries never silently bypass a failed AI confirmation.
 */
export function allowsDeterministicFallback(aiMode: string, executionMode: ExecutionMode): boolean {
  return executionMode === 'paper' && aiMode === 'confirm';
}
