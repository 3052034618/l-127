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
  Divider
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined
} from '@ant-design/icons'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { useApp } from '@/store/AppContext'
import { formatDateTime, formatTime } from '@/utils'
import type { HandoverRecord, Shift } from '@/types'

const { TextArea } = Input
const { Option } = Select

const weatherOptions = ['晴', '多云', '阴', '小雨', '中雨', '大雨', '暴雨', '雾', '大风', '雷暴']

const HandoverRecords: React.FC = () => {
  const { state, dispatch } = useApp()
  const [form] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HandoverRecord | null>(null)
  const [viewingRecord, setViewingRecord] = useState<HandoverRecord | null>(null)

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
  const voyageShifts = state.shifts.filter(s => s.voyageId === state.currentVoyageId)
  const voyageRecords = state.handoverRecords.filter(h => h.voyageId === state.currentVoyageId)

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
    return voyageShifts
      .filter(s => dayjs(s.endTime).isBefore(dayjs()))
      .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())
  }

  const handleAdd = () => {
    const availableShifts = getAvailableShifts()
    if (availableShifts.length === 0) {
      message.warning('暂无已完成的班次可用于交接')
      return
    }
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({
      handoverTime: dayjs(),
      speed: '12',
      weather: '晴',
      channelNotes: '航道正常，无异常情况',
      equipmentStatus: '设备运行正常',
      pendingTasks: '无'
    })
    setModalVisible(true)
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
        pendingTasks: values.pendingTasks,
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
    })
  }

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
      title: '天气',
      dataIndex: 'weather',
      key: 'weather',
      width: 80,
      render: (weather: string) => <Tag>{weather}</Tag>
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">交接记录</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增交接
        </Button>
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
            <div className="stat-value">{voyageShifts.length}</div>
            <div className="stat-label">总班次</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#52c41a' }}>
              {voyageShifts.filter(s => dayjs(s.endTime).isBefore(dayjs())).length}
            </div>
            <div className="stat-label">已完成班次</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#faad14' }}>
              {voyageShifts.filter(s => dayjs(s.endTime).isAfter(dayjs())).length}
            </div>
            <div className="stat-label">待交接班次</div>
          </div>
        </Col>
      </Row>

      <Card title="交接记录列表">
        <Table
          columns={columns}
          dataSource={voyageRecords}
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
                    <strong style={{ color: '#666' }}>未完成事项：</strong>
                    <p style={{ marginTop: 4 }}>{record.pendingTasks || '无'}</p>
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
        title={editingRecord ? '编辑交接记录' : '新增交接记录'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
        maskClosable={false}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="shiftId"
                label="选择班次"
                rules={[{ required: true, message: '请选择交接班次' }]}
              >
                <Select placeholder="请选择交接的班次">
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
                label="接班人员"
                rules={[{ required: true, message: '请选择接班人员' }]}
              >
                <Select placeholder="请选择接班人员">
                  {state.crews.map(crew => (
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
            label="未完成事项"
            rules={[{ required: true, message: '请填写未完成事项' }]}
          >
            <TextArea
              rows={3}
              placeholder="请描述需要下一班次继续处理的事项"
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
        width={700}
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
              <div style={{ background: '#fff7e6', padding: 12, borderRadius: 4 }}>
                {viewingRecord.pendingTasks}
              </div>
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

export default HandoverRecords
