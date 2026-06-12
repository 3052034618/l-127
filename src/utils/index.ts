import dayjs from 'dayjs'
import type { Shift, Crew, FatigueInfo } from '@/types'

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
