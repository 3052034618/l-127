import React, { useState, useEffect } from 'react'
import {
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Card,
  Table,
  Space,
  Popconfirm,
  message,
  Tag,
  Row,
  Col,
  Descriptions,
  Empty,
  Divider,
  Tooltip,
  Badge,
  List,
  Alert,
  Checkbox
} from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { useApp } from '@/store/AppContext'
import { formatDateTime, formatTime } from '@/utils'
import type { HandoverRecord, Shift } from '@/types'

const { TextArea } = Input
const { Option } = Select

const weatherOptions = ['晴', '多云', '阴', '小雨', '中雨', '大雨', '暴雨', '雾', '大风', '雷暴']

interface PendingTask {
  id: string
  content: string
  sourceRecordId: string
  sourceHandoverTime: string
  status: 'pending' | 'completed'
  completedRecordId?: string
}

const HandoverRecords: React.FC = () => {
  const { state, dispatch } = useApp()
  const [form] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HandoverRecord | null>(null)
  const [viewingRecord, setViewingRecord] = useState<HandoverRecord | null>(null)
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([])
  const [selectedPendingTasks, setSelectedPendingTasks] = useState<string[]>([])

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
  const voyageShifts = state.shifts.filter(s => s.voyageId === state.currentVoyageId)
  const voyageRecords = state.handoverRecords.filter(h => h.voyageId === state.currentVoyageId)

  useEffect(() => {
    const tasks: PendingTask[] = []
    const completedTaskIds = new Set<string>()

    voyageRecords
      .sort((a, b) => dayjs(a.handoverTime).valueOf() - dayjs(b.handoverTime).valueOf())
      .forEach(record => {
        if (record.pendingTasks && record.pendingTasks.trim() && record.pendingTasks !== '无') {
          const taskId = `task-${record.id}`
          tasks.push({
            id: taskId,
            content: record.pendingTasks,
            sourceRecordId: record.id,
            sourceHandoverTime: record.handoverTime,
            status: 'pending'
          })
        }
      })

    voyageRecords.forEach(record => {
      const lowerContent = record.pendingTasks?.toLowerCase() || ''
      tasks.forEach(task => {
        if (
          task.status === 'pending' &&
          record.id !== task.sourceRecordId &&
          dayjs(record.handoverTime).isAfter(dayjs(task.sourceHandoverTime))
        ) {
          if (
            lowerContent.includes('完成') ||
            lowerContent.includes('已处理') ||
            lowerContent.includes('已解决') ||
            lowerContent.includes('关闭') ||
            (lowerContent.includes(task.content.substring(0, 20)) &&
             (lowerContent.includes('已完成') || lowerContent.includes('已处理')))
          ) {
            task.status = 'completed'
            task.completedRecordId = record.id
            completedTaskIds.add(task.id)
          }
        }
      })
    })

    setPendingTasks(tasks)
  }, [voyageRecords])

  const getShiftInfo = (shiftId: string) => {
    const shift = voyageShifts.find(s => s.id === shiftId)
    if (!shift) return null
    const crew = state.crews.find(c => c.id === shift.crewId)
    const position = state.positions.find(p => p.id === shift.positionId)
    return { shift, crew, position }
  }

  const getCrewName = (crewId: string) => {
    return state.crews.find(c => c.id === crewId)?.name || '未知'
  }

  const getAvailableShifts = () => {
    const hasHandover = new Set(voyageRecords.map(r => r.shiftId))
    return voyageShifts
      .filter(s => dayjs(s.endTime).isBefore(dayjs()) && !hasHandover.has(s.id))
      .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())
  }

  const findNextShift = (currentShift: Shift) => {
    return voyageShifts
      .filter(s =>
        s.crewId !== currentShift.crewId &&
        s.date === currentShift.date &&
        dayjs(s.startTime).isAfter(dayjs(currentShift.endTime))
      )
      .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())[0]
  }

  const findLastHandoverForCrew = (crewId: string) => {
    return voyageRecords
      .filter(h => h.toCrewId === crewId)
      .sort((a, b) => dayjs(b.handoverTime).valueOf() - dayjs(a.handoverTime).valueOf())[0]
  }

  const handleAddFromShift = (shiftId: string, fromCrewId: string, toCrewId: string, startTime: string, endTime: string, pendingTasksStr: string) => {
    setEditingRecord(null)
    form.resetFields()
    setSelectedPendingTasks([])

    const availablePendingTasks = pendingTasks.filter((t: PendingTask) =>
      t.status === 'pending' && (
        voyageRecords.find(r => r.id === t.sourceRecordId)?.toCrewId === fromCrewId
      )
    )

    if (availablePendingTasks.length > 0) {
      setSelectedPendingTasks(availablePendingTasks.map(t => t.id))
    }

    form.setFieldsValue({
      shiftId,
      fromCrewId,
      toCrewId,
      handoverTime: dayjs(),
      speed: '12',
      weather: '晴',
      channelNotes: '航道正常，无异常情况',
      equipmentStatus: '设备运行正常',
      pendingTasks: pendingTasksStr || '无'
    })

    setModalVisible(true)
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent
      const { shiftId, fromCrewId, toCrewId, startTime, endTime, pendingTasks } = customEvent.detail
      handleAddFromShift(shiftId, fromCrewId, toCrewId, startTime, endTime, pendingTasks)
    }
    window.addEventListener('navigateToHandover', handler)
    return () => window.removeEventListener('navigateToHandover', handler)
  }, [])

  const handleAdd = () => {
    const availableShifts = getAvailableShifts()
    if (availableShifts.length === 0) {
      message.warning('暂无已完成的班次可用于交接')
      return
    }
    setEditingRecord(null)
    form.resetFields()
    setSelectedPendingTasks([])

    const firstShift = availableShifts[0]
    const nextShift = findNextShift(firstShift)
    const lastHandover = findLastHandoverForCrew(firstShift.crewId)

    form.setFieldsValue({
      shiftId: firstShift.id,
      toCrewId: nextShift?.crewId || '',
      handoverTime: dayjs(),
      speed: '12',
      weather: '晴',
      channelNotes: '航道正常，无异常情况',
      equipmentStatus: '设备运行正常',
      pendingTasks: lastHandover?.pendingTasks || '无'
    })

    if (lastHandover?.pendingTasks && lastHandover.pendingTasks.trim() && lastHandover.pendingTasks !== '无') {
      const taskId = `task-${lastHandover.id}`
      if (pendingTasks.find(t => t.id === taskId && t.status === 'pending')) {
        setSelectedPendingTasks([taskId])
      }
    }

    setModalVisible(true)
  }

  const handleShiftChange = (shiftId: string) => {
    const shift = voyageShifts.find(s => s.id === shiftId)
    if (shift) {
      const nextShift = findNextShift(shift)
      form.setFieldsValue({
        toCrewId: nextShift?.crewId || ''
      })

      const lastHandover = findLastHandoverForCrew(shift.crewId)
      if (lastHandover?.pendingTasks && lastHandover.pendingTasks.trim() && lastHandover.pendingTasks !== '无') {
        form.setFieldsValue({
          pendingTasks: lastHandover.pendingTasks
        })
        const taskId = `task-${lastHandover.id}`
        if (pendingTasks.find(t => t.id === taskId && t.status === 'pending')) {
          setSelectedPendingTasks([taskId])
        }
      } else {
        form.setFieldsValue({
          pendingTasks: '无'
        })
        setSelectedPendingTasks([])
      }
    }
  }

  const handleEdit = (record: HandoverRecord) => {
    setEditingRecord(record)
    form.setFieldsValue({
      ...record,
      handoverTime: dayjs(record.handoverTime)
    })
    setModalVisible(true)
  }

  const handleView = (record: HandoverRecord) => {
    setViewingRecord(record)
    setDetailVisible(true)
  }

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_HANDOVER', payload: id })
    message.success('交接记录已删除')
  }

  const handleSubmit = () => {
    form.validateFields().then(values => {
      const shiftInfo = getShiftInfo(values.shiftId)
      if (!shiftInfo) {
        message.error('未找到对应的班次信息')
        return
      }

      const fromCrewId = shiftInfo.crew?.id
      const toCrewId = values.toCrewId

      if (fromCrewId === toCrewId) {
        message.error('交班人和接班人不能为同一人')
        return
      }

      let pendingTasksContent = values.pendingTasks
      if (selectedPendingTasks.length > 0) {
        const selectedTasks = pendingTasks.filter(t => selectedPendingTasks.includes(t.id))
        if (selectedTasks.length > 0) {
          const trackedTasks = selectedTasks.map(t => `[跟进] ${t.content}`).join('\n\n')
          if (pendingTasksContent === '无' || !pendingTasksContent) {
            pendingTasksContent = trackedTasks
          } else if (!pendingTasksContent.includes('[跟进]')) {
            pendingTasksContent = `${trackedTasks}\n\n[新增]\n${pendingTasksContent}`
          }
        }
      }

      const recordData: Omit<HandoverRecord, 'id' | 'createdAt'> = {
        voyageId: state.currentVoyageId!,
        shiftId: values.shiftId,
        fromCrewId: fromCrewId!,
        toCrewId: toCrewId,
        handoverTime: values.handoverTime.format('YYYY-MM-DD HH:mm'),
        speed: values.speed,
        weather: values.weather,
        channelNotes: values.channelNotes,
        equipmentStatus: values.equipmentStatus,
        pendingTasks: pendingTasksContent,
        remark: values.remark
      }

      if (editingRecord) {
        dispatch({
          type: 'UPDATE_HANDOVER',
          payload: { ...editingRecord, ...recordData }
        })
        message.success('交接记录已更新')
      } else {
        dispatch({
          type: 'ADD_HANDOVER',
          payload: {
            ...recordData,
            id: uuidv4(),
            createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
          }
        })
        message.success('交接记录已创建')
      }
      setModalVisible(false)
      setSelectedPendingTasks([])
    })
  }

  const activePendingTasks = pendingTasks.filter(t => t.status === 'pending')
  const completedPendingTasks = pendingTasks.filter(t => t.status === 'completed')

  const currentShiftId = Form.useWatch('shiftId', form)
  const currentShift = voyageShifts.find(s => s.id === currentShiftId)
  const relevantPendingTasks = currentShift
    ? pendingTasks.filter(t => {
      const sourceRecord = voyageRecords.find(r => r.id === t.sourceRecordId)
      return (
        t.status === 'pending' &&
        sourceRecord &&
        (sourceRecord.toCrewId === currentShift.crewId ||
         sourceRecord.fromCrewId === currentShift.crewId)
      )
    })
    : []

  const columns = [
    {
      title: '交接时间',
      dataIndex: 'handoverTime',
      key: 'handoverTime',
      width: 160,
      render: (time: string) => formatDateTime(time)
    },
    {
      title: '班次',
      dataIndex: 'shiftId',
      key: 'shift',
      width: 180,
      render: (shiftId: string) => {
        const info = getShiftInfo(shiftId)
        if (!info) return '-'
        const { shift, position } = info
        return (
          <div>
            <Tag className={`position-badge ${position?.type || 'bridge'}`}>
              {position?.name}
            </Tag>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
            </div>
          </div>
        )
      }
    },
    {
      title: '交班人',
      dataIndex: 'fromCrewId',
      key: 'fromCrew',
      width: 100,
      render: (crewId: string) => getCrewName(crewId)
    },
    {
      title: '接班人',
      dataIndex: 'toCrewId',
      key: 'toCrew',
      width: 100,
      render: (crewId: string) => getCrewName(crewId)
    },
    {
      title: '航速',
      dataIndex: 'speed',
      key: 'speed',
      width: 80,
      render: (speed: string) => `${speed} 节`
    },
    {
      title: '待办事项',
      dataIndex: 'pendingTasks',
      key: 'pending',
      width: 120,
      render: (tasks: string) => {
        if (!tasks || tasks === '无') {
          return <Tag color="success">无</Tag>
        }
        const isCompleted = pendingTasks.find(t =>
          t.content === tasks && t.status === 'completed'
        )
        return (
          <Tag color={isCompleted ? 'success' : 'warning'}>
            {isCompleted ? '已跟进' : '待跟进'}
          </Tag>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: HandoverRecord) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          >
            查看
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此交接记录吗？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
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

  const pendingForCurrentCrew = currentShift
    ? activePendingTasks.filter(t => {
      const sourceRecord = voyageRecords.find(r => r.id === t.sourceRecordId)
      return sourceRecord?.toCrewId === currentShift.crewId
    }).length
    : 0

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">交接记录</h2>
        <Space>
          {activePendingTasks.length > 0 && (
            <Tooltip title={`有 ${activePendingTasks.length} 项待办事项需要跟进`}>
              <Badge count={activePendingTasks.length} size="small">
                <Button
                  icon={<WarningOutlined />}
                  onClick={() => document.getElementById('pending-tasks-section')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  待办提醒
                </Button>
              </Badge>
            </Tooltip>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增交接
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value">{voyageRecords.length}</div>
            <div className="stat-label">交接记录数</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value">{activePendingTasks.length}</div>
            <div className="stat-label" style={{ color: '#faad14' }}>待办事项</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#52c41a' }}>
              {completedPendingTasks.length}
            </div>
            <div className="stat-label">已完成事项</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#1890ff' }}>
              {getAvailableShifts().length}
            </div>
            <div className="stat-label">待交接班次</div>
          </div>
        </Col>
      </Row>

      {activePendingTasks.length > 0 && (
        <Card
          id="pending-tasks-section"
          title={
            <Space>
              <WarningOutlined style={{ color: '#faad14' }} />
              <span>待办事项跟踪</span>
              <Badge count={activePendingTasks.length} size="small" />
            </Space>
          }
          style={{ marginBottom: 16 }}
          size="small"
        >
          <List
            size="small"
            dataSource={activePendingTasks}
            renderItem={(task) => {
              const sourceRecord = voyageRecords.find(r => r.id === task.sourceRecordId)
              return (
                <List.Item
                  actions={[
                    <Tag key="from" color="blue">
                      {getCrewName(sourceRecord?.toCrewId || '')} 负责
                    </Tag>,
                    <Tag key="time">
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      {formatDate(task.sourceHandoverTime)}
                    </Tag>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Badge status="warning" />}
                    title={
                      <span style={{ fontSize: 13 }}>
                        {task.content}
                      </span>
                    }
                    description={
                      <span style={{ fontSize: 12, color: '#999' }}>
                        来源于 {formatDateTime(task.sourceHandoverTime)} 的交接记录
                      </span>
                    }
                  />
                </List.Item>
              )
            }}
          />
        </Card>
      )}

      <Card title="交接记录列表">
        <Table
          columns={columns}
          dataSource={voyageRecords
            .sort((a, b) => dayjs(b.handoverTime).valueOf() - dayjs(a.handoverTime).valueOf())}
          rowKey="id"
          bordered
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (record) => (
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <div>
                    <strong style={{ color: '#666' }}>航道提示：</strong>
                    <p style={{ marginTop: 4 }}>{record.channelNotes || '无'}</p>
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div>
                    <strong style={{ color: '#666' }}>设备状态：</strong>
                    <p style={{ marginTop: 4 }}>{record.equipmentStatus || '正常'}</p>
                  </div>
                </Col>
                <Col xs={24}>
                  <div>
                    <strong style={{
                      color: record.pendingTasks?.trim() && record.pendingTasks !== '无'
                        ? '#faad14'
                        : '#666'
                    }}>
                      未完成事项：
                    </strong>
                    <p style={{
                      marginTop: 4,
                      background: record.pendingTasks?.trim() && record.pendingTasks !== '无'
                        ? '#fff7e6'
                        : 'transparent',
                      padding: record.pendingTasks?.trim() && record.pendingTasks !== '无'
                        ? '8px 12px'
                        : 0,
                      borderRadius: 4,
                      whiteSpace: 'pre-wrap'
                    }}>
                      {record.pendingTasks || '无'}
                    </p>
                  </div>
                </Col>
                {record.remark && (
                  <Col xs={24}>
                    <div>
                      <strong style={{ color: '#666' }}>备注：</strong>
                      <p style={{ marginTop: 4 }}>{record.remark}</p>
                    </div>
                  </Col>
                )}
              </Row>
            )
          }}
        />
      </Card>

      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>{editingRecord ? '编辑交接记录' : '新增交接记录'}</span>
          </Space>
        }
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false)
          setSelectedPendingTasks([])
        }}
        width={750}
        maskClosable={false}
      >
        {relevantPendingTasks.length > 0 && !editingRecord && (
          <Alert
            message={`有 ${relevantPendingTasks.length} 项待办事项需要跟进`}
            description={
              <div>
                {relevantPendingTasks.slice(0, 3).map(task => (
                  <div key={task.id} style={{ fontSize: 12 }}>
                    • {task.content.substring(0, 50)}...
                  </div>
                ))}
                {relevantPendingTasks.length > 3 && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    ...还有 {relevantPendingTasks.length - 3} 项
                  </div>
                )}
              </div>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="shiftId"
                label={
                  <Space>
                    选择班次
                    <Tooltip title="选择已完成的值班班次">
                      <span style={{ color: '#999', fontSize: 12 }}>(自动带出交班人)</span>
                    </Tooltip>
                  </Space>
                }
                rules={[{ required: true, message: '请选择交接班次' }]}
              >
                <Select
                  placeholder="请选择交接的班次"
                  onChange={handleShiftChange}
                >
                  {getAvailableShifts().map(shift => {
                    const crew = state.crews.find(c => c.id === shift.crewId)
                    const position = state.positions.find(p => p.id === shift.positionId)
                    return (
                      <Option key={shift.id} value={shift.id}>
                        [{position?.name}] {crew?.name} - {formatTime(shift.startTime)}~{formatTime(shift.endTime)}
                      </Option>
                    )
                  })}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="toCrewId"
                label={
                  <Space>
                    接班人员
                    <Tooltip title="系统会自动推荐下一班次人员">
                      <span style={{ color: '#999', fontSize: 12 }}>(推荐下一班)</span>
                    </Tooltip>
                  </Space>
                }
                rules={[{ required: true, message: '请选择接班人员' }]}
              >
                <Select placeholder="请选择接班人员">
                  {state.crews
                    .filter(c => currentShift ? c.id !== currentShift.crewId : true)
                    .map(crew => (
                      <Option key={crew.id} value={crew.id}>
                        {crew.name} - {crew.position}
                      </Option>
                    ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="handoverTime"
                label="交接时间"
                rules={[{ required: true, message: '请选择交接时间' }]}
              >
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="speed"
                label="当前航速（节）"
                rules={[{ required: true, message: '请输入航速' }]}
              >
                <Input type="number" placeholder="请输入当前航速" suffix="节" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="weather"
                label="天气情况"
                rules={[{ required: true, message: '请选择天气' }]}
              >
                <Select placeholder="请选择天气">
                  {weatherOptions.map(weather => (
                    <Option key={weather} value={weather}>{weather}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {relevantPendingTasks.length > 0 && !editingRecord && (
            <Form.Item
              label={
                <Space>
                  <WarningOutlined style={{ color: '#faad14' }} />
                  <span>待办事项跟进</span>
                  <span style={{ color: '#999', fontSize: 12, fontWeight: 'normal' }}>
                    (勾选后将自动带入未完成事项)
                  </span>
                </Space>
              }
            >
              <List
                size="small"
                dataSource={relevantPendingTasks}
                renderItem={(task) => (
                  <List.Item>
                    <Checkbox
                      checked={selectedPendingTasks.includes(task.id)}
                      onChange={(e: CheckboxChangeEvent) => {
                        if (e.target.checked) {
                          setSelectedPendingTasks([...selectedPendingTasks, task.id])
                        } else {
                          setSelectedPendingTasks(selectedPendingTasks.filter(id => id !== task.id))
                        }
                      }}
                    >
                      <Space>
                        <Badge status="warning" />
                        <span style={{ fontSize: 13 }}>{task.content}</span>
                        <Tag color="blue" style={{ marginLeft: 'auto' }}>
                          {formatDate(task.sourceHandoverTime)}
                        </Tag>
                      </Space>
                    </Checkbox>
                  </List.Item>
                )}
              />
            </Form.Item>
          )}

          <Divider orientation="left" style={{ margin: '8px 0', fontSize: 14, fontWeight: 600 }}>
            交接详情
          </Divider>
          <Form.Item
            name="channelNotes"
            label="航道提示"
            rules={[{ required: true, message: '请填写航道提示' }]}
          >
            <TextArea
              rows={3}
              placeholder="请描述航道情况，如：水深、通航密度、航行警告等"
            />
          </Form.Item>
          <Form.Item
            name="equipmentStatus"
            label="设备状态"
            rules={[{ required: true, message: '请填写设备状态' }]}
          >
            <TextArea
              rows={3}
              placeholder="请描述主要设备运行状态，如：主机、舵机、导航设备等"
            />
          </Form.Item>
          <Form.Item
            name="pendingTasks"
            label={
              <Space>
                未完成事项
                {selectedPendingTasks.length > 0 && (
                  <Tag color="orange">{selectedPendingTasks.length}项跟进中</Tag>
                )}
              </Space>
            }
            rules={[{ required: true, message: '请填写未完成事项' }]}
          >
            <TextArea
              rows={4}
              placeholder="请描述需要下一班次继续处理的事项，勾选上方待办事项将自动带入"
            />
          </Form.Item>
          <Form.Item name="remark" label="其他备注">
            <TextArea rows={2} placeholder="其他需要说明的事项" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="交接记录详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={750}
      >
        {viewingRecord && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="交接时间" span={2}>
                {formatDateTime(viewingRecord.handoverTime)}
              </Descriptions.Item>
              <Descriptions.Item label="交班人">
                {getCrewName(viewingRecord.fromCrewId)}
              </Descriptions.Item>
              <Descriptions.Item label="接班人">
                {getCrewName(viewingRecord.toCrewId)}
              </Descriptions.Item>
              <Descriptions.Item label="航速">
                {viewingRecord.speed} 节
              </Descriptions.Item>
              <Descriptions.Item label="天气">
                {viewingRecord.weather}
              </Descriptions.Item>
              {(() => {
                const info = getShiftInfo(viewingRecord.shiftId)
                if (!info) return null
                return (
                  <>
                    <Descriptions.Item label="岗位">
                      {info.position?.name}
                    </Descriptions.Item>
                    <Descriptions.Item label="值班时段">
                      {formatTime(info.shift.startTime)} - {formatTime(info.shift.endTime)}
                    </Descriptions.Item>
                  </>
                )
              })()}
            </Descriptions>
            <Divider style={{ margin: '16px 0' }} />
            <div style={{ marginBottom: 12 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>航道提示：</strong>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                {viewingRecord.channelNotes}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>设备状态：</strong>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                {viewingRecord.equipmentStatus}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>未完成事项：</strong>
              <div style={{ background: '#fff7e6', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                {viewingRecord.pendingTasks || '无'}
              </div>
              {(() => {
                const task = pendingTasks.find(t =>
                  t.sourceRecordId === viewingRecord.id &&
                  t.content === viewingRecord.pendingTasks
                )
                if (task) {
                  return (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      background: task.status === 'completed' ? '#f6ffed' : '#fff7e6',
                      borderRadius: 4,
                      fontSize: 12
                    }}>
                      <Space>
                        {task.status === 'completed' ? (
                          <>
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            <span style={{ color: '#52c41a' }}>
                              已跟进（{formatDateTime(task.completedRecordId
                                ? voyageRecords.find(r => r.id === task.completedRecordId)?.handoverTime || ''
                                : '')}）
                            </span>
                          </>
                        ) : (
                          <>
                            <ClockCircleOutlined style={{ color: '#faad14' }} />
                            <span style={{ color: '#faad14' }}>待跟进中</span>
                          </>
                        )}
                      </Space>
                    </div>
                  )
                }
                return null
              })()}
            </div>
            {viewingRecord.remark && (
              <div>
                <strong style={{ display: 'block', marginBottom: 4 }}>备注：</strong>
                <div style={{ background: '#f0f5ff', padding: 12, borderRadius: 4 }}>
                  {viewingRecord.remark}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function formatDate(dateStr: string): string {
  return dayjs(dateStr).format('MM-DD')
}

export default HandoverRecords
