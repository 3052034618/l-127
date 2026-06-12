import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Row,
  Col,
  Table,
  Tag,
  Tabs,
  Empty,
  Space,
  message,
  Alert,
  DatePicker,
  Select,
  Form,
  Descriptions,
  Input,
  Timeline,
  Modal
} from 'antd'
import {
  ExportOutlined,
  FileExcelOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  SwapOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  AlertOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { useApp } from '@/store/AppContext'
import {
  formatDateTime,
  formatDate,
  formatTime,
  calculateFatigueInfo,
  getShiftDurationHours
} from '@/utils'
import type { FatigueInfo, ShiftChangeRecord, Shift, Incident, HandoverRecord } from '@/types'

const { RangePicker } = DatePicker
const { Option } = Select

const Reports: React.FC = () => {
  const { state } = useApp()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState('summary')
  const [shiftDateRange, setShiftDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [handoverDateRange, setHandoverDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [shiftCrewFilter, setShiftCrewFilter] = useState<string[]>([])
  const [handoverCrewFilter, setHandoverCrewFilter] = useState<string[]>([])
  const [fatigueRiskFilter, setFatigueRiskFilter] = useState<string>('all')
  const [exporting, setExporting] = useState(false)
  const [archivePreviewVisible, setArchivePreviewVisible] = useState(false)

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
  const voyageShifts = state.shifts.filter(s => s.voyageId === state.currentVoyageId)
  const voyageRecords = state.handoverRecords.filter(h => h.voyageId === state.currentVoyageId)
  const voyageIncidents = state.incidents.filter(i => i.voyageId === state.currentVoyageId)

  const getCrewName = (crewId: string) => {
    return state.crews.find(c => c.id === crewId)?.name || '未知'
  }

  const getPositionName = (positionId: string) => {
    return state.positions.find(p => p.id === positionId)?.name || '未知'
  }

  const getPositionType = (positionId: string) => {
    return state.positions.find(p => p.id === positionId)?.type || 'bridge'
  }

  const taskContentMatch = (a: string, b: string): boolean => {
    const normalize = (s: string) => {
      let result = s.toLowerCase()
      result = result.replace(/[完成已处理解决关闭\s]/g, '')
      return result.substring(0, Math.min(result.length, 15))
    }
    const na = normalize(a)
    const nb = normalize(b)
    if (na === nb) return true
    if (na.includes(nb) || nb.includes(na)) return true
    if (na.length >= 4 && nb.length >= 4) {
      let matchCount = 0
      for (let i = 0; i < na.length - 1; i++) {
        if (nb.includes(na.substring(i, i + 2))) matchCount++
      }
      if (matchCount >= Math.min(na.length, nb.length) * 0.4) return true
    }
    return false
  }

  const isTaskCompletedInLaterHandover = (taskContent: string, sourceRecordId: string, records: HandoverRecord[]): boolean => {
    const sourceRecord = records.find(r => r.id === sourceRecordId)
    if (!sourceRecord) return false
    const sourceTime = dayjs(sourceRecord.handoverTime)
    const laterRecords = records.filter(r => dayjs(r.handoverTime).isAfter(sourceTime))
    for (const later of laterRecords) {
      if (!later.pendingTasks || !later.pendingTasks.trim() || later.pendingTasks === '无') continue
      const lines = later.pendingTasks.split('\n').filter(l => l.trim())
      for (const line of lines) {
        if (taskContentMatch(line.trim(), taskContent)) {
          const lower = line.trim().toLowerCase()
          if (lower.includes('完成') || lower.includes('已处理') || lower.includes('已解决') || lower.includes('关闭')) {
            return true
          }
        }
      }
    }
    return false
  }

  const filteredShifts = useMemo(() => {
    let result = [...voyageShifts]
    if (shiftDateRange) {
      result = result.filter(s => {
        const shiftDate = dayjs(s.date)
        return shiftDate.isAfter(shiftDateRange[0].startOf('day')) &&
               shiftDate.isBefore(shiftDateRange[1].endOf('day'))
      })
    }
    if (shiftCrewFilter.length > 0) {
      result = result.filter(s => shiftCrewFilter.includes(s.crewId))
    }
    return result.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())
  }, [voyageShifts, shiftDateRange, shiftCrewFilter])

  const filteredRecords = useMemo(() => {
    let result = [...voyageRecords]
    if (handoverDateRange) {
      result = result.filter(h => {
        const recordDate = dayjs(h.handoverTime)
        return recordDate.isAfter(handoverDateRange[0].startOf('day')) &&
               recordDate.isBefore(handoverDateRange[1].endOf('day'))
      })
    }
    if (handoverCrewFilter.length > 0) {
      result = result.filter(h =>
        handoverCrewFilter.includes(h.fromCrewId) || handoverCrewFilter.includes(h.toCrewId)
      )
    }
    return result.sort((a, b) => dayjs(a.handoverTime).valueOf() - dayjs(b.handoverTime).valueOf())
  }, [voyageRecords, handoverDateRange, handoverCrewFilter])

  const fatigueInfoList = useMemo((): FatigueInfo[] => {
    if (!currentVoyage) return []
    let result = state.crews.map(crew =>
      calculateFatigueInfo(crew, voyageShifts, currentVoyage.departureTime)
    ).sort((a, b) => {
      const levelOrder = { high: 0, medium: 1, low: 2 }
      return levelOrder[a.riskLevel] - levelOrder[b.riskLevel]
    })
    if (fatigueRiskFilter !== 'all') {
      result = result.filter(f => f.riskLevel === fatigueRiskFilter)
    }
    return result
  }, [state.crews, voyageShifts, currentVoyage, fatigueRiskFilter])

  const voyageChangeRecords = useMemo<ShiftChangeRecord[]>(() => {
    return state.shiftChangeRecords
      .filter(r => r.voyageId === state.currentVoyageId)
      .sort((a, b) => dayjs(b.operationTime).valueOf() - dayjs(a.operationTime).valueOf())
  }, [state.shiftChangeRecords, state.currentVoyageId])

  const pendingTaskStats = useMemo(() => {
    const allTasks: { content: string; status: 'pending' | 'completed'; sourceTime: string; completedTime?: string }[] = []

    voyageRecords.forEach(record => {
      if (record.pendingTasks && record.pendingTasks.trim() && record.pendingTasks !== '无') {
        const lines = record.pendingTasks.split('\n').filter(l => l.trim())
        lines.forEach(line => {
          const lowerLine = line.toLowerCase()
          const isCompleted = lowerLine.includes('完成') || lowerLine.includes('已处理') ||
                             lowerLine.includes('已解决') || lowerLine.includes('关闭')
          allTasks.push({
            content: line.trim(),
            status: isCompleted ? 'completed' : 'pending',
            sourceTime: record.handoverTime,
            completedTime: isCompleted ? record.handoverTime : undefined
          })
        })
      }
    })

    const pending = allTasks.filter(t => t.status === 'pending').length
    const completed = allTasks.filter(t => t.status === 'completed').length
    const total = allTasks.length
    const closeRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0'

    return { total, pending, completed, closeRate, tasks: allTasks }
  }, [voyageRecords])

  const incidentStats = useMemo(() => {
    const resolved = voyageIncidents.filter(i => i.status === 'resolved')
    const processing = voyageIncidents.filter(i => i.status === 'processing')
    const pending = voyageIncidents.filter(i => i.status === 'pending')

    let avgResolveHours = 0
    const resolvedWithTime = resolved.filter(i => i.resolvedTime)
    if (resolvedWithTime.length > 0) {
      const totalHours = resolvedWithTime.reduce((sum, i) => {
        const hours = dayjs(i.resolvedTime).diff(dayjs(i.reportedTime), 'minute') / 60
        return sum + hours
      }, 0)
      avgResolveHours = totalHours / resolvedWithTime.length
    }

    return {
      total: voyageIncidents.length,
      pending: pending.length,
      processing: processing.length,
      resolved: resolved.length,
      avgResolveHours: avgResolveHours.toFixed(1),
      severeCount: voyageIncidents.filter(i => i.level === 'severe').length
    }
  }, [voyageIncidents])

  type LedgerEvent = {
    id: string
    type: 'shift_change' | 'handover' | 'incident' | 'pending_task'
    time: string
    title: string
    description: string
    color: string
    icon: React.ReactNode
    linkTo?: string
    rawRecord?: ShiftChangeRecord | HandoverRecord | Incident
  }

  const ledgerTimeline = useMemo<LedgerEvent[]>(() => {
    const events: LedgerEvent[] = []

    voyageChangeRecords.forEach(r => {
      const typeMap: Record<string, { text: string; color: string }> = {
        drag: { text: '拖拽调整', color: 'blue' },
        batch_template: { text: '模板生成', color: 'green' },
        manual_edit: { text: '手工编辑', color: 'geekblue' },
        add: { text: '新增班次', color: 'cyan' },
        delete: { text: '删除班次', color: 'red' }
      }
      const info = typeMap[r.operationType] || { text: r.operationType, color: 'default' }
      const crewName = getCrewName(r.newCrewId || r.oldCrewId || '')
      events.push({
        id: r.id,
        type: 'shift_change',
        time: r.operationTime,
        title: `排班变更 · ${info.text}`,
        description: `${crewName}${r.oldStartTime ? `：${formatTime(r.oldStartTime)}-${formatTime(r.oldEndTime!)} → ${formatTime(r.newStartTime!)}-${formatTime(r.newEndTime!)}` : ''}${r.reason ? `（${r.reason}）` : ''}`,
        color: info.color,
        icon: <SwapOutlined />,
        linkTo: `/shifts?date=${dayjs(r.operationTime).format('YYYY-MM-DD')}`,
        rawRecord: r
      })
    })

    voyageRecords.forEach(h => {
      const fromName = getCrewName(h.fromCrewId)
      const toName = getCrewName(h.toCrewId)
      events.push({
        id: h.id,
        type: 'handover',
        time: h.handoverTime,
        title: '交接记录',
        description: `${fromName} → ${toName} | 航速${h.speed}节 | ${h.weather}`,
        color: 'purple',
        icon: <FileTextOutlined />,
        linkTo: `/handover?highlight=${h.id}`,
        rawRecord: h
      })

      if (h.pendingTasks && h.pendingTasks.trim() && h.pendingTasks !== '无') {
        const lines = h.pendingTasks.split('\n').filter(l => l.trim())
        lines.forEach((line, idx) => {
          const isCompleted = isTaskCompletedInLaterHandover(line.trim(), h.id, voyageRecords)
          events.push({
            id: `${h.id}-task-${idx}`,
            type: 'pending_task',
            time: h.handoverTime,
            title: isCompleted ? '待办已闭环' : '待办未闭环',
            description: line.trim(),
            color: isCompleted ? 'green' : 'orange',
            icon: isCompleted ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />,
            linkTo: `/handover?highlight=${h.id}`,
          })
        })
      }
    })

    voyageIncidents.forEach(i => {
      const levelMap: Record<string, { text: string; color: string }> = {
        minor: { text: '轻微', color: 'green' },
        moderate: { text: '一般', color: 'orange' },
        severe: { text: '严重', color: 'red' }
      }
      const info = levelMap[i.level] || { text: i.level, color: 'default' }
      const statusText = i.status === 'resolved' ? '已解决' : i.status === 'processing' ? '处理中' : '待处理'
      events.push({
        id: i.id,
        type: 'incident',
        time: i.reportedTime,
        title: `异常事件 · ${info.text}`,
        description: `${i.title}（${statusText}）`,
        color: info.color,
        icon: <AlertOutlined />,
        linkTo: `/incidents?highlight=${i.id}`,
        rawRecord: i
      })
    })

    return events.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
  }, [voyageChangeRecords, voyageRecords, voyageIncidents, state.crews])

  const pendingTaskChainStats = useMemo(() => {
    const taskMap = new Map<string, { content: string; firstRecordId: string; firstTime: string; closedByRecordId?: string; closedTime?: string }>()

    const sortedRecords = [...voyageRecords].sort((a, b) => dayjs(a.handoverTime).valueOf() - dayjs(b.handoverTime).valueOf())

    sortedRecords.forEach(record => {
      if (!record.pendingTasks || !record.pendingTasks.trim() || record.pendingTasks === '无') return
      const lines = record.pendingTasks.split('\n').filter(l => l.trim())
      lines.forEach(line => {
        const trimmed = line.trim()
        const lowerLine = trimmed.toLowerCase()
        const isCompleted = lowerLine.includes('完成') || lowerLine.includes('已处理') ||
                           lowerLine.includes('已解决') || lowerLine.includes('关闭')

        let matched = false
        for (const [key, val] of taskMap) {
          if (taskContentMatch(val.content, trimmed)) {
            if (isCompleted && !val.closedByRecordId) {
              val.closedByRecordId = record.id
              val.closedTime = record.handoverTime
            }
            matched = true
            break
          }
        }

        if (!matched) {
          const key = `${record.id}-${trimmed.substring(0, 20)}`
          if (!taskMap.has(key)) {
            taskMap.set(key, {
              content: trimmed,
              firstRecordId: record.id,
              firstTime: record.handoverTime,
              closedByRecordId: isCompleted ? record.id : undefined,
              closedTime: isCompleted ? record.handoverTime : undefined
            })
          }
        }
      })
    })

    const chains = Array.from(taskMap.values())
    const total = chains.length
    const closed = chains.filter(c => c.closedByRecordId).length
    const closeRate = total > 0 ? ((closed / total) * 100).toFixed(1) : '0'

    return { total, closed, closeRate, chains }
  }, [voyageRecords])

  const createWorksheet = (data: any[], cols: number[], sheetName: string, wb: XLSX.WorkBook) => {
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = cols.map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  const buildShiftExportData = () => filteredShifts.map(s => ({
    '日期': s.date,
    '岗位': getPositionName(s.positionId),
    '岗位类型': getPositionType(s.positionId) === 'bridge' ? '驾驶台' : '机舱',
    '船员': getCrewName(s.crewId),
    '开始时间': formatTime(s.startTime),
    '结束时间': formatTime(s.endTime),
    '时长(小时)': getShiftDurationHours(s.startTime, s.endTime).toFixed(1)
  }))

  const buildHandoverExportData = () => filteredRecords.map(h => ({
    '交接时间': formatDateTime(h.handoverTime),
    '岗位': getPositionName(voyageShifts.find(s => s.id === h.shiftId)?.positionId || ''),
    '交班人': getCrewName(h.fromCrewId),
    '接班人': getCrewName(h.toCrewId),
    '航速(节)': h.speed,
    '天气': h.weather,
    '航道提示': h.channelNotes,
    '设备状态': h.equipmentStatus,
    '未完成事项': h.pendingTasks,
    '备注': h.remark || ''
  }))

  const buildFatigueExportData = () => fatigueInfoList.map(f => ({
    '船员': f.crewName,
    '总工作时长(小时)': f.totalHours,
    '最长连续工作(小时)': f.continuousHours,
    '休息时长(小时)': f.restHours,
    '班次数量': f.shiftCount,
    '风险等级': f.riskLevel === 'low' ? '低' : f.riskLevel === 'medium' ? '中' : '高',
    '预警信息': f.warnings.join('；')
  }))

  const buildIncidentExportData = () => voyageIncidents
    .sort((a, b) => dayjs(a.reportedTime).valueOf() - dayjs(b.reportedTime).valueOf())
    .map(i => ({
      '标题': i.title,
      '类型': i.type === 'safety' ? '安全事故' : i.type === 'equipment' ? '设备故障' :
              i.type === 'navigation' ? '航行异常' : '其他',
      '级别': i.level === 'minor' ? '轻微' : i.level === 'moderate' ? '一般' : '严重',
      '状态': i.status === 'pending' ? '待处理' : i.status === 'processing' ? '处理中' : '已解决',
      '报告时间': formatDateTime(i.reportedTime),
      '关联人员': getCrewName(i.crewId || ''),
      '关联班次': voyageShifts.find(s => s.id === i.shiftId)
        ? `${formatTime(voyageShifts.find(s => s.id === i.shiftId)!.startTime)} - ${formatTime(voyageShifts.find(s => s.id === i.shiftId)!.endTime)}`
        : '',
      '描述': i.description,
      '处理结果': i.resolution || '',
      '解决时间': i.resolvedTime ? formatDateTime(i.resolvedTime) : '',
      '处理耗时(小时)': i.resolvedTime
        ? (dayjs(i.resolvedTime).diff(dayjs(i.reportedTime), 'minute') / 60).toFixed(2)
        : ''
    }))

  const buildChangeRecordsExportData = () => voyageChangeRecords.map(r => {
    const typeMap: Record<string, string> = {
      drag: '拖拽调整',
      batch_template: '模板生成',
      manual_edit: '手工编辑',
      add: '新增班次',
      delete: '删除班次'
    }
    return {
      '操作类型': typeMap[r.operationType] || r.operationType,
      '船员': getCrewName(r.newCrewId || r.oldCrewId || ''),
      '原开始时间': r.oldStartTime ? formatDateTime(r.oldStartTime) : '-',
      '原结束时间': r.oldEndTime ? formatDateTime(r.oldEndTime) : '-',
      '新开始时间': r.newStartTime ? formatDateTime(r.newStartTime) : '-',
      '新结束时间': r.newEndTime ? formatDateTime(r.newEndTime) : '-',
      '操作时间': formatDateTime(r.operationTime),
      '变更原因': r.reason || ''
    }
  })

  const buildPendingTasksExportData = () => pendingTaskStats.tasks.map(t => ({
    '事项内容': t.content,
    '状态': t.status === 'pending' ? '待处理' : '已完成',
    '首次提出时间': formatDateTime(t.sourceTime),
    '关闭时间': t.completedTime ? formatDateTime(t.completedTime) : '-'
  }))

  const buildReviewSummaryExportData = () => [{
    '航次名称': currentVoyage?.name || '',
    '总班次': voyageShifts.length,
    '总交接记录': voyageRecords.length,
    '总异常事件': voyageIncidents.length,
    '排班调整次数': voyageChangeRecords.length,
    '待办事项总数': pendingTaskChainStats.total,
    '已闭环待办': pendingTaskChainStats.closed,
    '待办闭环率(%)': pendingTaskChainStats.closeRate,
    '异常事件总数': incidentStats.total,
    '已解决事件': incidentStats.resolved,
    '平均解决耗时(小时)': incidentStats.avgResolveHours,
    '严重事件数': incidentStats.severeCount,
    '高风险船员数': fatigueInfoList.filter(f => f.riskLevel === 'high').length,
    '中风险船员数': fatigueInfoList.filter(f => f.riskLevel === 'medium').length
  }]

  const buildLedgerExportData = () => ledgerTimeline.map(e => ({
    '时间': formatDateTime(e.time),
    '类型': e.type === 'shift_change' ? '排班变更' :
            e.type === 'handover' ? '交接记录' :
            e.type === 'incident' ? '异常事件' : '待办事项',
    '标题': e.title,
    '详情': e.description
  }))

  const buildIncidentImageExportData = () => {
    const rows: { '异常事件': string; '级别': string; '图片名称': string; '图片数量': string }[] = []
    voyageIncidents.forEach(i => {
      if (i.images && i.images.length > 0) {
        i.images.forEach(img => {
          rows.push({
            '异常事件': i.title,
            '级别': i.level === 'minor' ? '轻微' : i.level === 'moderate' ? '一般' : '严重',
            '图片名称': img.name,
            '图片数量': `${i.images.length}`
          })
        })
      }
    })
    if (rows.length === 0) {
      voyageIncidents.forEach(i => {
        rows.push({
          '异常事件': i.title,
          '级别': i.level === 'minor' ? '轻微' : i.level === 'moderate' ? '一般' : '严重',
          '图片名称': i.images && i.images.length > 0 ? `${i.images.length}张附件` : '无图片',
          '图片数量': `${i.images?.length || 0}`
        })
      })
    }
    return rows
  }

  const buildPendingTaskChainExportData = () => pendingTaskChainStats.chains.map(c => ({
    '事项内容': c.content,
    '首次提出时间': formatDateTime(c.firstTime),
    '闭环状态': c.closedByRecordId ? '已闭环' : '未闭环',
    '闭环时间': c.closedTime ? formatDateTime(c.closedTime) : '-'
  }))

  const buildSummaryExportData = () => [{
    '航次名称': currentVoyage?.name || '',
    '船舶名称': currentVoyage?.vesselName || '',
    '航线': `${currentVoyage?.departurePort || ''} → ${currentVoyage?.arrivalPort || ''}`,
    '出发时间': currentVoyage?.departureTime ? formatDateTime(currentVoyage.departureTime) : '',
    '预计到达': currentVoyage?.arrivalTime ? formatDateTime(currentVoyage.arrivalTime) : '未设置',
    '船员人数': state.crews.length,
    '总班次': voyageShifts.length,
    '交接记录': voyageRecords.length,
    '异常事件': voyageIncidents.length,
    '高风险人数': fatigueInfoList.filter(f => f.riskLevel === 'high').length,
    '中风险人数': fatigueInfoList.filter(f => f.riskLevel === 'medium').length,
    '低风险人数': fatigueInfoList.filter(f => f.riskLevel === 'low').length
  }]

  const handleExport = async (exportType: 'all' | 'shifts' | 'handover' | 'fatigue' | 'review' | 'archive') => {
    if (!currentVoyage) {
      message.error('请先选择航次')
      return
    }

    if (exportType === 'shifts' && filteredShifts.length === 0) {
      message.warning('当前筛选条件下没有可导出的值班数据')
      return
    }
    if (exportType === 'handover' && filteredRecords.length === 0) {
      message.warning('当前筛选条件下没有可导出的交接记录')
      return
    }
    if (exportType === 'fatigue' && fatigueInfoList.length === 0) {
      message.warning('当前筛选条件下没有可导出的疲劳数据')
      return
    }
    if (exportType === 'review' && voyageChangeRecords.length === 0 && pendingTaskStats.total === 0 && voyageIncidents.length === 0) {
      message.warning('当前航次没有可复盘的数据')
      return
    }

    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()

      if (exportType === 'all') {
        createWorksheet(buildSummaryExportData(),
          [15, 15, 25, 20, 20, 10, 10, 12, 10, 12, 12, 12], '航次摘要', wb)
        createWorksheet(buildShiftExportData(),
          [12, 12, 10, 12, 10, 10, 12], '值班表', wb)
        createWorksheet(buildHandoverExportData(),
          [18, 12, 10, 10, 10, 8, 30, 30, 30, 20], '交接记录', wb)
        createWorksheet(buildFatigueExportData(),
          [12, 16, 18, 14, 10, 10, 40], '疲劳风险', wb)
        createWorksheet(buildIncidentExportData(),
          [20, 10, 8, 10, 18, 10, 18, 40, 40, 18, 15], '异常事件', wb)
      } else if (exportType === 'shifts') {
        createWorksheet(buildShiftExportData(),
          [12, 12, 10, 12, 10, 10, 12], '值班表', wb)
      } else if (exportType === 'handover') {
        createWorksheet(buildHandoverExportData(),
          [18, 12, 10, 10, 10, 8, 30, 30, 30, 20], '交接记录', wb)
      } else if (exportType === 'fatigue') {
        createWorksheet(buildFatigueExportData(),
          [12, 16, 18, 14, 10, 10, 40], '疲劳风险', wb)
      } else if (exportType === 'review') {
        createWorksheet(buildReviewSummaryExportData(),
          [15, 10, 12, 12, 12, 12, 12, 12, 12, 12, 15, 10, 12, 12], '复盘总览', wb)
        createWorksheet(buildChangeRecordsExportData(),
          [12, 10, 18, 18, 18, 18, 18, 30], '排班变更记录', wb)
        createWorksheet(buildPendingTaskChainExportData(),
          [50, 20, 10, 20], '待办闭环跟踪', wb)
        createWorksheet(buildLedgerExportData(),
          [20, 12, 20, 50], '复盘台账', wb)
        createWorksheet(buildIncidentExportData(),
          [20, 10, 8, 10, 18, 10, 18, 40, 40, 18, 15], '异常事件处理', wb)
      } else if (exportType === 'archive') {
        createWorksheet(buildSummaryExportData(),
          [15, 15, 25, 20, 20, 10, 10, 12, 10, 12, 12, 12], '航次摘要', wb)
        createWorksheet(buildShiftExportData(),
          [12, 12, 10, 12, 10, 10, 12], '值班表', wb)
        createWorksheet(buildHandoverExportData(),
          [18, 12, 10, 10, 10, 8, 30, 30, 30, 20], '交接摘要', wb)
        createWorksheet(buildIncidentImageExportData(),
          [30, 10, 30, 10], '异常图片清单', wb)
        createWorksheet(buildLedgerExportData(),
          [20, 12, 20, 50], '复盘台账', wb)
        createWorksheet(buildPendingTaskChainExportData(),
          [50, 20, 10, 20], '待办闭环跟踪', wb)
        createWorksheet(buildFatigueExportData(),
          [12, 16, 18, 14, 10, 10, 40], '疲劳风险', wb)
      }

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })

      const typeNames: Record<string, string> = {
        all: '完整报表',
        shifts: '值班表',
        handover: '交接记录',
        fatigue: '疲劳报告',
        review: '航次复盘',
        archive: '归档包'
      }

      const fileName = exportType === 'archive'
        ? `${currentVoyage.name}_归档包_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
        : `${currentVoyage.name}_${typeNames[exportType]}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`

      const result = await window.electronAPI.saveFile({
        fileName,
        content: wbout
      })

      if (result.success) {
        const countText = exportType === 'shifts' ? `${filteredShifts.length}条记录`
          : exportType === 'handover' ? `${filteredRecords.length}条记录`
          : exportType === 'fatigue' ? `${fatigueInfoList.length}条记录`
          : exportType === 'review' ? '复盘报表'
          : exportType === 'archive' ? '归档包'
          : '全部数据'
        message.success(`${typeNames[exportType]}已导出到：${result.path}（${countText}）`)
      } else {
        message.info('已取消导出')
      }
    } catch (e) {
      console.error('Export error:', e)
      message.error('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const shiftColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (date: string) => formatDate(date)
    },
    {
      title: '岗位',
      dataIndex: 'positionId',
      key: 'position',
      width: 100,
      render: (positionId: string) => {
        const type = getPositionType(positionId)
        return (
          <Tag className={`position-badge ${type}`}>
            {getPositionName(positionId)}
          </Tag>
        )
      }
    },
    {
      title: '船员',
      dataIndex: 'crewId',
      key: 'crew',
      width: 100,
      render: (crewId: string) => getCrewName(crewId)
    },
    {
      title: '值班时间',
      key: 'time',
      width: 180,
      render: (_: unknown, record: typeof voyageShifts[0]) => (
        <span>
          {formatTime(record.startTime)} - {formatTime(record.endTime)}
        </span>
      )
    },
    {
      title: '时长',
      key: 'duration',
      width: 80,
      render: (_: unknown, record: typeof voyageShifts[0]) => (
        <span>{getShiftDurationHours(record.startTime, record.endTime).toFixed(1)}h</span>
      )
    }
  ]

  const fatigueColumns = [
    {
      title: '船员',
      dataIndex: 'crewName',
      key: 'crewName',
      width: 120
    },
    {
      title: '总时长',
      dataIndex: 'totalHours',
      key: 'totalHours',
      width: 100,
      render: (h: number) => `${h}h`
    },
    {
      title: '最长连续',
      dataIndex: 'continuousHours',
      key: 'continuousHours',
      width: 100,
      render: (h: number) => `${h}h`
    },
    {
      title: '休息时长',
      dataIndex: 'restHours',
      key: 'restHours',
      width: 100,
      render: (h: number) => `${h}h`
    },
    {
      title: '班次',
      dataIndex: 'shiftCount',
      key: 'shiftCount',
      width: 80
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 100,
      render: (level: FatigueInfo['riskLevel']) => (
        <span className={`risk-tag ${level}`}>
          {level === 'low' ? '低风险' : level === 'medium' ? '中风险' : '高风险'}
        </span>
      )
    },
    {
      title: '预警信息',
      dataIndex: 'warnings',
      key: 'warnings',
      render: (warnings: string[]) => (
        warnings.length > 0 ? (
          <div style={{ color: '#f5222d', fontSize: 12 }}>
            {warnings.map((w, i) => <div key={i}><WarningOutlined /> {w}</div>)}
          </div>
        ) : (
          <span style={{ color: '#52c41a' }}><CheckCircleOutlined /> 状态良好</span>
        )
      )
    }
  ]

  if (!state.currentVoyageId || !currentVoyage) {
    return (
      <div className="page-container">
        <Empty description="请先在航次看板中选择一个航次" />
      </div>
    )
  }

  const highRiskCount = fatigueInfoList.filter(f => f.riskLevel === 'high').length
  const mediumRiskCount = fatigueInfoList.filter(f => f.riskLevel === 'medium').length

  const tabItems = [
    {
      key: 'summary',
      label: '航次摘要',
      children: (
        <div>
          <Card title="航次基本信息" style={{ marginBottom: 16 }}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="航次名称">{currentVoyage.name}</Descriptions.Item>
              <Descriptions.Item label="船舶名称">{currentVoyage.vesselName}</Descriptions.Item>
              <Descriptions.Item label="航线">
                {currentVoyage.departurePort} → {currentVoyage.arrivalPort}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={currentVoyage.status === 'ongoing' ? 'processing' :
                           currentVoyage.status === 'completed' ? 'success' : 'default'}>
                  {currentVoyage.status === 'ongoing' ? '进行中' :
                   currentVoyage.status === 'completed' ? '已完成' : '待开始'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="出发时间">{formatDateTime(currentVoyage.departureTime)}</Descriptions.Item>
              <Descriptions.Item label="预计到达">
                {currentVoyage.arrivalTime ? formatDateTime(currentVoyage.arrivalTime) : '未设置'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <div className="stat-card">
                <div className="stat-value">{state.crews.length}</div>
                <div className="stat-label">船员人数</div>
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="stat-card">
                <div className="stat-value">{voyageShifts.length}</div>
                <div className="stat-label">总班次</div>
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="stat-card">
                <div className="stat-value">{voyageRecords.length}</div>
                <div className="stat-label">交接记录</div>
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="stat-card">
                <div className="stat-value">{voyageIncidents.length}</div>
                <div className="stat-label">异常事件</div>
              </div>
            </Col>
          </Row>

          {highRiskCount > 0 && (
            <Alert
              message={`疲劳风险预警：有 ${highRiskCount} 名船员处于高疲劳风险状态`}
              description={fatigueInfoList
                .filter(f => f.riskLevel === 'high')
                .map(f => `${f.crewName}：${f.warnings[0]}`)
                .join('；')}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          {mediumRiskCount > 0 && highRiskCount === 0 && (
            <Alert
              message={`疲劳提醒：有 ${mediumRiskCount} 名船员处于中疲劳风险状态`}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          {highRiskCount === 0 && mediumRiskCount === 0 && (
            <Alert
              message="所有船员疲劳状态良好"
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Card title="航次统计">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <h4 style={{ marginBottom: 12 }}>岗位分布</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {state.positions.map(pos => {
                    const count = state.crews.filter(c => c.positionId === pos.id).length
                    return (
                      <Tag key={pos.id} color={pos.type === 'bridge' ? 'blue' : 'orange'}>
                        {pos.name}: {count}人
                      </Tag>
                    )
                  })}
                </div>
              </Col>
              <Col xs={24} md={12}>
                <h4 style={{ marginBottom: 12 }}>事件统计</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Tag color="red">安全事故: {voyageIncidents.filter(i => i.type === 'safety').length}</Tag>
                  <Tag color="orange">设备故障: {voyageIncidents.filter(i => i.type === 'equipment').length}</Tag>
                  <Tag color="blue">航行异常: {voyageIncidents.filter(i => i.type === 'navigation').length}</Tag>
                  <Tag color="default">其他: {voyageIncidents.filter(i => i.type === 'other').length}</Tag>
                </div>
              </Col>
            </Row>
          </Card>
        </div>
      )
    },
    {
      key: 'shifts',
      label: (
        <Space>
          值班表
          {shiftDateRange && <Tag color="blue">已筛选</Tag>}
          {shiftCrewFilter.length > 0 && <Tag color="green">{shiftCrewFilter.length}人</Tag>}
        </Space>
      ),
      children: (
        <div>
          <Card
            title="值班安排"
            extra={
              <Space wrap>
                <Select
                  mode="multiple"
                  placeholder="筛选船员"
                  style={{ minWidth: 180 }}
                  value={shiftCrewFilter}
                  onChange={setShiftCrewFilter}
                  allowClear
                >
                  {state.crews.map(crew => (
                    <Option key={crew.id} value={crew.id}>{crew.name}</Option>
                  ))}
                </Select>
                <RangePicker
                  value={shiftDateRange}
                  onChange={(dates) => setShiftDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                  style={{ width: 280 }}
                />
                <Button
                  type="default"
                  onClick={() => {
                    setShiftDateRange(null)
                    setShiftCrewFilter([])
                  }}
                >
                  清除筛选
                </Button>
                <Button
                  icon={<ExportOutlined />}
                  type="primary"
                  loading={exporting}
                  onClick={() => handleExport('shifts')}
                >
                  导出值班表 ({filteredShifts.length})
                </Button>
              </Space>
            }
          >
            <Table
              columns={shiftColumns}
              dataSource={filteredShifts
                .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())}
              rowKey="id"
              bordered
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          </Card>
        </div>
      )
    },
    {
      key: 'handover',
      label: (
        <Space>
          交接摘要
          {handoverDateRange && <Tag color="blue">已筛选</Tag>}
          {handoverCrewFilter.length > 0 && <Tag color="green">{handoverCrewFilter.length}人</Tag>}
        </Space>
      ),
      children: (
        <div>
          <Card
            title="交接记录摘要"
            extra={
              <Space wrap>
                <Select
                  mode="multiple"
                  placeholder="筛选船员"
                  style={{ minWidth: 180 }}
                  value={handoverCrewFilter}
                  onChange={setHandoverCrewFilter}
                  allowClear
                >
                  {state.crews.map(crew => (
                    <Option key={crew.id} value={crew.id}>{crew.name}</Option>
                  ))}
                </Select>
                <RangePicker
                  value={handoverDateRange}
                  onChange={(dates) => setHandoverDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                  style={{ width: 280 }}
                />
                <Button
                  type="default"
                  onClick={() => {
                    setHandoverDateRange(null)
                    setHandoverCrewFilter([])
                  }}
                >
                  清除筛选
                </Button>
                <Button
                  icon={<ExportOutlined />}
                  type="primary"
                  loading={exporting}
                  onClick={() => handleExport('handover')}
                >
                  导出交接记录 ({filteredRecords.length})
                </Button>
              </Space>
            }
          >
            {filteredRecords.length === 0 ? (
              <Empty description="暂无交接记录" />
            ) : (
              <div>
                {filteredRecords
                  .sort((a, b) => dayjs(b.handoverTime).valueOf() - dayjs(a.handoverTime).valueOf())
                  .map(record => {
                    const pendingTaskCount = record.pendingTasks?.trim() ? 1 : 0
                    return (
                      <Card
                        key={record.id}
                        size="small"
                        style={{ marginBottom: 12 }}
                        title={
                          <Space wrap>
                            <span>{formatDateTime(record.handoverTime)}</span>
                            <Tag>{getCrewName(record.fromCrewId)} → {getCrewName(record.toCrewId)}</Tag>
                            <Tag color="blue">航速: {record.speed}节</Tag>
                            <Tag>{record.weather}</Tag>
                            {pendingTaskCount > 0 && (
                              <Tag color="orange">待跟进: {pendingTaskCount}项</Tag>
                            )}
                          </Space>
                        }
                      >
                        <Row gutter={[16, 8]}>
                          <Col xs={24} md={12}>
                            <strong style={{ color: '#666' }}>航道提示：</strong>
                            <p style={{ marginTop: 4 }}>{record.channelNotes}</p>
                          </Col>
                          <Col xs={24} md={12}>
                            <strong style={{ color: '#666' }}>设备状态：</strong>
                            <p style={{ marginTop: 4 }}>{record.equipmentStatus}</p>
                          </Col>
                          <Col xs={24}>
                            <strong style={{ color: record.pendingTasks?.trim() ? '#faad14' : '#666' }}>
                              未完成事项：
                            </strong>
                            <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
                              {record.pendingTasks || '无'}
                            </p>
                          </Col>
                          {record.remark && (
                            <Col xs={24}>
                              <strong style={{ color: '#666' }}>备注：</strong>
                              <p style={{ marginTop: 4 }}>{record.remark}</p>
                            </Col>
                          )}
                        </Row>
                      </Card>
                    )
                  })}
              </div>
            )}
          </Card>
        </div>
      )
    },
    {
      key: 'fatigue',
      label: (
        <Space>
          疲劳风险
          {fatigueRiskFilter !== 'all' && <Tag color="orange">已筛选</Tag>}
        </Space>
      ),
      children: (
        <div>
          <Card
            title="船员疲劳风险评估"
            extra={
              <Space wrap>
                <Select
                  placeholder="风险等级筛选"
                  style={{ width: 150 }}
                  value={fatigueRiskFilter}
                  onChange={setFatigueRiskFilter}
                >
                  <Option value="all">全部等级</Option>
                  <Option value="high">仅高风险</Option>
                  <Option value="medium">仅中风险</Option>
                  <Option value="low">仅低风险</Option>
                </Select>
                <Button
                  type="default"
                  onClick={() => setFatigueRiskFilter('all')}
                >
                  清除筛选
                </Button>
                <Button
                  type="primary"
                  icon={<ExportOutlined />}
                  loading={exporting}
                  onClick={() => handleExport('fatigue')}
                >
                  导出疲劳报告 ({fatigueInfoList.length})
                </Button>
              </Space>
            }
          >
            {fatigueInfoList.length === 0 ? (
              <Empty description="暂无符合条件的船员数据" />
            ) : (
              <Table
                columns={fatigueColumns}
                dataSource={fatigueInfoList}
                rowKey="crewId"
                bordered
                pagination={false}
              />
            )}
          </Card>
        </div>
      )
    },
    {
      key: 'review',
      label: '航次复盘',
      children: (
        <div>
          <Card
            title="航次复盘总览"
            extra={
              <Space>
                <Button
                  icon={<ExportOutlined />}
                  loading={exporting}
                  onClick={() => handleExport('review')}
                >
                  导出复盘报表
                </Button>
                <Button
                  type="primary"
                  icon={<FileExcelOutlined />}
                  loading={exporting}
                  onClick={() => setArchivePreviewVisible(true)}
                >
                  航次归档包
                </Button>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <div className="stat-card">
                  <div className="stat-value">{voyageChangeRecords.length}</div>
                  <div className="stat-label">排班调整次数</div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="stat-card">
                  <div className="stat-value">{pendingTaskChainStats.closeRate}%</div>
                  <div className="stat-label">待办闭环率</div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="stat-card">
                  <div className="stat-value">{incidentStats.avgResolveHours}h</div>
                  <div className="stat-label">平均处理耗时</div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="stat-card">
                  <div className="stat-value">{incidentStats.resolved}/{incidentStats.total}</div>
                  <div className="stat-label">异常已解决/总数</div>
                </div>
              </Col>
            </Row>
          </Card>

          <Card title="复盘台账（时间线）" style={{ marginBottom: 16 }}>
            {ledgerTimeline.length === 0 ? (
              <Empty description="暂无复盘记录" />
            ) : (
              <Timeline
                items={ledgerTimeline.map(event => ({
                  color: event.color,
                  dot: event.icon,
                  children: (
                    <div
                      style={{ cursor: event.linkTo ? 'pointer' : 'default', padding: '4px 0' }}
                      onClick={() => {
                        if (event.linkTo) navigate(event.linkTo)
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Tag color={event.color}>{event.title}</Tag>
                        <span style={{ color: '#999', fontSize: 12 }}>
                          <ClockCircleOutlined style={{ marginRight: 4 }} />
                          {formatDateTime(event.time)}
                        </span>
                      </div>
                      <div style={{ color: '#333', fontSize: 13 }}>{event.description}</div>
                    </div>
                  )
                }))}
              />
            )}
          </Card>

          <Card title="待办闭环跟踪" style={{ marginBottom: 16 }}>
            {pendingTaskChainStats.chains.length === 0 ? (
              <Empty description="暂无待办事项" />
            ) : (
              <Table
                dataSource={pendingTaskChainStats.chains}
                rowKey={(record, index) => `${record.firstRecordId}-${index}`}
                bordered
                size="small"
                pagination={{ pageSize: 10, showSizeChanger: true }}
                columns={[
                  {
                    title: '状态',
                    key: 'status',
                    width: 80,
                    render: (_: unknown, record: typeof pendingTaskChainStats.chains[0]) => (
                      <Tag color={record.closedByRecordId ? 'green' : 'orange'}>
                        {record.closedByRecordId ? '已闭环' : '未闭环'}
                      </Tag>
                    )
                  },
                  {
                    title: '事项内容',
                    dataIndex: 'content',
                    key: 'content',
                    ellipsis: true
                  },
                  {
                    title: '首次提出',
                    dataIndex: 'firstTime',
                    key: 'firstTime',
                    width: 160,
                    render: (time: string) => formatDateTime(time)
                  },
                  {
                    title: '闭环时间',
                    key: 'closedTime',
                    width: 160,
                    render: (_: unknown, record: typeof pendingTaskChainStats.chains[0]) =>
                      record.closedTime ? formatDateTime(record.closedTime) : '-'
                  }
                ]}
              />
            )}
          </Card>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Card title="排班变更记录">
                {voyageChangeRecords.length === 0 ? (
                  <Empty description="暂无排班变更记录" />
                ) : (
                  <Table
                    dataSource={voyageChangeRecords}
                    rowKey="id"
                    bordered
                    size="small"
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                    columns={[
                      {
                        title: '操作类型',
                        dataIndex: 'operationType',
                        key: 'operationType',
                        width: 100,
                        render: (type: string) => {
                          const typeMap: Record<string, { text: string; color: string }> = {
                            drag: { text: '拖拽调整', color: 'blue' },
                            batch_template: { text: '模板生成', color: 'green' },
                            manual_edit: { text: '手工编辑', color: 'orange' },
                            add: { text: '新增班次', color: 'cyan' },
                            delete: { text: '删除班次', color: 'red' }
                          }
                          const info = typeMap[type] || { text: type, color: 'default' }
                          return <Tag color={info.color}>{info.text}</Tag>
                        }
                      },
                      {
                        title: '船员',
                        dataIndex: 'newCrewId',
                        key: 'crew',
                        width: 80,
                        render: (_: string, record: ShiftChangeRecord) =>
                          getCrewName(record.newCrewId || record.oldCrewId || '')
                      },
                      {
                        title: '操作时间',
                        dataIndex: 'operationTime',
                        key: 'operationTime',
                        width: 150,
                        render: (time: string) => formatDateTime(time)
                      },
                      {
                        title: '原因',
                        dataIndex: 'reason',
                        key: 'reason',
                        ellipsis: true,
                        render: (reason: string) => reason || '-'
                      }
                    ]}
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="异常事件处理">
                {voyageIncidents.length === 0 ? (
                  <Empty description="暂无异常事件" />
                ) : (
                  <Table
                    dataSource={voyageIncidents
                      .sort((a, b) => dayjs(b.reportedTime).valueOf() - dayjs(a.reportedTime).valueOf())}
                    rowKey="id"
                    bordered
                    size="small"
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                    columns={[
                      {
                        title: '标题',
                        dataIndex: 'title',
                        key: 'title',
                        ellipsis: true
                      },
                      {
                        title: '级别',
                        dataIndex: 'level',
                        key: 'level',
                        width: 60,
                        render: (level: string) => {
                          const colorMap: Record<string, string> = { minor: 'green', moderate: 'orange', severe: 'red' }
                          const textMap: Record<string, string> = { minor: '轻微', moderate: '一般', severe: '严重' }
                          return <Tag color={colorMap[level]}>{textMap[level]}</Tag>
                        }
                      },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        key: 'status',
                        width: 70,
                        render: (status: string) => {
                          const colorMap: Record<string, string> = { pending: 'red', processing: 'orange', resolved: 'green' }
                          const textMap: Record<string, string> = { pending: '待处理', processing: '处理中', resolved: '已解决' }
                          return <Tag color={colorMap[status]}>{textMap[status]}</Tag>
                        }
                      },
                      {
                        title: '耗时',
                        key: 'duration',
                        width: 70,
                        render: (_: unknown, record) => {
                          if (record.status !== 'resolved' || !record.resolvedTime) return '-'
                          const hours = dayjs(record.resolvedTime).diff(dayjs(record.reportedTime), 'minute') / 60
                          return `${hours.toFixed(1)}h`
                        }
                      }
                    ]}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </div>
      )
    }
  ]

  const archivePreviewItems = [
    { label: '航次摘要', count: currentVoyage ? 1 : 0 },
    { label: '值班表', count: voyageShifts.length },
    { label: '交接摘要', count: voyageRecords.length },
    { label: '异常图片清单', count: voyageIncidents.filter(i => i.images && i.images.length > 0).length || voyageIncidents.length },
    { label: '复盘台账', count: ledgerTimeline.length },
    { label: '待办闭环跟踪', count: pendingTaskChainStats.chains.length },
    { label: '疲劳风险', count: fatigueInfoList.length }
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">报表窗口</h2>
        <Space>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            loading={exporting}
            onClick={() => handleExport('all')}
          >
            导出完整报表
          </Button>
        </Space>
      </div>

      <Card>
        <Tabs
          items={tabItems}
          activeKey={activeTab}
          onChange={setActiveTab}
        />
      </Card>

      <Card
        title={<><InfoCircleOutlined style={{ marginRight: 8 }} />导出说明</>}
        style={{ marginTop: 16 }}
      >
        <ul style={{ margin: 0, paddingLeft: 20, color: '#666' }}>
          <li><strong>完整报表</strong>包含：航次摘要、值班表、交接记录、疲劳风险、异常事件</li>
          <li><strong>航次复盘</strong>包含：复盘总览、台账时间线、待办闭环跟踪、排班变更记录、异常事件处理</li>
          <li><strong>归档包</strong>包含：航次摘要、值班表、交接摘要、异常图片清单、复盘台账、待办闭环跟踪、疲劳风险</li>
          <li><strong>单独导出</strong>：各页签的导出按钮仅导出当前页签的筛选数据</li>
          <li>可通过各页签的筛选条件（日期范围、船员、风险等级）选择特定数据导出</li>
          <li>所有时间均使用24小时制，时长以小时为单位</li>
          <li>疲劳风险评估基于国际海事组织(IMO)疲劳管理标准</li>
          <li style={{ color: '#f5222d' }}>高风险提示：连续工作超过8小时或日均工作超过12小时</li>
        </ul>
      </Card>

      <Modal
        title="航次结束归档包 - 导出预览"
        open={archivePreviewVisible}
        onCancel={() => setArchivePreviewVisible(false)}
        footer={
          <Space>
            <Button onClick={() => setArchivePreviewVisible(false)}>取消</Button>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              loading={exporting}
              onClick={() => {
                setArchivePreviewVisible(false)
                handleExport('archive')
              }}
            >
              确认导出归档包
            </Button>
          </Space>
        }
        width={600}
      >
        <Alert
          message="归档包将包含以下内容"
          description={`文件名：${currentVoyage?.name || '未命名'}_归档包_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          dataSource={archivePreviewItems}
          rowKey="label"
          bordered
          size="small"
          pagination={false}
          columns={[
            {
              title: '工作表',
              dataIndex: 'label',
              key: 'label',
              render: (label: string) => <strong>{label}</strong>
            },
            {
              title: '记录数',
              dataIndex: 'count',
              key: 'count',
              width: 100,
              render: (count: number) => (
                <Tag color={count > 0 ? 'blue' : 'default'}>{count}条</Tag>
              )
            }
          ]}
        />
      </Modal>
    </div>
  )
}

export default Reports
