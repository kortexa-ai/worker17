import { useState, useEffect } from 'react';
import { getWorld, subscribe } from '../simulation/WorldState';
import { PLOT_SIZE } from '../simulation/types';
import type { WorldState } from '../simulation/types';

const MAP_SIZE = 160; // px
const HALF_PLOT = PLOT_SIZE / 2;

// Convert world coords to minimap px
function toMap(x: number, z: number): { mx: number; my: number } {
    return {
        mx: ((x + HALF_PLOT) / PLOT_SIZE) * MAP_SIZE,
        my: ((z + HALF_PLOT) / PLOT_SIZE) * MAP_SIZE,
    };
}

const WORKER_STATE_COLORS: Record<string, string> = {
    working: '#22c55e',
    traveling: '#86efac',
    seeking: '#a3a3a3',
    idle: '#6b7280',
    headingToRecharge: '#f97316',
    queuing: '#eab308',
    recharging: '#06b6d4',
    returningToWork: '#22c55e',
};

const STATION_TYPE_COLORS: Record<string, string> = {
    mineral: '#3b82f6',
    gas: '#8b5cf6',
    build: '#f59e0b',
};

export function MiniMap() {
    const [snapshot, setSnapshot] = useState<WorldState>(getWorld());

    useEffect(() => {
        return subscribe(() => setSnapshot({ ...getWorld() }));
    }, []);

    return (
        <div
            className="absolute bottom-4 right-4 z-10 bg-black/80 rounded-lg p-2"
            style={{ width: MAP_SIZE + 16, height: MAP_SIZE + 16 }}
        >
            <svg width={MAP_SIZE} height={MAP_SIZE} className="rounded">
                {/* Field background */}
                <rect width={MAP_SIZE} height={MAP_SIZE} fill="#1a2e1a" rx={4} />

                {/* Grid lines */}
                {Array.from({ length: 5 }).map((_, i) => {
                    const pos = (i + 1) * (MAP_SIZE / 6);
                    return (
                        <g key={i}>
                            <line x1={pos} y1={0} x2={pos} y2={MAP_SIZE} stroke="#2d4a2d" strokeWidth={0.5} />
                            <line x1={0} y1={pos} x2={MAP_SIZE} y2={pos} stroke="#2d4a2d" strokeWidth={0.5} />
                        </g>
                    );
                })}

                {/* Work stations */}
                {snapshot.workStations.map(station => {
                    const { mx, my } = toMap(station.position.x, station.position.z);
                    const color = station.depleted ? '#4b5563' : STATION_TYPE_COLORS[station.type];
                    return (
                        <g key={station.id}>
                            <rect
                                x={mx - 5}
                                y={my - 5}
                                width={10}
                                height={10}
                                fill={color}
                                opacity={station.depleted ? 0.3 : 0.8}
                                rx={2}
                            />
                            {/* Worker count at station */}
                            {station.currentWorkerIds.length > 0 && (
                                <text
                                    x={mx}
                                    y={my + 3}
                                    textAnchor="middle"
                                    fill="white"
                                    fontSize={7}
                                    fontWeight="bold"
                                >
                                    {station.currentWorkerIds.length}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Recharge stations */}
                {snapshot.rechargeStations.map(station => {
                    const { mx, my } = toMap(station.position.x, station.position.z);
                    return (
                        <g key={station.id}>
                            <polygon
                                points={`${mx},${my - 6} ${mx + 5},${my + 4} ${mx - 5},${my + 4}`}
                                fill="#10b981"
                                opacity={0.8}
                            />
                            {/* Lightning bolt feel */}
                            <text x={mx} y={my + 3} textAnchor="middle" fill="white" fontSize={8}>
                                ⚡
                            </text>
                        </g>
                    );
                })}

                {/* Workers */}
                {snapshot.workers.map(worker => {
                    const { mx, my } = toMap(worker.position.x, worker.position.z);
                    const color = WORKER_STATE_COLORS[worker.state] || '#6b7280';
                    return (
                        <circle
                            key={worker.id}
                            cx={mx}
                            cy={my}
                            r={3}
                            fill={color}
                            stroke="#000"
                            strokeWidth={0.5}
                        />
                    );
                })}
            </svg>
        </div>
    );
}
