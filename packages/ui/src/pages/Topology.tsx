/**
 * Agent Topology & Flow page
 *
 * Visualizes multi-agent delegation graphs at runtime with time slider.
 */

import { useState, useEffect } from 'react';
import { useTopology } from '../hooks/useTopology';
import AgentGraph from '../components/AgentGraph';

function Topology() {
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'all'>('all');
  const [sizeBy, setSizeBy] = useState<'cost' | 'spans'>('cost');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null);

  // Time slider state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null);

  const getTimestamps = (range: string) => {
    const now = Date.now();
    switch (range) {
      case 'day':
        return { fromTs: now - 24 * 60 * 60 * 1000, toTs: now };
      case 'week':
        return { fromTs: now - 7 * 24 * 60 * 60 * 1000, toTs: now };
      case 'month':
        return { fromTs: now - 30 * 24 * 60 * 60 * 1000, toTs: now };
      default:
        return {};
    }
  };

  const timestamps = getTimestamps(timeRange);
  const { topology, loading, error } = useTopology({
    ...timestamps,
    toTs: currentTimestamp || timestamps.toTs,
  });

  // Animation effect for time slider
  useEffect(() => {
    if (!isPlaying || !timestamps.fromTs || !timestamps.toTs) return;

    const duration = timestamps.toTs - timestamps.fromTs;
    const startTime = Date.now();
    const animationDuration = 10000; // 10 seconds

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      const timestamp = timestamps.fromTs! + duration * progress;

      setCurrentTimestamp(timestamp);

      if (progress >= 1) {
        setIsPlaying(false);
        setCurrentTimestamp(null);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, timestamps.fromTs, timestamps.toTs]);

  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(nodeId);
    setSelectedEdge(null);
  };

  const handleEdgeClick = (source: string, target: string) => {
    setSelectedEdge({ source, target });
    setSelectedNode(null);
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setCurrentTimestamp(timestamps.fromTs || null);
      setIsPlaying(true);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-white mb-2">Agent Topology & Flow</h2>
        <p className="text-slate-400 mb-4">
          Visualize multi-agent runtime behavior: nodes represent agents, edges show delegations.
        </p>

        {/* Controls */}
        <div className="flex gap-4 p-4 bg-slate-800 rounded-lg mb-4 items-center flex-wrap border border-slate-700">
          {/* Time Range */}
          <div className="min-w-[150px]">
            <label className="block text-sm text-slate-300 mb-2">
              Time Range
            </label>
            <select
              value={timeRange}
              onChange={(e) => {
                setTimeRange(e.target.value as 'day' | 'week' | 'month' | 'all');
                setCurrentTimestamp(null);
                setIsPlaying(false);
              }}
              className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="day">Last 24 hours</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>

          {/* Size By */}
          <div className="min-w-[150px]">
            <label className="block text-sm text-slate-300 mb-2">
              Node Size
            </label>
            <select
              value={sizeBy}
              onChange={(e) => setSizeBy(e.target.value as 'cost' | 'spans')}
              className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="cost">By Cost</option>
              <option value="spans">By Span Count</option>
            </select>
          </div>

          {/* Play/Pause Button */}
          {timeRange !== 'all' && (
            <div className="ml-auto">
              <button
                onClick={handlePlayPause}
                className={`px-6 py-2 text-white rounded font-medium cursor-pointer transition-colors ${
                  isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-accent-500 hover:bg-accent-600'
                }`}
              >
                {isPlaying ? 'Pause' : 'Play Timeline'}
              </button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex gap-8 px-4 py-3 bg-slate-800 rounded-lg mb-4 text-sm border border-slate-700">
          <div className="text-slate-300">
            <strong className="text-white">Node Colors:</strong>
            <span className="ml-2 text-accent-500">● Healthy</span>
            <span className="ml-2 text-amber-500">● Some Errors</span>
            <span className="ml-2 text-red-500">● High Errors</span>
          </div>
          <div className="text-slate-300">
            <strong className="text-white">Edge Colors:</strong>
            <span className="ml-2 text-emerald-500">━ OK</span>
            <span className="ml-2 text-amber-500">━ Mixed</span>
            <span className="ml-2 text-red-500">━ Errors</span>
          </div>
        </div>
      </div>

      {/* Graph Container */}
      <div className="flex-1 bg-slate-800 rounded-lg relative min-h-[500px] border border-slate-700">
        {loading && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400">
            Loading topology...
          </div>
        )}

        {error && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-400 text-center">
            <p>Error loading topology</p>
            <p className="text-sm mt-2">{error.message}</p>
          </div>
        )}

        {!loading && !error && topology && (
          <>
            <AgentGraph
              nodes={topology.nodes}
              edges={topology.edges}
              sizeBy={sizeBy}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
            />

            {/* Current timestamp indicator */}
            {currentTimestamp && (
              <div className="absolute top-4 right-4 px-4 py-2 bg-slate-700/90 rounded text-sm font-medium text-slate-200">
                {new Date(currentTimestamp).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Panel */}
      {(selectedNode || selectedEdge) && (
        <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
          {selectedNode && topology && (
            <div>
              <h3 className="mb-2 text-base font-semibold text-white">
                Agent: {selectedNode}
              </h3>
              {(() => {
                const node = topology.nodes.find((n) => n.id === selectedNode);
                if (node) {
                  return (
                    <div className="text-sm text-slate-400">
                      <p>Total Cost: ${node.totalCost.toFixed(2)}</p>
                      <p>Span Count: {node.spanCount}</p>
                      <p>Error Count: {node.errorCount}</p>
                      <button
                        onClick={() => setSelectedNode(null)}
                        className="mt-2 px-3 py-1 bg-slate-700 border border-slate-600 rounded cursor-pointer text-slate-300 hover:bg-slate-600 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {selectedEdge && topology && (
            <div>
              <h3 className="mb-2 text-base font-semibold text-white">
                Delegation: {selectedEdge.source} → {selectedEdge.target}
              </h3>
              {(() => {
                const edge = topology.edges.find(
                  (e) => e.source === selectedEdge.source && e.target === selectedEdge.target
                );
                if (edge) {
                  return (
                    <div className="text-sm text-slate-400">
                      <p>Delegation Count: {edge.count}</p>
                      <p>Status: {edge.status}</p>
                      <button
                        onClick={() => setSelectedEdge(null)}
                        className="mt-2 px-3 py-1 bg-slate-700 border border-slate-600 rounded cursor-pointer text-slate-300 hover:bg-slate-600 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Topology;
