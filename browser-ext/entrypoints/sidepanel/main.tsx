import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppConfigProvider } from '../../contexts/AppConfig'
import { Sidebar } from '../../components/Sidebar'
import '../../assets/tailwind.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppConfigProvider>
      <Sidebar />
    </AppConfigProvider>
  </React.StrictMode>
)
