/**
 * Agent graph component for topology visualization
 *
 * Force-directed graph using D3.js showing agent delegation network.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import type { TopologyNode, TopologyEdge } from '../api/client';

export interface AgentGraphProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  sizeBy: 'cost' | 'spans';
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (source: string, target: string) => void;
}

interface D3Node extends TopologyNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface D3Link {
  source: D3Node | string;
  target: D3Node | string;
  count: number;
  status: 'ok' | 'mixed' | 'error';
}

function AgentGraph({ nodes, edges, sizeBy, onNodeClick, onEdgeClick }: AgentGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous render
    svg.selectAll('*').remove();

    // Create container group for zoom/pan
    const g = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Prepare data
    const d3Nodes: D3Node[] = nodes.map((n) => ({ ...n }));
    const d3Links: D3Link[] = edges.map((e) => ({
      source: e.source,
      target: e.target,
      count: e.count,
      status: e.status,
    }));

    // Create force simulation
    const simulation = d3.forceSimulation(d3Nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(d3Links)
        .id((d) => d.id)
        .distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Draw edges
    const link = g.append('g')
      .selectAll('line')
      .data(d3Links)
      .join('line')
      .attr('stroke', (d) => {
        switch (d.status) {
          case 'ok': return '#10b981';
          case 'mixed': return '#f59e0b';
          case 'error': return '#ef4444';
          default: return '#999';
        }
      })
      .attr('stroke-width', (d) => Math.min(2 + Math.log(d.count), 10))
      .attr('stroke-opacity', 0.6)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        const source = typeof d.source === 'string' ? d.source : d.source.id;
        const target = typeof d.target === 'string' ? d.target : d.target.id;
        if (onEdgeClick) {
          onEdgeClick(source, target);
        }
      });

    // Draw edge labels (delegation count)
    const linkLabel = g.append('g')
      .selectAll('text')
      .data(d3Links)
      .join('text')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .text((d) => d.count > 1 ? `${d.count}` : '');

    // Draw nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(d3Nodes)
      .join('circle')
      .attr('r', (d) => {
        const size = sizeBy === 'cost' ? d.totalCost : d.spanCount;
        return 10 + Math.sqrt(size) * 2;
      })
      .attr('fill', (d) => {
        const errorRate = d.spanCount > 0 ? d.errorCount / d.spanCount : 0;
        if (errorRate > 0.3) return '#ef4444'; // Red for high errors
        if (errorRate > 0.1) return '#f59e0b'; // Yellow for some errors
        return '#2563eb'; // Blue for healthy
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        if (onNodeClick) {
          onNodeClick(d.id);
        } else {
          // Default: navigate to sessions filtered by agent
          navigate(`/sessions?agentId=${encodeURIComponent(d.id)}`);
        }
      })
      .call(d3.drag<SVGCircleElement, D3Node>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any);

    // Add node labels
    const label = g.append('g')
      .selectAll('text')
      .data(d3Nodes)
      .join('text')
      .attr('font-size', 12)
      .attr('font-weight', 'bold')
      .attr('fill', '#333')
      .attr('text-anchor', 'middle')
      .attr('dy', -20)
      .text((d) => d.label)
      .style('pointer-events', 'none');

    // Add cost/span count labels
    const costLabel = g.append('g')
      .selectAll('text')
      .data(d3Nodes)
      .join('text')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .attr('dy', -8)
      .text((d) => {
        if (sizeBy === 'cost') {
          return `$${d.totalCost.toFixed(2)}`;
        } else {
          return `${d.spanCount} spans`;
        }
      })
      .style('pointer-events', 'none');

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      label
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);

      costLabel
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [nodes, edges, sizeBy, onNodeClick, onEdgeClick, navigate]);

  if (nodes.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
        }}
      >
        No topology data available
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
      }}
    />
  );
}

export default AgentGraph;
