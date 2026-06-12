import dayjs from 'dayjs'
import { v4 as uuidv4 } from 'uuid'
import type { Shift, Crew, FatigueInfo, ComplianceWarning, Position } from '@/types'

export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export function formatDate(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD')
}

export function formatTime(date: string | Date): string {
  return dayjs(date).format('HH:mm')
}

export function getShiftDurationHours(startTime: string, endTime: string): number {
  const start = dayjs(startTime)
  const end = dayjs(endTime)
  return end.diff(start, 'minute') / 60
}

export function calculateFatigueInfo(
  crew: Crew,
  shifts: Shift[],
  voyageStart: string
): FatigueInfo {
  const crewShifts = shifts
    .filter(s => s.crewId === crew.id)
    .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())

  let totalHours = 0
  let maxContinuousHours = 0
  let currentContinuous = 0
  let lastEndTime: dayjs.Dayjs | null = null
  let restHours = 0

  const voyageStartObj = dayjs(voyageStart)
  const now = dayjs()

  for (const shift of crewShifts) {
    const start = dayjs(shift.startTime)
    const end = dayjs(shift.endTime)
    const duration = end.diff(start, 'minute') / 60

    totalHours += duration

    if (lastEndTime && start.diff(lastEndTime, 'minute') <= 30) {
      currentContinuous += duration
    } else {
      if (lastEndTime) {
        restHours += start.diff(lastEndTime, 'minute') / 60
      }
      currentContinuous = duration
    }

    maxContinuousHours = Math.max(maxContinuousHours, currentContinuous)
    lastEndTime = end
  }

  const totalVoyageHours = now.diff(voyageStartObj, 'minute') / 60
  const availableRestHours = Math.max(0, totalVoyageHours - totalHours)
  restHours = Math.max(restHours, availableRestHours * 0.6)

  const warnings: string[] = []
  let riskLevel: 'low' | 'medium' | 'high' = 'low'

  if (maxContinuousHours > 8) {
    warnings.push(`连续工作时长 ${maxContinuousHours.toFixed(1)} 小时，超过8小时上限`)
    riskLevel = 'high'
  } else if (maxContinuousHours > 6) {
    warnings.push(`连续工作时长 ${maxContinuousHours.toFixed(1)} 小时，接近8小时上限`)
    riskLevel = riskLevel === 'low' ? 'medium' : riskLevel
  }

  const dailyHours = totalHours / Math.max(1, totalVoyageHours / 24)
  if (dailyHours > 12) {
    warnings.push(`日均工作时长 ${dailyHours.toFixed(1)} 小时，超过12小时上限`)
    riskLevel = 'high'
  } else if (dailyHours > 10) {
    warnings.push(`日均工作时长 ${dailyHours.toFixed(1)} 小时，接近12小时上限`)
    riskLevel = riskLevel === 'low' ? 'medium' : riskLevel
  }

  if (restHours < totalHours * 0.5) {
    warnings.push('休息时间不足工作时间的50%')
    riskLevel = riskLevel === 'low' ? 'medium' : riskLevel
  }

  return {
    crewId: crew.id,
    crewName: crew.name,
    totalHours: parseFloat(totalHours.toFixed(1)),
    continuousHours: parseFloat(maxContinuousHours.toFixed(1)),
    restHours: parseFloat(restHours.toFixed(1)),
    shiftCount: crewShifts.length,
    riskLevel,
    warnings
  }
}

export function checkShiftOverlap(
  shifts: Shift[],
  newShift: Omit<Shift, 'createdAt'>
): Shift[] {
  const newStart = dayjs(newShift.startTime).valueOf()
  const newEnd = dayjs(newShift.endTime).valueOf()

  return shifts.filter(s => {
    if (newShift.id && s.id === newShift.id) return false
    if (s.crewId !== newShift.crewId) return false
    if (s.positionId !== newShift.positionId) return false

    const start = dayjs(s.startTime).valueOf()
    const end = dayjs(s.endTime).valueOf()

    return (newStart < end && newEnd > start)
  })
}

export function getTimeSlots(startHour = 0, endHour = 24, step = 1): string[] {
  const slots: string[] = []
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += step * 60) {
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return slots
}

const NIGHT_SHIFT_START = 22
const NIGHT_SHIFT_END = 6
const MAX_CONTINUOUS_HOURS = 8
const MIN_REST_HOURS = 10

export function calculateComplianceWarnings(
  crews: Crew[],
  shifts: Shift[],
  positions: Position[],
  voyageStart: string,
  voyageEnd?: string
): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = []

  for (const crew of crews) {
    const crewShifts = shifts
      .filter(s => s.crewId === crew.id)
      .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())

    if (crewShifts.length === 0) continue

    let nightShiftCount = 0

    for (let i = 0; i < crewShifts.length; i++) {
      const shift = crewShifts[i]
      const startHour = dayjs(shift.startTime).hour()
      const endHour = dayjs(shift.endTime).hour()
      const duration = getShiftDurationHours(shift.startTime, shift.endTime)

      const isNightShift = startHour >= NIGHT_SHIFT_START || startHour < NIGHT_SHIFT_END ||
                           endHour > NIGHT_SHIFT_START || endHour <= NIGHT_SHIFT_END
      if (isNightShift && duration >= 4) {
        nightShiftCount++
      }

      if (duration > MAX_CONTINUOUS_HOURS) {
        warnings.push({
          id: uuidv4(),
          type: 'continuous',
          crewId: crew.id,
          crewName: crew.name,
          level: 'error',
          message: `单班工作时长 ${duration.toFixed(1)} 小时，超过 ${MAX_CONTINUOUS_HOURS} 小时上限`,
          date: shift.date,
          shiftId: shift.id,
          detail: `${formatTime(shift.startTime)} - ${formatTime(shift.endTime)}`
        })
      }

      if (i > 0) {
        const prevShift = crewShifts[i - 1]
        const restDuration = dayjs(shift.startTime).diff(dayjs(prevShift.endTime), 'minute') / 60

        if (restDuration < MIN_REST_HOURS) {
          warnings.push({
            id: uuidv4(),
            type: 'rest',
            crewId: crew.id,
            crewName: crew.name,
            level: 'error',
            message: `休息间隔仅 ${restDuration.toFixed(1)} 小时，不足 ${MIN_REST_HOURS} 小时`,
            date: shift.date,
            shiftId: shift.id,
            detail: `上一班 ${formatTime(prevShift.endTime)} 结束，本班 ${formatTime(shift.startTime)} 开始`
          })
        }
      }
    }

    if (nightShiftCount > 3) {
      warnings.push({
        id: uuidv4(),
        type: 'night_shift',
        crewId: crew.id,
        crewName: crew.name,
        level: 'warning',
        message: `累计夜班 ${nightShiftCount} 次，超过建议的3次`,
        date: crewShifts[crewShifts.length - 1]?.date,
        detail: '建议适当安排休息以恢复体力'
      })
    }
  }

  const dateSet = new Set(shifts.map(s => s.date))
  const dates = Array.from(dateSet).sort()

  for (const date of dates) {
    const dayShifts = shifts.filter(s => s.date === date)
    const coveredPositions = new Set(dayShifts.map(s => s.positionId))

    for (const position of positions) {
      if (!coveredPositions.has(position.id)) {
        warnings.push({
          id: uuidv4(),
          type: 'position_coverage',
          crewId: '',
          crewName: position.name,
          level: 'warning',
          message: `${date} ${position.name} 岗位无人值班`,
          date: date,
          detail: `请安排船员值${position.type === 'bridge' ? '驾驶台' : '机舱'}班`
        })
      }
    }
  }

  return warnings.sort((a, b) => {
    const levelOrder = { error: 0, warning: 1 }
    if (levelOrder[a.level] !== levelOrder[b.level]) {
      return levelOrder[a.level] - levelOrder[b.level]
    }
    return (b.date || '').localeCompare(a.date || '')
  })
}

export function getNightShiftCount(shifts: Shift[]): number {
  let count = 0
  for (const shift of shifts) {
    const startHour = dayjs(shift.startTime).hour()
    const endHour = dayjs(shift.endTime).hour()
    const duration = getShiftDurationHours(shift.startTime, shift.endTime)
    const isNightShift = startHour >= NIGHT_SHIFT_START || startHour < NIGHT_SHIFT_END ||
                         endHour > NIGHT_SHIFT_START || endHour <= NIGHT_SHIFT_END
    if (isNightShift && duration >= 4) {
      count++
    }
  }
  return count
}

export function getAvgRestHours(shifts: Shift[]): number {
  const sorted = [...shifts].sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())
  if (sorted.length <= 1) return 0

  let totalRest = 0
  for (let i = 1; i < sorted.length; i++) {
    totalRest += dayjs(sorted[i].startTime).diff(dayjs(sorted[i - 1].endTime), 'minute') / 60
  }
  return totalRest / (sorted.length - 1)
}
