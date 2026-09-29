export default function handler(req, res) {
  return res.status(200).json({
    status: 'ok',
    runtime: 'node',
    message: 'API funcionando.',
  })
}
