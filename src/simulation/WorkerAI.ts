// ============================================================
// Worker AI - autonomous decision logic for each worker
// Pure functions operating on world state. No React, no side effects.
// ============================================================

import {
    type WorkerInstance,
    type WorkStation,
    type RechargeStation,
    type WorldState,
    type Position,
    PLOT_SIZE,
    QUEUE_SPACING,
} from './types';
import { getConfig } from './WorldState';

// --- Helpers ---

export function distance(a: Position, b: Position): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function directionTo(from: Position, to: Position): Position {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return { x: 0, y: 0, z: 0 };
    return { x: dx / len, y: 0, z: dz / len };
}

function clampToField(pos: Position): Position {
    const half = PLOT_SIZE / 2 - 0.5;
    return {
        x: Math.max(-half, Math.min(half, pos.x)),
        y: pos.y,
        z: Math.max(-half, Math.min(half, pos.z)),
    };
}

function moveToward(worker: WorkerInstance, target: Position, dt: number, speedMultiplier = 1): boolean {
    const dist = distance(worker.position, target);
    const arrivalThreshold = 0.4;

    if (dist < arrivalThreshold) return true; // arrived

    const dir = directionTo(worker.position, target);
    const step = worker.walkSpeed * speedMultiplier * dt;
    const actualStep = Math.min(step, dist); // don't overshoot

    worker.position = clampToField({
        x: worker.position.x + dir.x * actualStep,
        y: worker.position.y,
        z: worker.position.z + dir.z * actualStep,
    });
    worker.direction = dir;
    worker.rotation = Math.atan2(dir.x, dir.z);
    return false;
}

// --- Station scoring ---

function scoreWorkStation(worker: WorkerInstance, station: WorkStation): number {
    if (station.depleted) return -1;
    if (station.currentWorkerIds.length >= station.maxWorkers) return -1;

    const dist = distance(worker.position, station.position);
    const availability = 1 - station.currentWorkerIds.length / station.maxWorkers;
    const workRemaining = (station.totalWork - station.completedWork) / station.totalWork;
    const efficiency = 1 / station.batteryDrainMultiplier;
    const proximity = 1 / (dist + 1); // +1 avoids division by zero

    return availability * workRemaining * efficiency * proximity;
}

function findBestWorkStation(worker: WorkerInstance, world: WorldState): WorkStation | null {
    let best: WorkStation | null = null;
    let bestScore = -1;

    for (const station of world.workStations) {
        const score = scoreWorkStation(worker, station);
        if (score > bestScore) {
            bestScore = score;
            best = station;
        }
    }
    return best;
}

function findBestRechargeStation(_worker: WorkerInstance, world: WorldState): RechargeStation | null {
    let best: RechargeStation | null = null;
    let bestQueueLen = Infinity;

    for (const station of world.rechargeStations) {
        const queueLen = station.queue.length + station.chargingWorkerIds.length;
        if (queueLen < bestQueueLen) {
            bestQueueLen = queueLen;
            best = station;
        }
    }
    return best;
}

function getQueueTargetPosition(station: RechargeStation, queueIndex: number): Position {
    // Queue forms a line extending from the station in queueDirection
    const offset = (queueIndex + 1) * QUEUE_SPACING;
    return {
        x: station.position.x + station.queueDirection.x * offset,
        y: 0,
        z: station.position.z + station.queueDirection.z * offset,
    };
}

// --- Per-state update functions ---

function updateIdle(worker: WorkerInstance, _world: WorldState, dt: number): void {
    // Brief pause, then seek work
    worker.stateTimer -= dt;
    if (worker.stateTimer <= 0) {
        worker.state = 'seeking';
    }
}

function updateSeeking(worker: WorkerInstance, world: WorldState, _dt: number): void {
    const station = findBestWorkStation(worker, world);
    if (station) {
        worker.assignedStationId = station.id;
        station.currentWorkerIds.push(worker.id);
        worker.state = 'traveling';
    } else {
        // No available stations -- wander idle briefly, then try again
        worker.state = 'idle';
        worker.stateTimer = 2;
    }
}

function updateTraveling(worker: WorkerInstance, world: WorldState, dt: number): void {
    const station = world.workStations.find(s => s.id === worker.assignedStationId);
    if (!station || station.depleted) {
        // Station gone or depleted while traveling
        releaseWorkStation(worker, world);
        worker.state = 'seeking';
        return;
    }

    // If station became full while we were walking, let go
    if (station.currentWorkerIds.filter(id => id !== worker.id).length >= station.maxWorkers) {
        releaseWorkStation(worker, world);
        worker.state = 'seeking';
        return;
    }

    // Spread workers around the station, not all on the exact same spot
    const workerIdx = station.currentWorkerIds.indexOf(worker.id);
    const angle = (workerIdx / station.maxWorkers) * Math.PI * 2;
    const spreadRadius = 0.8;
    const workPos: Position = {
        x: station.position.x + Math.cos(angle) * spreadRadius,
        y: 0,
        z: station.position.z + Math.sin(angle) * spreadRadius,
    };

    const arrived = moveToward(worker, workPos, dt);
    if (arrived) {
        worker.state = 'working';
        // Face the station
        const dir = directionTo(worker.position, station.position);
        worker.direction = dir;
        worker.rotation = Math.atan2(dir.x, dir.z);
    }
}

function updateWorking(worker: WorkerInstance, world: WorldState, dt: number): void {
    const config = getConfig();
    const station = world.workStations.find(s => s.id === worker.assignedStationId);

    if (!station || station.depleted) {
        releaseWorkStation(worker, world);
        worker.state = 'seeking';
        return;
    }

    // Do work
    station.completedWork += station.workRate * dt;

    // Drain battery
    const drain = config.baseDrainRate * station.batteryDrainMultiplier * dt;
    worker.battery = Math.max(0, worker.battery - drain);

    // Check if station complete
    if (station.completedWork >= station.totalWork) {
        station.depleted = true;
        if (station.respawnTime > 0) {
            station.respawnTimer = station.respawnTime;
        }
        // Release all workers from this station
        for (const wId of [...station.currentWorkerIds]) {
            const w = world.workers.find(w2 => w2.id === wId);
            if (w) {
                w.assignedStationId = null;
                if (w.state === 'working' || w.state === 'traveling') {
                    w.state = 'seeking';
                }
            }
        }
        station.currentWorkerIds = [];
        return;
    }

    // Check battery
    if (worker.battery <= config.lowBatteryThreshold) {
        releaseWorkStation(worker, world);
        worker.state = 'headingToRecharge';
    }
}

function updateHeadingToRecharge(worker: WorkerInstance, world: WorldState, dt: number): void {
    // Pick best recharge station (shortest queue) if not already assigned
    if (!worker.assignedRechargeId) {
        const station = findBestRechargeStation(worker, world);
        if (!station) return;
        worker.assignedRechargeId = station.id;
    }

    const station = world.rechargeStations.find(s => s.id === worker.assignedRechargeId);
    if (!station) {
        worker.assignedRechargeId = null;
        worker.state = 'seeking';
        return;
    }

    // Walk to the queue area first (near the station)
    const queueTarget = getQueueTargetPosition(station, station.queue.length);
    const arrived = moveToward(worker, queueTarget, dt);

    if (arrived) {
        // Now join the queue
        if (!station.queue.includes(worker.id) && !station.chargingWorkerIds.includes(worker.id)) {
            station.queue.push(worker.id);
        }
        worker.queuePosition = station.queue.indexOf(worker.id);
        worker.state = 'queuing';
    }
}

function updateQueuing(worker: WorkerInstance, world: WorldState, dt: number): void {
    const station = world.rechargeStations.find(s => s.id === worker.assignedRechargeId);
    if (!station) {
        worker.state = 'seeking';
        return;
    }

    // Update queue position (might have moved forward)
    const queueIdx = station.queue.indexOf(worker.id);
    if (queueIdx === -1) {
        // We've been moved to charging
        if (station.chargingWorkerIds.includes(worker.id)) {
            worker.state = 'recharging';
            return;
        }
        // Lost from queue somehow
        worker.assignedRechargeId = null;
        worker.state = 'headingToRecharge';
        return;
    }

    worker.queuePosition = queueIdx;

    // Walk to our queue spot (shuffles forward as others finish)
    const target = getQueueTargetPosition(station, queueIdx);
    const atSpot = moveToward(worker, target, dt, 0.7);

    // Only promote to charging slot if we're first in line AND at our queue spot
    if (station.chargingWorkerIds.length < station.maxSlots && queueIdx === 0 && atSpot) {
        station.queue.shift();
        station.chargingWorkerIds.push(worker.id);
        worker.state = 'recharging';
        worker.queuePosition = -1;
    }
}

function updateRecharging(worker: WorkerInstance, world: WorldState, dt: number): void {
    const station = world.rechargeStations.find(s => s.id === worker.assignedRechargeId);
    if (!station) {
        worker.state = 'seeking';
        return;
    }

    // Walk to station position first (onto the charger)
    const atStation = moveToward(worker, station.position, dt);

    // Only charge when physically at the station
    if (atStation) {
        worker.battery = Math.min(100, worker.battery + station.chargeRate * dt);
    }

    // Fully charged -> leave
    if (worker.battery >= 100) {
        station.chargingWorkerIds = station.chargingWorkerIds.filter(id => id !== worker.id);
        worker.assignedRechargeId = null;
        worker.queuePosition = -1;
        worker.state = 'seeking';
    }
}

// --- Cleanup helpers ---

function releaseWorkStation(worker: WorkerInstance, world: WorldState): void {
    if (worker.assignedStationId) {
        const station = world.workStations.find(s => s.id === worker.assignedStationId);
        if (station) {
            station.currentWorkerIds = station.currentWorkerIds.filter(id => id !== worker.id);
        }
        worker.assignedStationId = null;
    }
}

// --- Respawn depleted stations ---

export function updateStationRespawns(world: WorldState, dt: number): void {
    for (const station of world.workStations) {
        if (station.depleted && station.respawnTime > 0) {
            station.respawnTimer -= dt;
            if (station.respawnTimer <= 0) {
                station.depleted = false;
                station.completedWork = 0;
                station.respawnTimer = 0;
            }
        }
    }
}

// --- Main tick: update a single worker ---

export function tickWorker(worker: WorkerInstance, world: WorldState, dt: number): void {
    // Battery check override: if battery critically low and not already heading to recharge
    const config = getConfig();
    if (
        worker.battery <= config.lowBatteryThreshold &&
        worker.state !== 'headingToRecharge' &&
        worker.state !== 'queuing' &&
        worker.state !== 'recharging'
    ) {
        releaseWorkStation(worker, world);
        worker.state = 'headingToRecharge';
    }

    switch (worker.state) {
        case 'idle':
            updateIdle(worker, world, dt);
            break;
        case 'seeking':
            updateSeeking(worker, world, dt);
            break;
        case 'traveling':
            updateTraveling(worker, world, dt);
            break;
        case 'working':
            updateWorking(worker, world, dt);
            break;
        case 'headingToRecharge':
            updateHeadingToRecharge(worker, world, dt);
            break;
        case 'queuing':
            updateQueuing(worker, world, dt);
            break;
        case 'recharging':
            updateRecharging(worker, world, dt);
            break;
        case 'returningToWork':
            // Alias for seeking after recharge
            worker.state = 'seeking';
            break;
    }

    // Passive battery drain while idle/seeking/traveling (slower than working)
    if (worker.state === 'traveling' || worker.state === 'seeking') {
        worker.battery = Math.max(0, worker.battery - config.baseDrainRate * 0.3 * dt);
    }
}
