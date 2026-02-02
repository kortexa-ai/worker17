import { useState, useEffect, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import workerModelPath from '/src/assets/models/worker17.glb?url';
import { AnimationNames, type WorkerState } from './types';
import type { WorkerPosition } from './WorkerStatusPanel';

// Preload the model to avoid loading delay
useGLTF.preload(workerModelPath);

interface Worker17Props {
    position?: WorkerPosition;
    direction?: WorkerPosition;
    workerState?: WorkerState;
    isTerminated?: boolean;
}

export function Worker17({
    position = {x: 0, y: 0, z: 0},
    direction = {x: 0, y: 0, z: 0},
    workerState = 'idle',
    isTerminated = false
}: Worker17Props) {
    const group = useRef(null);
    const { scene, animations } = useGLTF(workerModelPath);
    const { actions, names } = useAnimations(animations, group);
    const lastPosition = useRef(new Vector3(position.x, position.y, position.z));
    const [rotation, setRotation] = useState(0);

    // Log available animations when component mounts
    useEffect(() => {
        console.log('Available animations:', names);
    }, [names]);

    // Play the appropriate animation based on state
    useEffect(() => {
        // Fade out all current animations
        for (const action of Object.values(actions)) {
            action?.fadeOut(0.5);
        }

        // Choose animation based on state
        let animationName: string;
        if (isTerminated) {
            animationName = AnimationNames.Sprint;
        } else if (workerState === 'working' || workerState === 'headingToStation') {
            animationName = AnimationNames.Walk;
        } else if (workerState === 'laying' || workerState === 'recharging') {
            // Use Grounded (laying down) animation for resting
            animationName = AnimationNames.Grounded;
        } else {
            animationName = AnimationNames.Idle;
        }

        // Play the selected animation if it exists
        if (actions[animationName]) {
            const action = actions[animationName]?.reset().fadeIn(0.5);
            if (isTerminated) {
                action?.setEffectiveTimeScale(1.5);
            }
            action?.play();
        } else {
            console.warn(`Animation "${animationName}" not found in model. Available animations:`, names);
        }

        return () => {
            for (const action of Object.values(actions)) {
                action?.fadeOut(0.5);
            }
        };
    }, [actions, workerState, isTerminated, names]);

    // Calculate and apply rotation based on movement direction
    useFrame(() => {
        if (group.current && (workerState === 'working' || workerState === 'headingToStation')) {
            const currentPosition = new Vector3(position.x, position.y, position.z);

            // If we have a specified direction, use that
            if (direction) {
                const directionVector = new Vector3(direction.x, direction.y, direction.z).normalize();
                if (directionVector.length() > 0) {
                    setRotation(Math.atan2(directionVector.x, directionVector.z));
                }
            }
            // Otherwise calculate direction from position change
            else if (!currentPosition.equals(lastPosition.current)) {
                const delta = new Vector3().subVectors(currentPosition, lastPosition.current);

                if (delta.length() > 0.01) {
                    setRotation(Math.atan2(delta.x, delta.z));
                }
            }

            lastPosition.current.copy(currentPosition);
        }
    });

    // When laying/recharging, rotate to align with bed
    const isLaying = workerState === 'laying' || workerState === 'recharging';
    const layRotation = isLaying ? Math.PI / 2 : rotation;

    // When laying, position the worker on the bed surface
    // Bed is at Y=0.5, with scale 3.2 the mattress surface is roughly at Y=1.3
    // When rotated -90° on X, the model lays flat, so Y should be at mattress level
    const yPosition = isLaying ? 1.3 : position.y;

    return (
        <group
            ref={group}
            position={[position.x, yPosition, position.z]}
            rotation={[isLaying ? -Math.PI / 2 : 0, layRotation, 0]}
            dispose={null}
            scale={[0.1, 0.1, 0.1]}
        >
            <primitive object={scene} />
        </group>
    );
}
