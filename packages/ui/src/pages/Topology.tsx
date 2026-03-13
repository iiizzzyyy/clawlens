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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Agent Topology & Flow</h2>
        <p style={{ color: '#666', marginBottom: '1rem' }}>
          Visualize multi-agent runtime behavior: nodes represent agents, edges show delegations.
        </p>

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            padding: '1rem',
            backgroundColor: 'white',
            borderRadius: '8px',
            marginBottom: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Time Range */}
          <div style={{ minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Time Range
            </label>
            <select
              value={timeRange}
              onChange={(e) => {
                setTimeRange(e.target.value as 'day' | 'week' | 'month' | 'all');
                setCurrentTimestamp(null);
                setIsPlaying(false);
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
              }}
            >
              <option value="day">Last 24 hours</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>

          {/* Size By */}
          <div style={{ minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Node Size
            </label>
            <select
              value={sizeBy}
              onChange={(e) => setSizeBy(e.target.value as 'cost' | 'spans')}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
              }}
            >
              <option value="cost">By Cost</option>
              <option value="spans">By Span Count</option>
            </select>
          </div>

          {/* Play/Pause Button */}
          {timeRange !== 'all' && (
            <div style={{ marginLeft: 'auto' }}>
              <button
                onClick={handlePlayPause}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: isPlaying ? '#ef4444' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {isPlaying ? 'Pause' : 'Play Timeline'}
              </button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            gap: '2rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'white',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}
        >
          <div>
            <strong>Node Colors:</strong>
            <span style={{ marginLeft: '0.5rem', color: '#2563eb' }}>● Healthy</span>
            <span style={{ marginLeft: '0.5rem', color: '#f59e0b' }}>● Some Errors</span>
            <span style={{ marginLeft: '0.5rem', color: '#ef4444' }}>● High Errors</span>
          </div>
          <div>
            <strong>Edge Colors:</strong>
            <span style={{ marginLeft: '0.5rem', color: '#10b981' }}>━ OK</span>
            <span style={{ marginLeft: '0.5rem', color: '#f59e0b' }}>━ Mixed</span>
            <span style={{ marginLeft: '0.5rem', color: '#ef4444' }}>━ Errors</span>
          </div>
        </div>
      </div>

      {/* Graph Container */}
      <div
        style={{
          flex: 1,
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '1rem',
          position: 'relative',
          minHeight: '500px',
        }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#666',
            }}
          >
            Loading topology...
          </div>
        )}

        {error && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#ef4444',
              textAlign: 'center',
            }}
          >
            <p>Error loading topology</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{error.message}</p>
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
              <div
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                {new Date(currentTimestamp).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Panel */}
      {(selectedNode || selectedEdge) && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: 'white',
            borderRadius: '8px',
          }}
        >
          {selectedNode && topology && (
            <div>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
                Agent: {selectedNode}
              </h3>
              {(() => {
                const node = topology.nodes.find((n) => n.id === selectedNode);
                if (node) {
                  return (
                    <div style={{ fontSize: '0.875rem', color: '#666' }}>
                      <p>Total Cost: ${node.totalCost.toFixed(2)}</p>
                      <p>Span Count: {node.spanCount}</p>
                      <p>Error Count: {node.errorCount}</p>
                      <button
                        onClick={() => setSelectedNode(null)}
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
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
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
                Delegation: {selectedEdge.source} → {selectedEdge.target}
              </h3>
              {(() => {
                const edge = topology.edges.find(
                  (e) => e.source === selectedEdge.source && e.target === selectedEdge.target
                );
                if (edge) {
                  return (
                    <div style={{ fontSize: '0.875rem', color: '#666' }}>
                      <p>Delegation Count: {edge.count}</p>
                      <p>Status: {edge.status}</p>
                      <button
                        onClick={() => setSelectedEdge(null)}
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
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
