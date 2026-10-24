import { neon } from "@neondatabase/serverless";
import { createHmac, randomBytes, timingSafeEqual, pbkdf2 as pbkdf2Callback } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Callback);
const COOKIE = "antic_session";
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "csv"]);

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers });
}
function sqlClient() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");
  return neon(process.env.DATABASE_URL);
}
function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET muss gesetzt sein und mindestens 32 Zeichen enthalten.");
  }
  return process.env.SESSION_SECRET;
}
function cookie(value, maxAge = SESSION_SECONDS) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function base64url(value) {
  return Buffer.from(value).toString("base64url");
}
function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}
function sessionToken(user) {
  const payload = base64url(JSON.stringify({ id: String(user.user_id), username: user.username, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  return `${payload}.${sign(payload)}`;
}
function sessionFrom(request) {
  const raw = request.headers.get("cookie") || "";
  const token = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!user.id || !user.username || user.exp < Math.floor(Date.now() / 1000)) return null;
    return user;
  } catch { return null; }
}
function isOwner(username) {
  const configured = process.env.OWNER_USERNAME || "";
  return Boolean(configured) && username.toLocaleLowerCase("en-US") === configured.toLocaleLowerCase("en-US");
}
function safeFilename(name) {
  return String(name || "Dokument").replace(/[\\/\r\n\0]/g, "_").slice(0, 180);
}
function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new HttpError(403, "Ungültige Anfrage.");
}
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function requireUser(request, sql) {
  const session = sessionFrom(request);
  if (!session) throw new HttpError(401, "Bitte melde dich zuerst an.");
  const rows = await sql`SELECT user_id, username FROM users WHERE user_id = ${session.id}`;
  if (!rows.length || rows[0].username !== session.username) throw new HttpError(401, "Sitzung abgelaufen. Bitte erneut anmelden.");
  return rows[0];
}
async function requireMembership(sql, groupId, userId) {
  const rows = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
  if (!rows.length) throw new HttpError(403, "Du bist kein Mitglied dieser Gruppe.");
}
async function parseJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, "Ungültige JSON-Anfrage."); }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = (url.searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
    const method = request.method.toUpperCase();
    try {
      if (method === "GET" && path === "auth/config") {
        return json({ ownerUsername: process.env.OWNER_USERNAME || "" });
      }
      if (path === "auth/logout" && method === "POST") {
        assertSameOrigin(request);
        return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
      }
      if ((path === "auth/register" || path === "auth/login") && method === "POST") {
        assertSameOrigin(request);
        const body = await parseJson(request);
        const username = String(body.displayName || "").normalize("NFKC").trim();
        const normalized = username.toLocaleLowerCase("en-US");
        const password = String(body.password || "");
        if (!/^[\p{L}\p{N}_. -]{2,24}$/u.test(username)) throw new HttpError(400, "Der Anzeigename muss 2–24 Zeichen lang sein und darf Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich enthalten.");
        if (password.length < 8 || password.length > 200) throw new HttpError(400, "Das Passwort muss mindestens 8 Zeichen lang sein.");
        const owner = isOwner(username);
        if (owner && (!process.env.OWNER_KEY || body.ownerKey !== process.env.OWNER_KEY)) throw new HttpError(401, "Der Owner-Schlüssel ist nicht korrekt.");
        const sql = sqlClient();
        if (path === "auth/register") {
          const salt = randomBytes(16).toString("base64url");
          const hash = (await pbkdf2(password, Buffer.from(salt, "base64url"), 310000, 32, "sha256")).toString("base64url");
          const users = await sql`
            WITH created AS (
              INSERT INTO users (username, username_normalized, password_hash, password_salt)
              VALUES (${username}, ${normalized}, ${hash}, ${salt})
              RETURNING user_id, username
            ), made_group AS (
              INSERT INTO chat_groups (name, created_by)
              SELECT 'Antic Community', user_id FROM created
              ON CONFLICT DO NOTHING
              RETURNING group_id
            ), destination AS (
              SELECT group_id FROM made_group
              UNION ALL
              SELECT group_id FROM chat_groups
              WHERE LOWER(name) = LOWER('Antic Community')
                AND NOT EXISTS (SELECT 1 FROM made_group)
              LIMIT 1
            ), joined AS (
              INSERT INTO group_members (group_id, user_id)
              SELECT destination.group_id, created.user_id FROM destination CROSS JOIN created
              RETURNING user_id
            ) SELECT created.user_id, created.username FROM created JOIN joined USING (user_id)`;
          if (!users.length) throw new HttpError(500, "Konto konnte nicht angelegt werden. Bitte installiere zuerst das Datenbankschema.");
          return json({ user: { displayName: users[0].username, isOwner: owner } }, 201, { "Set-Cookie": cookie(sessionToken(users[0])) });
        }
        const rows = await sql`SELECT user_id, username, password_hash, password_salt FROM users WHERE username_normalized = ${normalized}`;
        if (!rows.length) throw new HttpError(401, "Anzeigename oder Passwort ist falsch.");
        const candidate = await pbkdf2(password, Buffer.from(rows[0].password_salt, "base64url"), 310000, 32, "sha256");
        const expected = Buffer.from(rows[0].password_hash, "base64url");
        if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) throw new HttpError(401, "Anzeigename oder Passwort ist falsch.");
        return json({ user: { displayName: rows[0].username, isOwner: owner } }, 200, { "Set-Cookie": cookie(sessionToken(rows[0])) });
      }
      const sql = sqlClient();
      if (path === "auth/me" && method === "GET") {
        const session = sessionFrom(request);
        if (!session) return json({ user: null });
        const rows = await sql`SELECT user_id, username FROM users WHERE user_id = ${session.id}`;
        if (!rows.length) return json({ user: null }, 200, { "Set-Cookie": cookie("", 0) });
        return json({ user: { displayName: rows[0].username, isOwner: isOwner(rows[0].username) } });
      }

      const user = await requireUser(request, sql);
      if (path === "groups" && method === "GET") {
        const groups = await sql`
          SELECT g.group_id, g.name, COUNT(m.user_id)::int AS member_count
          FROM chat_groups g JOIN group_members mine ON mine.group_id = g.group_id AND mine.user_id = ${user.user_id}
          LEFT JOIN group_members m ON m.group_id = g.group_id
          GROUP BY g.group_id ORDER BY g.created_at, g.group_id`;
        return json({ groups });
      }
      if (path === "groups" && method === "POST") {
        assertSameOrigin(request);
        const body = await parseJson(request);
        const name = String(body.name || "").trim();
        if (name.length < 2 || name.length > 64) throw new HttpError(400, "Gruppennamen müssen 2–64 Zeichen lang sein.");
        const created = await sql`INSERT INTO chat_groups (name, created_by) VALUES (${name}, ${user.user_id}) RETURNING group_id, name`;
        await sql`INSERT INTO group_members (group_id, user_id) VALUES (${created[0].group_id}, ${user.user_id})`;
        return json({ group: created[0] }, 201);
      }
      if (path === "group/members" && method === "GET") {
        const groupId = Number(url.searchParams.get("groupId"));
        if (!Number.isSafeInteger(groupId) || groupId < 1) throw new HttpError(400, "Ungültige Gruppe.");
        await requireMembership(sql, groupId, user.user_id);
        const members = await sql`SELECT u.username, u.user_id FROM group_members gm JOIN users u USING (user_id) WHERE gm.group_id = ${groupId} ORDER BY u.username_normalized LIMIT 100`;
        return json({ members: members.map((member) => ({ display_name: member.username, is_owner: isOwner(member.username) })) });
      }
      if (path === "messages" && method === "GET") {
        const groupId = Number(url.searchParams.get("groupId"));
        if (!Number.isSafeInteger(groupId) || groupId < 1) throw new HttpError(400, "Ungültige Gruppe.");
        await requireMembership(sql, groupId, user.user_id);
        const messages = await sql`
          SELECT m.message_id, m.content, m.created_at, u.username AS display_name
          FROM messages m JOIN users u USING (user_id)
          WHERE m.group_id = ${groupId} ORDER BY m.created_at DESC, m.message_id DESC LIMIT 200`;
        messages.reverse();
        return json({ messages: messages.map((message) => ({ ...message, is_owner: isOwner(message.display_name) })) });
      }
      if (path === "messages" && method === "POST") {
        assertSameOrigin(request);
        const body = await parseJson(request);
        const groupId = Number(body.groupId);
        const content = String(body.content || "").trim();
        if (!Number.isSafeInteger(groupId) || groupId < 1) throw new HttpError(400, "Ungültige Gruppe.");
        if (!content || content.length > 2000) throw new HttpError(400, "Nachrichten dürfen nicht leer sein und maximal 2.000 Zeichen enthalten.");
        await requireMembership(sql, groupId, user.user_id);
        const rows = await sql`INSERT INTO messages (group_id, user_id, content) VALUES (${groupId}, ${user.user_id}, ${content}) RETURNING message_id, content, created_at`;
        return json({ message: { ...rows[0], display_name: user.username, is_owner: isOwner(user.username) } }, 201);
      }
      if (path === "documents" && method === "GET") {
        const groupId = Number(url.searchParams.get("groupId"));
        if (!Number.isSafeInteger(groupId) || groupId < 1) throw new HttpError(400, "Ungültige Gruppe.");
        await requireMembership(sql, groupId, user.user_id);
        const documents = await sql`SELECT d.document_id, d.filename, d.byte_size, d.created_at, u.username AS display_name FROM documents d JOIN users u USING (user_id) WHERE d.group_id = ${groupId} ORDER BY d.created_at LIMIT 100`;
        return json({ documents: documents.map((doc) => ({ ...doc, DocumentID: doc.document_id })) });
      }
      if (path === "documents" && method === "POST") {
        assertSameOrigin(request);
        const form = await request.formData();
        const groupId = Number(form.get("groupId"));
        const file = form.get("file");
        if (!Number.isSafeInteger(groupId) || groupId < 1) throw new HttpError(400, "Ungültige Gruppe.");
        if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "Bitte wähle eine Datei aus.");
        await requireMembership(sql, groupId, user.user_id);
        const filename = safeFilename(file.name);
        const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
        if (!ALLOWED_EXTENSIONS.has(ext)) throw new HttpError(400, "Dieser Dateityp ist nicht zugelassen.");
        if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new HttpError(413, "Dokumente dürfen höchstens 3 MB groß sein.");
        const data = Buffer.from(await file.arrayBuffer()).toString("base64");
        const rows = await sql`
          INSERT INTO documents (group_id, user_id, filename, content_type, byte_size, file_data)
          VALUES (${groupId}, ${user.user_id}, ${filename}, ${"application/octet-stream"}, ${file.size}, decode(${data}, 'base64'))
          RETURNING document_id, filename, byte_size, created_at`;
        return json({ document: { ...rows[0], DocumentID: rows[0].document_id, display_name: user.username } }, 201);
      }
      if (path === "documents/download" && method === "GET") {
        const groupId = Number(url.searchParams.get("groupId"));
        const documentId = Number(url.searchParams.get("documentId"));
        if (![groupId, documentId].every((value) => Number.isSafeInteger(value) && value > 0)) throw new HttpError(400, "Ungültiges Dokument.");
        await requireMembership(sql, groupId, user.user_id);
        const rows = await sql`SELECT filename, content_type, byte_size, encode(file_data, 'base64') AS file_data FROM documents WHERE document_id = ${documentId} AND group_id = ${groupId}`;
        if (!rows.length) throw new HttpError(404, "Dokument nicht gefunden.");
        const row = rows[0];
        return new Response(Buffer.from(row.file_data, "base64"), { headers: {
          "Content-Type": row.content_type || "application/octet-stream",
          "Content-Length": String(row.byte_size),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store"
        }});
      }
      throw new HttpError(404, "API-Endpunkt nicht gefunden.");
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error?.code === "23505") return json({ error: "Dieser Anzeigename ist bereits vergeben." }, 409);
      console.error("Antic API error:", error);
      return json({ error: "Die Anfrage konnte nicht verarbeitet werden. Prüfe Datenbank und Serverkonfiguration." }, 500);
    }
  }
};
