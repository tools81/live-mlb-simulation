import { Route, Routes } from 'react-router-dom'
import { useTeamLogoPrefetch } from './hooks/useTeamLogoPrefetch'
import { GamePickerPage } from './pages/GamePicker/GamePickerPage'
import { SimulationPage } from './pages/Simulation/SimulationPage'
import { SettingsProvider } from './settings/SettingsContext'

export default function App() {
  useTeamLogoPrefetch()

  return (
    <SettingsProvider>
      <Routes>
        <Route path="/" element={<GamePickerPage />} />
        <Route path="/game/:gamePk" element={<SimulationPage />} />
      </Routes>
    </SettingsProvider>
  )
}
