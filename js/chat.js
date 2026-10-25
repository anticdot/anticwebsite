const API = "/api/index";
const state = { user: null, groups: [], activeGroupId: null, messageIds: new Set(), documents: new Set(), signup: true, pendingDocument: null };
const $ = (selector) => document.querySelector(selector);
const toast = $("#toast");
const authBackdrop = $("#authBackdrop");
const downloadBackdrop = $("#downloadBackdrop");
const inviteBackdrop = $("#inviteBackdrop");

function endpoint(path, params = {}) {
  const url = new URL(API, location.origin);
  url.searchParams.set("path", path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}
async function request(path, options = {}, params = {}) {
  const response = await fetch(endpoint(path, params), { credentials: "same-origin", ...options });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(data?.error || "Die Anfrage konnte nicht abgeschlossen werden.");
  return data;
}
function setUser(user) {
  state.user = user;
  const avatar = $("#topAvatar");
  const name = user?.displayName || "Gast";
  avatar.textContent = user ? name.slice(0, 1).toLocaleUpperCase("de-DE") : "G";
  avatar.title = name;
  avatar.classList.toggle("owner-avatar", Boolean(user?.isOwner));
  $("#openAuth").textContent = user ? `Abmelden · ${name}` : "Anmelden / Konto erstellen";
  if (user?.isOwner) avatar.classList.add("owner-avatar");
}
function setActiveGroup(group) {
  state.activeGroupId = Number(group.group_id);
  $("#activeGroupName").textContent = group.name;
  $("#channelGroupName").textContent = group.name;
  $("#messageInput").placeholder = `Nachricht an ${group.name}`;
  $("#welcomeEyebrow").textContent = `${group.name.toLocaleUpperCase("de-DE")} · GRUPPE`;
  document.querySelectorAll("[data-group-id]").forEach((button) => button.classList.toggle("selected", Number(button.dataset.groupId) === state.activeGroupId));
  state.messageIds.clear();
  state.documents.clear();
  clearTimeline();
  void loadGroupContent();
}
function clearTimeline() {
  const timeline = $("#messages");
  [...timeline.children].slice(2).forEach((node) => node.remove());
}
function renderGroups() {
  const list = $("#groupsList");
  const create = $("#createGroup");
  list.replaceChildren();
  for (const group of state.groups) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-item";
    button.dataset.groupId = group.group_id;
    const mark = document.createElement("span");
    mark.className = "group-mark";
    mark.textContent = group.name.slice(0, 1).toLocaleUpperCase("de-DE");
    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = group.name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(group.member_count || 0);
    button.append(mark, name, count);
    button.addEventListener("click", () => setActiveGroup(group));
    list.append(button);
  }
  list.append(create);
}
function addMessage(message, own = false) {
  if (state.messageIds.has(String(message.message_id))) return;
  state.messageIds.add(String(message.message_id));
  const article = document.createElement("article");
  article.className = "message";
  const avatar = document.createElement("div");
  avatar.className = `avatar${message.is_owner ? " owner-avatar" : ""}`;
  avatar.textContent = (message.display_name || "A").slice(0, 1).toLocaleUpperCase("de-DE");
  const content = document.createElement("div");
  content.className = "msg-content";
  const header = document.createElement("div");
  header.className = "msg-top";
  const name = document.createElement("span");
  name.className = `msg-name${message.is_owner ? " owner-name" : ""}`;
  name.textContent = message.display_name;
  const tag = document.createElement("span");
  tag.className = `tag${message.is_owner ? " owner-tag" : ""}`;
  tag.textContent = message.is_owner ? "Owner" : own ? "Du" : "Member";
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = message.created_at ? new Date(message.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "Jetzt";
  header.append(name, tag, time);
  const body = document.createElement("div");
  body.className = "msg-text";
  body.textContent = message.content;
  content.append(header, body);
  article.append(avatar, content);
  $("#messages").append(article);
  return article;
}
function formatSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}
function addDocumentCard(doc) {
  const id = String(doc.document_id || doc.DocumentID);
  if (state.documents.has(id)) return;
  state.documents.add(id);
  const card = document.createElement("div");
  card.className = "file-card";
  const icon = document.createElement("div");
  icon.className = "file-icon";
  icon.textContent = (doc.filename.split(".").pop() || "FILE").slice(0, 4).toUpperCase();
  const meta = document.createElement("div");
  meta.className = "file-meta";
  const title = document.createElement("strong");
  title.textContent = doc.filename;
  title.title = doc.filename;
  const subtitle = document.createElement("small");
  subtitle.textContent = `${doc.display_name || "Gruppenmitglied"} · ${formatSize(Number(doc.byte_size))}`;
  meta.append(title, subtitle);
  const button = document.createElement("button");
  button.className = "download-button";
  button.textContent = "Herunterladen";
  button.addEventListener("click", () => confirmDownload(doc));
  card.append(icon, meta, button);
  $("#messages").append(card);
}
async function loadGroups() {
  const data = await request("groups");
  state.groups = data.groups;
  renderGroups();
  if (state.groups.length) setActiveGroup(state.groups[0]);
  else showToast("Es gibt noch keine Gruppe für dieses Konto.");
}
async function loadGroupContent() {
  if (!state.activeGroupId || !state.user) return;
  const groupId = state.activeGroupId;
  try {
    const [messages, documents, members] = await Promise.all([
      request("messages", {}, { groupId }),
      request("documents", {}, { groupId }),
      request("group/members", {}, { groupId })
    ]);
    if (groupId !== state.activeGroupId) return;
    messages.messages.forEach((message) => addMessage(message, message.display_name === state.user.displayName));
    documents.documents.forEach(addDocumentCard);
    renderMembers(members.members);
    $("#memberLabel").textContent = `Mitglieder · ${members.members.length}`;
  } catch (error) { showToast(error.message); }
}
function renderMembers(members) {
  const list = $("#memberList");
  list.replaceChildren();
  for (const member of members) {
    const row = document.createElement("div");
    row.className = "member";
    const avatar = document.createElement("span");
    avatar.className = `avatar${member.is_owner ? " owner-avatar" : ""}`;
    avatar.textContent = member.display_name.slice(0, 1).toLocaleUpperCase("de-DE");
    const label = document.createElement("span");
    label.textContent = member.display_name;
    if (member.is_owner) label.classList.add("owner-name");
    const detail = document.createElement("small");
    detail.textContent = member.is_owner ? "Owner" : "Mitglied";
    label.append(detail);
    row.append(avatar, label);
    list.append(row);
  }
}
function openAuth() {
  authBackdrop.classList.add("open");
  window.setTimeout(() => $("#displayName").focus(), 50);
}
function updateOwnerField() {
  const field = $("#ownerKeyField");
  const ownerName = $("#displayName").dataset.ownerName || "";
  const isOwnerName = ownerName && $("#displayName").value.trim().toLocaleLowerCase("en-US") === ownerName.toLocaleLowerCase("en-US");
  field.hidden = !isOwnerName;
  $("#ownerKey").required = Boolean(isOwnerName);
  if (!isOwnerName) $("#ownerKey").value = "";
}

$("#openAuth").addEventListener("click", async () => {
  if (!state.user) return openAuth();
  try {
    await request("auth/logout", { method: "POST" });
    setUser(null);
    state.groups = [];
    state.activeGroupId = null;
    renderGroups();
    clearTimeline();
    renderMembers([]);
    showToast("Du wurdest abgemeldet.");
  } catch (error) { showToast(error.message); }
});
$("#displayName").addEventListener("input", updateOwnerField);
$("#switchMode").addEventListener("click", () => {
  state.signup = !state.signup;
  $("#authTitle").textContent = state.signup ? "Willkommen bei Antic" : "Schön, dass du zurück bist";
  $("#authSub").textContent = state.signup ? "Ein Anzeigename und ein Passwort. Keine E-Mail-Adresse erforderlich." : "Melde dich mit Anzeigename und Passwort an. Für den Owner ist zusätzlich der Schlüssel erforderlich.";
  $("#authSubmit").textContent = state.signup ? "Konto erstellen" : "Anmelden";
  $("#switchText").textContent = state.signup ? "Schon ein Konto?" : "Neu bei Antic?";
  $("#switchMode").textContent = state.signup ? "Anmelden" : "Konto erstellen";
  $("#password").autocomplete = state.signup ? "new-password" : "current-password";
  updateOwnerField();
});
$("#closeAuth").addEventListener("click", () => authBackdrop.classList.remove("open"));
for (const backdrop of [authBackdrop, downloadBackdrop, inviteBackdrop]) backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.classList.remove("open"); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { authBackdrop.classList.remove("open"); downloadBackdrop.classList.remove("open"); inviteBackdrop.classList.remove("open"); } });
$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const authForm = event.currentTarget;
  const payload = { displayName: $("#displayName").value.trim(), password: $("#password").value, ownerKey: $("#ownerKey").value };
  try {
    const data = await request(`auth/${state.signup ? "register" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setUser(data.user);
    authBackdrop.classList.remove("open");
    authForm.reset();
    $("#ownerKeyField").hidden = true;
    await loadGroups();
    showToast(`${state.signup ? "Konto erstellt" : "Angemeldet"}: ${data.user.displayName}`);
  } catch (error) { showToast(error.message); }
});
$("#createGroup").addEventListener("click", createGroup);
$("#createGroupTop").addEventListener("click", createGroup);
$("#createGroupRail").addEventListener("click", createGroup);
async function createGroup() {
  if (!state.user) return showToast("Melde dich an, um eine Gruppe zu erstellen.");
  const name = window.prompt("Name der neuen Gruppe");
  if (!name?.trim()) return;
  try {
    const data = await request("groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
    await loadGroups();
    const created = state.groups.find((group) => Number(group.group_id) === Number(data.group.group_id));
    if (created) setActiveGroup(created);
  } catch (error) { showToast(error.message); }
}
function openInvite() {
  if (!state.user) return showToast("Melde dich an, um Mitglieder hinzuzufügen.");
  if (!state.activeGroupId) return showToast("Wähle zuerst eine Gruppe aus.");
  inviteBackdrop.classList.add("open");
  window.setTimeout(() => $("#inviteDisplayName").focus(), 50);
}
$("#inviteMemberButton").addEventListener("click", openInvite);
$("#closeInvite").addEventListener("click", () => inviteBackdrop.classList.remove("open"));
$("#inviteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const inviteForm = event.currentTarget;
  const submit = $("#inviteSubmit");
  const displayName = $("#inviteDisplayName").value.trim();
  if (!state.activeGroupId) return showToast("Wähle zuerst eine Gruppe aus.");
  submit.disabled = true;
  try {
    const data = await request("group/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName })
    }, { groupId: state.activeGroupId });
    inviteBackdrop.classList.remove("open");
    inviteForm.reset();
    await loadGroupContent();
    showToast(`${data.member.display_name} wurde zur Gruppe hinzugefügt.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
  }
});
$("#messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#messageInput");
  const content = input.value.trim();
  if (!content) return;
  if (!state.user) return showToast("Melde dich an, um Nachrichten zu senden.");
  try {
    const data = await request("messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, groupId: state.activeGroupId }) });
    addMessage(data.message, true);
    input.value = "";
    $("#messages").lastElementChild.scrollIntoView({ behavior: "smooth", block: "end" });
  } catch (error) { showToast(error.message); }
});
const fileInput = $("#documentInput");
$("#attachButton").addEventListener("click", () => {
  if (!state.user) return showToast("Melde dich an, um ein Dokument hochzuladen.");
  fileInput.click();
});
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  form.append("groupId", state.activeGroupId);
  try {
    const data = await request("documents", { method: "POST", body: form });
    addDocumentCard(data.document);
    showToast("Dokument wurde in der Gruppe geteilt.");
  } catch (error) { showToast(error.message); }
  finally { fileInput.value = ""; }
});
function confirmDownload(doc) {
  state.pendingDocument = doc;
  $("#downloadInfo").textContent = `${doc.filename} · ${formatSize(Number(doc.byte_size))} · geteilt von ${doc.display_name || "Gruppenmitglied"}`;
  downloadBackdrop.classList.add("open");
}
$("#cancelDownload").addEventListener("click", () => downloadBackdrop.classList.remove("open"));
$("#acceptDownload").addEventListener("click", () => {
  if (!state.pendingDocument) return;
  const id = state.pendingDocument.document_id || state.pendingDocument.DocumentID;
  location.href = endpoint("documents/download", { documentId: id, groupId: state.activeGroupId });
  state.pendingDocument = null;
  downloadBackdrop.classList.remove("open");
});
const emojis = ["😀", "😄", "😁", "😂", "😊", "😍", "😎", "🥳", "🤔", "🙌", "👏", "👍", "👎", "❤️", "🔥", "✨", "🎉", "💯", "🤝", "👋", "🙏", "😅", "😭", "💡"];
const emojiPopover = $("#emojiPopover");
for (const emoji of emojis) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = emoji;
  button.setAttribute("aria-label", emoji);
  button.addEventListener("click", () => {
    const input = $("#messageInput");
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    input.focus();
    input.setSelectionRange(start + emoji.length, start + emoji.length);
    emojiPopover.hidden = true;
  });
  emojiPopover.append(button);
}
$("#emojiButton").addEventListener("click", () => { emojiPopover.hidden = !emojiPopover.hidden; });
$("#privacyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showToast("Antic benötigt technische Infrastruktur. Vercel und Neon können Verbindungsdaten verarbeiten.");
});
async function start() {
  try {
    const config = await request("auth/config");
    $("#displayName").dataset.ownerName = config.ownerUsername || "";
    const session = await request("auth/me");
    if (session.user) {
      setUser(session.user);
      await loadGroups();
    } else {
      setUser(null);
      openAuth();
    }
  } catch (error) {
    showToast(error.message.includes("fetch") ? "API nicht erreichbar. Prüfe PostgreSQL- und Vercel-Konfiguration." : error.message);
  }
}
if (location.hash === "#signup") state.signup = true;
void start();
window.setInterval(() => { if (state.user && state.activeGroupId) void loadGroupContent(); }, 12000);

