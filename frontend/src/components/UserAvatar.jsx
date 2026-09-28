export function userInitials(name) {
  const words = String(name || 'U')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return 'U'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export default function UserAvatar({
  name,
  photo,
  className = '',
  title,
}) {
  return (
    <span
      className={`user-photo-avatar ${className}`.trim()}
      title={title || name || 'Usuário'}
      aria-label={name ? `Foto de ${name}` : 'Usuário'}
    >
      {photo ? (
        <img src={photo} alt="" />
      ) : (
        userInitials(name)
      )}
    </span>
  )
}