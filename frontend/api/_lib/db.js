import { neon } from '@neondatabase/serverless'

let client = null

function getConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  )
}

function getClient() {
  if (client) {
    return client
  }

  const connectionString = getConnectionString()

  if (!connectionString) {
    throw new Error(
      'Banco não conectado: DATABASE_URL ausente.',
    )
  }

  client = neon(connectionString)
  return client
}

export function sql(strings, ...values) {
  return getClient()(strings, ...values)
}

export function hasDatabaseConnection() {
  return Boolean(getConnectionString())
}
