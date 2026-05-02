/**
 * Proxy HTTP/HTTPS đơn giản chạy trên máy local để test ADOBE_PROXY.
 * Request từ backend đi qua proxy này → ra internet bằng IP máy bạn (Adobe thấy IP local).
 *
 * Chạy: node scripts/local-proxy.js
 * Mặc định listen: 0.0.0.0:3128 (nhận từ localhost và cả máy khác trong mạng).
 *
 * Trên cùng máy với backend:
 *   .env: ADOBE_PROXY=http://localhost:3128
 *
 * Backend chạy ở máy khác (VD server), proxy chạy trên máy bạn:
 *   1. Chạy script này trên máy bạn.
 *   2. Mở port 3128 (firewall) hoặc dùng ngrok nếu 2 máy không chung mạng.
 *   3. .env trên server: ADOBE_PROXY=http://IP_MAY_BAN:3128
 */

const http = require("http");
const net = require("net");

const PORT = parseInt(process.env.PROXY_PORT || "3128", 10);
const HOST = process.env.PROXY_HOST || "0.0.0.0";

const server = http.createServer((clientReq, clientRes) => {
  // Request-URI khi qua proxy có thể là full URL (http://host/path) hoặc path
  const reqUrl = clientReq.url || "/";
  const url = reqUrl.startsWith("http") ? new URL(reqUrl) : new URL(reqUrl, `http://${clientReq.headers.host || "localhost"}`);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + url.search,
    method: clientReq.method,
    headers: clientReq.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy] Request error:", err.message);
    clientRes.writeHead(502, { "Content-Type": "text/plain" });
    clientRes.end("Bad Gateway: " + err.message);
  });

  clientReq.pipe(proxyReq);
});

// HTTPS: CONNECT tunnel
server.on("connect", (req, clientSocket, head, callback) => {
  const [targetHost, targetPort] = (req.url || "").split(":");
  const port = parseInt(targetPort || "443", 10);

  const serverSocket = net.connect(port, targetHost, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on("error", (err) => {
    console.error("[proxy] CONNECT error:", req.url, err.message);
    clientSocket.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log("Local proxy đang chạy: http://%s:%s", HOST === "0.0.0.0" ? "localhost" : HOST, PORT);
  console.log("  → Trên cùng máy: ADOBE_PROXY=http://localhost:%s", PORT);
  const os = require("os");
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name]) {
      if (n.family === "IPv4" && !n.internal) {
        console.log("  → Từ máy khác trong mạng: ADOBE_PROXY=http://%s:%s", n.address, PORT);
        break;
      }
    }
  }
  console.log("\nTắt: Ctrl+C");
});
