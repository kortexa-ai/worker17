import { useRef, useEffect, useMemo } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Group } from 'three';
import { type WorkerState, KENNEY_ANIMATIONS } from '../simulation/types';
import { getWorld } from '../simulation/WorldState';

// Explicit imports so Vite can resolve and bundle each GLB
import maleAPath from '/src/assets/models/character-male-a.glb?url';
import maleBPath from '/src/assets/models/character-male-b.glb?url';
import maleCPath from '/src/assets/models/character-male-c.glb?url';
import maleDPath from '/src/assets/models/character-male-d.glb?url';
import femaleAPath from '/src/assets/models/character-female-a.glb?url';
import femaleBPath from '/src/assets/models/character-female-b.glb?url';
import femaleCPath from '/src/assets/models/character-female-c.glb?url';
import femaleDPath from '/src/assets/models/character-female-d.glb?url';

const MODEL_PATHS = [
    maleAPath,
    maleBPath,
    maleCPath,
    maleDPath,
    femaleAPath,
    femaleBPath,
    femaleCPath,
    femaleDPath,
];

// Preload all models so they're ready when workers spawn
for (const path of MODEL_PATHS) {
    useGLTF.preload(path);
}

interface WorkerModelProps {
    workerId: string;
    modelIndex: number;
    initialState: WorkerState;
    initialBattery: number;
}

function stateToAnimation(state: WorkerState): string {
    switch (state) {
        case 'working':
            return KENNEY_ANIMATIONS.work;
        case 'traveling':
        case 'headingToRecharge':
        case 'returningToWork':
        case 'seeking':
            return KENNEY_ANIMATIONS.walk;
        case 'queuing':
            return KENNEY_ANIMATIONS.idle;
        case 'recharging':
            return KENNEY_ANIMATIONS.idle;
        case 'idle':
        default:
            return KENNEY_ANIMATIONS.idle;
    }
}

export function WorkerModel({ workerId, modelIndex, initialState, initialBattery }: WorkerModelProps) {
    const group = useRef<Group>(null);
    const modelPath = MODEL_PATHS[modelIndex % MODEL_PATHS.length];

    const { scene, animations } = useGLTF(modelPath);
    // cloneSkeleton (from SkeletonUtils) properly handles skinned meshes + skeletons
    const clonedScene = useMemo(() => cloneSkeleton(scene), [scene]);
    const { actions } = useAnimations(animations, group);

    const prevAnimRef = useRef<string>('');
    const prevStateRef = useRef<WorkerState>(initialState);
    const batteryMeshRef = useRef<Group>(null);

    // Play initial animation
    useEffect(() => {
        const animName = stateToAnimation(initialState);
        prevAnimRef.current = animName;
        const action = actions[animName];
        if (action) {
            action.reset().fadeIn(0.1).play();
        }
    }, [actions, initialState]);

    // Read world state directly each frame -- no React state involved
    useFrame(() => {
        const world = getWorld();
        const worker = world.workers.find(w => w.id === workerId);
        if (!worker || !group.current) return;

        // Update position directly on the group ref
        group.current.position.set(worker.position.x, worker.position.y, worker.position.z);
        group.current.rotation.set(0, worker.rotation, 0);

        // Update animation if state changed
        if (worker.state !== prevStateRef.current) {
            prevStateRef.current = worker.state;
            const animName = stateToAnimation(worker.state);
            if (animName !== prevAnimRef.current) {
                prevAnimRef.current = animName;
                for (const action of Object.values(actions)) {
                    action?.fadeOut(0.3);
                }
                const action = actions[animName];
                if (action) {
                    action.reset().fadeIn(0.3).play();
                }
            }
        }

        // Update battery indicator color
        if (batteryMeshRef.current) {
            const mesh = batteryMeshRef.current.children[0] as THREE.Mesh;
            if (mesh?.material) {
                const mat = mesh.material as THREE.MeshStandardMaterial;
                const isLow = worker.battery < 20;
                const color = isLow ? '#ef4444' : worker.battery < 50 ? '#eab308' : '#22c55e';
                mat.color.set(color);
                mat.emissive.set(isLow ? '#ef4444' : '#000000');
                mat.emissiveIntensity = isLow ? 0.5 : 0;
            }
        }
    });

    const isLow = initialBattery < 20;

    return (
        <group ref={group} scale={[0.7, 0.7, 0.7]}>
            <primitive object={clonedScene} />
            {/* Battery indicator - small sphere above head */}
            <group ref={batteryMeshRef} position={[0, 2.8, 0]}>
                <mesh>
                    <sphereGeometry args={[0.12, 8, 8]} />
                    <meshStandardMaterial
                        color={isLow ? '#ef4444' : '#22c55e'}
                        emissive={isLow ? '#ef4444' : '#000000'}
                        emissiveIntensity={isLow ? 0.5 : 0}
                    />
                </mesh>
            </group>
        </group>
    );
}

// Need THREE namespace for the material type cast
import * as THREE from 'three';
