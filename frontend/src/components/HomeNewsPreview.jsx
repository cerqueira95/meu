import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import UserAvatar from './UserAvatar.jsx'

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function excerpt(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > 180 ? `${value.slice(0, 177)}...` : value
}

export default function HomeNewsPreview({ onNavigate }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    api.get('/api/news')
      .then((data) => {
        if (active) setPosts((data.publicacoes || []).slice(0, 3))
      })
      .catch(() => {
        if (active) setPosts([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])
  return (
    <section className="home-news-section">
      <div className="section-heading home-news-heading">
        <div>
          <span className="dashboard-kicker">ÚLTIMAS NOVIDADES</span>
          <h2>Armazém New</h2>
          <p>As publicações mais recentes aparecem aqui assim que você entra.</p>
        </div>
        <button className="home-news-all" type="button" onClick={() => onNavigate?.('news')}>
          Ver todas
          <span>→</span>
        </button>
      </div>

      {loading ? (
        <div className="home-news-loading">Carregando novidades...</div>
      ) : posts.length === 0 ? (
        <div className="home-news-empty">
          <strong>Nenhuma publicação ainda.</strong>
          <span>Quando houver uma novidade, ela aparecerá aqui.</span>
        </div>
      ) : (
        <div className="home-news-grid">
          {posts.map((post, index) => {
            const images = Array.isArray(post.imagens_data) ? post.imagens_data : []
            const cover = images[0] || post.imagem_data || null

            return (
              <article className={`home-news-card ${index === 0 ? 'featured' : ''}`} key={post.id}>
                <button type="button" className="home-news-card-hit" onClick={() => onNavigate?.('news')}>
                  <div className="home-news-media">
                    {post.video_url ? (
                      <video src={post.video_url} muted preload="metadata" />
                    ) : cover ? (
                      <img src={cover} alt="" />
                    ) : (
                      <div className="home-news-media-placeholder">
                        <span>N</span>
                      </div>
                    )}
                    {post.video_url && <span className="home-news-video-badge">▶ Vídeo</span>}
                  </div>
                  <div className="home-news-content">
                    <div className="home-news-author">
                      <UserAvatar
                        name={post.autor.nome}
                        photo={post.autor.foto_perfil}
                        className="home-news-avatar"
                      />
                      <div>
                        <strong>{post.autor.nome}</strong>
                        <span>{formatDate(post.criado_em)}</span>
                      </div>
                    </div>

                    <h3>{post.titulo}</h3>
                    <p>{excerpt(post.conteudo)}</p>

                    <div className="home-news-footer">
                      <span>
                        {post.comentarios?.length || 0}
                        {' '}
                        {(post.comentarios?.length || 0) === 1 ? 'comentário' : 'comentários'}
                      </span>
                      <strong>Abrir publicação →</strong>
                    </div>
                  </div>
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}