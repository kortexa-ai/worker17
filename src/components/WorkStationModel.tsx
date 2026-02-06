import { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Group } from 'three';
import type { WorkStation } from '../simulation/types';

// GLB imports for each station type
import rocksPath from '/src/assets/models/platformer/rocks.glb?url';
import barrelPath from '/src/assets/models/platformer/barrel.glb?url';
import cratePath from '/src/assets/models/platformer/crate.glb?url';

useGLTF.preload(rocksPath);
useGLTF.preload(barrelPath);
useGLTF.preload(cratePath);

const STATION_MODEL_PATHS: Record<WorkStation['type'], string> = {
    mineral: rocksPath,
    gas: barrelPath,
    build: cratePath,
};

const STATION_SCALES: Record<WorkStation['type'], number> = {
    mineral: 1.2,
    gas: 1.0,
    build: 1.0,
};

interface WorkStationModelProps {
    station: WorkStation;
}

export function WorkStationModel({ station }: WorkStationModelProps) {
    const group = useRef<Group>(null);
    const modelPath = STATION_MODEL_PATHS[station.type];
    const { scene } = useGLTF(modelPath);
    const clonedScene = useMemo(() => scene.clone(true), [scene]);
    const scale = STATION_SCALES[station.type];
    const progress = station.totalWork > 0 ? station.completedWork / station.totalWork : 0;

    return (
        <group ref={group} position={[station.position.x, 0, station.position.z]}>
            {/* The GLB model */}
            <group
                scale={[scale, scale, scale]}
                visible={!station.depleted}
            >
                <primitive object={clonedScene} />
            </group>

            {/* Depleted ghost - faded version */}
            {station.depleted && (
                <group scale={[scale * 0.8, scale * 0.5, scale * 0.8]}>
                    <mesh position={[0, 0.2, 0]}>
                        <cylinderGeometry args={[0.5, 0.6, 0.3, 8]} />
                        <meshStandardMaterial
                            color="#6b7280"
                            opacity={0.3}
                            transparent
                        />
                    </mesh>
                </group>
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

            {/* Worker capacity indicators - small dots around the station */}
            {Array.from({ length: station.maxWorkers }).map((_, i) => {
                const angle = (i / station.maxWorkers) * Math.PI * 2;
                const x = Math.cos(angle) * 1.3;
                const z = Math.sin(angle) * 1.3;
                const occupied = i < station.currentWorkerIds.length;
                return (
                    <mesh key={i} position={[x, 0.15, z]}>
                        <sphereGeometry args={[0.08, 6, 6]} />
                        <meshStandardMaterial
                            color={occupied ? '#22c55e' : '#4b5563'}
                            emissive={occupied ? '#22c55e' : '#000000'}
                            emissiveIntensity={occupied ? 0.5 : 0}
                        />
                    </mesh>
                );
            })}

            {/* Respawn timer ring when depleted */}
            {station.depleted && station.respawnTime > 0 && (
                <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
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
