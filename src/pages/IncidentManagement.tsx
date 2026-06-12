import React, { useState } from 'react'
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
  Upload,
  Badge,
  Timeline
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { useApp } from '@/store/AppContext'
import { formatDateTime, formatTime } from '@/utils'
import type { Incident } from '@/types'

const { TextArea } = Input
const { Option } = Select

const typeOptions = [
  { value: 'safety', label: '安全事故', color: 'red' },
  { value: 'equipment', label: '设备故障', color: 'orange' },
  { value: 'navigation', label: '航行异常', color: 'blue' },
  { value: 'other', label: '其他事件', color: 'default' }
]

const levelOptions = [
  { value: 'minor', label: '轻微', color: 'green' },
  { value: 'moderate', label: '一般', color: 'gold' },
  { value: 'severe', label: '严重', color: 'red' }
]

const statusOptions = [
  { value: 'pending', label: '待处理', color: 'default', icon: <ClockCircleOutlined /> },
  { value: 'processing', label: '处理中', color: 'processing', icon: <ClockCircleOutlined /> },
  { value: 'resolved', label: '已解决', color: 'success', icon: <CheckCircleOutlined /> }
]

const IncidentManagement: React.FC = () => {
  const { state, dispatch } = useApp()
  const [form] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null)
  const [viewingIncident, setViewingIncident] = useState<Incident | null>(null)
  const [images, setImages] = useState<{ name: string; dataUrl: string }[]>([])

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
  const voyageShifts = state.shifts.filter(s => s.voyageId === state.currentVoyageId)
  const voyageIncidents = state.incidents.filter(i => i.voyageId === state.currentVoyageId)

  const getCrewName = (crewId?: string) => {
    if (!crewId) return '-'
    return state.crews.find(c => c.id === crewId)?.name || '未知'
  }

  const getShiftInfo = (shiftId?: string) => {
    if (!shiftId) return null
    const shift = voyageShifts.find(s => s.id === shiftId)
    if (!shift) return null
    const crew = state.crews.find(c => c.id === shift.crewId)
    const position = state.positions.find(p => p.id === shift.positionId)
    return { shift, crew, position }
  }

  const getTypeTag = (type: Incident['type']) => {
    const config = typeOptions.find(t => t.value === type) || typeOptions[3]
    return <Tag color={config.color}>{config.label}</Tag>
  }

  const getLevelTag = (level: Incident['level']) => {
    const config = levelOptions.find(l => l.value === level)
    if (!config) return null
    return (
      <Tag color={config.color} icon={level === 'severe' ? <WarningOutlined /> : undefined}>
        {config.label}
      </Tag>
    )
  }

  const getStatusTag = (status: Incident['status']) => {
    const config = statusOptions.find(s => s.value === status) || statusOptions[0]
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.label}
      </Tag>
    )
  }

  const handleSelectImage = async () => {
    try {
      const result = await window.electronAPI.selectImage()
      if (result.success && result.dataUrl && result.fileName) {
        setImages([...images, { name: result.fileName, dataUrl: result.dataUrl }])
        message.success('图片已添加')
      }
    } catch (e) {
      message.error('图片选择失败')
    }
  }

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
  }

  const handleAdd = () => {
    setEditingIncident(null)
    setImages([])
    form.resetFields()
    form.setFieldsValue({
      reportedTime: dayjs(),
      type: 'equipment',
      level: 'moderate',
      status: 'pending'
    })
    setModalVisible(true)
  }

  const handleEdit = (incident: Incident) => {
    setEditingIncident(incident)
    setImages(incident.images || [])
    form.setFieldsValue({
      ...incident,
      reportedTime: dayjs(incident.reportedTime),
      resolvedTime: incident.resolvedTime ? dayjs(incident.resolvedTime) : null
    })
    setModalVisible(true)
  }

  const handleView = (incident: Incident) => {
    setViewingIncident(incident)
    setDetailVisible(true)
  }

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_INCIDENT', payload: id })
    message.success('事件已删除')
  }

  const handleSubmit = () => {
    form.validateFields().then(values => {
      const incidentData: Omit<Incident, 'id' | 'createdAt'> = {
        voyageId: state.currentVoyageId!,
        shiftId: values.shiftId,
        crewId: values.crewId,
        title: values.title,
        description: values.description,
        type: values.type,
        level: values.level,
        status: values.status,
        images: images,
        resolution: values.resolution,
        reportedTime: values.reportedTime.format('YYYY-MM-DD HH:mm'),
        resolvedTime: values.status === 'resolved' && values.resolvedTime
          ? values.resolvedTime.format('YYYY-MM-DD HH:mm')
          : undefined
      }

      if (incidentData.status === 'resolved' && !incidentData.resolution) {
        message.error('请填写处理结果')
        return
      }

      if (editingIncident) {
        dispatch({
          type: 'UPDATE_INCIDENT',
          payload: { ...editingIncident, ...incidentData }
        })
        message.success('事件已更新')
      } else {
        dispatch({
          type: 'ADD_INCIDENT',
          payload: {
            ...incidentData,
            id: uuidv4(),
            createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
          }
        })
        message.success('事件已记录')
      }
      setModalVisible(false)
    })
  }

  const columns = [
    {
      title: '事件标题',
      dataIndex: 'title',
      key: 'title',
      width: 180,
      render: (title: string, record: Incident) => (
        <div>
          <Badge
            status={record.status === 'resolved' ? 'success' :
                    record.status === 'processing' ? 'processing' : 'warning'}
          />
          {title}
        </div>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: Incident['type']) => getTypeTag(type)
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (level: Incident['level']) => getLevelTag(level)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: Incident['status']) => getStatusTag(status)
    },
    {
      title: '报告时间',
      dataIndex: 'reportedTime',
      key: 'reportedTime',
      width: 160,
      render: (time: string) => formatDateTime(time)
    },
    {
      title: '关联人员',
      dataIndex: 'crewId',
      key: 'crewId',
      width: 100,
      render: (crewId?: string) => getCrewName(crewId)
    },
    {
      title: '图片',
      key: 'images',
      width: 60,
      render: (_: unknown, record: Incident) => (
        record.images?.length ? (
          <Tag color="blue">{record.images.length}张</Tag>
        ) : '-'
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: Incident) => (
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
            title="确定删除此事件吗？"
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

  const stats = {
    total: voyageIncidents.length,
    pending: voyageIncidents.filter(i => i.status === 'pending').length,
    processing: voyageIncidents.filter(i => i.status === 'processing').length,
    resolved: voyageIncidents.filter(i => i.status === 'resolved').length,
    severe: voyageIncidents.filter(i => i.level === 'severe').length
  }

  if (!state.currentVoyageId || !currentVoyage) {
    return (
      <div className="page-container">
        <Empty description="请先在航次看板中选择一个航次" />
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">异常事件</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          记录事件
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">事件总数</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#faad14' }}>{stats.pending}</div>
            <div className="stat-label">待处理</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#1677ff' }}>{stats.processing}</div>
            <div className="stat-label">处理中</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#52c41a' }}>{stats.resolved}</div>
            <div className="stat-label">已解决</div>
          </div>
        </Col>
      </Row>

      {stats.severe > 0 && (
        <Card
          style={{ marginBottom: 16, background: '#fff1f0', borderColor: '#ffa39e' }}
        >
          <div style={{ color: '#f5222d', fontWeight: 600 }}>
            <WarningOutlined style={{ marginRight: 8 }} />
            当前有 {stats.severe} 起严重事件需要关注
          </div>
        </Card>
      )}

      <Card title="事件列表">
        <Table
          columns={columns}
          dataSource={voyageIncidents}
          rowKey="id"
          bordered
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Card title="处理时间线" style={{ marginTop: 16 }}>
        {voyageIncidents.length === 0 ? (
          <Empty description="暂无异常事件" />
        ) : (
          <Timeline
            mode="left"
            items={voyageIncidents
              .sort((a, b) => dayjs(b.reportedTime).valueOf() - dayjs(a.reportedTime).valueOf())
              .slice(0, 10)
              .map(incident => ({
                color: incident.status === 'resolved' ? 'green' :
                       incident.level === 'severe' ? 'red' : 'blue',
                label: formatDateTime(incident.reportedTime),
                children: (
                  <div>
                    <div style={{ fontWeight: 600 }}>{incident.title}</div>
                    <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                      {getTypeTag(incident.type)} {getLevelTag(incident.level)} {getStatusTag(incident.status)}
                    </div>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      {incident.description.slice(0, 50)}{incident.description.length > 50 ? '...' : ''}
                    </div>
                  </div>
                )
              }))}
          />
        )}
      </Card>

      <Modal
        title={editingIncident ? '编辑异常事件' : '记录异常事件'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
        maskClosable={false}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item
                name="title"
                label="事件标题"
                rules={[{ required: true, message: '请输入事件标题' }]}
              >
                <Input placeholder="简要描述事件" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="reportedTime"
                label="报告时间"
                rules={[{ required: true, message: '请选择报告时间' }]}
              >
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="type"
                label="事件类型"
                rules={[{ required: true, message: '请选择类型' }]}
              >
                <Select>
                  {typeOptions.map(opt => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="level"
                label="严重程度"
                rules={[{ required: true, message: '请选择严重程度' }]}
              >
                <Select>
                  {levelOptions.map(opt => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="status"
                label="处理状态"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select>
                  {statusOptions.map(opt => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="shiftId" label="关联班次">
                <Select allowClear placeholder="选择关联的班次">
                  {voyageShifts.map(shift => {
                    const crew = state.crews.find(c => c.id === shift.crewId)
                    return (
                      <Option key={shift.id} value={shift.id}>
                        {crew?.name} - {formatTime(shift.startTime)}~{formatTime(shift.endTime)}
                      </Option>
                    )
                  })}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="crewId" label="关联人员">
                <Select allowClear placeholder="选择关联的船员">
                  {state.crews.map(crew => (
                    <Option key={crew.id} value={crew.id}>
                      {crew.name} - {crew.position}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="description"
            label="事件描述"
            rules={[{ required: true, message: '请填写事件描述' }]}
          >
            <TextArea
              rows={4}
              placeholder="详细描述事件发生的时间、地点、经过和影响"
            />
          </Form.Item>
          <Form.Item label="现场图片">
            <div style={{ marginBottom: 8 }}>
              <Button
                icon={<UploadOutlined />}
                onClick={handleSelectImage}
              >
                选择图片
              </Button>
              <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                支持 JPG、PNG 格式
              </span>
            </div>
            <div className="image-upload-list">
              {images.map((img, index) => (
                <div key={index} className="image-upload-item">
                  <img src={img.dataUrl} alt={img.name} />
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeImage(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </Form.Item>
          <Form.Item
            name="resolution"
            label="处理结果"
            rules={[
              {
                validator: (_, value) => {
                  const status = form.getFieldValue('status')
                  if (status === 'resolved' && !value) {
                    return Promise.reject('请填写处理结果')
                  }
                  return Promise.resolve()
                }
              }
            ]}
          >
            <TextArea
              rows={3}
              placeholder="请描述事件的处理过程和结果（状态设为已解决时必填）"
            />
          </Form.Item>
          <Form.Item
            name="resolvedTime"
            label="解决时间"
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="事件详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {viewingIncident && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="事件标题" span={2}>
                {viewingIncident.title}
              </Descriptions.Item>
              <Descriptions.Item label="事件类型">
                {getTypeTag(viewingIncident.type)}
              </Descriptions.Item>
              <Descriptions.Item label="严重程度">
                {getLevelTag(viewingIncident.level)}
              </Descriptions.Item>
              <Descriptions.Item label="处理状态">
                {getStatusTag(viewingIncident.status)}
              </Descriptions.Item>
              <Descriptions.Item label="报告时间">
                {formatDateTime(viewingIncident.reportedTime)}
              </Descriptions.Item>
              <Descriptions.Item label="关联人员">
                {getCrewName(viewingIncident.crewId)}
              </Descriptions.Item>
              {viewingIncident.resolvedTime && (
                <Descriptions.Item label="解决时间" span={2}>
                  {formatDateTime(viewingIncident.resolvedTime)}
                </Descriptions.Item>
              )}
              {(() => {
                const info = getShiftInfo(viewingIncident.shiftId)
                if (!info) return null
                return (
                  <>
                    <Descriptions.Item label="关联班次" span={2}>
                      {info.crew?.name} - {info.position?.name} ({formatTime(info.shift.startTime)} - {formatTime(info.shift.endTime)})
                    </Descriptions.Item>
                  </>
                )
              })()}
            </Descriptions>

            <Card
              title="事件描述"
              size="small"
              style={{ marginTop: 16 }}
            >
              <div style={{ whiteSpace: 'pre-wrap' }}>{viewingIncident.description}</div>
            </Card>

            {viewingIncident.images && viewingIncident.images.length > 0 && (
              <Card
                title="现场图片"
                size="small"
                style={{ marginTop: 16 }}
              >
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {viewingIncident.images.map((img, index) => (
                    <img
                      key={index}
                      src={img.dataUrl}
                      alt={img.name}
                      style={{
                        maxWidth: 200,
                        maxHeight: 150,
                        border: '1px solid #e8e8e8',
                        borderRadius: 4
                      }}
                    />
                  ))}
                </div>
              </Card>
            )}

            {viewingIncident.resolution && (
              <Card
                title="处理结果"
                size="small"
                style={{ marginTop: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}
              >
                <div style={{ whiteSpace: 'pre-wrap' }}>{viewingIncident.resolution}</div>
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default IncidentManagement
