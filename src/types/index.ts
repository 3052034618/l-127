export type PositionType = 'bridge' | 'engine'

export interface Position {
  id: string
  name: string
  type: PositionType
  description?: string
  createdAt: string
}

export interface Crew {
  id: string
  name: string
  position: string
  positionId: string
  phone?: string
  remark?: string
  createdAt: string
}

export interface Voyage {
  id: string
  name: string
  vesselName: string
  departurePort: string
  arrivalPort: string
  departureTime: string
  arrivalTime?: string
  status: 'pending' | 'ongoing' | 'completed'
  description?: string
  createdAt: string
}

export interface Shift {
  id: string
  voyageId: string
  crewId: string
  positionId: string
  startTime: string
  endTime: string
  date: string
  createdAt: string
}

export interface HandoverRecord {
  id: string
  voyageId: string
  shiftId: string
  fromCrewId: string
  toCrewId: string
  handoverTime: string
  speed: string
  weather: string
  channelNotes: string
  equipmentStatus: string
  pendingTasks: string
  remark?: string
  createdAt: string
}

export interface Incident {
  id: string
  voyageId: string
  shiftId?: string
  crewId?: string
  title: string
  description: string
  type: 'safety' | 'equipment' | 'navigation' | 'other'
  level: 'minor' | 'moderate' | 'severe'
  status: 'pending' | 'processing' | 'resolved'
  images: { name: string; dataUrl: string }[]
  resolution?: string
  reportedTime: string
  resolvedTime?: string
  createdAt: string
}

export interface FatigueInfo {
  crewId: string
  crewName: string
  totalHours: number
  continuousHours: number
  restHours: number
  shiftCount: number
  riskLevel: 'low' | 'medium' | 'high'
  warnings: string[]
}

export type ChangeOperationType = 'drag' | 'batch_template' | 'manual_edit' | 'delete' | 'add'

export interface ShiftChangeRecord {
  id: string
  voyageId: string
  shiftId: string
  operationType: ChangeOperationType
  oldStartTime?: string
  oldEndTime?: string
  oldCrewId?: string
  newStartTime?: string
  newEndTime?: string
  newCrewId?: string
  operationTime: string
  operator?: string
  reason?: string
  createdAt: string
}

export interface ComplianceWarning {
  id: string
  type: 'continuous' | 'rest' | 'night_shift' | 'position_coverage'
  crewId: string
  crewName: string
  level: 'warning' | 'error'
  message: string
  date?: string
  shiftId?: string
  detail?: string
}
