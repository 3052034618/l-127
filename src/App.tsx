import React, { useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography } from 'antd'
import {
  DashboardOutlined,
  ScheduleOutlined,
  SwapOutlined,
  WarningOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined
} from '@ant-design/icons'
import VoyageDashboard from './pages/VoyageDashboard'
import ShiftScheduling from './pages/ShiftScheduling'
import HandoverRecords from './pages/HandoverRecords'
import IncidentManagement from './pages/IncidentManagement'
import Reports from './pages/Reports'
import CrewManagement from './pages/CrewManagement'
import PositionManagement from './pages/PositionManagement'
import { useApp } from './store/AppContext'
import type { MenuProps } from 'antd'

const { Header, Sider, Content } = Layout
const { Title } = Typography

type MenuItem = Required<MenuProps>['items'][number]

const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { state } = useApp()

  const currentVoyage = state.voyages.find(v => v.id === state.currentVoyageId)

  const mainMenuItems: MenuItem[] = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: <NavLink to="/">航次看板</NavLink>
    },
    {
      key: '/shifts',
      icon: <ScheduleOutlined />,
      label: <NavLink to="/shifts">班次编排</NavLink>,
      disabled: !state.currentVoyageId
    },
    {
      key: '/handover',
      icon: <SwapOutlined />,
      label: <NavLink to="/handover">交接记录</NavLink>,
      disabled: !state.currentVoyageId
    },
    {
      key: '/incidents',
      icon: <WarningOutlined />,
      label: <NavLink to="/incidents">异常事件</NavLink>,
      disabled: !state.currentVoyageId
    },
    {
      key: '/reports',
      icon: <FileTextOutlined />,
      label: <NavLink to="/reports">报表窗口</NavLink>,
      disabled: !state.currentVoyageId
    }
  ]

  const managementMenuItems: MenuItem[] = [
    {
      key: '/crew',
      icon: <TeamOutlined />,
      label: <NavLink to="/crew">船员管理</NavLink>
    },
    {
      key: '/positions',
      icon: <SettingOutlined />,
      label: <NavLink to="/positions">岗位设置</NavLink>
    }
  ]

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: '#1677ff',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
              fontWeight: 'bold'
            }}
          >
            船
          </div>
          <Title level={4} style={{ color: '#fff', margin: 0 }}>
            水路运输船员值班管理系统
          </Title>
        </div>
        {currentVoyage && (
          <div style={{ marginLeft: 'auto', color: '#fff', fontSize: 14 }}>
            当前航次：<span style={{ fontWeight: 600 }}>{currentVoyage.name}</span>
            <span style={{ marginLeft: 16, opacity: 0.8 }}>
              {currentVoyage.departurePort} → {currentVoyage.arrivalPort}
            </span>
          </div>
        )}
      </Header>
      <Layout>
        <Sider
          width={220}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme="dark"
        >
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={[
              { type: 'group', label: '航次管理', children: mainMenuItems },
              { type: 'divider' },
              { type: 'group', label: '系统管理', children: managementMenuItems }
            ]}
          />
        </Sider>
        <Layout>
          <Content>
            <Routes>
              <Route path="/" element={<VoyageDashboard />} />
              <Route path="/shifts" element={<ShiftScheduling />} />
              <Route path="/handover" element={<HandoverRecords />} />
              <Route path="/incidents" element={<IncidentManagement />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/crew" element={<CrewManagement />} />
              <Route path="/positions" element={<PositionManagement />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}

export default App
