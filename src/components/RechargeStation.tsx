import { useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import bedModelPath from '/src/assets/models/bed.glb?url';

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
            rotation={[0, Math.PI / 4, 0]} // Rotate a bit for better visibility
            dispose={null}
            scale={[32, 32, 32]} // Massive scale for maximum visibility
        >
            <primitive object={scene} />
        </group>
    );
}