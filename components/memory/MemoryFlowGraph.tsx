'use client';

import { useMemo } from 'react';
import { MemoryEvent } from '@/lib/memory/memoryEventSchema';

function buildNodes(events: MemoryEvent[]) {
    const map = new Map<string, { id: string; label: string; kind: 'source' | 'tool' | 'model'; count: number }>();

    for (const event of events) {
        const sourceKey = `source:${event.source ?? 'unknown'}`;
        const sourceNode = map.get(sourceKey) ?? { id: sourceKey, label: event.source ?? 'unknown', kind: 'source', count: 0 };
        sourceNode.count += 1;
        map.set(sourceKey, sourceNode);

        if (event.modelDecision) {
            const modelKey = `model:${event.modelDecision.routedModel}`;
            const modelNode = map.get(modelKey) ?? { id: modelKey, label: event.modelDecision.routedModel, kind: 'model', count: 0 };
            modelNode.count += 1;
            map.set(modelKey, modelNode);
        }

        for (const tool of event.toolInvocations ?? []) {
            const toolKey = `tool:${tool.toolName}`;
            const toolNode = map.get(toolKey) ?? { id: toolKey, label: tool.toolName, kind: 'tool', count: 0 };
            toolNode.count += 1;
            map.set(toolKey, toolNode);
        }
    }

    return Array.from(map.values()).slice(0, 60);
}

function buildEdges(events: MemoryEvent[], nodesById: Map<string, { id: string }>) {
    const edgeMap = new Map<string, { source: string; target: string; weight: number }>();

    for (const event of events) {
        const sourceKey = `source:${event.source ?? 'unknown'}`;
        if (event.modelDecision && nodesById.has(sourceKey) && nodesById.has(`model:${event.modelDecision.routedModel}`)) {
            const edgeKey = `${sourceKey}->model:${event.modelDecision.routedModel}`;
            edgeMap.set(edgeKey, { source: sourceKey, target: `model:${event.modelDecision.routedModel}`, weight: (edgeMap.get(edgeKey)?.weight ?? 0) + 1 });
        }
        for (const tool of event.toolInvocations ?? []) {
            const toolKey = `tool:${tool.toolName}`;
            if (nodesById.has(sourceKey) && nodesById.has(toolKey)) {
                const edgeKey = `${sourceKey}->${toolKey}`;
                edgeMap.set(edgeKey, { source: sourceKey, target: toolKey, weight: (edgeMap.get(edgeKey)?.weight ?? 0) + 1 });
            }
        }
    }

    return Array.from(edgeMap.values());
}

function layoutRadial(nodes: { id: string }[]) {
    if (!nodes.length) return new Map<string, { x: number; y: number }>();
    const positions = new Map<string, { x: number; y: number }>();
    const cx = 220;
    const cy = 180;
    const radius = Math.max(120, 40 + nodes.length * 14);

    nodes.forEach((node, index) => {
        const angle = (2 * Math.PI * index) / nodes.length - Math.PI / 2;
        positions.set(node.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });

    return positions;
}

export function MemoryFlowGraph({ events }: { events: MemoryEvent[] }) {
    const nodes = useMemo(() => buildNodes(events), [events]);
    const nodeMap = useMemo(() => {
        const map = new Map<string, { id: string }>();
        for (const node of nodes) map.set(node.id, node);
        return map;
    }, [nodes]);
    const edges = useMemo(() => buildEdges(events, nodeMap), [events, nodeMap]);
    const positions = useMemo(() => layoutRadial(nodes), [nodes]);

    const colorForKind = (kind: 'source' | 'tool' | 'model') => {
        if (kind === 'source') return '#6366f1';
        if (kind === 'model') return '#0ea5e9';
        return '#22c55e';
    };

    const maxWeight = Math.max(1, ...edges.map((edge) => edge.weight));

    return (
        <div className="w-full overflow-x-auto">
            <svg viewBox="0 0 440 360" className="w-full max-w-3xl">
                <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                    </marker>
                </defs>
                {edges.map((edge) => {
                    const from = positions.get(edge.source);
                    const to = positions.get(edge.target);
                    if (!from || !to) return null;
                    const stroke = (edge.weight / maxWeight) * 6 + 1;
                    return (
                        <line
                            key={`${edge.source}->${edge.target}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke="#94a3b8"
                            strokeWidth={stroke}
                            markerEnd="url(#arrow)"
                            opacity={0.7}
                        />
                    );
                })}
                {nodes.map((node) => {
                    const position = positions.get(node.id);
                    if (!position) return null;
                    return (
                        <g key={node.id} transform={`translate(${position.x}, ${position.y})`}>
                            <circle r={18} fill={colorForKind(node.kind)} opacity={0.9} />
                            <circle r={22} fill="none" stroke="#e2e8f0" strokeWidth="1" opacity={0.6} />
                            <text y={4} textAnchor="middle" fontSize="10" fill="#f8fafc">
                                {node.label.length > 8 ? node.label.slice(0, 6) + '…' : node.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
