import { useRef } from 'react';
import type { Group } from 'three';
import type { RechargeStation } from '../simulation/types';

interface RechargeStationModelProps {
    station: RechargeStation;
}

export function RechargeStationModel({ station }: RechargeStationModelProps) {
    const group = useRef<Group>(null);
    const slotsUsed = station.chargingWorkerIds.length;
    const queueLength = station.queue.length;

    return (
        <group ref={group} position={[station.position.x, 0, station.position.z]}>
            {/* Base pad */}
            <mesh position={[0, 0.05, 0]} receiveShadow>
                <boxGeometry args={[2.0, 0.1, 2.0]} />
                <meshStandardMaterial color="#374151" />
            </mesh>

            {/* Charging pillar */}
            <mesh position={[0, 0.75, 0]} castShadow>
                <cylinderGeometry args={[0.2, 0.3, 1.4, 8]} />
                <meshStandardMaterial
                    color="#10b981"
                    emissive="#10b981"
                    emissiveIntensity={slotsUsed > 0 ? 0.6 : 0.2}
                />
            </mesh>

            {/* Charging indicator ring */}
            <mesh position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.4, 0.06, 8, 16]} />
                <meshStandardMaterial
                    color={slotsUsed > 0 ? '#22c55e' : '#6b7280'}
                    emissive={slotsUsed > 0 ? '#22c55e' : '#000000'}
                    emissiveIntensity={slotsUsed > 0 ? 0.8 : 0}
                />
            </mesh>

            {/* Slot indicators */}
            {Array.from({ length: station.maxSlots }).map((_, i) => {
                const angle = (i / Math.max(station.maxSlots, 1)) * Math.PI * 2;
                const x = Math.cos(angle) * 0.7;
                const z = Math.sin(angle) * 0.7;
                const occupied = i < slotsUsed;
                return (
                    <mesh key={i} position={[x, 0.15, z]}>
                        <boxGeometry args={[0.3, 0.05, 0.3]} />
                        <meshStandardMaterial
                            color={occupied ? '#22c55e' : '#1f2937'}
                            emissive={occupied ? '#22c55e' : '#000000'}
                            emissiveIntensity={occupied ? 0.4 : 0}
                        />
                    </mesh>
                );
            })}

            {/* Queue count indicator (small floating number wouldn't work in 3D, use stacked dots) */}
            {queueLength > 0 && Array.from({ length: Math.min(queueLength, 5) }).map((_, i) => (
                <mesh key={`q${i}`} position={[1.3 + i * 0.25, 0.3, 0]}>
                    <sphereGeometry args={[0.08, 6, 6]} />
                    <meshStandardMaterial
                        color="#eab308"
                        emissive="#eab308"
                        emissiveIntensity={0.3}
                    />
                </mesh>
            ))}
        </group>
    );
}
