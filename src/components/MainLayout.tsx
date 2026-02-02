import { Suspense, useState, useEffect, useRef } from 'react';
import { SafeViewport } from './SafeViewport';
import { ContainerDimensions } from './ContainerDimensions';
import { Camera } from './Camera';
import { ThreeContainer, type ThreeContainerRef } from './ThreeContainer';
import { Environment, OrbitControls, Box } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Worker17 } from './Worker17';
import { RechargeStation } from './RechargeStation';
import { WorkerStatusPanel, type WorkerStatus, type WorkerPosition } from './WorkerStatusPanel';
import { WorkerControls, type MovementParams, DEFAULT_PARAMS } from './WorkerControls';
import type { WorkerState } from './types';

const PLOT_SIZE = 20;
const RECHARGE_STATION_POSITION = {x: -(PLOT_SIZE / 2 - 6), y: 0, z: -(PLOT_SIZE / 2 - 6)};
const RECHARGE_STATION_RADIUS = 2;
const BATTERY_LOW_THRESHOLD = 10;

export function MainLayout() {
    const [workerState, setWorkerState] = useState<WorkerState>('idle');
    const [workerPosition, setWorkerPosition] = useState<WorkerPosition>({x: 0, y: 0, z: 0});
    const [workerDirection, setWorkerDirection] = useState<WorkerPosition>({x: 0, y: 0, z: 1});
    const threeContainerRef = useRef<ThreeContainerRef>(null);

    // Movement parameters controlled by UI
    const [movementParams, setMovementParams] = useState<MovementParams>(DEFAULT_PARAMS);

    // Local state for UI display
    const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({
        batteryLevel: 100,
        status: 'idle',
        currentTask: undefined
    });

    // Use refs for values that don't need to trigger re-renders but are needed in intervals
    const batteryRef = useRef<number>(100);
    const workerStateRef = useRef(workerState);
    const workerPositionRef = useRef(workerPosition);
    const movementParamsRef = useRef(movementParams);

    // Keep refs in sync with state
    useEffect(() => {
        workerStateRef.current = workerState;
    }, [workerState]);

    useEffect(() => {
        workerPositionRef.current = workerPosition;
    }, [workerPosition]);

    useEffect(() => {
        movementParamsRef.current = movementParams;
    }, [movementParams]);

    // Target for random walking
    const walkTargetRef = useRef({
        x: 0,
        z: 0,
        timeToChange: 0
    });

    // Current direction vector for smooth transitions
    const directionRef = useRef<WorkerPosition>({x: 0, y: 0, z: 1});

    // Toggle working state periodically (only when in working state)
    useEffect(() => {
        const interval = setInterval(() => {
            const currentState = workerStateRef.current;
            
            // Only toggle when in working state and not heading to station
            if (currentState !== 'working' && currentState !== 'idle') return;

            setWorkerState(prev => {
                const newState = prev === 'working' ? 'idle' : 'working';
                setWorkerStatus(status => ({
                    ...status,
                    status: newState
                }));
                return newState;
            });
        }, 8000);

        return () => clearInterval(interval);
    }, []);

    // Battery management - drain when working, recharge when laying
    useEffect(() => {
        const batteryInterval = setInterval(() => {
            const currentState = workerStateRef.current;
            const params = movementParamsRef.current;

            // Recharging mode - only when in recharging state (laying on bed)
            if (currentState === 'recharging') {
                const chargeAmount = params.batteryRechargeRate;
                const newBatteryLevel = Math.min(100, batteryRef.current + chargeAmount);
                batteryRef.current = newBatteryLevel;

                setWorkerStatus(prev => ({
                    ...prev,
                    batteryLevel: newBatteryLevel,
                    currentTask: 'Recharging'
                }));

                // When fully charged, go back to working
                if (newBatteryLevel >= 100) {
                    setWorkerState('working');
                    setWorkerStatus(prev => ({
                        ...prev,
                        status: 'working',
                        currentTask: undefined
                    }));
                }
            }
            // Draining mode (only when working)
            else if (currentState === 'working') {
                const drainRange = params.batteryDischargeMax - params.batteryDischargeMin;
                const drainAmount = Math.floor(Math.random() * (drainRange + 1)) + params.batteryDischargeMin;
                const newBatteryLevel = Math.max(0, batteryRef.current - drainAmount);
                batteryRef.current = newBatteryLevel;

                setWorkerStatus(prev => ({
                    ...prev,
                    batteryLevel: newBatteryLevel
                }));

                // When battery drops to threshold, head to station
                if (newBatteryLevel <= BATTERY_LOW_THRESHOLD) {
                    setWorkerState('headingToStation');
                    setWorkerStatus(prev => ({
                        ...prev,
                        status: 'headingToStation',
                        currentTask: 'Taking a break'
                    }));
                }
            }
        }, 1000);

        return () => clearInterval(batteryInterval);
    }, []);

    // Handle movement to recharge station when heading there
    useEffect(() => {
        if (workerState !== 'headingToStation') return;

        const moveToRechargeInterval = setInterval(() => {
            const {x, y, z} = workerPositionRef.current;
            const {x: targetX, z: targetZ} = RECHARGE_STATION_POSITION;

            const dirX = targetX - x;
            const dirZ = targetZ - z;
            const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);

            // When close enough to station, transition to laying state
            if (distance < 0.5) {
                clearInterval(moveToRechargeInterval);
                // Position worker exactly on the bed
                setWorkerPosition({x: targetX, y: 1.3, z: targetZ});
                setWorkerState('laying');
                setWorkerStatus(prev => ({
                    ...prev,
                    status: 'laying',
                    currentTask: 'Resting'
                }));
                
                // After a short delay, start actual recharging
                setTimeout(() => {
                    setWorkerState('recharging');
                    setWorkerStatus(prev => ({
                        ...prev,
                        status: 'recharging',
                        currentTask: 'Recharging'
                    }));
                }, 1000);
                return;
            }

            const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
            const normDirX = dirX / length;
            const normDirZ = dirZ / length;
            const stepSize = movementParamsRef.current.rechargeStepSize;
            const newX = x + normDirX * stepSize;
            const newZ = z + normDirZ * stepSize;

            setWorkerPosition({x: newX, y, z: newZ});
            setWorkerDirection({x: normDirX, y: 0, z: normDirZ});
        }, 16);

        return () => clearInterval(moveToRechargeInterval);
    }, [workerState]);

    // Normal walking behavior when in working state
    useEffect(() => {
        if (workerState !== 'working') return;

        const moveInterval = setInterval(() => {
            const {x, z} = workerPositionRef.current;
            const params = movementParamsRef.current;

            // Initialize target if needed
            if (walkTargetRef.current.timeToChange <= 0) {
                walkTargetRef.current = {
                    x: Math.random() * PLOT_SIZE / 2 - PLOT_SIZE / 4,
                    z: Math.random() * PLOT_SIZE / 2 - PLOT_SIZE / 4,
                    timeToChange: 200
                };
            }

            walkTargetRef.current.timeToChange--;

            const distToTarget = Math.sqrt(
                (x - walkTargetRef.current.x) ** 2 +
                (z - walkTargetRef.current.z) ** 2
            );

            if (walkTargetRef.current.timeToChange <= 0 || distToTarget < params.targetDistanceThreshold) {
                let validTarget = false;
                let attempts = 0;
                let newTargetX = 0;
                let newTargetZ = 0;

                while (!validTarget && attempts < 10) {
                    newTargetX = Math.random() * (PLOT_SIZE - 4) - (PLOT_SIZE / 2 - 2);
                    newTargetZ = Math.random() * (PLOT_SIZE - 4) - (PLOT_SIZE / 2 - 2);

                    const distToStation = Math.sqrt(
                        (newTargetX - RECHARGE_STATION_POSITION.x) ** 2 +
                        (newTargetZ - RECHARGE_STATION_POSITION.z) ** 2
                    );

                    if (distToStation > RECHARGE_STATION_RADIUS * 1.2) {
                        validTarget = true;
                    }
                    attempts++;
                }

                walkTargetRef.current = {
                    x: newTargetX,
                    z: newTargetZ,
                    timeToChange: 150 + Math.floor(Math.random() * 100)
                };
            }

            const targetX = walkTargetRef.current.x;
            const targetZ = walkTargetRef.current.z;
            const moveX = targetX - x;
            const moveZ = targetZ - z;
            const moveDist = Math.sqrt(moveX * moveX + moveZ * moveZ);

            if (moveDist > 0.001) {
                const targetDirX = moveX / moveDist;
                const targetDirZ = moveZ / moveDist;
                const turnSpeed = params.turnSpeed;

                directionRef.current.x += (targetDirX - directionRef.current.x) * turnSpeed;
                directionRef.current.z += (targetDirZ - directionRef.current.z) * turnSpeed;

                const currentDirLength = Math.sqrt(
                    directionRef.current.x ** 2 +
                    directionRef.current.z ** 2
                );

                if (currentDirLength > 0.001) {
                    directionRef.current.x /= currentDirLength;
                    directionRef.current.z /= currentDirLength;
                }

                const smoothDirX = directionRef.current.x;
                const smoothDirZ = directionRef.current.z;
                const stepSize = params.walkStepSize;
                let newX = x + smoothDirX * stepSize;
                let newZ = z + smoothDirZ * stepSize;

                // Check distance to recharge station
                const stationX = RECHARGE_STATION_POSITION.x;
                const stationZ = RECHARGE_STATION_POSITION.z;
                const dxStation = newX - stationX;
                const dzStation = newZ - stationZ;
                const distanceToStation = Math.sqrt(dxStation * dxStation + dzStation * dzStation);

                if (distanceToStation < params.stationAvoidanceRadius) {
                    const nx = dxStation / distanceToStation;
                    const nz = dzStation / distanceToStation;
                    const pushFactor = (params.stationAvoidanceRadius - distanceToStation) * params.pushFactor;
                    newX = newX + nx * pushFactor;
                    newZ = newZ + nz * pushFactor;

                    if (Math.random() < 0.1) {
                        walkTargetRef.current.timeToChange = 0;
                    }
                }

                setWorkerPosition({x: newX, y: 0, z: newZ});
                setWorkerDirection({x: smoothDirX, y: 0, z: smoothDirZ});
            }
        }, 16);

        return () => clearInterval(moveInterval);
    }, [workerState]);

    return (
        <SafeViewport>
            <Camera />
            <WorkerStatusPanel status={workerStatus} position={workerPosition}/>
            <WorkerControls params={movementParams} onParamsChange={setMovementParams} />
            <ContainerDimensions className="w-full h-full flex-1 min-h-0">
                {({ width, height }) => (
                    <ThreeContainer
                        ref={threeContainerRef}
                        width={width}
                        height={height}
                        cameraPosition={[8, 8, 8]}
                        cameraFov={50}
                    >
                        {/* Lighting */}
                        <ambientLight intensity={0.5} />
                        <directionalLight
                            position={[5, 8, 5]}
                            intensity={1}
                            castShadow
                            shadow-mapSize={[2048, 2048]}
                            shadow-camera-left={-10}
                            shadow-camera-right={10}
                            shadow-camera-top={10}
                            shadow-camera-bottom={-10} />

                        <Suspense fallback={null}>
                            <Physics debug={false}>
                                {/* Grass ground with physics */}
                                <RigidBody type="fixed" colliders={false}>
                                    <CuboidCollider
                                        args={[PLOT_SIZE / 2, 0.1, PLOT_SIZE / 2]}
                                        position={[0, -0.1, 0]} />
                                    <Box
                                        args={[PLOT_SIZE, 0.2, PLOT_SIZE]}
                                        position={[0, -0.1, 0]}
                                        receiveShadow
                                    >
                                        <meshStandardMaterial color="#4ade80" />
                                    </Box>
                                </RigidBody>

                                {/* Recharge Station Rigid Body */}
                                <RigidBody type="fixed" position={[RECHARGE_STATION_POSITION.x, 2, RECHARGE_STATION_POSITION.z]}>
                                    <CuboidCollider
                                        args={[0.8, 0.4, 0.8]}
                                    />
                                </RigidBody>
                            </Physics>
                            {/* Worker model */}
                            <Worker17
                                position={workerPosition}
                                workerState={workerState}
                                direction={workerDirection}
                            />

                            {/* Recharge Station (Bed) model */}
                            <RechargeStation
                                position={[RECHARGE_STATION_POSITION.x, 0.5, RECHARGE_STATION_POSITION.z]}
                            />
                            <Environment preset="park" />
                        </Suspense>

                        <OrbitControls
                            enablePan={true}
                            enableZoom={true}
                            minDistance={3}
                            maxDistance={20}
                            maxPolarAngle={Math.PI / 2 - 0.1}
                            target={[0, 0, 0]} />

                    </ThreeContainer>
                )}
            </ContainerDimensions>
        </SafeViewport>
    );
}
