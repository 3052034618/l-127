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
  Tag
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { useApp } from '@/store/AppContext'
import type { Crew } from '@/types'

const { TextArea } = Input
const { Option } = Select

const CrewManagement: React.FC = () => {
  const { state, dispatch } = useApp()
  const [form] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [editingCrew, setEditingCrew] = useState<Crew | null>(null)

  const handleAdd = () => {
    setEditingCrew(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (crew: Crew) => {
    setEditingCrew(crew)
    form.setFieldsValue(crew)
    setModalVisible(true)
  }

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_CREW', payload: id })
    message.success('船员已删除')
  }

  const handleSubmit = () => {
    form.validateFields().then(values => {
      const position = state.positions.find(p => p.id === values.positionId)

      const crewData: Omit<Crew, 'id' | 'createdAt'> = {
        name: values.name,
        position: position?.name || '',
        positionId: values.positionId,
        phone: values.phone,
        remark: values.remark
      }

      if (editingCrew) {
        dispatch({
          type: 'UPDATE_CREW',
          payload: { ...editingCrew, ...crewData }
        })
        message.success('船员信息已更新')
      } else {
        dispatch({
          type: 'ADD_CREW',
          payload: {
            ...crewData,
            id: uuidv4(),
            createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
          }
        })
        message.success('船员已添加')
      }
      setModalVisible(false)
    })
  }

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120
    },
    {
      title: '岗位',
      dataIndex: 'position',
      key: 'position',
      width: 120,
      render: (_: string, record: Crew) => {
        const position = state.positions.find(p => p.id === record.positionId)
        return (
          <Tag className={`position-badge ${position?.type || 'bridge'}`}>
            {record.position}
          </Tag>
        )
      }
    },
    {
      title: '岗位类型',
      key: 'positionType',
      width: 120,
      render: (_: unknown, record: Crew) => {
        const position = state.positions.find(p => p.id === record.positionId)
        const typeMap = {
          bridge: { text: '驾驶台', color: 'blue' },
          engine: { text: '机舱', color: 'orange' }
        }
        const type = position?.type || 'bridge'
        return <Tag color={typeMap[type].color}>{typeMap[type].text}</Tag>
      }
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      key: 'phone',
      width: 150
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark'
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Crew) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此船员吗？"
            description="删除后该船员的相关排班也会被移除"
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">船员管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加船员
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={state.crews}
        rowKey="id"
        bordered
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingCrew ? '编辑船员' : '添加船员'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入船员姓名" />
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
            name="phone"
            label="联系电话"
          >
            <Input placeholder="请输入联系电话" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={3} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CrewManagement
