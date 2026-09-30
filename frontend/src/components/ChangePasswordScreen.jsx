import { useState } from 'react'
import { api } from '../services/api.js'
import './ChangePasswordScreen.css'

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  placeholder,
}) {
  return (
    <div className="change-password-field">
      <label htmlFor={id}>{label}</label>
      <div className="change-password-input-wrap">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="change-password-eye"
          onClick={onToggle}
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </div>
  )
}

export default function ChangePasswordScreen({ onChanged }) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [showAtual, setShowAtual] = useState(false)
  const [showNova, setShowNova] = useState(false)
  const [showConfirmacao, setShowConfirmacao] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!senhaAtual) {
      setError('Informe sua senha atual.')
      return
    }

    if (novaSenha.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setError('A confirmação da nova senha não confere.')
      return
    }

    if (novaSenha === senhaAtual) {
      setError('A nova senha deve ser diferente da senha atual.')
      return
    }

    setSaving(true)

    try {
      const data = await api.post('/api/auth/change-password', {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
        confirmar_senha: confirmarSenha,
      })

      setSenhaAtual('')
      setNovaSenha('')
      setConfirmarSenha('')
      setMessage(data.message || 'Senha alterada com sucesso.')
      onChanged?.()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="change-password-page">
      <div className="change-password-hero">
        <span className="dashboard-kicker">SEGURANÇA</span>
        <h1>Alterar senha</h1>
        <p>
          Troque sua senha de acesso ao Warehouse. Sua sessão atual continua ativa,
          mas outros acessos e atalhos salvos são encerrados por segurança.
        </p>
      </div>

      <form className="change-password-card" onSubmit={handleSubmit}>
        <div className="change-password-card-head">
          <div>
            <span className="change-password-shield">•••</span>
            <div>
              <strong>Senha de acesso</strong>
              <small>Use no mínimo 6 caracteres.</small>
            </div>
          </div>
        </div>

        <PasswordField
          id="current-password"
          label="Senha atual"
          value={senhaAtual}
          onChange={setSenhaAtual}
          show={showAtual}
          onToggle={() => setShowAtual((current) => !current)}
          autoComplete="current-password"
          placeholder="Digite sua senha atual"
        />

        <PasswordField
          id="new-password"
          label="Nova senha"
          value={novaSenha}
          onChange={setNovaSenha}
          show={showNova}
          onToggle={() => setShowNova((current) => !current)}
          autoComplete="new-password"
          placeholder="Mínimo de 6 caracteres"
        />

        <PasswordField
          id="confirm-password"
          label="Confirmar nova senha"
          value={confirmarSenha}
          onChange={setConfirmarSenha}
          show={showConfirmacao}
          onToggle={() => setShowConfirmacao((current) => !current)}
          autoComplete="new-password"
          placeholder="Digite novamente a nova senha"
        />

        {error && <div className="change-password-message error">{error}</div>}
        {message && <div className="change-password-message success">{message}</div>}

        <button
          className="change-password-submit"
          type="submit"
          disabled={saving}
        >
          {saving ? 'Alterando senha...' : 'Alterar senha'}
        </button>
      </form>
    </section>
  )
}
