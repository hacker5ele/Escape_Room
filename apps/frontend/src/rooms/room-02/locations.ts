/**
 * The facility map. Each location is a full scene with hotspots positioned by
 * percentage so it reads as a place, not a grid of buttons. Backgrounds fall
 * back to a CSS gradient until real images are dropped into
 * `public/images/room-02/` under the filenames below.
 */

export type LocationId = 'lab' | 'control' | 'corridor'

export interface Hotspot {
  id: string
  label: string
  x: number
  y: number
}

export interface RoomLocation {
  id: LocationId
  name: string
  background: string
  entryText: string | null
  hotspots: Hotspot[]
}

export const LOCATIONS: Record<LocationId, RoomLocation> = {
  lab: {
    id: 'lab',
    name: 'Genetics Laboratory',
    background: '/images/room-02/lab_background.jpg',
    entryText: 'Broken glass. Flickering monitors. Whatever happened here, it happened fast.',
    hotspots: [
      { id: 'dnaStation', label: 'DNA Analysis', x: 20, y: 62 },
      { id: 'recording', label: 'Recovered Log', x: 42, y: 38 },
      { id: 'terminal', label: 'Security Terminal', x: 68, y: 58 },
      { id: 'locker', label: 'Storage Locker', x: 85, y: 72 },
      { id: 'footprints', label: 'Claw Marks', x: 12, y: 82 },
      { id: 'equipment', label: 'Wrecked Equipment', x: 55, y: 80 },
    ],
  },
  control: {
    id: 'control',
    name: 'Security Control Room',
    background: '/images/room-02/control_room_background.jpg',
    entryText: "Dozens of monitors. Most are dead. The ones still running aren't showing good news.",
    hotspots: [
      { id: 'statusBoard', label: 'Containment Status', x: 25, y: 40 },
      { id: 'evidenceDesk', label: 'Evidence Terminal', x: 55, y: 55 },
      { id: 'powerRouter', label: 'Power Router', x: 80, y: 68 },
    ],
  },
  corridor: {
    id: 'corridor',
    name: 'Containment Corridor',
    background: '/images/room-02/corridor_background.jpg',
    entryText: null, // shown from Story.corridorEntry at runtime
    hotspots: [
      { id: 'cameraFeed', label: 'Camera Feed', x: 22, y: 32 },
      { id: 'exitDoor', label: 'Emergency Exit', x: 78, y: 55 },
    ],
  },
}

/** Order used for the facility-map nav in the HUD. */
export const LOCATION_ORDER: LocationId[] = ['lab', 'control', 'corridor']
