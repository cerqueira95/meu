import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api.js'

const MAX_IMAGES = 4
const MAX_IMAGE_LENGTH = 760_000

const REACTIONS = [
  { id: 'curtir', icon: '👍', label: 'Curtir' },
  { id: 'parabens', icon: '👏', label: 'Parabéns' },
  { id: 'importante', icon: '⭐', label: 'Importante' },
]

function formatDateTime(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function initials(name) {
  const words = String(name || 'U')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return 'U'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

async function compressImage(file) {
  if (!file) return null

  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione apenas arquivos de imagem.')
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Não foi possível ler uma das fotos.'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível processar uma das fotos.'))
    img.src = dataUrl
  })

  const maxSide = 1400
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, width, height)

  let quality = 0.84
  let result = canvas.toDataURL('image/jpeg', quality)

  while (result.length > MAX_IMAGE_LENGTH && quality > 0.42) {
    quality -= 0.07
    result = canvas.toDataURL('image/jpeg', quality)
  }

  if (result.length > MAX_IMAGE_LENGTH) {
    throw new Error('Uma das fotos ficou muito grande. Escolha uma imagem menor.')
  }

  return result
}

function ReactionSummary({ post }) {
  const total =
    Number(post.reacoes?.curtir || 0) +
    Number(post.reacoes?.parabens || 0) +
    Number(post.reacoes?.importante || 0)

  if (total === 0 && post.comentarios.length === 0) return null

  return (
    <div className="news-social-summary">
      <span>
        {total > 0 && (
          <>
            <span className="news-mini-reactions">👍 👏 ⭐</span>
            {total} {total === 1 ? 'reação' : 'reações'}
          </>
        )}
      </span>
      <span>
        {post.comentarios.length > 0 &&
          `${post.comentarios.length} ${post.comentarios.length === 1 ? 'comentário' : 'comentários'}`}
      </span>
    </div>
  )
}

function PhotoGrid({ images, title }) {
  const [activeIndex, setActiveIndex] = useState(null)

  if (!images?.length) return null

  const count = Math.min(images.length, MAX_IMAGES)

  return (
    <>
      <div className={`news-photo-grid count-${count}`}>
        {images.slice(0, MAX_IMAGES).map((image, index) => (
          <button
            className="news-photo-cell"
            type="button"
            key={`${index}-${image.slice(-24)}`}
            onClick={() => setActiveIndex(index)}
            aria-label={`Abrir foto ${index + 1} de ${count}`}
          >
            <img src={image} alt={`${title} — foto ${index + 1}`} />
          </button>
        ))}
      </div>

      {activeIndex !== null && (
        <div className="news-lightbox" role="dialog" aria-modal="true" onMouseDown={() => setActiveIndex(null)}>
          <button
            className="news-lightbox-close"
            type="button"
            onClick={() => setActiveIndex(null)}
            aria-label="Fechar foto"
          >
            ×
          </button>

          {count > 1 && (
            <button
              className="news-lightbox-nav previous"
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setActiveIndex((current) => (current - 1 + count) % count)}
              aria-label="Foto anterior"
            >
              ‹
            </button>
          )}

          <img
            src={images[activeIndex]}
            alt={`${title} — foto ${activeIndex + 1}`}
            onMouseDown={(event) => event.stopPropagation()}
          />

          {count > 1 && (
            <button
              className="news-lightbox-nav next"
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setActiveIndex((current) => (current + 1) % count)}
              aria-label="Próxima foto"
            >
              ›
            </button>
          )}

          <span className="news-lightbox-counter">{activeIndex + 1} / {count}</span>
        </div>
      )}
    </>
  )
}

function NewsPost({ post, currentUser, onReact, onComment }) {
  const [comment, setComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  async function submitComment(event) {
    event.preventDefault()
    const text = comment.trim()

    if (!text) return

    setSendingComment(true)

    try {
      await onComment(post.id, text)
      setComment('')
    } finally {
      setSendingComment(false)
    }
  }

  const images = Array.isArray(post.imagens_data)
    ? post.imagens_data
    : post.imagem_data
      ? [post.imagem_data]
      : []

  return (
    <article className="news-post">
      <header className="news-post-header">
        <div className="news-author-avatar">{initials(post.autor.nome)}</div>
        <div className="news-author-copy">
          <strong>{post.autor.nome}</strong>
          <span>{post.autor.cargo || post.autor.perfil || 'Equipe do armazém'}</span>
          <small>{formatDateTime(post.criado_em)}</small>
        </div>
        <span className="news-published-badge">Publicado</span>
      </header>

      <div className="news-post-body">
        <h2>{post.titulo}</h2>
        <p>{post.conteudo}</p>
      </div>

      <PhotoGrid images={images} title={post.titulo} />

      <ReactionSummary post={post} />

      <div className="news-reaction-bar">
        {REACTIONS.map((reaction) => {
          const active = post.reacoes?.minha === reaction.id
          const count = Number(post.reacoes?.[reaction.id] || 0)

          return (
            <button
              key={reaction.id}
              className={active ? 'active' : ''}
              type="button"
              onClick={() => onReact(post.id, reaction.id)}
            >
              <span>{reaction.icon}</span>
              <strong>{reaction.label}</strong>
              {count > 0 && <small>{count}</small>}
            </button>
          )
        })}
      </div>

      {post.comentarios.length > 0 && (
        <div className="news-comments">
          {post.comentarios.map((item) => (
            <div className="news-comment" key={item.id}>
              <div className="news-comment-avatar">{initials(item.usuario.nome)}</div>
              <div className="news-comment-bubble">
                <div className="news-comment-meta">
                  <strong>{item.usuario.nome}</strong>
                  <span>{formatDateTime(item.criado_em)}</span>
                </div>
                <p>{item.texto}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form className="news-comment-form" onSubmit={submitComment}>
        <div className="news-comment-avatar current">{initials(currentUser.nome)}</div>
        <div className="news-comment-input-wrap">
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Escreva um comentário..."
            maxLength={1000}
            disabled={sendingComment}
          />
          <button type="submit" disabled={sendingComment || !comment.trim()}>
            {sendingComment ? '...' : 'Enviar'}
          </button>
        </div>
      </form>
    </article>
  )
}

function AdminComposer({ currentUser, onPublished }) {
  const fileInputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [imagens, setImagens] = useState([])
  const [processingImage, setProcessingImage] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')

  async function chooseImages(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''

    if (files.length === 0) return

    const remaining = MAX_IMAGES - imagens.length

    if (remaining <= 0 || files.length > remaining) {
      setError(`Você pode adicionar no máximo ${MAX_IMAGES} fotos por publicação.`)
      return
    }

    setError('')
    setProcessingImage(true)

    try {
      const compressed = []

      for (const file of files) {
        compressed.push(await compressImage(file))
      }

      setImagens((current) => [...current, ...compressed].slice(0, MAX_IMAGES))
    } catch (imageError) {
      setError(imageError.message)
    } finally {
      setProcessingImage(false)
    }
  }

  function removeImage(index) {
    setImagens((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  async function publish(event) {
    event.preventDefault()
    setError('')

    if (titulo.trim().length < 3 || conteudo.trim().length < 3) {
      setError('Preencha o título e o texto da publicação.')
      return
    }

    setPublishing(true)

    try {
      await api.post('/api/news', {
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        imagens_data: imagens,
      })

      setTitulo('')
      setConteudo('')
      setImagens([])
      setOpen(false)
      await onPublished()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPublishing(false)
    }
  }

  function closeComposer() {
    if (publishing || processingImage) return
    setOpen(false)
  }

  if (!open) {
    return (
      <button className="news-create-trigger" type="button" onClick={() => setOpen(true)}>
        <div className="news-author-avatar admin">{initials(currentUser.nome)}</div>
        <span>Compartilhe uma notícia, resultado ou comunicado...</span>
        <strong>+ Nova publicação</strong>
      </button>
    )
  }

  return (
    <form className="news-composer" onSubmit={publish}>
      <div className="news-composer-heading">
        <div>
          <span className="dashboard-kicker">PUBLICAÇÃO DO ADM</span>
          <h2>Nova publicação</h2>
        </div>
        <button className="news-close-composer" type="button" onClick={closeComposer} aria-label="Fechar">
          ×
        </button>
      </div>

      <label className="news-field">
        <span>Título</span>
        <input
          value={titulo}
          onChange={(event) => setTitulo(event.target.value)}
          placeholder="Ex.: Fechamento do mês com novo recorde"
          maxLength={180}
          disabled={publishing}
        />
      </label>

      <label className="news-field">
        <span>Texto da publicação</span>
        <textarea
          value={conteudo}
          onChange={(event) => setConteudo(event.target.value)}
          placeholder="Conte a novidade para o time. Você pode escrever textos grandes, comunicados, reconhecimentos e atualizações da operação."
          maxLength={20000}
          disabled={publishing}
        />
        <small>{conteudo.length.toLocaleString('pt-BR')} / 20.000 caracteres</small>
      </label>

      <input
        ref={fileInputRef}
        className="news-hidden-file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={chooseImages}
      />

      {imagens.length > 0 && (
        <div className={`news-preview-grid count-${imagens.length}`}>
          {imagens.map((image, index) => (
            <div className="news-preview-cell" key={`${index}-${image.slice(-24)}`}>
              <img src={image} alt={`Prévia da foto ${index + 1}`} />
              <span>{index + 1}</span>
              <button
                type="button"
                onClick={() => removeImage(index)}
                aria-label={`Remover foto ${index + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="news-form-error">{error}</div>}

      <div className="news-composer-actions">
        <button
          className="news-photo-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={processingImage || publishing || imagens.length >= MAX_IMAGES}
        >
          <span>▣</span>
          {processingImage
            ? 'Processando fotos...'
            : imagens.length > 0
              ? `Adicionar fotos (${imagens.length}/${MAX_IMAGES})`
              : 'Adicionar fotos'}
        </button>

        <span className="news-photo-limit">
          Até {MAX_IMAGES} fotos por publicação
        </span>

        <button
          className="primary-action-button"
          type="submit"
          disabled={publishing || processingImage}
        >
          {publishing ? 'Publicando...' : 'Publicar agora'}
        </button>
      </div>
    </form>
  )
}

export default function NewsScreen({ currentUser }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const isAdmin = String(currentUser.perfil || '').toUpperCase() === 'ADM'

  const totalComments = useMemo(
    () => posts.reduce((sum, post) => sum + post.comentarios.length, 0),
    [posts],
  )

  useEffect(() => {
    loadPosts()
  }, [])

  async function loadPosts({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    setError('')

    try {
      const data = await api.get('/api/news')
      setPosts(data.publicacoes || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  async function react(postId, type) {
    setError('')

    try {
      await api.post('/api/news/react', {
        publicacao_id: postId,
        tipo: type,
      })
      await loadPosts({ quiet: true })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function comment(postId, text) {
    setError('')

    try {
      await api.post('/api/news/comment', {
        publicacao_id: postId,
        texto: text,
      })
      await loadPosts({ quiet: true })
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    }
  }

  return (
    <section className="news-page">
      <div className="news-page-header">
        <div>
          <span className="dashboard-kicker">COMUNICAÇÃO INTERNA</span>
          <h1>Armazém New</h1>
          <p>Notícias, resultados, reconhecimentos e comunicados do armazém em um só lugar.</p>
        </div>
        <div className="news-header-stats">
          <div>
            <strong>{posts.length}</strong>
            <span>publicações</span>
          </div>
          <div>
            <strong>{totalComments}</strong>
            <span>comentários</span>
          </div>
        </div>
      </div>

      <div className="news-layout">
        <div className="news-feed">
          {isAdmin && <AdminComposer currentUser={currentUser} onPublished={loadPosts} />}

          {error && <div className="news-form-error global">{error}</div>}

          {loading ? (
            <div className="news-empty-state">
              <div className="news-empty-icon">N</div>
              <strong>Carregando notícias...</strong>
            </div>
          ) : posts.length === 0 ? (
            <div className="news-empty-state">
              <div className="news-empty-icon">N</div>
              <strong>Ainda não há publicações.</strong>
              <p>{isAdmin ? 'Crie a primeira notícia para o time.' : 'As novidades do armazém aparecerão aqui.'}</p>
            </div>
          ) : (
            posts.map((post) => (
              <NewsPost
                key={post.id}
                post={post}
                currentUser={currentUser}
                onReact={react}
                onComment={comment}
              />
            ))
          )}
        </div>

        <aside className="news-side-card">
          <span className="news-side-icon">N</span>
          <span className="dashboard-kicker">ARMAZÉM NEW</span>
          <h2>Informação que chega a todo mundo.</h2>
          <p>
            Use este espaço para compartilhar resultados, avisos importantes,
            reconhecimentos e novidades da operação.
          </p>
          <div className="news-side-rule">
            <span>●</span>
            <p>Publicações exibem automaticamente a data e a hora em que foram criadas.</p>
          </div>
          <div className="news-side-rule">
            <span>●</span>
            <p>Você pode publicar até 4 fotos. Todos podem reagir e comentar.</p>
          </div>
        </aside>
      </div>
    </section>
  )
}
