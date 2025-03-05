import { useState, useEffect, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import workerModelPath from '/src/assets/models/worker17.glb?url';

interface Worker17Props {
    position?: [number, number, number];
    isWalking?: boolean;
    direction?: [number, number, number]; // Optional direction vector for manual control
}

export enum AnimationNames {
    Grounded = "Armature|Grounded",
    Idle = "Armature|Idle",
    Jump = "Armature|Jump",
    Sprint = "Armature|Sprint",
    Walk = "Armature|Walk"
}

export function Worker17({ 
    position = [0, 0, 0], 
    isWalking = false,
    direction
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

    // Play the appropriate animation based on isWalking prop
    useEffect(() => {
        // Fade out all current animations
        Object.values(actions).forEach(action => action?.fadeOut(0.5));
        
        // Choose animation based on walking state
        const animationName = isWalking 
            ? AnimationNames.Walk // Change this if your walking animation has a different name
            : AnimationNames.Idle;
        
        // Play the selected animation if it exists
        if (actions[animationName]) {
            actions[animationName].reset().fadeIn(0.5).play();
        } else {
            console.warn(`Animation "${animationName}" not found in model. Available animations:`, names);
        }

        return () => {
            Object.values(actions).forEach(action => action?.fadeOut(0.5));
        };
    }, [actions, isWalking, names]);

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