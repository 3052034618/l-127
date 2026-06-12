import React, { useState } from 'react'
import {
  Button,
  Modal,
  Form,
  Input,
  Select,
  Table,
  Space,
  Popconfirm,
  message,
  Tag,
  Row,
  Col
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { useApp } from '@/store/AppContext'
import type { Position, PositionType } from '@/types'

const { TextArea } = Input
const { Option } = Select

const PositionManagement: React.FC = () => {
  const { state, dispatch } = useApp()
  const [form] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [editingPosition, setEditingPosition] = useState<Position | null>(null)

  const handleAdd = () => {
    setEditingPosition(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (position: Position) => {
    setEditingPosition(position)
    form.setFieldsValue(position)
    setModalVisible(true)
  }

  const handleDelete = (id: string) => {
    const crewCount = state.crews.filter(c => c.positionId === id).length
    if (crewCount > 0) {
      message.error(`该岗位下还有 ${crewCount} 名船员，请先调整船员岗位`)
      return
    }
    dispatch({ type: 'DELETE_POSITION', payload: id })
    message.success('岗位已删除')
  }

  const handleSubmit = () => {
    form.validateFields().then(values => {
      const positionData: Omit<Position, 'id' | 'createdAt'> = {
        name: values.name,
        type: values.type,
        description: values.description
      }

      if (editingPosition) {
        dispatch({
          type: 'UPDATE_POSITION',
          payload: { ...editingPosition, ...positionData }
        })
        message.success('岗位信息已更新')
      } else {
        dispatch({
          type: 'ADD_POSITION',
          payload: {
            ...positionData,
            id: uuidv4(),
            createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
          }
        })
        message.success('岗位已添加')
      }
      setModalVisible(false)
    })
  }

  const bridgePositions = state.positions.filter(p => p.type === 'bridge')
  const enginePositions = state.positions.filter(p => p.type === 'engine')

  const columns = [
    {
      title: '岗位名称',
      dataIndex: 'name',
      key: 'name',
      width: 150
    },
    {
      title: '岗位类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: PositionType) => {
        const typeMap = {
          bridge: { text: '驾驶台', color: 'blue' },
          engine: { text: '机舱', color: 'orange' }
        }
        return <Tag color={typeMap[type].color}>{typeMap[type].text}</Tag>
      }
    },
    {
      title: '在岗人数',
      key: 'crewCount',
      width: 100,
      render: (_: unknown, record: Position) => {
        const count = state.crews.filter(c => c.positionId === record.id).length
        return count > 0 ? <Tag color="blue">{count} 人</Tag> : <span style={{ color: '#999' }}>0 人</span>
      }
    },
    {
      title: '职责描述',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Position) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此岗位吗？"
            description="只有在岗人数为0时才能删除"
            onConfirm={() => handleDelete(record.id)}
            disabled={state.crews.filter(c => c.positionId === record.id).length > 0}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={state.crews.filter(c => c.positionId === record.id).length > 0}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">岗位设置</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加岗位
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value">{state.positions.length}</div>
            <div className="stat-label">总岗位数</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#1677ff' }}>{bridgePositions.length}</div>
            <div className="stat-label">驾驶台岗位</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#fa8c16' }}>{enginePositions.length}</div>
            <div className="stat-label">机舱岗位</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-value">{state.crews.length}</div>
            <div className="stat-label">船员总数</div>
          </div>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={state.positions}
        rowKey="id"
        bordered
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingPosition ? '编辑岗位' : '添加岗位'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="岗位名称"
            rules={[{ required: true, message: '请输入岗位名称' }]}
          >
            <Input placeholder="如：船长、大副等" />
          </Form.Item>
          <Form.Item
            name="type"
            label="岗位类型"
            rules={[{ required: true, message: '请选择岗位类型' }]}
          >
            <Select placeholder="请选择岗位类型">
              <Option value="bridge">驾驶台</Option>
              <Option value="engine">机舱</Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="职责描述">
            <TextArea rows={3} placeholder="岗位主要职责描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PositionManagement
