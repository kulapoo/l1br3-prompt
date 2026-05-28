import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppConfigProvider } from '../../contexts/AppConfig'
import { AdminLayout } from '../../components/AdminLayout'
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

function RealtimeBootstrap() {
  useRealtimeSync()
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider>
        <RealtimeBootstrap />
        <AdminLayout />
      </AppConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
