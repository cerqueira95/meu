export default function handler(req, res) {
  return res.status(200).json({
    status: 'ok',
    databaseUrlConfigured: Boolean(
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL,
    ),
  })
}
