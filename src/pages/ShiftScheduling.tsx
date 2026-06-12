import React, { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay
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
  Space
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  WarningOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'
import { useApp } from '@/store/AppContext'
import {
  formatDateTime,
  formatTime,
  getShiftDurationHours,
  checkShiftOverlap,
  calculateFatigueInfo,
  getTimeSlots
} from '@/utils'
import type { Shift } from '@/types'

const { Option } = Select
const { RangePicker } = TimePicker

const TIME_SCALE = 60
const START_HOUR = 0
const END_HOUR = 24

const ShiftScheduling: React.FC = () => {
  const { state, dispatch } = useApp()
  const [form] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    })
  )

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
  const voyageShifts = state.shifts.filter(s => s.voyageId === state.currentVoyageId)
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

  const timeToPosition = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number)
    return ((hours + minutes / 60) / (END_HOUR - START_HOUR)) * 100
  }

  const positionToTime = (position: number) => {
    const totalMinutes = (position / 100) * (END_HOUR - START_HOUR) * 60
    const hours = Math.floor(totalMinutes / 60)
    const minutes = Math.round(totalMinutes % 60)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event
    setActiveId(null)

    const shift = dayShifts.find(s => s.id === active.id)
    if (!shift) return

    const container = document.getElementById('shift-timeline-container')
    if (!container) return

    const containerWidth = container.clientWidth
    const startPos = timeToPosition(formatTime(shift.startTime))
    const endPos = timeToPosition(formatTime(shift.endTime))
    const width = endPos - startPos

    const deltaXPercent = (delta.x / containerWidth) * 100
    let newStartPos = startPos + deltaXPercent

    newStartPos = Math.max(0, Math.min(newStartPos, 100 - width))
    const newEndPos = newStartPos + width

    const newStartTime = positionToTime(newStartPos)
    const newEndTime = positionToTime(newEndPos)

    const fullStart = `${selectedDate} ${newStartTime}`
    const fullEnd = `${selectedDate} ${newEndTime}`

    const overlaps = checkShiftOverlap(voyageShifts, {
      ...shift,
      startTime: fullStart,
      endTime: fullEnd,
      date: selectedDate,
      voyageId: state.currentVoyageId!
    })

    if (overlaps.length > 0) {
      message.error('班次时间重叠，请调整后再试')
      return
    }

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

    const fatigue = fatigueInfoMap.get(shift.crewId)
    if (fatigue && fatigue.riskLevel === 'high') {
      message.warning(`${state.crews.find(c => c.id === shift.crewId)?.name} 存在高疲劳风险`)
    }
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

  const handleDeleteShift = (id: string) => {
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
        dispatch({
          type: 'UPDATE_SHIFT',
          payload: { ...editingShift, ...shiftData }
        })
        message.success('班次已更新')
      } else {
        dispatch({
          type: 'ADD_SHIFT',
          payload: {
            ...shiftData,
            id: uuidv4(),
            createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
          }
        })
        message.success('班次已添加')
      }

      setModalVisible(false)
    })
  }

  const highRiskCrews = Array.from(fatigueInfoMap.values()).filter(f => f.riskLevel === 'high')

  const renderShiftBlock = (shift: Shift, isDragging = false) => {
    const crew = state.crews.find(c => c.id === shift.crewId)
    const position = state.positions.find(p => p.id === shift.positionId)
    const fatigue = fatigueInfoMap.get(shift.crewId)

    const left = timeToPosition(formatTime(shift.startTime))
    const width = timeToPosition(formatTime(shift.endTime)) - left

    return (
      <div
        key={shift.id}
        className={`shift-block ${position?.type || 'bridge'} ${isDragging ? 'dragging' : ''}`}
        style={{
          left: `${left}%`,
          width: `${Math.max(width, 2)}%`,
          top: 4,
          bottom: 4
        }}
        onClick={(e) => {
          e.stopPropagation()
          handleEditShift(shift)
        }}
        title={`${crew?.name} - ${formatTime(shift.startTime)} ~ ${formatTime(shift.endTime)}`}
      >
        <div className="shift-crew">
          {crew?.name}
          {fatigue?.riskLevel === 'high' && <span style={{ marginLeft: 4 }}>⚠️</span>}
        </div>
        <div className="shift-time">
          {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
        </div>
      </div>
    )
  }

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
    return lines
  }

  const renderFatigueWarnings = () => {
    if (highRiskCrews.length === 0) return null

    return (
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
        style={{ marginBottom: 16 }}
      />
    )
  }

  if (!state.currentVoyageId || !currentVoyage) {
    return (
      <div className="page-container">
        <Empty description="请先在航次看板中选择一个航次" />
      </div>
    )
  }

  const activeShift = activeId ? dayShifts.find(s => s.id === activeId) : null

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
    }
  ]

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
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleAddShift(bridgeCrews[0]?.id || '', bridgeCrews[0]?.positionId || '')}
            disabled={state.crews.length === 0}
          >
            添加班次
          </Button>
        </Space>
      </div>

      {renderFatigueWarnings()}

      <Card>
        <Tabs items={tabItems} />
      </Card>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <DragOverlay>
          {activeShift && renderShiftBlock(activeShift, true)}
        </DragOverlay>
      </DndContext>

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
    </div>
  )
}

export default ShiftScheduling
