/**
 * SpanContext - tracks active span stack per session
 *
 * This allows child spans to find their parent_id during hook processing.
 */

interface SpanStackEntry {
  spanId: string;
  spanType: string;
  sessionId: string;
}

/**
 * SpanContext class for managing hierarchical span relationships
 */
export class SpanContext {
  // Map of sessionId -> stack of span IDs
  private sessionStacks = new Map<string, SpanStackEntry[]>();

  // Map of sessionId -> current turn span ID (special case for tools/llm_calls)
  private currentTurnSpans = new Map<string, string>();

  /**
   * Push a span onto the session's stack
   */
  pushSpan(sessionId: string, spanId: string, spanType: string): void {
    if (!this.sessionStacks.has(sessionId)) {
      this.sessionStacks.set(sessionId, []);
    }

    const stack = this.sessionStacks.get(sessionId)!;
    stack.push({ spanId, spanType, sessionId });

    // Track turn spans specially for tool/llm_call parenting
    if (spanType === 'turn') {
      this.currentTurnSpans.set(sessionId, spanId);
    }
  }

  /**
   * Pop the most recent span from the session's stack
   */
  popSpan(sessionId: string): SpanStackEntry | null {
    const stack = this.sessionStacks.get(sessionId);
    if (!stack || stack.length === 0) return null;

    const popped = stack.pop()!;

    // Clear turn tracking if we popped a turn span
    if (popped.spanType === 'turn') {
      this.currentTurnSpans.delete(sessionId);
    }

    return popped;
  }

  /**
   * Get the current (most recent) span for a session
   */
  getCurrentSpan(sessionId: string): SpanStackEntry | null {
    const stack = this.sessionStacks.get(sessionId);
    if (!stack || stack.length === 0) return null;
    return stack[stack.length - 1];
  }

  /**
   * Get the session span (root) for a session
   */
  getSessionSpan(sessionId: string): SpanStackEntry | null {
    const stack = this.sessionStacks.get(sessionId);
    if (!stack || stack.length === 0) return null;
    // Session span is always the first (root) span
    return stack[0];
  }

  /**
   * Get the current turn span for a session
   *
   * Used by tool_exec and llm_call spans to find their parent
   */
  getCurrentTurnSpan(sessionId: string): string | null {
    return this.currentTurnSpans.get(sessionId) ?? null;
  }

  /**
   * Clear all spans for a session (on session end)
   */
  clearSession(sessionId: string): void {
    this.sessionStacks.delete(sessionId);
    this.currentTurnSpans.delete(sessionId);
  }

  /**
   * Get stack depth for a session
   */
  getStackDepth(sessionId: string): number {
    const stack = this.sessionStacks.get(sessionId);
    return stack ? stack.length : 0;
  }

  /**
   * Check if a session has any active spans
   */
  hasActiveSpans(sessionId: string): boolean {
    return this.getStackDepth(sessionId) > 0;
  }
}
