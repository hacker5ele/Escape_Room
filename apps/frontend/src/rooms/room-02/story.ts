/**
 * All narrative content. Nothing in here is game logic; it's what the player
 * reads and pieces together. Ported verbatim from the original prototype.
 */

export type LockKind = 'locker' | 'evidence' | 'exit'

export interface Lock {
  title: string
  instructions: string
  answer: string
  hint: string
}

// Each answer is solvable from clues already readable elsewhere in the game
// (DNA station, containment board) — instructions point to the exact source
// so players don't have to guess blind. These are in-fiction, always-visible
// hints (the lock's own instructions), distinct from the room's official
// hint system (see room-02.ts on the backend).
export const LOCKS: Record<LockKind, Lock> = {
  locker: {
    title: 'STORAGE LOCKER',
    instructions:
      'A combination lock, dial set to letters. The DNA Analysis Station gave this specimen an internal codename — that single word, all lowercase, opens the lock.',
    answer: 'obsidian',
    hint: "HINT: Open the DNA Analysis Station and read its last line — 'Internal designation: ___ REX.' Enter just that first word.",
  },
  evidence: {
    title: 'EVIDENCE TERMINAL',
    instructions:
      "Locked behind a 4-digit case code. The Containment Status board (also here in the Control Room) lists a 'CASE FILE REF' and an 'AUDIT TRACKING NO.' — string the two numbers together, in that order, to get 4 digits.",
    answer: '0741',
    hint: 'HINT: CASE FILE REF: 07, AUDIT TRACKING NO: ...41. Together: 0741.',
  },
  exit: {
    title: 'EMERGENCY EXIT — MANUAL OVERRIDE',
    instructions:
      "Power's up, but the blast door won't release on power alone — it wants proof someone here actually read the threat assessment. Enter the one-word aggression classification the DNA Analysis Station assigned to the specimen that's loose.",
    answer: 'severe',
    hint: "HINT: Reopen the DNA Analysis Station in the lab. The final line reads 'Aggression index: ___.' That word is the override.",
  },
}

export type ItemId = 'badge' | 'screwdriver' | 'usb'

export interface Item {
  name: string
  short: string
}

export const ITEMS: Record<ItemId, Item> = {
  badge: { name: 'Facility Access Badge', short: 'BADGE' },
  screwdriver: { name: 'Screwdriver', short: 'TOOL' },
  usb: { name: 'USB Drive', short: 'USB' },
}

export interface EvidenceItem {
  id: string
  subject: string
  body: string
  damning: boolean
}

export const STORY = {
  // ---- DNA Analysis Station (Laboratory) — revealed one step at a time ----
  dnaSequence: [
    'Sample: tissue fragment, Sector 4 origin. Running comparison...',
    'Base genome: Tyrannosaurus, restored sequence.',
    'Splice markers detected: Velociraptor pack-hunting genes.',
    'A third, undisclosed reptilian donor strand. Origin: unlisted.',
    'Aggression index: SEVERE. Internal designation — OBSIDIAN REX.',
  ],

  // ---- Recovered scientist recording (Laboratory) --------------------------
  recordingLines: [
    "—corridor's compromised, I need Control to lock down Sector 4, now—",
    '[SIGNAL DEGRADED]',
    "It's not just breaking containment protocol. It's learning it.",
    '[SIGNAL DEGRADED]',
    "If you're hearing this and I'm not answering — don't wait for records. Don't wait for me. Just go.",
  ],

  // ---- Flavor-only objects ---------------------------------------------------
  flavor: {
    footprints: [
      'A single clawed print, pressed deep into cracked tile.',
      "Whatever left it was walking, not running. It wasn't in a hurry.",
    ],
    equipment: [
      'An overturned incubation rig, glass cracked but intact.',
      'Vines have already started growing up through the housing. This has been like this for a while.',
    ],
  },

  // ---- Security Terminal (Laboratory) ----------------------------------------
  terminalNoBadge: 'Badge-locked. You need facility access before this will do anything.',
  terminalIncomplete:
    'Insufficient data logged. Finish the DNA analysis and recover the audio log before this terminal will trust you with the layout.',
  terminalUnlocked: [
    'The badge reader blinks green. A facility map loads.',
    'One route is still marked active: SECURITY CONTROL ROOM.',
    'Everything else on the map is flagged BREACHED or UNKNOWN.',
  ],

  // ---- Storage locker (Laboratory) — code lock --------------------------------
  lockerOpened: [
    'The lock clicks open. Inside: a facility access badge, a screwdriver, and an unused USB drive.',
    "A half-written resignation letter sits on top: '...I can't keep pretending these are just animals. What we've done can't be undone. I'm done being complicit—' It stops mid-sentence.",
  ],

  // ---- Containment status board (Control Room) -------------------------------
  containmentStatus: [
    'SECTOR 4 — CONTAINMENT: BREACHED',
    'SECTOR 2 — CONTAINMENT: BREACHED',
    'PERSONNEL UNACCOUNTED FOR: 3',
    'SPECIMENS AT LARGE: 2 (1 APEX-CLASS)',
    'CASE FILE REF: 07',
    'AUDIT TRACKING NO: ...41',
    '———',
    'INTERNAL MEMO, pinned to the board:',
    "'Maintain public messaging. Do not disclose specimen count or classification to outside authorities until board review.'",
  ],

  // ---- Evidence terminal (Control Room) — decision puzzle ---------------------
  // Player must pick exactly the items proving *intentional* concealment.
  evidenceItems: [
    {
      id: 'audit',
      subject: 'Internal Email — Audit Prep',
      body: "'All Sector 4 logs are to reflect STANDARD RESEARCH only. Do not reference hybrid designations in any documentation the auditors might access.' — Director Kade",
      damning: true,
    },
    {
      id: 'loading',
      subject: 'Security Log — Loading Dock',
      body: 'Unmarked container received, 11:47 PM. Manifest redacted. Visit not logged in staff registry.',
      damning: false,
    },
    {
      id: 'override',
      subject: 'Experiment Log — Day 301',
      body: "'Recommended program suspension pending full safety review. Recommendation OVERRULED by Director Kade, citing contractual obligations to investors.'",
      damning: true,
    },
    {
      id: 'manifest',
      subject: 'Buyer Manifest — Apex Lot 1',
      body: "'Payment structured in three parts to avoid reporting thresholds.' Private buyer consortium, specimen never declared to any regulator.",
      damning: true,
    },
    {
      id: 'nightstalker',
      subject: 'DNA Report — Sample NIGHTSTALKER-004',
      body: 'Hybrid destabilized past 40% gene integration. Terminated at embryo stage per protocol 7. A failed experiment — not evidence of concealment.',
      damning: false,
    },
  ] satisfies EvidenceItem[],
  evidenceHint:
    'HINT: Routine incidents and failed experiments aren\'t proof of a cover-up. Look for what shows they KNEW the danger and hid it anyway.',
  evidenceNeedsUSB: 'You need something to copy this onto. Find a USB drive first.',
  evidenceWrong:
    'That doesn\'t establish intentional concealment on its own. Reconsider which of these actually prove they knew — and hid it.',

  // ---- Power router puzzle (Control Room) ------------------------------------
  powerRouterIntro: 'SECTOR POWER ROUTER — reroute emergency power to the corridor evacuation route.',
  wireColors: ['#e33d3d', '#3d7de3', '#e3d33d', '#3de37a'],
  wireHint: 'HINT: Each line only fuses with a terminal of the same color.',

  // ---- Lockdown sequence -------------------------------------------------------
  lockdownLines: [
    'UNAUTHORIZED DATA EXTRACTION DETECTED',
    'CONTAINMENT BREACH CONFIRMED.',
    'SECURITY TEAMS DISPATCHED.',
    'MULTIPLE SPECIMENS AT LARGE.',
    'FACILITY LOCKDOWN INITIATED.',
  ],

  // ---- Escape timer (starts the instant the data extraction is logged) --------
  escapeTimeSeconds: 60,
  timerStartedToast:
    'The extraction was logged the second you pulled it. Something is already moving toward you — reach the exit before the clock runs out.',

  // ---- Containment Corridor -----------------------------------------------------
  corridorEntry: 'Warning lights. Claw marks gouged into the walls at shoulder height. This was not part of any tour.',
  cameraFeedLines: ['[SIGNAL LOST]', '...', 'MOTION DETECTED — SECTOR 4', '[SIGNAL LOST]'],
  exitLocked: ['A heavy blast door marked EMERGENCY EXIT.', 'The panel beside it is dark. NO POWER.'],
  exitUnlocked: ['The panel glows steady green. EXIT READY.', 'This is it.'],

  // ---- Ambient dinosaur presence (fires across locations, not just the end) ---
  ambientLines: [
    'Something heavy shifts, somewhere above the ceiling tiles.',
    'A low growl rolls through the vents, then goes quiet.',
    'The lights stutter. For a second, every monitor shows static.',
    'Claws click against metal flooring, somewhere down the hall.',
  ],

  // ---- Ending sequence -----------------------------------------------------------
  endingLines: [
    'Heavy footsteps echo through the corridor behind you...',
    '*ROAR*',
    'You slam the door behind you.',
  ],
  endingSubtitle: 'Evidence Recovered',
  endingFlavor: "Project Genesis is exposed. Somewhere, Dr. Chen's letter will finally be read.",

  // ---- Death sequence (timer runs out before the exit is reached) ----------------
  deathLines: ['The clock hits zero.', 'Something heavy hits the floor behind you, close.', '*ROAR*'],
  deathSubtitle: 'Containment Failure',
  deathFlavor: "You didn't make it out in time. Obsidian Rex did.",
}
