/**
 * Flow Event Bus
 *
 * Simple in-memory event emitter with a circular buffer for the live flow visualization.
 * Hooks push events here; the SSE endpoint consumes them.
 */

export type FlowSpanType =
  | 'session_start'
  | 'session_end'
  | 'message_received'
  | 'message_sent'
  | 'llm_output'
  | 'after_tool_call'
  | 'subagent_spawned'
  | 'subagent_ended';

export interface FlowEvent {
  type: 'span';
  data: {
    spanType: FlowSpanType;
    agentId: string;
    name: string;
    status: 'ok' | 'error' | 'pending';
    timestamp: number;
    metadata: Record<string, unknown>;
  };
}

type FlowEventListener = (event: FlowEvent) => void;

/**
 * Circular buffer + event emitter for flow events.
 *
 * - Stores up to `maxSize` recent events (default 100)
 * - Listeners are called synchronously when an event is emitted
 * - getRecent() returns the last N events in chronological order
 */
export class FlowBus {
  private buffer: FlowEvent[];
  private writeIndex: number;
  private count: number;
  private readonly maxSize: number;
  private listeners: Set<FlowEventListener>;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.buffer = new Array<FlowEvent>(maxSize);
    this.writeIndex = 0;
    this.count = 0;
    this.listeners = new Set();
  }

  /**
   * Emit an event: store in buffer and notify all listeners.
   */
  emit(event: FlowEvent): void {
    this.buffer[this.writeIndex] = event;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    if (this.count < this.maxSize) {
      this.count++;
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let a failing listener break other listeners
      }
    }
  }

  /**
   * Subscribe to new events. Returns an unsubscribe function.
   */
  subscribe(listener: FlowEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get the most recent `n` events in chronological order.
   */
  getRecent(n = 50): FlowEvent[] {
    const take = Math.min(n, this.count);
    if (take === 0) return [];

    const result: FlowEvent[] = [];
    // Start index: writeIndex points to the next write slot,
    // so the oldest item in the window is at (writeIndex - count) mod maxSize
    let startIndex = (this.writeIndex - take + this.maxSize) % this.maxSize;
    for (let i = 0; i < take; i++) {
      result.push(this.buffer[(startIndex + i) % this.maxSize]);
    }
    return result;
  }

  /**
   * Number of connected listeners (for diagnostics).
   */
  get listenerCount(): number {
    return this.listeners.size;
  }
}
