const http = require("http");

const BASE = "http://localhost:3001";
const USERNAME = "admin";
const PASSWORD = "admin1";

function request(options, body) {
  return new Promise((resolve, reject) => {
    const path = options.path.startsWith("/") ? options.path : "/" + options.path;
    const url = new URL(BASE + path);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 3001,
        path: url.pathname,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: data })
        );
      }
    );
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const loginRes = await request(
    {
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { username: USERNAME, password: PASSWORD }
  );
  if (loginRes.status !== 200) process.exit(1);

  const setCookie = loginRes.headers["set-cookie"];
  const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
    .map((s) => String(s).split(";")[0].trim())
    .join("; ");

  const formsRes = await request({
    path: "/api/form-info/forms",
    method: "GET",
    headers: { Cookie: cookie },
  });
  const inputsRes = await request({
    path: "/api/form-info/inputs",
    method: "GET",
    headers: { Cookie: cookie },
  });

  console.log("forms:", formsRes.status, "inputs:", inputsRes.status);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
