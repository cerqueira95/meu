import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api.js'
import UserAvatar from './UserAvatar.jsx'

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

function wasEdited(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) return false

  const created = new Date(createdAt).getTime()
  const updated = new Date(updatedAt).getTime()

  return Number.isFinite(created) && Number.isFinite(updated) && updated - created > 1500
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

async function processSelectedImages(files, currentCount) {
  const list = Array.from(files || [])
  const remaining = MAX_IMAGES - currentCount

  if (list.length === 0) return []

  if (remaining <= 0 || list.length > remaining) {
    throw new Error(`Você pode adicionar no máximo ${MAX_IMAGES} fotos por publicação.`)
  }

  const compressed = []

  for (const file of list) {
    compressed.push(await compressImage(file))
  }

  return compressed
}

async function uploadVideo(file) {
  if (!file) return null

  const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime']

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Use um vídeo MP4, WebM ou MOV.')
  }

  if (file.size > 35 * 1024 * 1024) {
    throw new Error('O vídeo deve ter no máximo 35 MB.')
  }

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name || 'video'),
    },
    body: file,
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.message || 'Não foi possível enviar o vídeo.')
  }

  return {
    url: body.url,
    nome: file.name || body.nome || 'Vídeo',
    tipo: file.type || body.tipo || 'video/mp4',
  }
}

function ReactionSummary({ post }) {
  const activeReactions = REACTIONS
    .map((reaction) => ({
      ...reaction,
      count: Number(post.reacoes?.[reaction.id] || 0),
    }))
    .filter((reaction) => reaction.count > 0)

  const total = activeReactions.reduce(
    (sum, reaction) => sum + reaction.count,
    0,
  )

  if (total === 0 && post.comentarios.length === 0) return null

  return (
    <div className="news-social-summary">
      <span>
        {total > 0 && (
          <>
            <span className="news-mini-reactions">
              {activeReactions.map((reaction) => (
                <span
                  key={reaction.id}
                  title={`${reaction.label}: ${reaction.count}`}
                >
                  {reaction.icon}
                </span>
              ))}
            </span>
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
            {count > 1 && index === count - 1 && (
              <span className="news-expand-hint">Ampliar</span>
            )}
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

function CommentItem({ item, isAdmin, onManage }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.texto)
  const [saving, setSaving] = useState(false)

  async function save() {
    const value = text.trim()

    if (!value || value === item.texto) {
      setText(item.texto)
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      await onManage(item.id, 'edit', value)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm('Excluir este comentário?')) return

    setSaving(true)
    try {
      await onManage(item.id, 'delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="news-comment">
      <UserAvatar
        name={item.usuario.nome}
        photo={item.usuario.foto_perfil}
        className="news-comment-avatar"
      />
      <div className="news-comment-bubble">
        <div className="news-comment-meta">
          <div>
            <strong>{item.usuario.nome}</strong>
            <span>
              {formatDateTime(item.criado_em)}
              {wasEdited(item.criado_em, item.atualizado_em) ? ' • editado' : ''}
            </span>
          </div>

          {isAdmin && !editing && (
            <div className="news-comment-admin-actions">
              <button type="button" onClick={() => setEditing(true)}>Editar</button>
              <button type="button" className="danger" onClick={remove} disabled={saving}>Excluir</button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="news-comment-edit">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={1000}
              disabled={saving}
              autoFocus
            />
            <div>
              <button type="button" onClick={() => { setText(item.texto); setEditing(false) }} disabled={saving}>
                Cancelar
              </button>
              <button type="button" className="save" onClick={save} disabled={saving || !text.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        ) : (
          <p>{item.texto}</p>
        )}
      </div>
    </div>
  )
}

function NewsPost({
  post,
  currentUser,
  isAdmin,
  onReact,
  onComment,
  onEditPost,
  onDeletePost,
  onManageComment,
}) {
  const [comment, setComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)

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

  async function removePost() {
    setAdminMenuOpen(false)

    if (!window.confirm('Excluir esta publicação? Os comentários e reações também serão removidos.')) {
      return
    }

    await onDeletePost(post.id)
  }

  const images = Array.isArray(post.imagens_data)
    ? post.imagens_data
    : post.imagem_data
      ? [post.imagem_data]
      : []

  return (
    <article className="news-post">
      <header className="news-post-header">
        <UserAvatar
          name={post.autor.nome}
          photo={post.autor.foto_perfil}
          className="news-author-avatar"
        />
        <div className="news-author-copy">
          <strong>{post.autor.nome}</strong>
          <span>{post.autor.cargo || post.autor.perfil || 'Equipe do armazém'}</span>
          <small>
            {formatDateTime(post.criado_em)}
            {wasEdited(post.criado_em, post.atualizado_em) ? ' • editado' : ''}
          </small>
        </div>

        <div className="news-post-header-actions">
          <span className="news-published-badge">Publicado</span>

          {isAdmin && (
            <div className="news-admin-menu-wrap">
              <button
                className="news-admin-menu-button"
                type="button"
                onClick={() => setAdminMenuOpen((current) => !current)}
                aria-label="Opções da publicação"
              >
                •••
              </button>

              {adminMenuOpen && (
                <div className="news-admin-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminMenuOpen(false)
                      onEditPost(post)
                    }}
                  >
                    Editar publicação
                  </button>
                  <button type="button" className="danger" onClick={removePost}>
                    Excluir publicação
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="news-post-body">
        <h2>{post.titulo}</h2>
        <p>{post.conteudo}</p>
      </div>

      <PhotoGrid images={images} title={post.titulo} />

      {post.video_url && (
        <div className="news-video-wrap">
          <video
            src={post.video_url}
            controls
            playsInline
            preload="metadata"
          >
            Seu navegador não suporta reprodução de vídeo.
          </video>
          {post.video_nome && <span>{post.video_nome}</span>}
        </div>
      )}

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
            <CommentItem
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              onManage={onManageComment}
            />
          ))}
        </div>
      )}

      <form className="news-comment-form" onSubmit={submitComment}>
        <UserAvatar
          name={currentUser.nome}
          photo={currentUser.foto_perfil}
          className="news-comment-avatar current"
        />
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

function PostEditor({
  mode,
  currentUser,
  initialPost = null,
  onCancel,
  onSaved,
}) {
  const fileInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const [titulo, setTitulo] = useState(initialPost?.titulo || '')
  const [conteudo, setConteudo] = useState(initialPost?.conteudo || '')
  const [imagens, setImagens] = useState(
    Array.isArray(initialPost?.imagens_data)
      ? initialPost.imagens_data
      : initialPost?.imagem_data
        ? [initialPost.imagem_data]
        : [],
  )
  const [video, setVideo] = useState(
    initialPost?.video_url
      ? {
          url: initialPost.video_url,
          nome: initialPost.video_nome || 'Vídeo',
          tipo: initialPost.video_tipo || 'video/mp4',
        }
      : null,
  )
  const [processingImage, setProcessingImage] = useState(false)
  const [processingVideo, setProcessingVideo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function chooseImages(event) {
    const files = event.target.files
    event.target.value = ''

    if (!files?.length) return

    if (video) {
      setError('Remova o vídeo antes de adicionar fotos.')
      return
    }

    setError('')
    setProcessingImage(true)

    try {
      const compressed = await processSelectedImages(files, imagens.length)
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

  async function chooseVideo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (imagens.length > 0) {
      setError('Remova as fotos antes de adicionar um vídeo.')
      return
    }

    setError('')
    setProcessingVideo(true)

    try {
      setVideo(await uploadVideo(file))
    } catch (videoError) {
      setError(videoError.message)
    } finally {
      setProcessingVideo(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (titulo.trim().length < 3 || conteudo.trim().length < 3) {
      setError('Preencha o título e o texto da publicação.')
      return
    }

    setSaving(true)

    try {
      if (mode === 'edit') {
        await api.post('/api/news/manage-post', {
          id: initialPost.id,
          action: 'edit',
          titulo: titulo.trim(),
          conteudo: conteudo.trim(),
          imagens_data: imagens,
          video_url: video?.url || null,
          video_nome: video?.nome || null,
          video_tipo: video?.tipo || null,
        })
      } else {
        await api.post('/api/news', {
          titulo: titulo.trim(),
          conteudo: conteudo.trim(),
          imagens_data: imagens,
          video_url: video?.url || null,
          video_nome: video?.nome || null,
          video_tipo: video?.tipo || null,
        })
      }

      await onSaved()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={mode === 'edit' ? 'news-edit-modal' : 'news-composer'} onSubmit={submit}>
      <div className="news-composer-heading">
        <div>
          <span className="dashboard-kicker">
            {mode === 'edit' ? 'EDITAR PUBLICAÇÃO' : 'PUBLICAÇÃO DO ADM'}
          </span>
          <h2>{mode === 'edit' ? 'Editar publicação' : 'Nova publicação'}</h2>
        </div>
        <button
          className="news-close-composer"
          type="button"
          onClick={onCancel}
          aria-label="Fechar"
          disabled={saving || processingImage || processingVideo}
        >
          ×
        </button>
      </div>

      <div className="news-editor-author">
        <UserAvatar
          name={currentUser.nome}
          photo={currentUser.foto_perfil}
          className="news-author-avatar admin"
        />
        <div>
          <strong>{currentUser.nome}</strong>
          <span>{currentUser.cargo || currentUser.perfil}</span>
        </div>
      </div>

      <label className="news-field">
        <span>Título</span>
        <input
          value={titulo}
          onChange={(event) => setTitulo(event.target.value)}
          placeholder="Ex.: Fechamento do mês com novo recorde"
          maxLength={180}
          disabled={saving}
        />
      </label>

      <label className="news-field">
        <span>Texto da publicação</span>
        <textarea
          value={conteudo}
          onChange={(event) => setConteudo(event.target.value)}
          placeholder="Conte a novidade para o time..."
          maxLength={20000}
          disabled={saving}
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

      <input
        ref={videoInputRef}
        className="news-hidden-file"
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={chooseVideo}
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

      {video && (
        <div className="news-video-preview">
          <video src={video.url} controls playsInline preload="metadata" />
          <div>
            <strong>{video.nome}</strong>
            <span>Vídeo pronto para publicar</span>
          </div>
          <button
            type="button"
            onClick={() => setVideo(null)}
            aria-label="Remover vídeo"
          >
            ×
          </button>
        </div>
      )}

      {error && <div className="news-form-error">{error}</div>}

      <div className="news-composer-actions">
        <button
          className="news-photo-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={processingImage || processingVideo || saving || imagens.length >= MAX_IMAGES || Boolean(video)}
        >
          <span>▣</span>
          {processingImage
            ? 'Processando fotos...'
            : imagens.length > 0
              ? `Adicionar fotos (${imagens.length}/${MAX_IMAGES})`
              : 'Adicionar fotos'}
        </button>

        <button
          className="news-video-button"
          type="button"
          onClick={() => videoInputRef.current?.click()}
          disabled={processingImage || processingVideo || saving || imagens.length > 0}
        >
          <span>▶</span>
          {processingVideo
            ? 'Enviando vídeo...'
            : video
              ? 'Trocar vídeo'
              : 'Adicionar vídeo'}
        </button>

        <span className="news-photo-limit">Até {MAX_IMAGES} fotos ou 1 vídeo de até 35 MB</span>

        <button
          className="primary-action-button"
          type="submit"
          disabled={saving || processingImage || processingVideo}
        >
          {saving
            ? mode === 'edit' ? 'Salvando...' : 'Publicando...'
            : mode === 'edit' ? 'Salvar alterações' : 'Publicar agora'}
        </button>
      </div>
    </form>
  )
}

function AdminComposer({ currentUser, onPublished }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button className="news-create-trigger" type="button" onClick={() => setOpen(true)}>
        <UserAvatar
          name={currentUser.nome}
          photo={currentUser.foto_perfil}
          className="news-author-avatar admin"
        />
        <span>Compartilhe uma notícia, resultado ou comunicado...</span>
        <strong>+ Nova publicação</strong>
      </button>
    )
  }

  return (
    <PostEditor
      mode="create"
      currentUser={currentUser}
      onCancel={() => setOpen(false)}
      onSaved={async () => {
        setOpen(false)
        await onPublished()
      }}
    />
  )
}

export default function NewsScreen({ currentUser }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingPost, setEditingPost] = useState(null)
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

  async function deletePost(id) {
    setError('')

    try {
      await api.post('/api/news/manage-post', {
        id,
        action: 'delete',
      })
      await loadPosts({ quiet: true })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function manageComment(id, action, text = '') {
    setError('')

    try {
      await api.post('/api/news/manage-comment', {
        id,
        action,
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
        {isAdmin && (
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
        )}
      </div>

      <div className={`news-layout ${isAdmin ? 'admin-layout' : 'viewer-layout'}`}>
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
                isAdmin={isAdmin}
                onReact={react}
                onComment={comment}
                onEditPost={setEditingPost}
                onDeletePost={deletePost}
                onManageComment={manageComment}
              />
            ))
          )}
        </div>

        {isAdmin && (
          <aside className="news-side-card">
            <span className="news-side-icon">N</span>
            <span className="dashboard-kicker">ARMAZÉM NEW</span>
            <h2>Central de publicação</h2>
            <p>
              Área de apoio para quem administra a comunicação interna do armazém.
            </p>
            <div className="news-side-rule">
              <span>●</span>
              <p>Publicações exibem automaticamente a data e a hora em que foram criadas.</p>
            </div>
            <div className="news-side-rule">
              <span>●</span>
              <p>Você pode publicar até 4 fotos ou 1 vídeo. Todos podem reagir e comentar.</p>
            </div>
            <div className="news-side-rule">
              <span>●</span>
              <p>Como ADM, você pode editar ou excluir publicações e comentários.</p>
            </div>
          </aside>
        )}
      </div>

      {editingPost && (
        <div className="news-edit-backdrop" role="presentation" onMouseDown={() => setEditingPost(null)}>
          <div className="news-edit-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <PostEditor
              mode="edit"
              currentUser={currentUser}
              initialPost={editingPost}
              onCancel={() => setEditingPost(null)}
              onSaved={async () => {
                setEditingPost(null)
                await loadPosts({ quiet: true })
              }}
            />
          </div>
        </div>
      )}
    </section>
  )
}