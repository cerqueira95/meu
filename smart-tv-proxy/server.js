const http = require("http");
const zlib = require("zlib");
const dns = require("dns").promises;
const net = require("net");

const PORT = process.env.PORT || 10000;
const MAX_REMOTE_BYTES = 100 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 60000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 65536) {
        reject(new Error("request_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    return (
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168)
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:");
  }
  return true;
}

async function validateRemoteUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("invalid_url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("invalid_url");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("blocked_host");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("blocked_host");
  } else {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) {
      throw new Error("blocked_host");
    }
  }

  return parsed.href;
}

async function fetchRemote(remoteUrl, probeOnly) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probeOnly ? 15000 : REMOTE_TIMEOUT_MS);

  try {
    const response = await fetch(remoteUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 SmartPlayTV/1.0.0",
        "Accept": "*/*"
      }
    });

    if (probeOnly) {
      let prefix = "";
      if (response.body && response.body.getReader) {
        const reader = response.body.getReader();
        const part = await reader.read();
        if (part.value) {
          prefix = Buffer.from(part.value).subarray(0, 4096).toString("utf8");
        }
        try { await reader.cancel(); } catch {}
      }

      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        finalUrl: response.url,
        prefix
      };
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength && declaredLength > MAX_REMOTE_BYTES) {
      throw new Error("remote_file_too_large");
    }

    const chunks = [];
    let totalBytes = 0;

    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const part = await reader.read();
        if (part.done) break;

        totalBytes += part.value.byteLength;
        if (totalBytes > MAX_REMOTE_BYTES) {
          try { await reader.cancel(); } catch {}
          throw new Error("remote_file_too_large");
        }
        chunks.push(Buffer.from(part.value));
      }
    } else {
      const fallback = Buffer.from(await response.arrayBuffer());
      totalBytes = fallback.length;
      if (totalBytes > MAX_REMOTE_BYTES) throw new Error("remote_file_too_large");
      chunks.push(fallback);
    }

    const data = Buffer.concat(chunks, totalBytes);
    let decoded = data;
    if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
      decoded = zlib.gunzipSync(data);
    }

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      finalUrl: response.url,
      content: decoded.toString("utf8")
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handleProxy(req, res, probeOnly) {
  try {
    const body = await readJson(req);
    const remoteUrl = await validateRemoteUrl(body.url);
    const result = await fetchRemote(remoteUrl, probeOnly);
    sendJson(res, 200, result);
  } catch (error) {
    const message =
      error && error.name === "AbortError"
        ? "timeout"
        : String(error && error.message ? error.message : error);
    sendJson(res, 502, { ok: false, error: message });
  }
}

const PRIVACY_HTML = "<!doctype html>\n<html lang=\"pt-BR\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>Política de Privacidade - Smart Play TV</title>\n<style>\nbody{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;line-height:1.6;color:#1b1b1b}\nh1,h2{color:#4b168c} .box{background:#f6f3fb;padding:16px 20px;border-radius:12px}\nsmall{color:#666}\n</style>\n</head>\n<body>\n<h1>Política de Privacidade — Smart Play TV</h1>\n<p><small>Última atualização: 7 de outubro de 2026</small></p>\n<p>O Smart Play TV é um reprodutor de mídia. O aplicativo não fornece canais, filmes, séries ou listas de reprodução. O usuário adiciona suas próprias fontes e é responsável por utilizar apenas conteúdo e serviços para os quais possua autorização.</p>\n<h2>Dados tratados</h2>\n<p>O aplicativo pode tratar endereços de playlists M3U/M3U8, endereço do servidor Xtream e credenciais Xtream fornecidas pelo próprio usuário para acessar a fonte escolhida. Configurações do aplicativo, favoritos, catálogo em cache e progresso de reprodução podem ser armazenados localmente na TV.</p>\n<h2>Credenciais</h2>\n<p>Credenciais Xtream não são gravadas na lista persistente do aplicativo. Elas são mantidas apenas durante a sessão do aplicativo para permitir consultas e reprodução e são descartadas ao encerrar ou recarregar o app.</p>\n<h2>Proxy de compatibilidade</h2>\n<p>Quando uma fonte não pode ser acessada diretamente pela TV, o Smart Play TV pode usar o serviço técnico smart-play-tv-proxy.onrender.com para testar ou obter a playlist. Nesse caso, a URL fornecida pelo usuário é transmitida ao proxy para executar a solicitação necessária. O proxy não possui função de publicidade, não vende dados e não cria perfis de usuários.</p>\n<h2>Compartilhamento</h2>\n<p>Não vendemos dados pessoais e não compartilhamos dados para publicidade comportamental. Dados técnicos podem transitar por provedores de infraestrutura estritamente para viabilizar a função solicitada pelo usuário.</p>\n<h2>Retenção</h2>\n<p>Dados locais permanecem na TV até serem removidos pelo usuário, pela limpeza dos dados do aplicativo ou pela desinstalação. Credenciais de sessão são descartadas ao encerrar ou recarregar o aplicativo. O proxy não foi projetado para armazenar playlists ou credenciais em banco de dados.</p>\n<h2>Segurança</h2>\n<p>O aplicativo utiliza HTTPS para comunicação com o proxy. O usuário deve preferir fontes HTTPS e manter suas credenciais privadas.</p>\n<h2>Seus controles</h2>\n<p>O usuário pode remover playlists, limpar cache/progresso local e desinstalar o aplicativo para eliminar dados armazenados localmente.</p>\n<h2>Contato</h2>\n<p>Dúvidas sobre privacidade: <a href=\"mailto:cerqueir95@gmail.com\">cerqueir95@gmail.com</a></p>\n<div class=\"box\"><strong>English summary:</strong> Smart Play TV is a media player and does not provide content. User-supplied playlist/server URLs and Xtream credentials may be processed to access the user's selected source. Settings, favorites, cached catalog data and playback progress may be stored locally on the TV. Xtream credentials are session-only and are not stored in the persistent playlist metadata. A compatibility proxy may process the supplied URL when direct access from the TV fails. Data is not sold or used for behavioral advertising.</div>\n</body>\n</html>";

http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req.method === "GET" && (req.url === "/privacy" || req.url === "/privacy/")) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    return res.end(PRIVACY_HTML);
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      app: "Smart Play TV Proxy",
      version: "1.0.0",
      timestamp: Date.now()
    });
  }

  if (req.method === "POST" && req.url === "/api/fetch-text") {
    return handleProxy(req, res, false);
  }

  if (req.method === "POST" && req.url === "/api/probe-url") {
    return handleProxy(req, res, true);
  }

  sendJson(res, 404, { ok: false, error: "not_found" });
}).listen(PORT, "0.0.0.0", () => {
  console.log("Smart Play TV Proxy listening on port " + PORT);
});
