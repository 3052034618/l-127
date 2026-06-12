import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDraggable,
  useDroppable
} from '@dnd-kit/core'
import dayjs from 'dayjs'
import { v4 as uuidv4 } from 'uuid'
import {
  Button,
  Modal,
  Form,
  Select,
  DatePicker,
  TimePicker,
  Card,
  Row,
  Col,
  Alert,
  Tag,
  Popconfirm,
  message,
  Tabs,
  Empty,
  Space,
  Checkbox,
  Divider,
  Descriptions,
  List,
  Badge,
  Tooltip,
  Table
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  TeamOutlined,
  SwapOutlined
} from '@ant-design/icons'
import { useApp } from '@/store/AppContext'
import {
  formatDateTime,
  formatTime,
  getShiftDurationHours,
  checkShiftOverlap,
  calculateFatigueInfo,
  getTimeSlots,
  calculateComplianceWarnings,
  getNightShiftCount,
  getAvgRestHours
} from '@/utils'
import type { Shift, Incident, ComplianceWarning, ShiftChangeRecord, Crew } from '@/types'

const { Option } = Select
const { RangePicker } = TimePicker
const { RangePicker: DateRangePicker } = DatePicker

const TIME_SCALE = 60
const START_HOUR = 0
const END_HOUR = 24
const SNAP_MINUTES = 15

const SHIFT_TEMPLATES = [
  { id: '4h', name: '4小时一班', hours: 4, description: '标准4小时轮班，适合短航程' },
  { id: '6h', name: '6小时一班', hours: 6, description: '标准6小时轮班，平衡工作与休息' },
  { id: '8h', name: '8小时一班', hours: 8, description: '标准8小时轮班，三班倒模式' },
  { id: '12h', name: '12小时一班', hours: 12, description: '长班次轮班，适合人手紧张' }
]

interface DraggableShiftProps {
  shift: Shift
  onDragStart: (id: string) => void
  onDragEnd: (id: string, deltaX: number) => void
  onResizeStart: (id: string, edge: 'left' | 'right') => void
  onResizeEnd: (id: string, edge: 'left' | 'right', deltaX: number) => void
  onClick: (shift: Shift) => void
  onHandover: (shift: Shift) => void
  incidents: Incident[]
}

const DraggableShift: React.FC<DraggableShiftProps> = ({
  shift,
  onDragStart,
  onDragEnd,
  onResizeStart,
  onResizeEnd,
  onClick,
  onHandover,
  incidents
}) => {
  const { state } = useApp()
  const crew = state.crews.find(c => c.id === shift.crewId)
  const position = state.positions.find(p => p.id === shift.positionId)
  const fatigue = calculateFatigueInfo(
    crew!,
    state.shifts.filter(s => s.voyageId === state.currentVoyageId),
    state.voyages.find(v => v.id === state.currentVoyageId)?.departureTime || ''
  )

  const left = ((dayjs(shift.startTime).hour() + dayjs(shift.startTime).minute() / 60) / 24) * 100
  const width = ((dayjs(shift.endTime).diff(dayjs(shift.startTime), 'minute') / 60) / 24) * 100

  const [isDragging, setIsDragging] = useState(false)
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null)
  const [dragStartX, setDragStartX] = useState(0)
  const [currentLeft, setCurrentLeft] = useState(left)
  const [currentWidth, setCurrentWidth] = useState(width)

  const shiftIncidents = incidents.filter(i => i.shiftId === shift.id)

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'left' | 'right') => {
    e.preventDefault()
    e.stopPropagation()

    if (type === 'move') {
      setIsDragging(true)
      setDragStartX(e.clientX)
      onDragStart(shift.id)
    } else {
      setResizing(type)
      setDragStartX(e.clientX)
      onResizeStart(shift.id, type)
    }
  }

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById('shift-timeline-container')
      if (!container) return

      const containerWidth = container.clientWidth
      const deltaX = e.clientX - dragStartX
      const deltaXPercent = (deltaX / containerWidth) * 100

      if (isDragging) {
        let newLeft = left + deltaXPercent
        newLeft = Math.max(0, Math.min(newLeft, 100 - width))
        setCurrentLeft(newLeft)
      } else if (resizing === 'left') {
        let newLeft = left + deltaXPercent
        let newWidth = width - deltaXPercent
        newLeft = Math.max(0, Math.min(newLeft, left + width - 1))
        newWidth = Math.max(1, Math.min(newWidth, 100 - newLeft))
        setCurrentLeft(newLeft)
        setCurrentWidth(newWidth)
      } else if (resizing === 'right') {
        let newWidth = width + deltaXPercent
        newWidth = Math.max(1, Math.min(newWidth, 100 - left))
        setCurrentWidth(newWidth)
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      const container = document.getElementById('shift-timeline-container')
      if (!container) return

      const containerWidth = container.clientWidth
      const deltaX = e.clientX - dragStartX

      if (isDragging) {
        onDragEnd(shift.id, deltaX)
      } else if (resizing) {
        onResizeEnd(shift.id, resizing, deltaX)
      }

      setIsDragging(false)
      setResizing(null)
      setCurrentLeft(left)
      setCurrentWidth(width)
    }

    if (isDragging || resizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, resizing, dragStartX, left, width, onDragEnd, onResizeEnd, shift.id])

  return (
    <div
      className={`shift-block ${position?.type || 'bridge'} ${isDragging || resizing ? 'dragging' : ''}`}
      style={{
        left: `${currentLeft}%`,
        width: `${Math.max(currentWidth, 2)}%`,
        top: 4,
        bottom: 4,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
      onClick={(e) => {
        e.stopPropagation()
        if (!isDragging && !resizing) {
          onClick(shift)
        }
      }}
      title={`${crew?.name} - ${formatTime(shift.startTime)} ~ ${formatTime(shift.endTime)}`}
    >
      <div
        className="shift-resize-handle left"
        onMouseDown={(e) => handleMouseDown(e, 'left')}
        title="拖动调整开始时间"
      />
      <div style={{ flex: 1, padding: '4px 8px', minWidth: 0 }}>
        <div className="shift-crew">
          {crew?.name}
          {fatigue?.riskLevel === 'high' && <span style={{ marginLeft: 4 }}>⚠️</span>}
          {shiftIncidents.length > 0 && (
            <Badge
              count={shiftIncidents.length}
              size="small"
              style={{ marginLeft: 4 }}
              color={shiftIncidents.some(i => i.status !== 'resolved') ? '#faad14' : '#52c41a'}
            />
          )}
        </div>
        <div className="shift-time">
          {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
        </div>
      </div>
      <div
        className="shift-resize-handle right"
        onMouseDown={(e) => handleMouseDown(e, 'right')}
        title="拖动调整结束时间"
      />
      <Tooltip title="发起交接">
        <Button
          type="text"
          size="small"
          icon={<FileTextOutlined />}
          style={{ padding: '0 4px', height: 'auto' }}
          onClick={(e) => {
            e.stopPropagation()
            onHandover(shift)
          }}
        />
      </Tooltip>
    </div>
  )
}

const ShiftScheduling: React.FC = () => {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [templateForm] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [templateModalVisible, setTemplateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [viewingShift, setViewingShift] = useState<Shift | null>(null)
  const [activeTab, setActiveTab] = useState('bridge')

  const [resizingShift, setResizingShift] = useState<{ id: string; edge: 'left' | 'right' } | null>(null)
  const [previewShift, setPreviewShift] = useState<Shift | null>(null)
  const [conflictWarning, setConflictWarning] = useState<string[]>([])
  const [fatigueWarning, setFatigueWarning] = useState<string[]>([])

  const [templatePreviewVisible, setTemplatePreviewVisible] = useState(false)
  const [previewTemplateShifts, setPreviewTemplateShifts] = useState<Shift[]>([])
  const [previewConflicts, setPreviewConflicts] = useState<string[]>([])
  const [previewFatigueWarnings, setPreviewFatigueWarnings] = useState<string[]>([])
  const [templateConfig, setTemplateConfig] = useState<{
    templateId: string
    crewIds: string[]
    startDate: dayjs.Dayjs
    endDate: dayjs.Dayjs
    startTime: dayjs.Dayjs
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    })
  )

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
  const voyageShifts = state.shifts.filter(s => s.voyageId === state.currentVoyageId)
  const voyageIncidents = state.incidents.filter(i => i.voyageId === state.currentVoyageId)
  const dayShifts = voyageShifts.filter(s => s.date === selectedDate)

  const bridgeCrews = state.crews.filter(c => {
    const pos = state.positions.find(p => p.id === c.positionId)
    return pos?.type === 'bridge'
  })

  const engineCrews = state.crews.filter(c => {
    const pos = state.positions.find(p => p.id === c.positionId)
    return pos?.type === 'engine'
  })

  const fatigueInfoMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateFatigueInfo>>()
    if (currentVoyage) {
      state.crews.forEach(crew => {
        const info = calculateFatigueInfo(crew, voyageShifts, currentVoyage.departureTime)
        map.set(crew.id, info)
      })
    }
    return map
  }, [state.crews, voyageShifts, currentVoyage])

  const complianceWarnings = useMemo<ComplianceWarning[]>(() => {
    if (!currentVoyage) return []
    return calculateComplianceWarnings(
      state.crews,
      voyageShifts,
      state.positions,
      currentVoyage.departureTime,
      currentVoyage.arrivalTime
    )
  }, [state.crews, voyageShifts, state.positions, currentVoyage])

  const voyageChangeRecords = useMemo(() => {
    return state.shiftChangeRecords
      .filter(r => r.voyageId === state.currentVoyageId)
      .sort((a, b) => dayjs(b.operationTime).valueOf() - dayjs(a.operationTime).valueOf())
  }, [state.shiftChangeRecords, state.currentVoyageId])

  const recordShiftChange = (
    operationType: ShiftChangeRecord['operationType'],
    shift: Shift,
    oldShift?: Shift,
    reason?: string
  ) => {
    const record: ShiftChangeRecord = {
      id: uuidv4(),
      voyageId: shift.voyageId,
      shiftId: shift.id,
      operationType,
      oldStartTime: oldShift?.startTime,
      oldEndTime: oldShift?.endTime,
      oldCrewId: oldShift?.crewId,
      newStartTime: shift.startTime,
      newEndTime: shift.endTime,
      newCrewId: shift.crewId,
      operationTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      reason,
      createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
    }
    dispatch({ type: 'ADD_SHIFT_CHANGE', payload: record })
  }

  const batchRecordShiftChanges = (
    operationType: ShiftChangeRecord['operationType'],
    shifts: Shift[],
    reason?: string
  ) => {
    const records: ShiftChangeRecord[] = shifts.map(shift => ({
      id: uuidv4(),
      voyageId: shift.voyageId,
      shiftId: shift.id,
      operationType,
      newStartTime: shift.startTime,
      newEndTime: shift.endTime,
      newCrewId: shift.crewId,
      operationTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      reason,
      createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
    }))
    dispatch({ type: 'BATCH_ADD_SHIFT_CHANGES', payload: records })
  }

  const snapToGrid = (minutes: number): number => {
    return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
  }

  const positionToTime = (position: number) => {
    const totalMinutes = (position / 100) * 24 * 60
    const snappedMinutes = snapToGrid(totalMinutes)
    const hours = Math.floor(snappedMinutes / 60)
    const minutes = snappedMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  const timeToPosition = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number)
    return ((hours + minutes / 60) / 24) * 100
  }

  const validateShiftChange = (shift: Shift, newStartTime: string, newEndTime: string) => {
    const overlaps = checkShiftOverlap(voyageShifts, {
      ...shift,
      startTime: `${selectedDate} ${newStartTime}`,
      endTime: `${selectedDate} ${newEndTime}`,
      date: selectedDate
    })

    const conflicts: string[] = []
    const fatigues: string[] = []

    if (overlaps.length > 0) {
      overlaps.forEach(o => {
        const crew = state.crews.find(c => c.id === o.crewId)
        conflicts.push(`与 ${crew?.name} 的班次 (${formatTime(o.startTime)}-${formatTime(o.endTime)}) 重叠`)
      })
    }

    const duration = getShiftDurationHours(`${selectedDate} ${newStartTime}`, `${selectedDate} ${newEndTime}`)
    if (duration > 8) {
      fatigues.push(`班次时长(${duration.toFixed(1)}小时)超过8小时`)
    }

    const crew = state.crews.find(c => c.id === shift.crewId)
    if (crew) {
      const updatedShifts = voyageShifts.map(s =>
        s.id === shift.id
          ? { ...s, startTime: `${selectedDate} ${newStartTime}`, endTime: `${selectedDate} ${newEndTime}` }
          : s
      )
      const fatigue = calculateFatigueInfo(crew, updatedShifts, currentVoyage?.departureTime || '')
      if (fatigue.riskLevel === 'high') {
        fatigues.push(`${crew.name} 存在高疲劳风险: ${fatigue.warnings[0]}`)
      }
    }

    setConflictWarning(conflicts)
    setFatigueWarning(fatigues)

    return { conflicts, fatigues, hasError: conflicts.length > 0 }
  }

  const handleDragStart = (id: string) => {
    const shift = dayShifts.find(s => s.id === id)
    if (shift) {
      setPreviewShift(shift)
    }
  }

  const handleDragEnd = (id: string, deltaX: number) => {
    const shift = dayShifts.find(s => s.id === id)
    if (!shift) return

    const container = document.getElementById('shift-timeline-container')
    if (!container) return

    const containerWidth = container.clientWidth
    const startPos = timeToPosition(formatTime(shift.startTime))
    const endPos = timeToPosition(formatTime(shift.endTime))
    const width = endPos - startPos

    const deltaXPercent = (deltaX / containerWidth) * 100
    let newStartPos = startPos + deltaXPercent

    newStartPos = Math.max(0, Math.min(newStartPos, 100 - width))
    const newEndPos = newStartPos + width

    const newStartTime = positionToTime(newStartPos)
    const newEndTime = positionToTime(newEndPos)

    const { hasError } = validateShiftChange(shift, newStartTime, newEndTime)

    if (hasError) {
      message.error('调整失败：存在时间重叠')
      setPreviewShift(null)
      return
    }

    if (conflictWarning.length > 0) {
      message.error(conflictWarning[0])
      setPreviewShift(null)
      return
    }

    const fullStart = `${selectedDate} ${newStartTime}`
    const fullEnd = `${selectedDate} ${newEndTime}`

    const duration = getShiftDurationHours(fullStart, fullEnd)
    if (duration > 8) {
      message.warning('班次时长超过8小时，请注意疲劳管理')
    }

    dispatch({
      type: 'UPDATE_SHIFT',
      payload: {
        ...shift,
        startTime: fullStart,
        endTime: fullEnd
      }
    })

    recordShiftChange('drag', { ...shift, startTime: fullStart, endTime: fullEnd }, shift, '拖拽调整班次时间')

    const crew = state.crews.find(c => c.id === shift.crewId)
    const fatigue = fatigueInfoMap.get(shift.crewId)
    if (fatigue && fatigue.riskLevel === 'high') {
      message.warning(`${crew?.name} 存在高疲劳风险`)
    }

    message.success('班次已更新')
    setPreviewShift(null)
    setConflictWarning([])
    setFatigueWarning([])
  }

  const handleResizeStart = (id: string, edge: 'left' | 'right') => {
    setResizingShift({ id, edge })
    const shift = dayShifts.find(s => s.id === id)
    if (shift) {
      setPreviewShift(shift)
    }
  }

  const handleResizeEnd = (id: string, edge: 'left' | 'right', deltaX: number) => {
    const shift = dayShifts.find(s => s.id === id)
    if (!shift) return

    const container = document.getElementById('shift-timeline-container')
    if (!container) return

    const containerWidth = container.clientWidth
    const startPos = timeToPosition(formatTime(shift.startTime))
    const endPos = timeToPosition(formatTime(shift.endTime))
    const width = endPos - startPos

    const deltaXPercent = (deltaX / containerWidth) * 100

    let newStartTime: string
    let newEndTime: string

    if (edge === 'left') {
      let newStartPos = startPos + deltaXPercent
      let newWidth = width - deltaXPercent
      newStartPos = Math.max(0, Math.min(newStartPos, startPos + width - 1))
      newWidth = Math.max(1, Math.min(newWidth, 100 - newStartPos))
      newStartTime = positionToTime(newStartPos)
      newEndTime = positionToTime(newStartPos + newWidth)
    } else {
      let newWidth = width + deltaXPercent
      newWidth = Math.max(1, Math.min(newWidth, 100 - startPos))
      newStartTime = formatTime(shift.startTime)
      newEndTime = positionToTime(startPos + newWidth)
    }

    const { hasError } = validateShiftChange(shift, newStartTime, newEndTime)

    if (hasError) {
      message.error('调整失败：存在时间重叠')
      setPreviewShift(null)
      setResizingShift(null)
      return
    }

    const fullStart = `${selectedDate} ${newStartTime}`
    const fullEnd = `${selectedDate} ${newEndTime}`

    const duration = getShiftDurationHours(fullStart, fullEnd)
    if (duration > 8) {
      message.warning('班次时长超过8小时，请注意疲劳管理')
    }

    dispatch({
      type: 'UPDATE_SHIFT',
      payload: {
        ...shift,
        startTime: fullStart,
        endTime: fullEnd
      }
    })

    recordShiftChange('drag', { ...shift, startTime: fullStart, endTime: fullEnd }, shift, '拖拽调整班次时长')

    message.success('班次已更新')
    setPreviewShift(null)
    setResizingShift(null)
    setConflictWarning([])
    setFatigueWarning([])
  }

  const handleAddShift = (crewId: string, positionId: string) => {
    setEditingShift(null)
    form.resetFields()
    form.setFieldsValue({
      crewId,
      positionId,
      date: dayjs(selectedDate),
      timeRange: [dayjs(`${selectedDate} 08:00`), dayjs(`${selectedDate} 12:00`)]
    })
    setModalVisible(true)
  }

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift)
    form.setFieldsValue({
      crewId: shift.crewId,
      positionId: shift.positionId,
      date: dayjs(shift.date),
      timeRange: [dayjs(shift.startTime), dayjs(shift.endTime)]
    })
    setModalVisible(true)
  }

  const handleViewShift = (shift: Shift) => {
    setViewingShift(shift)
    setDetailModalVisible(true)
  }

  const handleHandoverFromShift = (shift: Shift) => {
    const handoverRecords = state.handoverRecords.filter(h => h.voyageId === state.currentVoyageId)

    const nextShift = voyageShifts
      .filter(s =>
        s.crewId !== shift.crewId &&
        s.positionId === shift.positionId &&
        dayjs(s.startTime).isAfter(dayjs(shift.startTime))
      )
      .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())[0]

    const lastHandover = handoverRecords
      .filter(h => h.toCrewId === shift.crewId)
      .sort((a, b) => dayjs(b.handoverTime).valueOf() - dayjs(a.handoverTime).valueOf())[0]

    const pendingTasks = lastHandover?.pendingTasks || ''

    const params = new URLSearchParams({
      shiftId: shift.id,
      fromCrewId: shift.crewId,
      toCrewId: nextShift?.crewId || '',
      startTime: shift.startTime,
      endTime: shift.endTime,
      pendingTasks: pendingTasks
    })

    navigate(`/handover?${params.toString()}`)
  }

  const handleDeleteShift = (id: string) => {
    const shift = voyageShifts.find(s => s.id === id)
    if (shift) {
      recordShiftChange('delete', shift, shift, '删除班次')
    }
    dispatch({ type: 'DELETE_SHIFT', payload: id })
    message.success('班次已删除')
  }

  const handleSubmit = () => {
    form.validateFields().then(values => {
      const [startTime, endTime] = values.timeRange || []
      if (!startTime || !endTime) {
        message.error('请选择班次时间')
        return
      }

      const fullStart = startTime.format('YYYY-MM-DD HH:mm')
      const fullEnd = endTime.format('YYYY-MM-DD HH:mm')
      const date = values.date.format('YYYY-MM-DD')

      const duration = getShiftDurationHours(fullStart, fullEnd)
      if (duration <= 0) {
        message.error('结束时间必须晚于开始时间')
        return
      }

      const shiftData = {
        voyageId: state.currentVoyageId!,
        crewId: values.crewId,
        positionId: values.positionId,
        startTime: fullStart,
        endTime: fullEnd,
        date
      }

      const overlaps = checkShiftOverlap(voyageShifts, {
        ...shiftData,
        id: editingShift?.id || ''
      })

      if (overlaps.length > 0) {
        message.error('该时间段与现有班次重叠')
        return
      }

      if (duration > 8) {
        message.warning('班次时长超过8小时，请注意疲劳管理')
      }

      if (editingShift) {
        const updatedShift = { ...editingShift, ...shiftData }
        dispatch({
          type: 'UPDATE_SHIFT',
          payload: updatedShift
        })
        recordShiftChange('manual_edit', updatedShift, editingShift, '手工编辑班次')
        message.success('班次已更新')
      } else {
        const newShift = {
          ...shiftData,
          id: uuidv4(),
          createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
        }
        dispatch({
          type: 'ADD_SHIFT',
          payload: newShift
        })
        recordShiftChange('add', newShift, undefined, '手工添加班次')
        message.success('班次已添加')
      }

      setModalVisible(false)
    })
  }

  const generateTemplateShifts = () => {
    templateForm.validateFields().then(values => {
      const { templateId, crewIds, startDate, endDate, startTime } = values

      if (!crewIds || crewIds.length === 0) {
        message.error('请至少选择一名船员')
        return
      }

      const template = SHIFT_TEMPLATES.find(t => t.id === templateId)
      if (!template) return

      const start = dayjs(startDate)
      const end = dayjs(endDate)
      const startHour = dayjs(startTime).hour()
      const startMin = dayjs(startTime).minute()

      const newShifts: Shift[] = []
      const conflicts: string[] = []
      const fatigueWarnings: string[] = []

      let currentDate = start.clone()
      while (currentDate.isBefore(end) || currentDate.isSame(end, 'day')) {
        crewIds.forEach((crewId: string, crewIndex: number) => {
          const crew = state.crews.find(c => c.id === crewId)
          const position = state.positions.find(p => p.id === crew?.positionId)
          if (!crew || !position) return

          const offsetHours = crewIndex * template.hours
          let shiftStart = currentDate.clone().hour(startHour).minute(startMin).add(offsetHours, 'hour')

          while (shiftStart.date() === currentDate.date()) {
            const shiftEnd = shiftStart.clone().add(template.hours, 'hour')

            const shiftData = {
              id: uuidv4(),
              voyageId: state.currentVoyageId!,
              crewId,
              positionId: crew.positionId,
              startTime: shiftStart.format('YYYY-MM-DD HH:mm'),
              endTime: shiftEnd.format('YYYY-MM-DD HH:mm'),
              date: currentDate.format('YYYY-MM-DD'),
              createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
            }

            const overlaps = checkShiftOverlap([...voyageShifts, ...newShifts], shiftData)
            if (overlaps.length > 0) {
              conflicts.push(`${currentDate.format('MM-DD')} ${crew.name} 与现有班次重叠`)
            } else {
              const testShifts = [...voyageShifts, ...newShifts, shiftData]
              const fatigue = calculateFatigueInfo(crew, testShifts, currentVoyage?.departureTime || '')
              if (fatigue.riskLevel === 'high') {
                fatigueWarnings.push(`${currentDate.format('MM-DD')} ${crew.name}: ${fatigue.warnings[0]}`)
              }
              newShifts.push(shiftData)
            }

            shiftStart = shiftStart.add(template.hours * crewIds.length, 'hour')
          }
        })

        currentDate = currentDate.add(1, 'day')
      }

      setPreviewTemplateShifts(newShifts)
      setPreviewConflicts(conflicts)
      setPreviewFatigueWarnings(fatigueWarnings)
      setTemplateConfig({ templateId, crewIds, startDate, endDate, startTime })
      setTemplateModalVisible(false)
      setTemplatePreviewVisible(true)
    })
  }

  const confirmGenerateTemplate = () => {
    const validShifts = previewTemplateShifts.filter(s => {
      const overlaps = checkShiftOverlap(voyageShifts, s)
      return overlaps.length === 0
    })

    validShifts.forEach(s => {
      dispatch({ type: 'ADD_SHIFT', payload: s })
    })

    if (validShifts.length > 0) {
      batchRecordShiftChanges('batch_template', validShifts, `轮班模板生成(${templateConfig?.templateId || ''})`)
    }

    const skipped = previewTemplateShifts.length - validShifts.length
    if (skipped > 0) {
      message.success(`成功生成 ${validShifts.length} 个班次，跳过 ${skipped} 个冲突班次`)
    } else {
      message.success(`成功生成 ${validShifts.length} 个班次`)
    }

    setTemplatePreviewVisible(false)
    setPreviewTemplateShifts([])
    setPreviewConflicts([])
    setPreviewFatigueWarnings([])
    setTemplateConfig(null)
  }

  const cancelTemplatePreview = () => {
    setTemplatePreviewVisible(false)
    setPreviewTemplateShifts([])
    setPreviewConflicts([])
    setPreviewFatigueWarnings([])
    setTemplateConfig(null)
  }

  const highRiskCrews = Array.from(fatigueInfoMap.values()).filter(f => f.riskLevel === 'high')

  const renderShiftBlock = (shift: Shift) => (
    <DraggableShift
      key={shift.id}
      shift={shift}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onResizeStart={handleResizeStart}
      onResizeEnd={handleResizeEnd}
      onClick={handleViewShift}
      onHandover={handleHandoverFromShift}
      incidents={voyageIncidents}
    />
  )

  const renderCrewRow = (crew: typeof state.crews[0]) => {
    const position = state.positions.find(p => p.id === crew.positionId)
    const crewShifts = dayShifts.filter(s => s.crewId === crew.id)
    const fatigue = fatigueInfoMap.get(crew.id)

    return (
      <div key={crew.id} className="timeline-row" style={{ gridTemplateColumns: '180px 1fr' }}>
        <div className="crew-label" onClick={() => handleAddShift(crew.id, crew.positionId)}>
          <span
            className={`position-badge ${position?.type || 'bridge'}`}
          >
            {crew.position}
          </span>
          <span>{crew.name}</span>
          {fatigue && fatigue.riskLevel !== 'low' && (
            <span className={`risk-tag ${fatigue.riskLevel}`} style={{ marginLeft: 'auto' }}>
              {fatigue.riskLevel === 'high' ? '高风险' : '中风险'}
            </span>
          )}
        </div>
        <div style={{ position: 'relative', minHeight: 50 }}>
          {crewShifts.map(shift => renderShiftBlock(shift))}
        </div>
      </div>
    )
  }

  const renderTimelineHeader = () => {
    const hours = getTimeSlots(START_HOUR, END_HOUR, 1)
    return (
      <div className="timeline-header" style={{ gridTemplateColumns: '180px 1fr' }}>
        <div style={{ padding: '8px' }}>船员</div>
        <div style={{ position: 'relative', height: 40 }}>
          {hours.map((hour, index) => (
            <div
              key={hour}
              style={{
                position: 'absolute',
                left: `${(index / hours.length) * 100}%`,
                top: 12,
                fontSize: 11,
                color: '#999',
                transform: 'translateX(-50%)'
              }}
            >
              {hour}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderGridLines = () => {
    const lines = []
    for (let i = 0; i <= 24; i++) {
      lines.push(
        <div
          key={`hour-${i}`}
          className="timeline-hour-marker"
          style={{ left: `${(i / 24) * 100}%` }}
        />
      )
    }
    for (let i = 0; i <= 24 * 4; i++) {
      if (i % 4 !== 0) {
        lines.push(
          <div
            key={`quarter-${i}`}
            style={{
              position: 'absolute',
              left: `${(i / (24 * 4)) * 100}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: '#f0f0f0',
              zIndex: 0
            }}
          />
        )
      }
    }
    return lines
  }

  const renderFatigueWarnings = () => {
    if (highRiskCrews.length === 0 && conflictWarning.length === 0 && fatigueWarning.length === 0) return null

    return (
      <div style={{ marginBottom: 16 }}>
        {highRiskCrews.length > 0 && (
          <Alert
            message="疲劳风险预警"
            description={
              <div>
                {highRiskCrews.map(fatigue => (
                  <div key={fatigue.crewId} style={{ marginTop: 4 }}>
                    <strong>{fatigue.crewName}</strong>：
                    {fatigue.warnings.join('；')}
                  </div>
                ))}
              </div>
            }
            type="error"
            showIcon
            style={{ marginBottom: 8 }}
          />
        )}
        {conflictWarning.length > 0 && (
          <Alert
            message="时间冲突警告"
            description={conflictWarning.map((w, i) => <div key={i}>{w}</div>)}
            type="error"
            showIcon
            style={{ marginBottom: 8 }}
          />
        )}
        {fatigueWarning.length > 0 && conflictWarning.length === 0 && (
          <Alert
            message="疲劳警告"
            description={fatigueWarning.map((w, i) => <div key={i}>{w}</div>)}
            type="warning"
            showIcon
          />
        )}
      </div>
    )
  }

  if (!state.currentVoyageId || !currentVoyage) {
    return (
      <div className="page-container">
        <Empty description="请先在航次看板中选择一个航次" />
      </div>
    )
  }

  const tabItems = [
    {
      key: 'bridge',
      label: (
        <span>
          <Tag color="blue">驾驶台</Tag> 值班编排
        </span>
      ),
      children: (
        <div id="shift-timeline-container" className="timeline-body">
          {renderTimelineHeader()}
          <div style={{ position: 'relative' }}>
            {renderGridLines()}
            {bridgeCrews.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">👥</div>
                <div className="empty-text">暂无驾驶台船员，请先在船员管理中添加</div>
              </div>
            ) : (
              bridgeCrews.map(crew => renderCrewRow(crew))
            )}
          </div>
        </div>
      )
    },
    {
      key: 'engine',
      label: (
        <span>
          <Tag color="orange">机舱</Tag> 值班编排
        </span>
      ),
      children: (
        <div id="shift-timeline-container" className="timeline-body">
          {renderTimelineHeader()}
          <div style={{ position: 'relative' }}>
            {renderGridLines()}
            {engineCrews.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">👥</div>
                <div className="empty-text">暂无机舱船员，请先在船员管理中添加</div>
              </div>
            ) : (
              engineCrews.map(crew => renderCrewRow(crew))
            )}
          </div>
        </div>
      )
    },
    {
      key: 'fatigue',
      label: (
        <span>
          <WarningOutlined /> 疲劳监控
        </span>
      ),
      children: (
        <div>
          <Row gutter={[16, 16]}>
            {state.crews.map(crew => {
              const fatigue = fatigueInfoMap.get(crew.id)
              if (!fatigue) return null
              return (
                <Col xs={24} md={12} lg={8} key={crew.id}>
                  <Card
                    size="small"
                    title={
                      <Space>
                        <span>{crew.name}</span>
                        <span className={`risk-tag ${fatigue.riskLevel}`}>
                          {fatigue.riskLevel === 'low' ? '正常' :
                           fatigue.riskLevel === 'medium' ? '中风险' : '高风险'}
                        </span>
                      </Space>
                    }
                    extra={<Tag>{crew.position}</Tag>}
                  >
                    <Row gutter={[8, 8]}>
                      <Col span={12}>
                        <div style={{ fontSize: 12, color: '#999' }}>总工作时长</div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>{fatigue.totalHours}h</div>
                      </Col>
                      <Col span={12}>
                        <div style={{ fontSize: 12, color: '#999' }}>最长连续</div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>{fatigue.continuousHours}h</div>
                      </Col>
                      <Col span={12}>
                        <div style={{ fontSize: 12, color: '#999' }}>休息时长</div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>{fatigue.restHours}h</div>
                      </Col>
                      <Col span={12}>
                        <div style={{ fontSize: 12, color: '#999' }}>班次数量</div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>{fatigue.shiftCount}</div>
                      </Col>
                    </Row>
                    {fatigue.warnings.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
                        {fatigue.warnings.map((warning, i) => (
                          <div key={i} style={{ fontSize: 12, color: '#f5222d' }}>
                            <WarningOutlined style={{ marginRight: 4 }} />
                            {warning}
                          </div>
                        ))}
                      </div>
                    )}
                    {fatigue.warnings.length === 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0', fontSize: 12, color: '#52c41a' }}>
                        <CheckCircleOutlined style={{ marginRight: 4 }} />
                        疲劳状态良好
                      </div>
                    )}
                  </Card>
                </Col>
              )
            })}
          </Row>
        </div>
      )
    },
    {
      key: 'compliance',
      label: (
        <span>
          <CheckCircleOutlined /> 合规检查
        </span>
      ),
      children: (
        <div>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#f5222d' }}>
                  {complianceWarnings.filter(w => w.level === 'error').length}
                </div>
                <div className="stat-label">严重问题</div>
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#faad14' }}>
                  {complianceWarnings.filter(w => w.level === 'warning').length}
                </div>
                <div className="stat-label">警告提示</div>
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="stat-card">
                <div className="stat-value">
                  {complianceWarnings.filter(w => w.type === 'continuous').length}
                </div>
                <div className="stat-label">超长连续值班</div>
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="stat-card">
                <div className="stat-value">
                  {complianceWarnings.filter(w => w.type === 'rest').length}
                </div>
                <div className="stat-label">休息间隔不足</div>
              </div>
            </Col>
          </Row>

          <Card title="合规检查清单" size="small">
            {complianceWarnings.length === 0 ? (
              <Empty description="排班合规，无违规项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={complianceWarnings}
                renderItem={(warning) => (
                  <List.Item
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (warning.shiftId) {
                        const shift = voyageShifts.find(s => s.id === warning.shiftId)
                        if (shift) {
                          setSelectedDate(shift.date)
                          const crew = state.crews.find(c => c.id === shift.crewId)
                          const pos = state.positions.find(p => p.id === shift.positionId)
                          if (pos?.type === 'engine') {
                            setActiveTab('engine')
                          } else {
                            setActiveTab('bridge')
                          }
                          setViewingShift(shift)
                          setDetailModalVisible(true)
                          return
                        }
                      }
                      if (warning.date) {
                        setSelectedDate(warning.date)
                        if (warning.type === 'position_coverage') {
                          setActiveTab('bridge')
                        } else {
                          const crew = state.crews.find(c => c.id === warning.crewId)
                          const pos = state.positions.find(p => p.id === crew?.positionId)
                          setActiveTab(pos?.type === 'engine' ? 'engine' : 'bridge')
                        }
                        message.info(`已定位到 ${warning.date}，船员：${warning.crewName}`)
                      }
                    }}
                  >
                    <List.Item.Meta
                      avatar={
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: warning.level === 'error' ? '#fff1f0' : '#fffbe6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: warning.level === 'error' ? '#f5222d' : '#faad14',
                          fontSize: 16
                        }}>
                          {warning.level === 'error' ? '✕' : '!'}
                        </div>
                      }
                      title={
                        <Space>
                          <span style={{ color: warning.level === 'error' ? '#f5222d' : '#faad14', fontWeight: 500 }}>
                            {warning.message}
                          </span>
                          {warning.date && (
                            <Tag color="blue">{warning.date}</Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                            {warning.crewName} · {
                              warning.type === 'continuous' ? '连续值班' :
                              warning.type === 'rest' ? '休息间隔' :
                              warning.type === 'night_shift' ? '夜班次数' : '岗位覆盖'
                            }
                          </div>
                          {warning.detail && (
                            <div style={{ fontSize: 12, color: '#666' }}>{warning.detail}</div>
                          )}
                        </div>
                      }
                    />
                    <Tag style={{ cursor: 'pointer', color: '#1677ff' }}>
                      点击定位
                    </Tag>
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Card title="船员值班统计" size="small" style={{ marginTop: 16 }}>
            <Table
              size="small"
              dataSource={state.crews}
              rowKey="id"
              pagination={false}
              columns={[
                {
                  title: '船员',
                  dataIndex: 'name',
                  key: 'name',
                  width: 100
                },
                {
                  title: '岗位',
                  dataIndex: 'position',
                  key: 'position',
                  width: 100
                },
                {
                  title: '总班次',
                  key: 'shiftCount',
                  width: 80,
                  render: (_: unknown, record: Crew) => {
                    const shifts = voyageShifts.filter(s => s.crewId === record.id)
                    return shifts.length
                  }
                },
                {
                  title: '总工时',
                  key: 'totalHours',
                  width: 100,
                  render: (_: unknown, record: Crew) => {
                    const shifts = voyageShifts.filter(s => s.crewId === record.id)
                    const total = shifts.reduce((sum, s) => sum + getShiftDurationHours(s.startTime, s.endTime), 0)
                    return `${total.toFixed(1)}h`
                  }
                },
                {
                  title: '夜班次数',
                  key: 'nightShifts',
                  width: 100,
                  render: (_: unknown, record: Crew) => {
                    const shifts = voyageShifts.filter(s => s.crewId === record.id)
                    return getNightShiftCount(shifts)
                  }
                },
                {
                  title: '平均休息',
                  key: 'avgRest',
                  width: 100,
                  render: (_: unknown, record: Crew) => {
                    const shifts = voyageShifts.filter(s => s.crewId === record.id)
                    const avg = getAvgRestHours(shifts)
                    return avg > 0 ? `${avg.toFixed(1)}h` : '-'
                  }
                },
                {
                  title: '疲劳风险',
                  key: 'fatigue',
                  width: 100,
                  render: (_: unknown, record: Crew) => {
                    const fatigue = fatigueInfoMap.get(record.id)
                    if (!fatigue) return <Tag color="default">未评估</Tag>
                    return (
                      <Tag color={fatigue.riskLevel === 'low' ? 'green' : fatigue.riskLevel === 'medium' ? 'gold' : 'red'}>
                        {fatigue.riskLevel === 'low' ? '正常' : fatigue.riskLevel === 'medium' ? '中风险' : '高风险'}
                      </Tag>
                    )
                  }
                }
              ]}
            />
          </Card>
        </div>
      )
    },
    {
      key: 'changes',
      label: (
        <span>
          <FileTextOutlined /> 排班变更记录
        </span>
      ),
      children: (
        <div>
          <Card title="排班变更历史" size="small">
            {voyageChangeRecords.length === 0 ? (
              <Empty description="暂无排班变更记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                size="small"
                dataSource={voyageChangeRecords}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: '操作类型',
                    dataIndex: 'operationType',
                    key: 'operationType',
                    width: 100,
                    render: (type: string) => {
                      const typeMap: Record<string, { label: string; color: string }> = {
                        drag: { label: '拖拽调整', color: 'blue' },
                        batch_template: { label: '模板生成', color: 'purple' },
                        manual_edit: { label: '手工编辑', color: 'geekblue' },
                        add: { label: '新增班次', color: 'green' },
                        delete: { label: '删除班次', color: 'red' }
                      }
                      const config = typeMap[type] || { label: type, color: 'default' }
                      return <Tag color={config.color}>{config.label}</Tag>
                    }
                  },
                  {
                    title: '船员',
                    key: 'crew',
                    width: 100,
                    render: (_: unknown, record: ShiftChangeRecord) => {
                      const crewId = record.newCrewId || record.oldCrewId
                      const crew = state.crews.find(c => c.id === crewId)
                      return crew?.name || '-'
                    }
                  },
                  {
                    title: '原时间',
                    key: 'oldTime',
                    width: 180,
                    render: (_: unknown, record: ShiftChangeRecord) => {
                      if (!record.oldStartTime || !record.oldEndTime) return '-'
                      return `${formatTime(record.oldStartTime)} - ${formatTime(record.oldEndTime)}`
                    }
                  },
                  {
                    title: '新时间',
                    key: 'newTime',
                    width: 180,
                    render: (_: unknown, record: ShiftChangeRecord) => {
                      if (!record.newStartTime || !record.newEndTime) return '-'
                      return `${formatTime(record.newStartTime)} - ${formatTime(record.newEndTime)}`
                    }
                  },
                  {
                    title: '操作时间',
                    dataIndex: 'operationTime',
                    key: 'operationTime',
                    width: 160,
                    render: (time: string) => formatDateTime(time)
                  },
                  {
                    title: '变更原因',
                    dataIndex: 'reason',
                    key: 'reason',
                    render: (reason?: string) => reason || '-'
                  }
                ]}
              />
            )}
          </Card>
        </div>
      )
    }
  ]

  const currentCrews = activeTab === 'bridge' ? bridgeCrews : engineCrews
  const shiftIncidents = viewingShift ? voyageIncidents.filter(i => i.shiftId === viewingShift.id) : []

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">班次编排</h2>
        <Space>
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) => date && setSelectedDate(date.format('YYYY-MM-DD'))}
            style={{ width: 180 }}
          />
          <Button
            icon={<SwapOutlined />}
            onClick={() => {
              templateForm.resetFields()
              templateForm.setFieldsValue({
                templateId: '6h',
                startDate: dayjs(),
                endDate: dayjs().add(7, 'day'),
                startTime: dayjs('2024-01-01 08:00'),
                crewIds: currentCrews.map(c => c.id)
              })
              setTemplateModalVisible(true)
            }}
          >
            轮班模板
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleAddShift(currentCrews[0]?.id || '', currentCrews[0]?.positionId || '')}
            disabled={state.crews.length === 0}
          >
            添加班次
          </Button>
        </Space>
      </div>

      {renderFatigueWarnings()}

      <Card>
        <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} />
      </Card>

      <Modal
        title={editingShift ? '编辑班次' : '添加班次'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={500}
        footer={
          <Space>
            {editingShift && (
              <Popconfirm
                title="确定删除此班次吗？"
                onConfirm={() => {
                  handleDeleteShift(editingShift.id)
                  setModalVisible(false)
                }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            )}
            <Button onClick={() => setModalVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>确定</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="date"
            label="日期"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="crewId"
            label="船员"
            rules={[{ required: true, message: '请选择船员' }]}
          >
            <Select placeholder="请选择船员">
              {state.crews.map(crew => (
                <Option key={crew.id} value={crew.id}>
                  {crew.name} - {crew.position}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="positionId"
            label="岗位"
            rules={[{ required: true, message: '请选择岗位' }]}
          >
            <Select placeholder="请选择岗位">
              {state.positions.map(position => (
                <Option key={position.id} value={position.id}>
                  {position.name} ({position.type === 'bridge' ? '驾驶台' : '机舱'})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="timeRange"
            label="值班时间"
            rules={[{ required: true, message: '请选择值班时间' }]}
          >
            <RangePicker
              format="HH:mm"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量生成轮班"
        open={templateModalVisible}
        onOk={generateTemplateShifts}
        onCancel={() => setTemplateModalVisible(false)}
        width={600}
        okText="生成班次"
      >
        <Form form={templateForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="templateId"
                label="轮班模板"
                rules={[{ required: true, message: '请选择模板' }]}
              >
                <Select placeholder="请选择模板">
                  {SHIFT_TEMPLATES.map(template => (
                    <Option key={template.id} value={template.id}>
                      {template.name} ({template.hours}小时)
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="startTime"
                label="每日首班开始时间"
                rules={[{ required: true, message: '请选择开始时间' }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="crewIds"
            label="参与轮班船员（按顺序轮班）"
            rules={[{ required: true, message: '请至少选择一名船员' }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <Row gutter={[8, 8]}>
                {currentCrews.map(crew => (
                  <Col span={12} key={crew.id}>
                    <Checkbox value={crew.id}>
                      <Badge
                        status={fatigueInfoMap.get(crew.id)?.riskLevel === 'high' ? 'error' :
                                fatigueInfoMap.get(crew.id)?.riskLevel === 'medium' ? 'warning' : 'success'}
                      />
                      {crew.name} - {crew.position}
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>
          <Form.Item
            label="生成日期范围"
            required
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item
                name="startDate"
                noStyle
                rules={[{ required: true, message: '请选择开始日期' }]}
              >
                <DatePicker style={{ width: '48%' }} placeholder="开始日期" />
              </Form.Item>
              <span style={{ padding: '0 8px' }}>至</span>
              <Form.Item
                name="endDate"
                noStyle
                rules={[{ required: true, message: '请选择结束日期' }]}
              >
                <DatePicker style={{ width: '48%' }} placeholder="结束日期" />
              </Form.Item>
            </Space>
          </Form.Item>
          <Divider style={{ margin: '12px 0' }} />
          <Alert
            message="生成说明"
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>系统将按照选择的模板和船员顺序自动生成班次</li>
                <li>例如：4小时一班 + 3名船员，将生成 8:00-12:00(船员1), 12:00-16:00(船员2), 16:00-20:00(船员3)...</li>
                <li>生成前会自动检测时间重叠和疲劳风险</li>
                <li>时间以15分钟为单位自动吸附</li>
              </ul>
            }
            type="info"
            showIcon
          />
        </Form>
      </Modal>

      <Modal
        title="轮班模板预览"
        open={templatePreviewVisible}
        onOk={confirmGenerateTemplate}
        onCancel={cancelTemplatePreview}
        width={700}
        okText="确认生成"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Tag color="green">共生成 {previewTemplateShifts.length} 个班次</Tag>
            {previewConflicts.length > 0 && (
              <Tag color="red">冲突 {previewConflicts.length} 处</Tag>
            )}
            {previewFatigueWarnings.length > 0 && (
              <Tag color="gold">疲劳警告 {previewFatigueWarnings.length} 处</Tag>
            )}
          </Space>
        </div>

        {(previewConflicts.length > 0 || previewFatigueWarnings.length > 0) && (
          <Alert
            message="注意事项"
            description={
              <div>
                {previewConflicts.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ color: '#f5222d', fontWeight: 600, margin: '0 0 4px 0' }}>
                      时间冲突 ({previewConflicts.length}处)：
                    </p>
                    <ul style={{ color: '#f5222d', margin: 0, paddingLeft: 20 }}>
                      {previewConflicts.slice(0, 5).map((c, i) => <li key={i}>{c}</li>)}
                      {previewConflicts.length > 5 && <li>...还有 {previewConflicts.length - 5} 处冲突</li>}
                    </ul>
                    <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>冲突的班次将自动跳过</p>
                  </div>
                )}
                {previewFatigueWarnings.length > 0 && (
                  <div>
                    <p style={{ color: '#faad14', fontWeight: 600, margin: '0 0 4px 0' }}>
                      疲劳警告 ({previewFatigueWarnings.length}处)：
                    </p>
                    <ul style={{ color: '#faad14', margin: 0, paddingLeft: 20 }}>
                      {previewFatigueWarnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                      {previewFatigueWarnings.length > 5 && <li>...还有 {previewFatigueWarnings.length - 5} 处警告</li>}
                    </ul>
                  </div>
                )}
              </div>
            }
            type={previewConflicts.length > 0 ? 'error' : 'warning'}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Card title="生成预览" size="small" style={{ maxHeight: 300, overflow: 'auto' }}>
          <Table
            size="small"
            dataSource={previewTemplateShifts.slice(0, 20)}
            rowKey="id"
            pagination={false}
            columns={[
              {
                title: '日期',
                dataIndex: 'date',
                key: 'date',
                width: 100
              },
              {
                title: '船员',
                key: 'crew',
                width: 100,
                render: (_: unknown, record: Shift) => {
                  const crew = state.crews.find(c => c.id === record.crewId)
                  return crew?.name || '-'
                }
              },
              {
                title: '岗位',
                key: 'position',
                width: 100,
                render: (_: unknown, record: Shift) => {
                  const pos = state.positions.find(p => p.id === record.positionId)
                  return pos?.name || '-'
                }
              },
              {
                title: '值班时间',
                key: 'time',
                render: (_: unknown, record: Shift) => (
                  <span>{formatTime(record.startTime)} - {formatTime(record.endTime)}</span>
                )
              }
            ]}
          />
          {previewTemplateShifts.length > 20 && (
            <div style={{ textAlign: 'center', padding: '8px 0', color: '#999', fontSize: 12 }}>
              还有 {previewTemplateShifts.length - 20} 个班次未显示...
            </div>
          )}
        </Card>
      </Modal>

      <Modal
        title="班次详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          <Space>
            <Button onClick={() => {
              setDetailModalVisible(false)
              if (viewingShift) handleEditShift(viewingShift)
            }}>
              编辑班次
            </Button>
            <Button type="primary" onClick={() => setDetailModalVisible(false)}>
              关闭
            </Button>
          </Space>
        }
        width={700}
      >
        {viewingShift && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="船员">
                {state.crews.find(c => c.id === viewingShift.crewId)?.name}
              </Descriptions.Item>
              <Descriptions.Item label="岗位">
                {state.positions.find(p => p.id === viewingShift.positionId)?.name}
              </Descriptions.Item>
              <Descriptions.Item label="日期">{viewingShift.date}</Descriptions.Item>
              <Descriptions.Item label="值班时间">
                {formatTime(viewingShift.startTime)} - {formatTime(viewingShift.endTime)}
              </Descriptions.Item>
              <Descriptions.Item label="时长" span={2}>
                {getShiftDurationHours(viewingShift.startTime, viewingShift.endTime).toFixed(1)} 小时
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">关联异常事件</Divider>
            {shiftIncidents.length === 0 ? (
              <Empty description="暂无关联事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={shiftIncidents}
                renderItem={(incident) => (
                  <List.Item
                    actions={[
                      <Tag key="status" color={
                        incident.status === 'resolved' ? 'success' :
                        incident.status === 'processing' ? 'processing' : 'warning'
                      }>
                        {incident.status === 'resolved' ? '已解决' :
                         incident.status === 'processing' ? '处理中' : '待处理'}
                      </Tag>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <Badge status={
                          incident.level === 'severe' ? 'error' :
                          incident.level === 'moderate' ? 'warning' : 'default'
                        } />
                      }
                      title={
                        <Space>
                          <span>{incident.title}</span>
                          <Tag color={
                            incident.type === 'safety' ? 'red' :
                            incident.type === 'equipment' ? 'orange' :
                            incident.type === 'navigation' ? 'blue' : 'default'
                          }>
                            {incident.type === 'safety' ? '安全' :
                             incident.type === 'equipment' ? '设备' :
                             incident.type === 'navigation' ? '航行' : '其他'}
                          </Tag>
                        </Space>
                      }
                      description={
                        <div>
                          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                            {formatDateTime(incident.reportedTime)}
                          </div>
                          <div style={{ fontSize: 13 }}>{incident.description}</div>
                          {incident.resolution && (
                            <div style={{ fontSize: 12, color: '#52c41a', marginTop: 4 }}>
                              <CheckCircleOutlined style={{ marginRight: 4 }} />
                              处理结果：{incident.resolution}
                            </div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ShiftScheduling
