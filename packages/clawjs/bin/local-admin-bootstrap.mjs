export async function readLocalAdminBootstrap() {
  if (process.env.CLAW_LOCAL_ADMIN_BOOTSTRAP_STDIN !== "1") return {};
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("CLAW_LOCAL_ADMIN_BOOTSTRAP_STDIN was set but no bootstrap payload was received");
  const parsed = JSON.parse(raw);
  const adminToken = typeof parsed.adminToken === "string" && parsed.adminToken.length > 0 ? parsed.adminToken : undefined;
  return { ...(adminToken ? { adminToken } : {}) };
}
