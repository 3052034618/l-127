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
  Descriptions,
  Input
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
  const [activeTab, setActiveTab] = useState('summary')
  const [shiftDateRange, setShiftDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [handoverDateRange, setHandoverDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [shiftCrewFilter, setShiftCrewFilter] = useState<string[]>([])
  const [handoverCrewFilter, setHandoverCrewFilter] = useState<string[]>([])
  const [fatigueRiskFilter, setFatigueRiskFilter] = useState<string>('all')
  const [exporting, setExporting] = useState(false)

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)
  const voyageShifts = state.shifts.filter(s => s.voyageId === state.currentVoyageId)
  const voyageRecords = state.handoverRecords.filter(h => h.voyageId === state.currentVoyageId)
  const voyageIncidents = state.incidents.filter(i => i.voyageId === state.currentVoyageId)

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

  const getCrewName = (crewId: string) => {
    return state.crews.find(c => c.id === crewId)?.name || '未知'
  }

  const getPositionName = (positionId: string) => {
    return state.positions.find(p => p.id === positionId)?.name || '未知'
  }

  const getPositionType = (positionId: string) => {
    return state.positions.find(p => p.id === positionId)?.type || 'bridge'
  }

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
      '解决时间': i.resolvedTime ? formatDateTime(i.resolvedTime) : ''
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

  const handleExport = async (exportType: 'all' | 'shifts' | 'handover' | 'fatigue') => {
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
          [20, 10, 8, 10, 18, 10, 18, 40, 40, 18], '异常事件', wb)
      } else if (exportType === 'shifts') {
        createWorksheet(buildShiftExportData(),
          [12, 12, 10, 12, 10, 10, 12], '值班表', wb)
      } else if (exportType === 'handover') {
        createWorksheet(buildHandoverExportData(),
          [18, 12, 10, 10, 10, 8, 30, 30, 30, 20], '交接记录', wb)
      } else if (exportType === 'fatigue') {
        createWorksheet(buildFatigueExportData(),
          [12, 16, 18, 14, 10, 10, 40], '疲劳风险', wb)
      }

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })

      const typeNames = {
        all: '完整报表',
        shifts: '值班表',
        handover: '交接记录',
        fatigue: '疲劳报告'
      }

      const filterSuffix = exportType !== 'all' ? `_${activeTab}` : ''
      const fileName = `${currentVoyage.name}_${typeNames[exportType]}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`

      const result = await window.electronAPI.saveFile({
        fileName,
        content: wbout
      })

      if (result.success) {
        const countText = exportType === 'shifts' ? `${filteredShifts.length}条记录`
          : exportType === 'handover' ? `${filteredRecords.length}条记录`
          : exportType === 'fatigue' ? `${fatigueInfoList.length}条记录`
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
    }
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
          <li><strong>单独导出</strong>：各页签的导出按钮仅导出当前页签的筛选数据</li>
          <li>可通过各页签的筛选条件（日期范围、船员、风险等级）选择特定数据导出</li>
          <li>所有时间均使用24小时制，时长以小时为单位</li>
          <li>疲劳风险评估基于国际海事组织(IMO)疲劳管理标准</li>
          <li style={{ color: '#f5222d' }}>高风险提示：连续工作超过8小时或日均工作超过12小时</li>
        </ul>
      </Card>
    </div>
  )
}

export default Reports
