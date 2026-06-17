const state = {
  sections: [],
  section: "dashboard",
  files: [],
  current: null,
  dirty: false,
  preview: false,
  dataRoot: "",
  dataMode: "demo",
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function setStatus(message, isError = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", isError);
}

function renderNav() {
  $("nav").innerHTML = state.sections.map((item) => `
    <button type="button" class="${item.key === state.section ? "active" : ""}" data-section="${item.key}">
      <span>${escapeHtml(item.label)}</span>
      <span class="count">${item.count}</span>
    </button>
  `).join("");
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => selectSection(button.dataset.section));
  });
  $("createSection").innerHTML = state.sections
    .filter((item) => item.key !== "dashboard")
    .map((item) => `<option value="${item.key}">${escapeHtml(item.label)}</option>`)
    .join("");
}

function renderStats(stats) {
  const items = [
    ["文件", stats.files],
    ["分类", stats.sections],
    ["日志", stats.logs],
    ["计划", stats.plans],
  ];
  $("stats").innerHTML = items.map(([label, value]) => `
    <div class="stat-card"><strong>${value}</strong><span>${label}</span></div>
  `).join("");
}

function renderRecent(files, target = $("recentFiles")) {
  if (!files.length) {
    target.innerHTML = `<div class="empty">没有结果</div>`;
    return;
  }
  target.innerHTML = files.map((file) => `
    <button type="button" class="recent-item" data-open="${escapeHtml(file.path)}" data-section-open="${escapeHtml(file.section)}">
      <div class="item-title">${escapeHtml(file.title)}</div>
      <div class="item-meta">${escapeHtml(file.path)} · ${escapeHtml(file.updated)}${file.line ? ` · 第 ${file.line} 行` : ""}</div>
      <div class="item-excerpt">${escapeHtml(file.snippet || file.excerpt || "")}</div>
    </button>
  `).join("");
  target.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      await selectSection(button.dataset.sectionOpen || "dashboard");
      await openFile(button.dataset.open);
    });
  });
}

function renderFiles() {
  if (!state.files.length) {
    $("fileList").innerHTML = `<div class="empty">当前分类没有 Markdown 文件</div>`;
    return;
  }
  $("fileList").innerHTML = state.files.map((file) => `
    <button type="button" class="file-card ${state.current?.path === file.path ? "active" : ""}" data-path="${escapeHtml(file.path)}">
      <div class="item-title">${escapeHtml(file.title)}</div>
      <div class="item-meta">${escapeHtml(file.path)} · ${escapeHtml(file.updated)} · ${file.size} B</div>
      <div class="item-excerpt">${escapeHtml(file.excerpt)}</div>
    </button>
  `).join("");
  $("fileList").querySelectorAll("[data-path]").forEach((button) => {
    button.addEventListener("click", () => openFile(button.dataset.path));
  });
}

function fillFocus(focus) {
  $("focusMainGoal").value = focus["主目标"] || "";
  $("focusStage").value = focus["当前阶段"] || "";
  $("focusWeek").value = focus["本周重点"] || "";
  $("focusToday").value = focus["今日任务"] || "";
}

async function loadSummary() {
  const summary = await api("/api/summary");
  state.dataRoot = summary.dataRoot || "";
  state.dataMode = summary.dataMode || "demo";
  state.sections = summary.sections;
  $("logDate").value = summary.today;
  renderNav();
  renderStats(summary.stats);
  fillFocus(summary.focus);
  renderRecent(summary.recent);
  refreshAiStatus().catch(() => {});
}

async function selectSection(section) {
  if (!await confirmLeave()) return;
  state.section = section;
  state.current = null;
  state.dirty = false;
  state.preview = false;
  $("editor").value = "";
  $("preview").style.display = "none";
  $("editor").style.display = "block";
  $("previewBtn").textContent = "预览";
  const info = state.sections.find((item) => item.key === section);
  $("pageTitle").textContent = info ? info.label : section;
  const source = state.dataMode === "external" ? "外部数据" : "Demo 数据";
  $("pageMeta").textContent = info ? `${info.count} 个文件 · ${source} · ${state.dataRoot}` : "";
  $("dashboardView").style.display = section === "dashboard" ? "block" : "none";
  $("managerView").style.display = section === "dashboard" ? "none" : "grid";
  $("searchView").style.display = "none";
  $("currentPath").textContent = "未选择文件";
  setEditorEnabled(false);
  renderNav();
  if (section !== "dashboard") {
    await loadFiles();
    if (state.files[0]) await openFile(state.files[0].path);
  }
}

async function loadFiles() {
  const params = new URLSearchParams({
    section: state.section,
    q: $("fileSearch").value.trim(),
    sort: $("sortSelect").value,
  });
  state.files = (await api(`/api/files?${params}`)).files;
  renderFiles();
}

function setEditorEnabled(enabled) {
  $("saveBtn").disabled = !enabled;
  $("renameBtn").disabled = !enabled || state.current?.path === "dashboard.md";
  $("archiveBtn").disabled = !enabled || state.current?.path === "dashboard.md";
}

async function refreshAiStatus() {
  const status = await api("/api/ai/status");
  $("aiStatus").textContent = status.configured ? `${status.model} 已配置` : `未配置 ${status.required_env}`;
  $("aiStatus").className = `badge ${status.configured ? "ready" : "warn"}`;
  return status;
}

async function openFile(path) {
  if (!await confirmLeave()) return;
  const file = await api(`/api/file?path=${encodeURIComponent(path)}`);
  state.current = file.meta;
  state.dirty = false;
  $("editor").value = file.content;
  $("currentPath").textContent = file.meta.path;
  setEditorEnabled(true);
  renderFiles();
  updatePreview();
  setStatus(`已打开 ${file.meta.path}`);
}

async function saveCurrent() {
  if (!state.current) return;
  const result = await api("/api/file", {
    method: "POST",
    body: JSON.stringify({ path: state.current.path, content: $("editor").value }),
  });
  state.current = result.meta;
  state.dirty = false;
  await loadSummary();
  await loadFiles();
  setStatus(`已保存 ${result.meta.path}，备份：${result.backup}`);
}

async function createFile() {
  const result = await api("/api/create", {
    method: "POST",
    body: JSON.stringify({
      section: $("createSection").value,
      title: $("createTitle").value,
      name: $("createName").value,
    }),
  });
  $("createDialog").close();
  await loadSummary();
  await selectSection(result.meta.section);
  await openFile(result.meta.path);
}

async function renameCurrent() {
  if (!state.current) return;
  const result = await api("/api/rename", {
    method: "POST",
    body: JSON.stringify({ path: state.current.path, name: $("renameName").value }),
  });
  $("renameDialog").close();
  await loadSummary();
  await loadFiles();
  await openFile(result.meta.path);
}

async function archiveCurrent() {
  if (!state.current) return;
  if (!window.confirm(`归档 ${state.current.path} 到 .trash/？`)) return;
  const result = await api("/api/archive", {
    method: "POST",
    body: JSON.stringify({ path: state.current.path }),
  });
  state.current = null;
  state.dirty = false;
  $("editor").value = "";
  $("currentPath").textContent = "未选择文件";
  setEditorEnabled(false);
  await loadSummary();
  await loadFiles();
  setStatus(`已归档到 ${result.archived_to}`);
}

async function saveFocus() {
  await api("/api/dashboard/focus", {
    method: "POST",
    body: JSON.stringify({
      main_goal: $("focusMainGoal").value,
      stage: $("focusStage").value,
      week: $("focusWeek").value,
      today: $("focusToday").value,
    }),
  });
  await loadSummary();
  setStatus("dashboard 焦点已更新");
}

async function appendLog() {
  const result = await api("/api/logs/daily", {
    method: "POST",
    body: JSON.stringify({
      date: $("logDate").value,
      task: $("logTask").value,
      result: $("logResult").value,
      hours: $("logHours").value,
      evidence: $("logEvidence").value,
      takeaway: $("logTakeaway").value,
      next: $("logNext").value,
    }),
  });
  ["logTask", "logResult", "logHours", "logEvidence", "logTakeaway", "logNext"].forEach((id) => $(id).value = "");
  await loadSummary();
  setStatus(`已追加日志 ${result.path}`);
}

async function runSearch() {
  const query = $("globalSearch").value.trim();
  if (!query) {
    await selectSection("dashboard");
    return;
  }
  if (!await confirmLeave()) return;
  const results = (await api(`/api/search?q=${encodeURIComponent(query)}`)).results;
  state.section = "__search";
  $("dashboardView").style.display = "none";
  $("managerView").style.display = "none";
  $("searchView").style.display = "block";
  $("pageTitle").textContent = "全局搜索";
  $("pageMeta").textContent = `${results.length} 个结果`;
  renderNav();
  renderRecent(results, $("searchResults"));
}

async function openAiDialog() {
  const status = await refreshAiStatus();
  $("aiPrompt").value = "";
  $("aiResult").value = "";
  $("aiInsertBtn").disabled = true;
  $("aiReplaceBtn").disabled = true;
  $("aiGenerateSubmit").disabled = !status.configured;
  $("aiDialog").showModal();
}

async function generateWithAi() {
  const button = $("aiGenerateSubmit");
  button.disabled = true;
  button.classList.add("busy");
  button.textContent = "生成中";
  $("aiResult").value = "";
  try {
    const result = await api("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify({
        mode: $("aiMode").value,
        prompt: $("aiPrompt").value,
        section: state.section,
        path: state.current?.path || "",
        context: $("aiUseContext").checked ? $("editor").value : "",
      }),
    });
    $("aiResult").value = result.content;
    $("aiInsertBtn").disabled = !result.content;
    $("aiReplaceBtn").disabled = !result.content;
    setStatus(`DeepSeek 生成完成：${result.model}`);
  } finally {
    button.disabled = false;
    button.classList.remove("busy");
    button.textContent = "生成";
  }
}

function insertAiResult(replace = false) {
  const content = $("aiResult").value.trim();
  if (!content) return;
  if (replace) {
    $("editor").value = content + "\n";
  } else {
    const current = $("editor").value;
    const separator = current.endsWith("\n") || !current ? "" : "\n\n";
    $("editor").value = `${current}${separator}${content}\n`;
  }
  state.dirty = true;
  updatePreview();
  setStatus("AI 生成内容已写入编辑器，保存后才会更新文件");
}

async function confirmLeave() {
  if (!state.dirty) return true;
  return window.confirm("当前文件有未保存修改，确定离开吗？");
}

function togglePreview() {
  state.preview = !state.preview;
  $("preview").style.display = state.preview ? "block" : "none";
  $("editor").style.display = state.preview ? "none" : "block";
  $("previewBtn").textContent = state.preview ? "编辑" : "预览";
  updatePreview();
}

function updatePreview() {
  if (!state.preview) return;
  $("preview").innerHTML = renderMarkdown($("editor").value);
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  let html = "";
  let inList = false;
  let inCode = false;
  let code = [];
  let table = [];

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  const flushTable = () => {
    if (!table.length) return;
    html += "<table>";
    table.forEach((row, index) => {
      if (/^\s*\|?\s*:?-{3,}/.test(row)) return;
      const cells = row.split("|").slice(1, -1);
      const tag = index === 0 ? "th" : "td";
      html += `<tr>${cells.map((cell) => `<${tag}>${inline(cell.trim())}</${tag}>`).join("")}</tr>`;
    });
    html += "</table>";
    table = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushTable();
      closeList();
      if (inCode) {
        html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
        code = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (/^\|.*\|$/.test(line.trim())) {
      closeList();
      table.push(line.trim());
      continue;
    }
    flushTable();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html += `<h${level}>${inline(heading[2])}</h${level}>`;
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`;
    } else if (line.trim()) {
      closeList();
      html += `<p>${inline(line)}</p>`;
    } else {
      closeList();
    }
  }
  flushTable();
  closeList();
  return html || `<div class="empty">没有可预览内容</div>`;
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

$("fileSearch").addEventListener("input", () => loadFiles().catch((error) => setStatus(error.message, true)));
$("sortSelect").addEventListener("change", () => loadFiles().catch((error) => setStatus(error.message, true)));
$("editor").addEventListener("input", () => {
  state.dirty = true;
  updatePreview();
  if (state.current) setStatus(`正在编辑 ${state.current.path}`);
});
$("saveBtn").addEventListener("click", () => saveCurrent().catch((error) => setStatus(error.message, true)));
$("previewBtn").addEventListener("click", togglePreview);
$("newBtn").addEventListener("click", () => {
  $("createSection").value = state.section && state.section !== "dashboard" && state.section !== "__search" ? state.section : "plans";
  $("createTitle").value = "";
  $("createName").value = "";
  $("createDialog").showModal();
});
$("aiBtn").addEventListener("click", () => openAiDialog().catch((error) => setStatus(error.message, true)));
$("aiGenerateSubmit").addEventListener("click", (event) => {
  event.preventDefault();
  generateWithAi().catch((error) => setStatus(error.message, true));
});
$("aiInsertBtn").addEventListener("click", (event) => {
  event.preventDefault();
  insertAiResult(false);
});
$("aiReplaceBtn").addEventListener("click", (event) => {
  event.preventDefault();
  if (window.confirm("确定用 AI 生成结果替换当前编辑器内容吗？")) insertAiResult(true);
});
$("createTitle").addEventListener("input", () => {
  if ($("createName").value.trim()) return;
  const value = $("createTitle").value.trim().replace(/\s+/g, "-");
  $("createName").value = value ? `${value}.md` : "";
});
$("createSubmit").addEventListener("click", (event) => {
  event.preventDefault();
  createFile().catch((error) => setStatus(error.message, true));
});
$("renameBtn").addEventListener("click", () => {
  if (!state.current) return;
  $("renameName").value = state.current.name;
  $("renameDialog").showModal();
});
$("renameSubmit").addEventListener("click", (event) => {
  event.preventDefault();
  renameCurrent().catch((error) => setStatus(error.message, true));
});
$("archiveBtn").addEventListener("click", () => archiveCurrent().catch((error) => setStatus(error.message, true)));
$("saveFocusBtn").addEventListener("click", () => saveFocus().catch((error) => setStatus(error.message, true)));
$("appendLogBtn").addEventListener("click", () => appendLog().catch((error) => setStatus(error.message, true)));
$("globalSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") runSearch().catch((error) => setStatus(error.message, true));
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

(async function init() {
  try {
    await loadSummary();
    await selectSection("dashboard");
  } catch (error) {
    setStatus(error.message, true);
  }
})();
