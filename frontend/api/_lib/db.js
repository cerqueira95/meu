import postgres from 'postgres'

let client = null

function getConnectionString() {
  return (
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  )
}

function isLocalConnection(connectionString) {
  try {
    const url = new URL(connectionString)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function getClient() {
  if (client) {
    return client
  }

  const connectionString = getConnectionString()

  if (!connectionString) {
    throw new Error(
      'Banco não conectado: SUPABASE_DATABASE_URL/DATABASE_URL ausente.',
    )
  }

  client = postgres(connectionString, {
    max: 5,
    prepare: false,
    ssl: isLocalConnection(connectionString) ? false : 'require',
    idle_timeout: 20,
    connect_timeout: 15,
  })

  return client
}

export function sql(strings, ...values) {
  return getClient()(strings, ...values)
}

export function hasDatabaseConnection() {
  return Boolean(getConnectionString())
}
