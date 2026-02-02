export enum AnimationNames {
    Grounded = "Armature|Grounded",
    Idle = "Armature|Idle",
    Jump = "Armature|Jump",
    Sprint = "Armature|Sprint",
    Walk = "Armature|Walk"
}

export type WorkerState = 
    | 'working'      // Normal walking/idle cycle
    | 'headingToStation'  // Walking to recharge station (battery low)
    | 'laying'       // Laying on bed, not yet recharging
    | 'recharging'   // Actually recharging while laying
    | 'idle';        // Standing idle
