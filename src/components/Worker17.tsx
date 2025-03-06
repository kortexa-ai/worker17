import { useState, useEffect, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import workerModelPath from '/src/assets/models/worker17.glb?url';
import { AnimationNames } from './types';

interface Worker17Props {
    position?: [number, number, number];
    isWalking?: boolean;
    direction?: [number, number, number];
    isTerminated?: boolean;
}

export function Worker17({ 
    position = [0, 0, 0], 
    isWalking = false,
    direction,
    isTerminated = false
}: Worker17Props) {
    const group = useRef(null);
    const { scene, animations } = useGLTF(workerModelPath);
    const { actions, names } = useAnimations(animations, group);
    const lastPosition = useRef(new Vector3(...position));
    const [rotation, setRotation] = useState(0);
    
    // Log available animations when component mounts
    useEffect(() => {
        console.log('Available animations:', names);
    }, [names]);

    // Play the appropriate animation based on state
    useEffect(() => {
        // Fade out all current animations
        Object.values(actions).forEach(action => action?.fadeOut(0.5));
        
        // Choose animation based on state
        let animationName;
        if (isTerminated) {
            // Use sprint animation for termination run
            animationName = AnimationNames.Sprint;
        } else if (isWalking) {
            // Normal walking animation
            animationName = AnimationNames.Walk;
        } else {
            // Idle animation
            animationName = AnimationNames.Idle;
        }
        
        // Play the selected animation if it exists
        if (actions[animationName]) {
            // Speed up animation if terminated
            const action = actions[animationName]?.reset().fadeIn(0.5);
            if (isTerminated) {
                action?.setEffectiveTimeScale(1.5); // Make sprint faster
            }
            action?.play();
        } else {
            console.warn(`Animation "${animationName}" not found in model. Available animations:`, names);
        }

        return () => {
            Object.values(actions).forEach(action => action?.fadeOut(0.5));
        };
    }, [actions, isWalking, isTerminated, names]);

    // Calculate and apply rotation based on movement direction
    useFrame(() => {
        if (group.current && isWalking) {
            const currentPosition = new Vector3(...position);
            
            // If we have a specified direction, use that
            if (direction) {
                const directionVector = new Vector3(...direction).normalize();
                if (directionVector.length() > 0) {
                    // Calculate angle from direction vector (assuming model faces +Z by default)
                    setRotation(Math.atan2(directionVector.x, directionVector.z));
                }
            } 
            // Otherwise calculate direction from position change
            else if (!currentPosition.equals(lastPosition.current)) {
                const delta = new Vector3().subVectors(currentPosition, lastPosition.current);
                
                // Only rotate if we've moved a meaningful amount
                if (delta.length() > 0.01) {
                    // Calculate angle from movement vector (assuming model faces +Z by default)
                    setRotation(Math.atan2(delta.x, delta.z));
                }
            }
            
            lastPosition.current.copy(currentPosition);
        }
    });

    return (
        <group 
            ref={group} 
            position={position} 
            rotation={[0, rotation, 0]} 
            dispose={null}
        >
            <primitive object={scene} />
        </group>
    );
}