import { useRef } from 'react';
import type { Group } from 'three';
import type { WorkStation } from '../simulation/types';

// Color schemes per station type
const STATION_COLORS: Record<WorkStation['type'], { base: string; accent: string; emissive: string }> = {
    mineral: { base: '#60a5fa', accent: '#3b82f6', emissive: '#1d4ed8' },
    gas:     { base: '#a78bfa', accent: '#8b5cf6', emissive: '#6d28d9' },
    build:   { base: '#fbbf24', accent: '#f59e0b', emissive: '#b45309' },
};

interface WorkStationModelProps {
    station: WorkStation;
}

export function WorkStationModel({ station }: WorkStationModelProps) {
    const group = useRef<Group>(null);
    const colors = STATION_COLORS[station.type];
    const progress = station.totalWork > 0 ? station.completedWork / station.totalWork : 0;

    return (
        <group ref={group} position={[station.position.x, 0, station.position.z]}>
            {/* Base platform */}
            <mesh position={[0, 0.1, 0]} receiveShadow castShadow>
                <cylinderGeometry args={[1.2, 1.4, 0.2, 8]} />
                <meshStandardMaterial
                    color={station.depleted ? '#6b7280' : colors.base}
                    opacity={station.depleted ? 0.4 : 1}
                    transparent={station.depleted}
                />
            </mesh>

            {/* Central pillar / resource node */}
            {!station.depleted && (
                <mesh position={[0, 0.6, 0]} castShadow>
                    {station.type === 'mineral' ? (
                        <dodecahedronGeometry args={[0.5, 0]} />
                    ) : station.type === 'gas' ? (
                        <coneGeometry args={[0.4, 0.8, 6]} />
                    ) : (
                        <boxGeometry args={[0.6, 0.6, 0.6]} />
                    )}
                    <meshStandardMaterial
                        color={colors.accent}
                        emissive={colors.emissive}
                        emissiveIntensity={0.3}
                    />
                </mesh>
            )}

            {/* Progress ring on the ground */}
            {!station.depleted && (
                <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[1.3, 1.5, 32, 1, 0, Math.PI * 2 * progress]} />
                    <meshStandardMaterial
                        color="#22c55e"
                        emissive="#22c55e"
                        emissiveIntensity={0.4}
                    />
                </mesh>
            )}

            {/* Worker capacity indicators - small dots around the platform */}
            {Array.from({ length: station.maxWorkers }).map((_, i) => {
                const angle = (i / station.maxWorkers) * Math.PI * 2;
                const x = Math.cos(angle) * 1.0;
                const z = Math.sin(angle) * 1.0;
                const occupied = i < station.currentWorkerIds.length;
                return (
                    <mesh key={i} position={[x, 0.25, z]}>
                        <sphereGeometry args={[0.08, 6, 6]} />
                        <meshStandardMaterial
                            color={occupied ? '#22c55e' : '#4b5563'}
                            emissive={occupied ? '#22c55e' : '#000000'}
                            emissiveIntensity={occupied ? 0.5 : 0}
                        />
                    </mesh>
                );
            })}

            {/* Type label - floating text would be nice but a colored ring will do */}
            {station.depleted && station.respawnTime > 0 && (
                <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.3, 0.5, 16, 1, 0, Math.PI * 2 * (1 - station.respawnTimer / station.respawnTime)]} />
                    <meshStandardMaterial
                        color="#9ca3af"
                        emissive="#9ca3af"
                        emissiveIntensity={0.2}
                    />
                </mesh>
            )}
        </group>
    );
}
