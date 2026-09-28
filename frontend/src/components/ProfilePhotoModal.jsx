import { useRef, useState } from 'react'
import { api } from '../services/api.js'
import UserAvatar from './UserAvatar.jsx'

const MAX_PROFILE_LENGTH = 620_000

export async function compressProfilePhoto(file) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Selecione uma imagem válida.')
  }

  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível processar a imagem.'))
    img.src = source
  })

  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  const side = Math.min(image.width, image.height)
  const sx = Math.max(0, (image.width - side) / 2)
  const sy = Math.max(0, (image.height - side) / 2)

  context.drawImage(image, sx, sy, side, side, 0, 0, size, size)

  let quality = 0.84
  let result = canvas.toDataURL('image/jpeg', quality)

  while (result.length > MAX_PROFILE_LENGTH && quality > 0.46) {
    quality -= 0.08
    result = canvas.toDataURL('image/jpeg', quality)
  }

  if (result.length > MAX_PROFILE_LENGTH) {
    throw new Error('A imagem ficou muito grande.')
  }

  return result
}

export default function ProfilePhotoModal({ user, onClose, onUpdated }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(user.foto_perfil || null)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  async function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    setError('')
    setProcessing(true)

    try {
      setPreview(await compressProfilePhoto(file))
    } catch (photoError) {
      setError(photoError.message)
    } finally {
      setProcessing(false)
    }
  }
  async function save() {
    setSaving(true)
    setError('')

    try {
      const data = await api.post('/api/profile/photo', {
        foto_perfil: preview,
      })
      onUpdated?.(data.usuario)
      onClose()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-photo-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="profile-photo-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="profile-photo-heading">
          <div>
            <span className="dashboard-kicker">MEU PERFIL</span>
            <h2>Foto de perfil</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving}>×</button>
        </div>

        <div className="profile-photo-preview">
          <UserAvatar
            name={user.nome}
            photo={preview}
            className="profile-photo-large"
          />
          <div>
            <strong>{user.nome}</strong>
            <span>{user.cargo || user.perfil || 'Colaborador'}</span>
            <small>A foto aparece no menu, publicações e comentários.</small>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={choosePhoto}
        />
        {error && <div className="users-message error">{error}</div>}

        <div className="profile-photo-actions">
          <button
            className="modal-secondary"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={saving || processing}
          >
            {processing ? 'Processando...' : preview ? 'Trocar foto' : 'Adicionar foto'}
          </button>

          {preview && (
            <button
              className="profile-photo-remove"
              type="button"
              onClick={() => setPreview(null)}
              disabled={saving || processing}
            >
              Remover
            </button>
          )}

          <button
            className="primary-action-button"
            type="button"
            onClick={save}
            disabled={saving || processing}
          >
            {saving ? 'Salvando...' : 'Salvar foto'}
          </button>
        </div>
      </div>
    </div>
  )
}