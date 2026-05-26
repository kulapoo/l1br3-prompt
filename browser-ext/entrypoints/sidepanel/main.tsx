import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppConfigProvider } from '../../contexts/AppConfig'
import { Sidebar } from '../../components/Sidebar'
import { useRealtimeSync } from '../../hooks/useRealtimeSync'
import '../../assets/tailwind.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Mounts the Realtime subscription inside both QueryClientProvider and
// AppConfigProvider so it can invalidate queries and read/write sync state.
function RealtimeBootstrap() {
  useRealtimeSync()
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider>
        <RealtimeBootstrap />
        <Sidebar />
      </AppConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
