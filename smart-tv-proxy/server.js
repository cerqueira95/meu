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
        "User-Agent": "Mozilla/5.0 SmartPlayTV/0.7.4",
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

http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      app: "Smart Play TV Proxy",
      version: "0.7.4",
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
