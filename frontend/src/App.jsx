import { useEffect, useState } from 'react'
import { api } from './services/api.js'

export default function App() {
  const [apiStatus, setApiStatus] = useState({
    loading: true,
    online: false,
    message: 'Verificando API...',
  })

  useEffect(() => {
    let active = true

    api
      .get('/api/health')
      .then((data) => {
        if (!active) return

        setApiStatus({
          loading: false,
          online: data?.status === 'ok',
          message: data?.message ?? 'API respondeu com sucesso.',
        })
      })
      .catch(() => {
        if (!active) return

        setApiStatus({
          loading: false,
          online: false,
          message: 'API indisponível. Inicie o backend PHP para testar a conexão.',
        })
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="hero">
        <span className="eyebrow">BASE DO PROJETO</span>
        <h1>React + Vite + PHP + MySQL</h1>
        <p>
          Estrutura inicial criada e preparada para evoluir com frontend e API
          separados.
        </p>

        <div className="status-card">
          <span
            className={`status-dot ${apiStatus.online ? 'online' : 'offline'}`}
            aria-hidden="true"
          />
          <div>
            <strong>
              {apiStatus.loading
                ? 'Conectando...'
                : apiStatus.online
                  ? 'API online'
                  : 'API offline'}
            </strong>
            <p>{apiStatus.message}</p>
          </div>
        </div>
      </section>
    </main>
  )
}
