import React, { useState, useMemo } from 'react'
import {
  Button,
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Space,
  Popconfirm,
  message,
  Empty
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { useApp } from '@/store/AppContext'
import { formatDateTime, calculateFatigueInfo } from '@/utils'
import type { Voyage } from '@/types'

const { TextArea } = Input
const { RangePicker } = DatePicker
const { Option } = Select

const VoyageDashboard: React.FC = () => {
  const { state, dispatch } = useApp()
  const [form] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [editingVoyage, setEditingVoyage] = useState<Voyage | null>(null)

  const voyageStats = useMemo(() => {
    const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
    const stats = {
      total: state.voyages.length,
      ongoing: state.voyages.filter(v => v.status === 'ongoing').length,
      pending: state.voyages.filter(v => v.status === 'pending').length,
      completed: state.voyages.filter(v => v.status === 'completed').length
    }

    const fatigueWarnings: string[] = []
    if (currentVoyage) {
      state.crews.forEach(crew => {
        const fatigue = calculateFatigueInfo(
          crew,
          state.shifts.filter(s => s.voyageId === currentVoyage.id),
          currentVoyage.departureTime
        )
        if (fatigue.riskLevel === 'high') {
          fatigueWarnings.push(`${crew.name} 存在高疲劳风险`)
        }
      })
    }

    return { ...stats, fatigueWarnings }
  }, [state])

  const handleAdd = () => {
    setEditingVoyage(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (voyage: Voyage) => {
    setEditingVoyage(voyage)
    form.setFieldsValue({
      ...voyage,
      dateRange: [dayjs(voyage.departureTime), voyage.arrivalTime ? dayjs(voyage.arrivalTime) : null]
    })
    setModalVisible(true)
  }

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_VOYAGE', payload: id })
    message.success('航次已删除')
  }

  const handleSubmit = () => {
    form.validateFields().then(values => {
      const [departureTime, arrivalTime] = values.dateRange || []
      if (!departureTime) {
        message.error('请选择出发时间')
        return
      }

      const voyageData: Omit<Voyage, 'id' | 'createdAt'> = {
        name: values.name,
        vesselName: values.vesselName,
        departurePort: values.departurePort,
        arrivalPort: values.arrivalPort,
        departureTime: departureTime.format('YYYY-MM-DD HH:mm'),
        arrivalTime: arrivalTime ? arrivalTime.format('YYYY-MM-DD HH:mm') : undefined,
        status: values.status,
        description: values.description
      }

      if (editingVoyage) {
        dispatch({
          type: 'UPDATE_VOYAGE',
          payload: { ...editingVoyage, ...voyageData }
        })
        message.success('航次已更新')
      } else {
        dispatch({
          type: 'ADD_VOYAGE',
          payload: {
            ...voyageData,
            id: uuidv4(),
            createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
          }
        })
        message.success('航次已创建')
      }
      setModalVisible(false)
    })
  }

  const handleSelectVoyage = (voyage: Voyage) => {
    dispatch({ type: 'SET_CURRENT_VOYAGE', payload: voyage.id })
    message.info(`已选择航次：${voyage.name}`)
  }

  const getStatusTag = (status: Voyage['status']) => {
    const statusMap = {
      pending: { color: 'default', text: '待开始', icon: <ClockCircleOutlined /> },
      ongoing: { color: 'processing', text: '进行中', icon: <PlayCircleOutlined /> },
      completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> }
    }
    const config = statusMap[status]
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    )
  }

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">航次看板</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          创建航次
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card className="stat-card">
            <Statistic title="总航次数" value={voyageStats.total} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card">
            <Statistic title="待开始" value={voyageStats.pending} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card">
            <Statistic title="进行中" value={voyageStats.ongoing} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card">
            <Statistic title="已完成" value={voyageStats.completed} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      {voyageStats.fatigueWarnings.length > 0 && (
        <Card
          style={{ marginBottom: 24, background: '#fff1f0', borderColor: '#ffa39e' }}
          title={<span style={{ color: '#f5222d' }}>⚠️ 疲劳风险预警</span>}
        >
          {voyageStats.fatigueWarnings.map((warning, index) => (
            <div key={index} style={{ color: '#f5222d' }}>
              {warning}
            </div>
          ))}
        </Card>
      )}

      <Card title="航次列表">
        {state.voyages.length === 0 ? (
          <Empty description="暂无航次，点击右上角创建第一个航次" />
        ) : (
          <Row gutter={[16, 16]}>
            {state.voyages.map(voyage => (
              <Col xs={24} lg={12} xl={8} key={voyage.id}>
                <div
                  className={`voyage-card ${voyage.id === state.currentVoyageId ? 'active' : ''}`}
                  onClick={() => handleSelectVoyage(voyage)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{voyage.name}</h3>
                      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                        {voyage.vesselName}
                      </div>
                    </div>
                    {getStatusTag(voyage.status)}
                  </div>

                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <span style={{ color: '#1677ff' }}>{voyage.departurePort}</span>
                    <span style={{ margin: '0 8px', color: '#999' }}>→</span>
                    <span style={{ color: '#52c41a' }}>{voyage.arrivalPort}</span>
                  </div>

                  <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
                    <div>出发：{formatDateTime(voyage.departureTime)}</div>
                    {voyage.arrivalTime && <div>到达：{formatDateTime(voyage.arrivalTime)}</div>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={e => {
                        e.stopPropagation()
                        handleEdit(voyage)
                      }}
                    >
                      编辑
                    </Button>
                    <Popconfirm
                      title="确定删除此航次吗？"
                      description="删除后将同时删除相关的班次、交接记录和异常事件"
                      onConfirm={(e) => {
                        if (e) e.stopPropagation()
                        handleDelete(voyage.id)
                      }}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {currentVoyage && (
        <Card title="当前航次详情" style={{ marginTop: 24 }}>
          <Row gutter={[16, 16]}>
            <Col sm={12}>
              <div>
                <span style={{ color: '#666' }}>航次名称：</span>
                <strong>{currentVoyage.name}</strong>
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ color: '#666' }}>船舶名称：</span>
                {currentVoyage.vesselName}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ color: '#666' }}>航线：</span>
                {currentVoyage.departurePort} → {currentVoyage.arrivalPort}
              </div>
            </Col>
            <Col sm={12}>
              <div>
                <span style={{ color: '#666' }}>出发时间：</span>
                {formatDateTime(currentVoyage.departureTime)}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ color: '#666' }}>预计到达：</span>
                {currentVoyage.arrivalTime ? formatDateTime(currentVoyage.arrivalTime) : '未设置'}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ color: '#666' }}>状态：</span>
                {getStatusTag(currentVoyage.status)}
              </div>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={8}>
              <Statistic
                title="船员人数"
                value={state.crews.length}
                valueStyle={{ fontSize: 18 }}
              />
            </Col>
            <Col xs={8}>
              <Statistic
                title="班次数量"
                value={state.shifts.filter(s => s.voyageId === currentVoyage.id).length}
                valueStyle={{ fontSize: 18 }}
              />
            </Col>
            <Col xs={8}>
              <Statistic
                title="异常事件"
                value={state.incidents.filter(i => i.voyageId === currentVoyage.id).length}
                valueStyle={{ fontSize: 18 }}
              />
            </Col>
          </Row>

          {currentVoyage.description && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <span style={{ color: '#666' }}>备注：</span>
              {currentVoyage.description}
            </div>
          )}
        </Card>
      )}

      <Modal
        title={editingVoyage ? '编辑航次' : '创建航次'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col sm={12}>
              <Form.Item
                name="name"
                label="航次名称"
                rules={[{ required: true, message: '请输入航次名称' }]}
              >
                <Input placeholder="如：V20240101" />
              </Form.Item>
            </Col>
            <Col sm={12}>
              <Form.Item
                name="vesselName"
                label="船舶名称"
                rules={[{ required: true, message: '请输入船舶名称' }]}
              >
                <Input placeholder="如：中远之星" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col sm={12}>
              <Form.Item
                name="departurePort"
                label="出发港口"
                rules={[{ required: true, message: '请输入出发港口' }]}
              >
                <Input placeholder="如：上海港" />
              </Form.Item>
            </Col>
            <Col sm={12}>
              <Form.Item
                name="arrivalPort"
                label="到达港口"
                rules={[{ required: true, message: '请输入到达港口' }]}
              >
                <Input placeholder="如：宁波港" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="dateRange"
            label="航行时间"
            rules={[{ required: true, message: '请选择航行时间' }]}
          >
            <RangePicker
              showTime
              style={{ width: '100%' }}
              placeholder={['出发时间', '预计到达时间']}
            />
          </Form.Item>
          <Form.Item
            name="status"
            label="航次状态"
            rules={[{ required: true, message: '请选择状态' }]}
            initialValue="pending"
          >
            <Select>
              <Option value="pending">待开始</Option>
              <Option value="ongoing">进行中</Option>
              <Option value="completed">已完成</Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="备注">
            <TextArea rows={3} placeholder="航次相关备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default VoyageDashboard
