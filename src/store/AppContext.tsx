import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import type { Voyage, Crew, Position, Shift, HandoverRecord, Incident } from '@/types'

interface AppState {
  voyages: Voyage[]
  crews: Crew[]
  positions: Position[]
  shifts: Shift[]
  handoverRecords: HandoverRecord[]
  incidents: Incident[]
  currentVoyageId: string | null
}

type AppAction =
  | { type: 'SET_STATE'; payload: Partial<AppState> }
  | { type: 'SET_CURRENT_VOYAGE'; payload: string | null }
  | { type: 'ADD_VOYAGE'; payload: Voyage }
  | { type: 'UPDATE_VOYAGE'; payload: Voyage }
  | { type: 'DELETE_VOYAGE'; payload: string }
  | { type: 'ADD_CREW'; payload: Crew }
  | { type: 'UPDATE_CREW'; payload: Crew }
  | { type: 'DELETE_CREW'; payload: string }
  | { type: 'ADD_POSITION'; payload: Position }
  | { type: 'UPDATE_POSITION'; payload: Position }
  | { type: 'DELETE_POSITION'; payload: string }
  | { type: 'ADD_SHIFT'; payload: Shift }
  | { type: 'UPDATE_SHIFT'; payload: Shift }
  | { type: 'DELETE_SHIFT'; payload: string }
  | { type: 'BATCH_UPDATE_SHIFTS'; payload: Shift[] }
  | { type: 'ADD_HANDOVER'; payload: HandoverRecord }
  | { type: 'UPDATE_HANDOVER'; payload: HandoverRecord }
  | { type: 'DELETE_HANDOVER'; payload: string }
  | { type: 'ADD_INCIDENT'; payload: Incident }
  | { type: 'UPDATE_INCIDENT'; payload: Incident }
  | { type: 'DELETE_INCIDENT'; payload: string }

const defaultPositions: Position[] = [
  { id: uuidv4(), name: '船长', type: 'bridge', description: '船舶总负责人', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '大副', type: 'bridge', description: '甲板部负责人', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '二副', type: 'bridge', description: '航行值班驾驶员', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '三副', type: 'bridge', description: '航行值班驾驶员', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '水手长', type: 'bridge', description: '水手团队负责人', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '轮机长', type: 'engine', description: '机舱总负责人', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '大管轮', type: 'engine', description: '轮机部高级船员', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '二管轮', type: 'engine', description: '轮机部高级船员', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '三管轮', type: 'engine', description: '轮机部高级船员', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  { id: uuidv4(), name: '机工长', type: 'engine', description: '机工团队负责人', createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss') }
]

const initialState: AppState = {
  voyages: [],
  crews: [],
  positions: defaultPositions,
  shifts: [],
  handoverRecords: [],
  incidents: [],
  currentVoyageId: null
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.payload }
    case 'SET_CURRENT_VOYAGE':
      return { ...state, currentVoyageId: action.payload }
    case 'ADD_VOYAGE':
      return { ...state, voyages: [...state.voyages, action.payload] }
    case 'UPDATE_VOYAGE':
      return {
        ...state,
        voyages: state.voyages.map(v => (v.id === action.payload.id ? action.payload : v))
      }
    case 'DELETE_VOYAGE':
      return {
        ...state,
        voyages: state.voyages.filter(v => v.id !== action.payload),
        shifts: state.shifts.filter(s => s.voyageId !== action.payload),
        handoverRecords: state.handoverRecords.filter(h => h.voyageId !== action.payload),
        incidents: state.incidents.filter(i => i.voyageId !== action.payload),
        currentVoyageId: state.currentVoyageId === action.payload ? null : state.currentVoyageId
      }
    case 'ADD_CREW':
      return { ...state, crews: [...state.crews, action.payload] }
    case 'UPDATE_CREW':
      return {
        ...state,
        crews: state.crews.map(c => (c.id === action.payload.id ? action.payload : c))
      }
    case 'DELETE_CREW':
      return {
        ...state,
        crews: state.crews.filter(c => c.id !== action.payload),
        shifts: state.shifts.filter(s => s.crewId !== action.payload)
      }
    case 'ADD_POSITION':
      return { ...state, positions: [...state.positions, action.payload] }
    case 'UPDATE_POSITION':
      return {
        ...state,
        positions: state.positions.map(p => (p.id === action.payload.id ? action.payload : p))
      }
    case 'DELETE_POSITION':
      return {
        ...state,
        positions: state.positions.filter(p => p.id !== action.payload),
        crews: state.crews.filter(c => c.positionId !== action.payload),
        shifts: state.shifts.filter(s => s.positionId !== action.payload)
      }
    case 'ADD_SHIFT':
      return { ...state, shifts: [...state.shifts, action.payload] }
    case 'UPDATE_SHIFT':
      return {
        ...state,
        shifts: state.shifts.map(s => (s.id === action.payload.id ? action.payload : s))
      }
    case 'DELETE_SHIFT':
      return {
        ...state,
        shifts: state.shifts.filter(s => s.id !== action.payload)
      }
    case 'BATCH_UPDATE_SHIFTS': {
      const updatedIds = new Set(action.payload.map(s => s.id))
      const otherShifts = state.shifts.filter(s => !updatedIds.has(s.id))
      return { ...state, shifts: [...otherShifts, ...action.payload] }
    }
    case 'ADD_HANDOVER':
      return { ...state, handoverRecords: [...state.handoverRecords, action.payload] }
    case 'UPDATE_HANDOVER':
      return {
        ...state,
        handoverRecords: state.handoverRecords.map(h => (h.id === action.payload.id ? action.payload : h))
      }
    case 'DELETE_HANDOVER':
      return {
        ...state,
        handoverRecords: state.handoverRecords.filter(h => h.id !== action.payload)
      }
    case 'ADD_INCIDENT':
      return { ...state, incidents: [...state.incidents, action.payload] }
    case 'UPDATE_INCIDENT':
      return {
        ...state,
        incidents: state.incidents.map(i => (i.id === action.payload.id ? action.payload : i))
      }
    case 'DELETE_INCIDENT':
      return {
        ...state,
        incidents: state.incidents.filter(i => i.id !== action.payload)
      }
    default:
      return state
  }
}

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextType | undefined>(undefined)

const STORAGE_KEY = 'crew-duty-system-data'

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY)
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        dispatch({
          type: 'SET_STATE',
          payload: {
            ...parsed,
            positions: parsed.positions?.length > 0 ? parsed.positions : defaultPositions
          }
        })
      } catch (e) {
        console.error('Failed to load saved data:', e)
      }
    }
  }, [])

  useEffect(() => {
    const { voyages, crews, positions, shifts, handoverRecords, incidents, currentVoyageId } = state
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ voyages, crews, positions, shifts, handoverRecords, incidents, currentVoyageId })
    )
  }, [state])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
