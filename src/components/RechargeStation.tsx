import { useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import bedModelPath from '/src/assets/models/bed.glb?url';

// Preload the model to avoid loading delay
useGLTF.preload(bedModelPath);

interface RechargeStationProps {
    position?: [number, number, number];
}

export function RechargeStation({ 
    position = [0, 0, 0]
}: RechargeStationProps) {
    const group = useRef(null);
    const { scene } = useGLTF(bedModelPath);
    
    return (
        <group 
            ref={group} 
            position={position} 
            rotation={[0, 0, 0]} // Aligned with Z axis
            dispose={null}
            scale={[3.2, 3.2, 3.2]} // Scaled to match worker size
        >
            <primitive object={scene} />
        </group>
    );
}