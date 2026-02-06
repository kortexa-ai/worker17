// ============================================================
// SimulationDriver - lives inside the R3F Canvas
// Calls simulationTick() every frame via useFrame().
// Also renders all 3D entities from world state.
// ============================================================

import { useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { simulationTick } from '../simulation/SimulationLoop';
import { getWorld, subscribe } from '../simulation/WorldState';
import type { WorldState } from '../simulation/types';
import { WorkerModel } from './WorkerModel';
import { WorkStationModel } from './WorkStationModel';
import { RechargeStationModel } from './RechargeStationModel';

export function SimulationDriver() {
    // Snapshot triggers React re-renders for adding/removing workers and station updates
    const [snapshot, setSnapshot] = useState<WorldState>(getWorld());

    useEffect(() => {
        return subscribe(() => {
            const world = getWorld();
            // Create a new object so React detects the change
            setSnapshot({
                ...world,
                // Shallow-copy arrays so React sees new references when items are added/removed
                workers: [...world.workers],
                workStations: [...world.workStations],
                rechargeStations: [...world.rechargeStations],
            });
        });
    }, []);

    // Drive the simulation
    useFrame(({ clock }) => {
        simulationTick(clock.getElapsedTime());
    });

    return (
        <>
            {/* Workers - position/rotation updates happen inside WorkerModel via useFrame */}
            {snapshot.workers.map(worker => (
                <WorkerModel
                    key={worker.id}
                    workerId={worker.id}
                    modelIndex={worker.modelIndex}
                    initialState={worker.state}
                    initialBattery={worker.battery}
                />
            ))}

            {/* Work Stations */}
            {snapshot.workStations.map(station => (
                <WorkStationModel key={station.id} station={station} />
            ))}

            {/* Recharge Stations */}
            {snapshot.rechargeStations.map(station => (
                <RechargeStationModel key={station.id} station={station} />
            ))}
        </>
    );
}
