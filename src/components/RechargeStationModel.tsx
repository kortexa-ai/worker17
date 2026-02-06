import { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Group } from 'three';
import type { RechargeStation } from '../simulation/types';

import chestPath from '/src/assets/models/platformer/chest.glb?url';
import flagPath from '/src/assets/models/platformer/flag.glb?url';

useGLTF.preload(chestPath);
useGLTF.preload(flagPath);

interface RechargeStationModelProps {
    station: RechargeStation;
}

export function RechargeStationModel({ station }: RechargeStationModelProps) {
    const group = useRef<Group>(null);
    const { scene: chestScene } = useGLTF(chestPath);
    const { scene: flagScene } = useGLTF(flagPath);
    const clonedChest = useMemo(() => chestScene.clone(true), [chestScene]);
    const clonedFlag = useMemo(() => flagScene.clone(true), [flagScene]);
    const slotsUsed = station.chargingWorkerIds.length;
    const queueLength = station.queue.length;

    return (
        <group ref={group} position={[station.position.x, 0, station.position.z]}>
            {/* Chest as the main charging station */}
            <group scale={[1.2, 1.2, 1.2]}>
                <primitive object={clonedChest} />
            </group>

            {/* Flag marker so it's visible from afar */}
            <group position={[0.6, 0, -0.6]} scale={[0.8, 0.8, 0.8]}>
                <primitive object={clonedFlag} />
            </group>

            {/* Charging indicator ring - glows when active */}
            <mesh position={[0, 1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.5, 0.06, 8, 16]} />
                <meshStandardMaterial
                    color={slotsUsed > 0 ? '#22c55e' : '#6b7280'}
                    emissive={slotsUsed > 0 ? '#22c55e' : '#000000'}
                    emissiveIntensity={slotsUsed > 0 ? 0.8 : 0}
                />
            </mesh>

            {/* Queue count dots */}
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
