/**
 * Live Flow Visualization page
 *
 * Animated real-time diagram showing message flow through the system:
 * User -> Channel -> Brain (LLM) -> Tools -> Response
 *
 * Connects via SSE to /clawlens/api/flow/stream for live events.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowSpanType =
  | 'session_start'
  | 'session_end'
  | 'message_received'
  | 'message_sent'
  | 'llm_output'
  | 'after_tool_call'
  | 'subagent_spawned';

interface FlowEventData {
  spanType: FlowSpanType;
  agentId: string;
  name: string;
  status: 'ok' | 'error' | 'pending';
  timestamp: number;
  metadata: Record<string, unknown>;
}

interface FlowEvent {
  type: 'span';
  data: FlowEventData;
}

type NodeId = 'user' | 'channel' | 'brain' | 'tools';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map span types to the node they primarily activate */
function spanTypeToNode(spanType: FlowSpanType): NodeId {
  switch (spanType) {
    case 'session_start':
    case 'session_end':
      return 'user';
    case 'message_received':
    case 'message_sent':
      return 'channel';
    case 'llm_output':
      return 'brain';
    case 'after_tool_call':
    case 'subagent_spawned':
      return 'tools';
  }
}

/** Map span types to the edge they animate (source -> target) */
function spanTypeToEdge(spanType: FlowSpanType): [NodeId, NodeId] | null {
  switch (spanType) {
    case 'message_received':
      return ['user', 'channel'];
    case 'llm_output':
      return ['channel', 'brain'];
    case 'after_tool_call':
    case 'subagent_spawned':
      return ['brain', 'tools'];
    case 'message_sent':
      return ['channel', 'user'];
    default:
      return null;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const SPAN_TYPE_LABELS: Record<FlowSpanType, string> = {
  session_start: 'Session Start',
  session_end: 'Session End',
  message_received: 'Msg Received',
  message_sent: 'Msg Sent',
  llm_output: 'LLM Output',
  after_tool_call: 'Tool Call',
  subagent_spawned: 'Subagent',
};

const SPAN_TYPE_COLORS: Record<FlowSpanType, string> = {
  session_start: 'text-green-400',
  session_end: 'text-slate-400',
  message_received: 'text-blue-400',
  message_sent: 'text-cyan-400',
  llm_output: 'text-purple-400',
  after_tool_call: 'text-amber-400',
  subagent_spawned: 'text-pink-400',
};

// ---------------------------------------------------------------------------
// Node definitions
// ---------------------------------------------------------------------------

interface FlowNodeDef {
  id: NodeId;
  label: string;
  icon: string;
  color: string;
  glowColor: string;
}

const FLOW_NODES: FlowNodeDef[] = [
  { id: 'user', label: 'User', icon: '\u{1F464}', color: 'border-blue-500', glowColor: 'shadow-blue-500/60' },
  { id: 'channel', label: 'Channel', icon: '\u{1F4E8}', color: 'border-cyan-500', glowColor: 'shadow-cyan-500/60' },
  { id: 'brain', label: 'Brain (LLM)', icon: '\u{1F9E0}', color: 'border-purple-500', glowColor: 'shadow-purple-500/60' },
  { id: 'tools', label: 'Tools', icon: '\u{1F527}', color: 'border-amber-500', glowColor: 'shadow-amber-500/60' },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
      />
      <span className={connected ? 'text-green-400' : 'text-red-400'}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}

function FlowNode({
  node,
  eventCount,
  active,
}: {
  node: FlowNodeDef;
  eventCount: number;
  active: boolean;
}) {
  return (
    <div
      className={`
        relative flex flex-col items-center justify-center
        w-32 h-32 rounded-2xl border-2 bg-slate-800
        transition-all duration-300
        ${node.color}
        ${active ? `shadow-lg ${node.glowColor} scale-105` : 'shadow-md shadow-slate-900/50'}
      `}
    >
      <span className="text-3xl">{node.icon}</span>
      <span className="mt-1 text-sm font-semibold text-white">{node.label}</span>
      <span className="mt-0.5 text-xs text-slate-400">{eventCount} events</span>
      {active && (
        <div
          className={`absolute inset-0 rounded-2xl border-2 ${node.color} animate-ping opacity-30`}
        />
      )}
    </div>
  );
}

function FlowEdge({ active, reverse }: { active: boolean; reverse?: boolean }) {
  return (
    <div className="flex items-center mx-2 w-16 relative">
      <div className="w-full h-0.5 bg-slate-600 relative overflow-hidden rounded">
        {active && (
          <div
            className={`absolute inset-y-0 w-4 bg-cyan-400 rounded ${
              reverse ? 'animate-flow-reverse' : 'animate-flow'
            }`}
          />
        )}
      </div>
      <div
        className={`absolute ${reverse ? 'left-0 rotate-180' : 'right-0'} w-0 h-0
        border-t-[4px] border-t-transparent
        border-b-[4px] border-b-transparent
        border-l-[6px] ${active ? 'border-l-cyan-400' : 'border-l-slate-600'}`}
      />
    </div>
  );
}

function EventFeed({ events }: { events: FlowEvent[] }) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    // If user scrolled up more than 50px from bottom, disable auto-scroll
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  }, []);

  return (
    <div className="mt-6 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Live Event Feed</h3>
        <span className="text-xs text-slate-400">{events.length} events</span>
      </div>
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="h-64 overflow-y-auto p-2 space-y-1 font-mono text-xs"
      >
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            Waiting for events...
          </div>
        ) : (
          events.map((event, i) => (
            <div
              key={`${event.data.timestamp}-${i}`}
              className="flex items-start gap-3 px-2 py-1.5 rounded hover:bg-slate-700/50"
            >
              <span className="text-slate-500 shrink-0">
                {formatTime(event.data.timestamp)}
              </span>
              <span
                className={`shrink-0 w-24 font-medium ${
                  SPAN_TYPE_COLORS[event.data.spanType] ?? 'text-slate-300'
                }`}
              >
                {SPAN_TYPE_LABELS[event.data.spanType] ?? event.data.spanType}
              </span>
              <span className="text-slate-300 truncate">{event.data.name}</span>
              <span className="text-slate-500 shrink-0 ml-auto">{event.data.agentId}</span>
              {event.data.status === 'error' && (
                <span className="text-red-400 shrink-0">ERR</span>
              )}
            </div>
          ))
        )}
      </div>
      {!autoScroll && (
        <button
          onClick={() => setAutoScroll(true)}
          className="w-full py-1 text-xs text-center text-cyan-400 hover:bg-slate-700 border-t border-slate-700"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const MAX_FEED_EVENTS = 200;
const ACTIVE_DURATION_MS = 1500;

export default function Flow() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [nodeCounts, setNodeCounts] = useState<Record<NodeId, number>>({
    user: 0,
    channel: 0,
    brain: 0,
    tools: 0,
  });
  const [activeNodes, setActiveNodes] = useState<Record<NodeId, number>>({
    user: 0,
    channel: 0,
    brain: 0,
    tools: 0,
  });
  const [activeEdges, setActiveEdges] = useState<Record<string, number>>({
    'user->channel': 0,
    'channel->brain': 0,
    'brain->tools': 0,
    'channel->user': 0,
  });

  useEffect(() => {
    const sseUrl = `${window.location.origin}/clawlens/api/flow/stream`;
    const source = new EventSource(sseUrl);

    source.onopen = () => {
      setConnected(true);
    };

    source.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as FlowEvent;

        // Append to feed (bounded)
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > MAX_FEED_EVENTS ? next.slice(-MAX_FEED_EVENTS) : next;
        });

        // Activate the relevant node
        const nodeId = spanTypeToNode(event.data.spanType);
        setNodeCounts((prev) => ({ ...prev, [nodeId]: prev[nodeId] + 1 }));

        const now = Date.now();
        setActiveNodes((prev) => ({ ...prev, [nodeId]: now }));

        // Activate the relevant edge
        const edge = spanTypeToEdge(event.data.spanType);
        if (edge) {
          const edgeKey = `${edge[0]}->${edge[1]}`;
          setActiveEdges((prev) => ({ ...prev, [edgeKey]: now }));
        }
      } catch {
        // Ignore unparseable messages (e.g. keepalive comments)
      }
    };

    source.onerror = () => {
      setConnected(false);
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, []);

  // Timer to clear active states after ACTIVE_DURATION_MS
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      setActiveNodes((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next) as NodeId[]) {
          if (next[key] > 0 && now - next[key] > ACTIVE_DURATION_MS) {
            next[key] = 0;
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      setActiveEdges((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (next[key] > 0 && now - next[key] > ACTIVE_DURATION_MS) {
            next[key] = 0;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const isEdgeActive = (from: NodeId, to: NodeId) => {
    const key = `${from}->${to}`;
    return activeEdges[key] > 0;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Flow</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time message flow visualization
          </p>
        </div>
        <ConnectionStatus connected={connected} />
      </div>

      {/* Flow diagram */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-8">
        <div className="flex items-center justify-center">
          {FLOW_NODES.map((node, i) => (
            <div key={node.id} className="flex items-center">
              <FlowNode
                node={node}
                eventCount={nodeCounts[node.id]}
                active={activeNodes[node.id] > 0}
              />
              {i < FLOW_NODES.length - 1 && (
                <FlowEdge
                  active={isEdgeActive(
                    FLOW_NODES[i].id,
                    FLOW_NODES[i + 1].id
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Return path indicator */}
        <div className="flex justify-center mt-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Response path:</span>
            <span className={isEdgeActive('channel', 'user') ? 'text-cyan-400' : ''}>
              Tools {'\u2192'} Brain {'\u2192'} Channel {'\u2192'} User
            </span>
            {isEdgeActive('channel', 'user') && (
              <span className="text-cyan-400 animate-pulse">{'\u25C0'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Event feed */}
      <EventFeed events={events} />

      {/* Custom animation styles */}
      <style>{`
        @keyframes flow-right {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes flow-left {
          0% { transform: translateX(400%); }
          100% { transform: translateX(-100%); }
        }
        .animate-flow {
          animation: flow-right 0.8s ease-in-out infinite;
        }
        .animate-flow-reverse {
          animation: flow-left 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
