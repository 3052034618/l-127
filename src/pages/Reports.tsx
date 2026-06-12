import React, { useMemo, useState } from 'react'
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
  Descriptions
} from 'antd'
import {
  ExportOutlined,
  FileExcelOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined
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
import type { FatigueInfo } from '@/types'

const { RangePicker } = DatePicker
const { Option } = Select

const Reports: React.FC = () => {
  const { state } = useApp()
  const [form] = Form.useForm()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [exportType, setExportType] = useState<'all' | 'shifts' | 'handover' | 'fatigue'>('all')

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
  const voyageShifts = state.shifts.filter(s => s.voyageId === state.currentVoyageId)
  const voyageRecords = state.handoverRecords.filter(h => h.voyageId === state.currentVoyageId)
  const voyageIncidents = state.incidents.filter(i => i.voyageId === state.currentVoyageId)

  const filteredShifts = useMemo(() => {
    if (!dateRange) return voyageShifts
    return voyageShifts.filter(s => {
      const shiftDate = dayjs(s.date)
      return shiftDate.isAfter(dateRange[0].startOf('day')) &&
             shiftDate.isBefore(dateRange[1].endOf('day'))
    })
  }, [voyageShifts, dateRange])

  const filteredRecords = useMemo(() => {
    if (!dateRange) return voyageRecords
    return voyageRecords.filter(h => {
      const recordDate = dayjs(h.handoverTime)
      return recordDate.isAfter(dateRange[0].startOf('day')) &&
             recordDate.isBefore(dateRange[1].endOf('day'))
    })
  }, [voyageRecords, dateRange])

  const fatigueInfoList = useMemo((): FatigueInfo[] => {
    if (!currentVoyage) return []
    return state.crews.map(crew =>
      calculateFatigueInfo(crew, voyageShifts, currentVoyage.departureTime)
    ).sort((a, b) => {
      const levelOrder = { high: 0, medium: 1, low: 2 }
      return levelOrder[a.riskLevel] - levelOrder[b.riskLevel]
    })
  }, [state.crews, voyageShifts, currentVoyage])

  const getCrewName = (crewId: string) => {
    return state.crews.find(c => c.id === crewId)?.name || '未知'
  }

  const getPositionName = (positionId: string) => {
    return state.positions.find(p => p.id === positionId)?.name || '未知'
  }

  const getPositionType = (positionId: string) => {
    return state.positions.find(p => p.id === positionId)?.type || 'bridge'
  }

  const handleExport = async () => {
    if (!currentVoyage) {
      message.error('请先选择航次')
      return
    }

    try {
      const wb = XLSX.utils.book_new()

      if (exportType === 'all' || exportType === 'shifts') {
        const shiftData = filteredShifts
          .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())
          .map(s => ({
            '日期': s.date,
            '岗位': getPositionName(s.positionId),
            '岗位类型': getPositionType(s.positionId) === 'bridge' ? '驾驶台' : '机舱',
            '船员': getCrewName(s.crewId),
            '开始时间': formatTime(s.startTime),
            '结束时间': formatTime(s.endTime),
            '时长(小时)': getShiftDurationHours(s.startTime, s.endTime).toFixed(1)
          }))

        const ws1 = XLSX.utils.json_to_sheet(shiftData)
        ws1['!cols'] = [
          { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
          { wch: 10 }, { wch: 10 }, { wch: 12 }
        ]
        XLSX.utils.book_append_sheet(wb, ws1, '值班表')
      }

      if (exportType === 'all' || exportType === 'handover') {
        const handoverData = filteredRecords
          .sort((a, b) => dayjs(a.handoverTime).valueOf() - dayjs(b.handoverTime).valueOf())
          .map(h => ({
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

        const ws2 = XLSX.utils.json_to_sheet(handoverData)
        ws2['!cols'] = [
          { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
          { wch: 10 }, { wch: 8 }, { wch: 30 }, { wch: 30 },
          { wch: 30 }, { wch: 20 }
        ]
        XLSX.utils.book_append_sheet(wb, ws2, '交接记录')
      }

      if (exportType === 'all' || exportType === 'fatigue') {
        const fatigueData = fatigueInfoList.map(f => ({
          '船员': f.crewName,
          '总工作时长(小时)': f.totalHours,
          '最长连续工作(小时)': f.continuousHours,
          '休息时长(小时)': f.restHours,
          '班次数量': f.shiftCount,
          '风险等级': f.riskLevel === 'low' ? '低' : f.riskLevel === 'medium' ? '中' : '高',
          '预警信息': f.warnings.join('；')
        }))

        const ws3 = XLSX.utils.json_to_sheet(fatigueData)
        ws3['!cols'] = [
          { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
          { wch: 10 }, { wch: 10 }, { wch: 40 }
        ]
        XLSX.utils.book_append_sheet(wb, ws3, '疲劳风险')
      }

      if (exportType === 'all') {
        const incidentData = voyageIncidents
          .sort((a, b) => dayjs(a.reportedTime).valueOf() - dayjs(b.reportedTime).valueOf())
          .map(i => ({
            '标题': i.title,
            '类型': i.type === 'safety' ? '安全事故' : i.type === 'equipment' ? '设备故障' :
                    i.type === 'navigation' ? '航行异常' : '其他',
            '级别': i.level === 'minor' ? '轻微' : i.level === 'moderate' ? '一般' : '严重',
            '状态': i.status === 'pending' ? '待处理' : i.status === 'processing' ? '处理中' : '已解决',
            '报告时间': formatDateTime(i.reportedTime),
            '关联人员': getCrewName(i.crewId || ''),
            '描述': i.description,
            '处理结果': i.resolution || '',
            '解决时间': i.resolvedTime ? formatDateTime(i.resolvedTime) : ''
          }))

        const ws4 = XLSX.utils.json_to_sheet(incidentData)
        ws4['!cols'] = [
          { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 10 },
          { wch: 18 }, { wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 18 }
        ]
        XLSX.utils.book_append_sheet(wb, ws4, '异常事件')

        const summaryData = [{
          '航次名称': currentVoyage.name,
          '船舶名称': currentVoyage.vesselName,
          '航线': `${currentVoyage.departurePort} → ${currentVoyage.arrivalPort}`,
          '出发时间': formatDateTime(currentVoyage.departureTime),
          '预计到达': currentVoyage.arrivalTime ? formatDateTime(currentVoyage.arrivalTime) : '未设置',
          '船员人数': state.crews.length,
          '总班次': voyageShifts.length,
          '交接记录': voyageRecords.length,
          '异常事件': voyageIncidents.length,
          '高风险人数': fatigueInfoList.filter(f => f.riskLevel === 'high').length,
          '中风险人数': fatigueInfoList.filter(f => f.riskLevel === 'medium').length,
          '低风险人数': fatigueInfoList.filter(f => f.riskLevel === 'low').length
        }]

        const ws5 = XLSX.utils.json_to_sheet(summaryData)
        ws5['!cols'] = [
          { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 20 },
          { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
          { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
        ]
        XLSX.utils.book_append_sheet(wb, ws5, '航次摘要')
      }

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })
      const fileName = `${currentVoyage.name}_值班报表_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`

      const result = await window.electronAPI.saveFile({
        fileName,
        content: wbout
      })

      if (result.success) {
        message.success(`报表已导出到：${result.path}`)
      } else {
        message.info('已取消导出')
      }
    } catch (e) {
      console.error('Export error:', e)
      message.error('导出失败，请重试')
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
      label: '值班表',
      children: (
        <div>
          <Card
            title="值班安排"
            extra={
              <Space>
                <RangePicker
                  value={dateRange}
                  onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                  style={{ width: 280 }}
                />
                <Button
                  icon={<ExportOutlined />}
                  onClick={() => {
                    setExportType('shifts')
                    handleExport()
                  }}
                >
                  导出值班表
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
              pagination={{ pageSize: 20 }}
            />
          </Card>
        </div>
      )
    },
    {
      key: 'handover',
      label: '交接摘要',
      children: (
        <div>
          <Card
            title="交接记录摘要"
            extra={
              <Button
                icon={<ExportOutlined />}
                onClick={() => {
                  setExportType('handover')
                  handleExport()
                }}
              >
                导出交接记录
              </Button>
            }
          >
            {filteredRecords.length === 0 ? (
              <Empty description="暂无交接记录" />
            ) : (
              <div>
                {filteredRecords
                  .sort((a, b) => dayjs(b.handoverTime).valueOf() - dayjs(a.handoverTime).valueOf())
                  .map(record => (
                    <Card
                      key={record.id}
                      size="small"
                      style={{ marginBottom: 12 }}
                      title={
                        <Space>
                          <span>{formatDateTime(record.handoverTime)}</span>
                          <Tag>{getCrewName(record.fromCrewId)} → {getCrewName(record.toCrewId)}</Tag>
                          <Tag color="blue">航速: {record.speed}节</Tag>
                          <Tag>{record.weather}</Tag>
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
                          <strong style={{ color: '#faad14' }}>未完成事项：</strong>
                          <p style={{ marginTop: 4 }}>{record.pendingTasks}</p>
                        </Col>
                      </Row>
                    </Card>
                  ))}
              </div>
            )}
          </Card>
        </div>
      )
    },
    {
      key: 'fatigue',
      label: '疲劳风险',
      children: (
        <div>
          <Card
            title="船员疲劳风险评估"
            extra={
              <Button
                type="primary"
                icon={<ExportOutlined />}
                onClick={() => {
                  setExportType('fatigue')
                  handleExport()
                }}
              >
                导出疲劳报告
              </Button>
            }
          >
            {fatigueInfoList.length === 0 ? (
              <Empty description="暂无船员数据" />
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
    }
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">报表窗口</h2>
        <Space>
          <Form layout="inline" form={form}>
            <Form.Item label="导出内容" initialValue="all" name="exportType">
              <Select style={{ width: 150 }} onChange={setExportType} value={exportType}>
                <Option value="all">完整报表</Option>
                <Option value="shifts">仅值班表</Option>
                <Option value="handover">仅交接记录</Option>
                <Option value="fatigue">仅疲劳报告</Option>
              </Select>
            </Form.Item>
          </Form>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={handleExport}
          >
            导出Excel报表
          </Button>
        </Space>
      </div>

      <Card>
        <Tabs items={tabItems} />
      </Card>

      <Card
        title={<><InfoCircleOutlined style={{ marginRight: 8 }} />导出说明</>}
        style={{ marginTop: 16 }}
      >
        <ul style={{ margin: 0, paddingLeft: 20, color: '#666' }}>
          <li>完整报表包含：航次摘要、值班表、交接记录、疲劳风险、异常事件</li>
          <li>可通过上方筛选条件选择特定时间段的数据导出</li>
          <li>所有时间均使用24小时制，时长以小时为单位</li>
          <li>疲劳风险评估基于国际海事组织(IMO)疲劳管理标准</li>
          <li style={{ color: '#f5222d' }}>高风险提示：连续工作超过8小时或日均工作超过12小时</li>
        </ul>
      </Card>
    </div>
  )
}

export default Reports
