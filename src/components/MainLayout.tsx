import { Suspense } from 'react';
import { SafeViewport } from './SafeViewport';
import { ContainerDimensions } from './ContainerDimensions';
import { ThreeContainer } from './ThreeContainer';
import { Environment, OrbitControls, Box } from '@react-three/drei';
import { SimulationDriver } from './SimulationDriver';
import { SwarmStatusPanel } from './SwarmStatusPanel';
import { MiniMap } from './MiniMap';
import { PLOT_SIZE } from '../simulation/types';

export function MainLayout() {
    return (
        <SafeViewport>
            <SwarmStatusPanel />
            <MiniMap />
            <ContainerDimensions className="w-full h-full flex-1 min-h-0">
                {({ width, height }) => (
                    <ThreeContainer
                        width={width}
                        height={height}
                        cameraPosition={[12, 12, 12]}
                        cameraFov={50}
                    >
                        {/* Lighting */}
                        <ambientLight intensity={0.6} />
                        <directionalLight
                            position={[8, 12, 8]}
                            intensity={1}
                            castShadow
                            shadow-mapSize={[2048, 2048]}
                            shadow-camera-left={-12}
                            shadow-camera-right={12}
                            shadow-camera-top={12}
                            shadow-camera-bottom={-12}
                        />

                        <Suspense fallback={null}>
                            {/* Ground plane - no physics needed since movement is AI-driven */}
                            <Box
                                args={[PLOT_SIZE, 0.2, PLOT_SIZE]}
                                position={[0, -0.1, 0]}
                                receiveShadow
                            >
                                <meshStandardMaterial color="#4ade80" />
                            </Box>

                            {/* Field border */}
                            <Box args={[PLOT_SIZE + 0.2, 0.05, PLOT_SIZE + 0.2]} position={[0, 0.01, 0]}>
                                <meshStandardMaterial color="#166534" />
                            </Box>

                            {/* The simulation: workers, stations, everything */}
                            <SimulationDriver />

                            <Environment preset="park" />
                        </Suspense>

                        <OrbitControls
                            enablePan={true}
                            enableZoom={true}
                            minDistance={5}
                            maxDistance={30}
                            maxPolarAngle={Math.PI / 2 - 0.05}
                            target={[0, 0, 0]}
                        />
                    </ThreeContainer>
                )}
            </ContainerDimensions>
        </SafeViewport>
    );
}
