// ============================================================
// Simulation Loop - single rAF loop that ticks all workers
// Called from a React component via useFrame (R3F) so it
// stays in sync with the Three.js render loop.
// ============================================================

import { tickWorker, updateStationRespawns } from './WorkerAI';
import { getWorld, notifySubscribers } from './WorldState';

let lastTime = 0;

/**
 * Called once per frame from useFrame().
 * dt is in seconds, already multiplied by simSpeed.
 */
export function simulationTick(clockElapsed: number): void {
    const world = getWorld();
    if (world.paused) {
        lastTime = clockElapsed;
        return;
    }

    // Calculate dt, cap at 100ms to avoid spiral of death
    let dt = lastTime === 0 ? 0.016 : clockElapsed - lastTime;
    lastTime = clockElapsed;
    dt = Math.min(dt, 0.1) * world.simSpeed;

    if (dt <= 0) return;

    // Tick all workers
    for (const worker of world.workers) {
        tickWorker(worker, world, dt);
    }

    // Update station respawns
    updateStationRespawns(world, dt);

    world.tickCount++;

    // Notify React subscribers (triggers re-render for UI panels)
    // Throttle to ~15fps for UI updates (every 4th tick at 60fps)
    if (world.tickCount % 4 === 0) {
        notifySubscribers();
    }
}
