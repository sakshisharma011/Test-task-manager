/* TaskFlow — a dependency-free task & timeline manager.
 * Data is stored in the browser (localStorage). Use Export/Import to back up or move data.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "taskflow.tasks.v1";
  const PREFS_KEY = "taskflow.prefs.v1";
  const DAY = 86400000;
  const STATUSES = [
    { id: "todo", label: "To do" },
    { id: "in-progress", label: "In progress" },
    { id: "blocked", label: "Blocked" },
    { id: "done", label: "Done" },
  ];
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const ZOOM_PX = { day: 36, week: 14, month: 5 }; // pixels per day

  // ---------- Date helpers (all dates are "YYYY-MM-DD" strings) ----------
  const toKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const dayNum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return toKey(d); };
  const todayKey = () => toKey(new Date());
  const fmt = (s) => parse(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const fmtLong = (s) => parse(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---------- State ----------
  let tasks = load();
  const prefs = Object.assign(
    { view: "list", zoom: "week", sort: "end" },
    safeJSON(localStorage.getItem(PREFS_KEY)) || {}
  );
  const filters = { q: "", project: "", status: "", priority: "" };

  function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }

  function load() {
    const stored = safeJSON(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : sampleTasks();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
    catch { toast("Could not save — browser storage is full or disabled."); }
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }
  function sampleTasks() {
    const t = todayKey();
    const mk = (title, project, owner, s, e, status, priority, progress, description = "") =>
      ({ id: uid(), title, project, owner, start: addDays(t, s), end: addDays(t, e), status, priority, progress, description, createdAt: Date.now() });
    return [
      mk("Define campaign goals & KPIs", "Q4 Launch", "Sakshi", -10, -4, "done", "high", 100, "Agree targets with stakeholders."),
      mk("Build creative brief", "Q4 Launch", "Ananya", -5, 2, "in-progress", "high", 60),
      mk("Set up tracking dashboards", "Q4 Launch", "Rahul", -2, 6, "in-progress", "medium", 30),
      mk("Seller onboarding calls", "Seller Growth", "Sakshi", 0, 10, "todo", "medium", 0, "Kick-off calls with new advertisers."),
      mk("Vendor contract sign-off", "Seller Growth", "Legal", -6, -1, "blocked", "high", 40, "Waiting on legal review."),
      mk("Quarterly business review deck", "Reporting", "Sakshi", 8, 15, "todo", "low", 0),
    ];
  }

  const isOverdue = (t) => t.status !== "done" && dayNum(t.end) < dayNum(todayKey());
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const statusLabel = (id) => (STATUSES.find((s) => s.id === id) || {}).label || id;

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const view = $("#view");
  const dialog = $("#taskDialog");
  const form = $("#taskForm");

  // ---------- Filtering & sorting ----------
  function visibleTasks() {
    const q = filters.q.trim().toLowerCase();
    const list = tasks.filter((t) =>
      (!filters.project || t.project === filters.project) &&
      (!filters.status || t.status === filters.status) &&
      (!filters.priority || t.priority === filters.priority) &&
      (!q || [t.title, t.description, t.owner, t.project].some((v) => (v || "").toLowerCase().includes(q)))
    );
    const by = prefs.sort;
    return list.sort((a, b) => {
      if (by === "title") return a.title.localeCompare(b.title);
      if (by === "priority") return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || dayNum(a.end) - dayNum(b.end);
      if (by === "start") return dayNum(a.start) - dayNum(b.start);
      return dayNum(a.end) - dayNum(b.end);
    });
  }

  // ---------- Rendering ----------
  function render() {
    document.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === prefs.view));
    $("#zoomControls").hidden = prefs.view !== "timeline";
    document.querySelectorAll("[data-zoom]").forEach((b) => b.classList.toggle("active", b.dataset.zoom === prefs.zoom));
    $("#sortBy").value = prefs.sort;
    renderStats();
    renderProjectOptions();
    const list = visibleTasks();
    if (!tasks.length) {
      view.innerHTML = `<div class="empty"><p><strong>No tasks yet.</strong></p><p>Click <em>+ New task</em> to add your first one.</p></div>`;
      return;
    }
    if (!list.length) {
      view.innerHTML = `<div class="empty">No tasks match your filters.</div>`;
      return;
    }
    if (prefs.view === "board") renderBoard(list);
    else if (prefs.view === "timeline") renderTimeline(list);
    else renderList(list);
  }

  function renderStats() {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const inProg = tasks.filter((t) => t.status === "in-progress").length;
    const overdue = tasks.filter(isOverdue).length;
    const t = dayNum(todayKey());
    const dueWeek = tasks.filter((x) => x.status !== "done" && dayNum(x.end) >= t && dayNum(x.end) <= t + 7).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("#stats").innerHTML = [
      ["Total tasks", total],
      ["In progress", inProg],
      ["Due in 7 days", dueWeek],
      ["Overdue", overdue, overdue > 0 ? "warn" : ""],
      ["Completed", `${done} · ${pct}%`],
    ].map(([label, value, cls = ""]) => `<div class="stat ${cls}"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("");
  }

  function renderProjectOptions() {
    const projects = [...new Set(tasks.map((t) => t.project).filter(Boolean))].sort();
    const sel = $("#filterProject");
    const current = filters.project;
    sel.innerHTML = `<option value="">All projects</option>` + projects.map((p) => `<option ${p === current ? "selected" : ""}>${esc(p)}</option>`).join("");
    if (current && !projects.includes(current)) filters.project = "";
    $("#projectList").innerHTML = projects.map((p) => `<option value="${esc(p)}">`).join("");
  }

  function dueCell(t) {
    const diff = dayNum(t.end) - dayNum(todayKey());
    let hint = "";
    if (t.status !== "done") {
      if (diff < 0) hint = `<span class="overdue"> · ${-diff}d overdue</span>`;
      else if (diff === 0) hint = `<span class="overdue"> · today</span>`;
      else if (diff <= 3) hint = ` · in ${diff}d`;
    }
    return `${fmtLong(t.end)}${hint}`;
  }

  function renderList(list) {
    view.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>Task</th><th>Project</th><th>Owner</th><th>Status</th><th>Priority</th><th>Start</th><th>Due</th><th>Progress</th></tr></thead>
        <tbody>${list.map((t) => `
          <tr data-id="${t.id}" class="${t.status === "done" ? "done-row" : ""}">
            <td><input type="checkbox" class="check" data-toggle="${t.id}" ${t.status === "done" ? "checked" : ""} title="Mark done" /></td>
            <td class="title-cell"><div class="title-text">${esc(t.title)}</div>${t.description ? `<div class="desc">${esc(t.description)}</div>` : ""}</td>
            <td>${t.project ? `<span class="badge project-tag">${esc(t.project)}</span>` : "—"}</td>
            <td>${esc(t.owner) || "—"}</td>
            <td><span class="badge status-${t.status}">${statusLabel(t.status)}</span></td>
            <td class="prio-${t.priority}">● ${t.priority[0].toUpperCase() + t.priority.slice(1)}</td>
            <td>${fmtLong(t.start)}</td>
            <td>${dueCell(t)}</td>
            <td><span class="progress"><span style="width:${t.progress}%"></span></span> ${t.progress}%</td>
          </tr>`).join("")}
        </tbody></table></div>`;
  }

  function renderBoard(list) {
    view.innerHTML = `<div class="board">${STATUSES.map((s) => {
      const items = list.filter((t) => t.status === s.id);
      return `<div class="column" data-status="${s.id}">
        <h3><span class="badge status-${s.id}">${s.label}</span><span class="count">${items.length}</span></h3>
        ${items.map((t) => `
          <div class="card" draggable="true" data-id="${t.id}">
            <div class="card-title">${esc(t.title)}</div>
            <div class="meta">
              ${t.project ? `<span class="badge project-tag">${esc(t.project)}</span>` : ""}
              <span class="prio-${t.priority}">● ${t.priority}</span>
              ${t.owner ? `<span>👤 ${esc(t.owner)}</span>` : ""}
            </div>
            <div class="meta" style="margin-top:6px">
              <span class="${isOverdue(t) ? "overdue" : ""}">📅 ${fmt(t.start)} → ${fmt(t.end)}</span>
              <span class="progress"><span style="width:${t.progress}%"></span></span>
            </div>
          </div>`).join("")}
      </div>`;
    }).join("")}</div>`;
  }

  function renderTimeline(list) {
    const pxPerDay = ZOOM_PX[prefs.zoom];
    const t0 = todayKey();
    let min = Math.min(...list.map((t) => dayNum(t.start)), dayNum(t0));
    let max = Math.max(...list.map((t) => dayNum(t.end)), dayNum(t0));
    // Pad the range and align to whole weeks/months for a tidy header.
    let startKey = addDays(t0, min - dayNum(t0) - 3);
    if (prefs.zoom !== "day") {
      const d = parse(startKey);
      if (prefs.zoom === "month") d.setDate(1); else d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
      startKey = toKey(d);
    }
    const origin = dayNum(startKey);
    const totalDays = Math.max(max - origin + 10, prefs.zoom === "month" ? 120 : prefs.zoom === "week" ? 42 : 21);
    const width = totalDays * pxPerDay;
    const days = Array.from({ length: totalDays }, (_, i) => addDays(startKey, i));
    const isWeekend = (k) => { const g = parse(k).getDay(); return g === 0 || g === 6; };

    // Header rows: top = months, bottom = day / week / (none for month view)
    const months = [];
    days.forEach((k) => {
      const d = parse(k);
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      if (!months.length || months[months.length - 1].label !== label) months.push({ label, n: 0 });
      months[months.length - 1].n++;
    });
    const topRow = months.map((m) => `<div class="tl-header-cell" style="width:${m.n * pxPerDay}px">${m.label}</div>`).join("");
    let bottomRow = "";
    if (prefs.zoom === "day") {
      bottomRow = days.map((k) => `<div class="tl-header-cell ${isWeekend(k) ? "weekend" : ""}" style="width:${pxPerDay}px;text-align:center;padding:4px 0">${parse(k).getDate()}</div>`).join("");
    } else if (prefs.zoom === "week") {
      for (let i = 0; i < days.length; i += 7) {
        const n = Math.min(7, days.length - i);
        bottomRow += `<div class="tl-header-cell" style="width:${n * pxPerDay}px">${fmt(days[i])}</div>`;
      }
    }

    // Background grid columns (one per day in day view, per week otherwise)
    let bg = "";
    if (prefs.zoom === "day") bg = days.map((k) => `<div class="${isWeekend(k) ? "weekend" : ""}" style="width:${pxPerDay}px"></div>`).join("");
    else if (prefs.zoom === "week") for (let i = 0; i < days.length; i += 7) bg += `<div style="width:${Math.min(7, days.length - i) * pxPerDay}px"></div>`;
    else bg = months.map((m) => `<div style="width:${m.n * pxPerDay}px"></div>`).join("");

    const todayLeft = (dayNum(t0) - origin) * pxPerDay + pxPerDay / 2;

    // Group by project
    const groups = new Map();
    list.forEach((t) => {
      const g = t.project || "No project";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(t);
    });

    let rows = "";
    let first = true;
    for (const [name, items] of groups) {
      rows += `<div class="tl-group"><span>${esc(name)} · ${items.length}</span></div>`;
      items.forEach((t) => {
        const left = (dayNum(t.start) - origin) * pxPerDay;
        const w = (dayNum(t.end) - dayNum(t.start) + 1) * pxPerDay;
        rows += `
          <div class="tl-label" data-id="${t.id}">
            <div class="t">${esc(t.title)}</div>
            <div class="s">${esc(t.owner) || "Unassigned"} · ${fmt(t.start)} → ${fmt(t.end)}</div>
          </div>
          <div class="tl-row" style="width:${width}px">
            <div class="tl-bg">${bg}</div>
            <div class="tl-today ${first ? "labelled" : ""}" style="left:${todayLeft}px"></div>
            <div class="tl-bar status-${t.status} ${isOverdue(t) ? "is-overdue" : ""}" data-id="${t.id}"
                 style="left:${left}px;width:${w}px"
                 title="${esc(t.title)} — ${statusLabel(t.status)}, ${t.progress}%&#10;${fmtLong(t.start)} → ${fmtLong(t.end)}">
              <div class="fill" style="width:${t.progress}%"></div><span>${w > 60 ? esc(t.title) : ""}</span>
            </div>
          </div>`;
        first = false;
      });
    }

    view.innerHTML = `
      <div class="timeline" id="timelineScroll">
        <div class="tl-grid">
          <div class="tl-corner">Task</div>
          <div class="tl-header" style="width:${width}px">
            <div class="tl-header-row top">${topRow}</div>
            ${bottomRow ? `<div class="tl-header-row">${bottomRow}</div>` : ""}
          </div>
          ${rows}
        </div>
      </div>
      <div class="legend">
        <span><i style="background:var(--todo)"></i>To do</span>
        <span><i style="background:var(--progress)"></i>In progress</span>
        <span><i style="background:var(--blocked)"></i>Blocked</span>
        <span><i style="background:var(--done)"></i>Done</span>
        <span><i style="background:transparent;outline:2px solid var(--danger)"></i>Overdue</span>
        <span>Lighter fill inside a bar = progress</span>
      </div>`;

    // Scroll so "today" is visible
    const sc = $("#timelineScroll");
    sc.scrollLeft = Math.max(0, todayLeft - sc.clientWidth / 3);
  }

  // ---------- Dialog ----------
  function openDialog(task) {
    form.reset();
    $("#formError").textContent = "";
    const t = task || {
      id: "", title: "", description: "", project: filters.project || "", owner: "",
      start: todayKey(), end: addDays(todayKey(), 7), status: "todo", priority: "medium", progress: 0,
    };
    $("#dialogTitle").textContent = task ? "Edit task" : "New task";
    for (const [k, v] of Object.entries(t)) if (form.elements[k]) form.elements[k].value = v;
    $("#progressOut").textContent = `${t.progress}%`;
    $("#deleteBtn").hidden = !task;
    dialog.showModal();
    form.elements.title.focus();
  }

  form.elements.progress.addEventListener("input", (e) => ($("#progressOut").textContent = `${e.target.value}%`));
  form.elements.status.addEventListener("change", (e) => {
    if (e.target.value === "done") { form.elements.progress.value = 100; $("#progressOut").textContent = "100%"; }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!f.title.trim()) return ($("#formError").textContent = "Please add a title.");
    if (dayNum(f.end) < dayNum(f.start)) return ($("#formError").textContent = "Due date can't be before the start date.");
    const data = {
      title: f.title.trim(), description: f.description.trim(), project: f.project.trim(), owner: f.owner.trim(),
      start: f.start, end: f.end, status: f.status, priority: f.priority, progress: Number(f.progress),
    };
    if (f.id) {
      const t = tasks.find((x) => x.id === f.id);
      Object.assign(t, data, { updatedAt: Date.now() });
      toast("Task updated");
    } else {
      tasks.push({ id: uid(), ...data, createdAt: Date.now() });
      toast("Task added");
    }
    save(); dialog.close(); render();
  });

  $("#cancelBtn").addEventListener("click", () => dialog.close());
  $("#deleteBtn").addEventListener("click", () => {
    const id = form.elements.id.value;
    const t = tasks.find((x) => x.id === id);
    if (t && confirm(`Delete "${t.title}"?`)) {
      tasks = tasks.filter((x) => x.id !== id);
      save(); dialog.close(); render(); toast("Task deleted");
    }
  });

  // ---------- Events ----------
  $("#addBtn").addEventListener("click", () => openDialog());
  document.querySelectorAll(".view-btn").forEach((b) =>
    b.addEventListener("click", () => { prefs.view = b.dataset.view; savePrefs(); render(); }));
  document.querySelectorAll("[data-zoom]").forEach((b) =>
    b.addEventListener("click", () => { prefs.zoom = b.dataset.zoom; savePrefs(); render(); }));
  $("#search").addEventListener("input", (e) => { filters.q = e.target.value; render(); });
  $("#filterProject").addEventListener("change", (e) => { filters.project = e.target.value; render(); });
  $("#filterStatus").addEventListener("change", (e) => { filters.status = e.target.value; render(); });
  $("#filterPriority").addEventListener("change", (e) => { filters.priority = e.target.value; render(); });
  $("#sortBy").addEventListener("change", (e) => { prefs.sort = e.target.value; savePrefs(); render(); });

  // Clicks inside the current view (open task / toggle done)
  view.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const t = tasks.find((x) => x.id === toggle.dataset.toggle);
      t.status = toggle.checked ? "done" : "in-progress";
      if (toggle.checked) t.progress = 100;
      save(); render();
      return;
    }
    const el = e.target.closest("[data-id]");
    if (el) openDialog(tasks.find((x) => x.id === el.dataset.id));
  });

  // Board drag & drop
  view.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    card.classList.add("dragging");
    e.dataTransfer.setData("text/plain", card.dataset.id);
    e.dataTransfer.effectAllowed = "move";
  });
  view.addEventListener("dragend", (e) => e.target.closest(".card")?.classList.remove("dragging"));
  view.addEventListener("dragover", (e) => {
    const col = e.target.closest(".column");
    if (!col) return;
    e.preventDefault();
    document.querySelectorAll(".column.drag-over").forEach((c) => c !== col && c.classList.remove("drag-over"));
    col.classList.add("drag-over");
  });
  view.addEventListener("dragleave", (e) => {
    const col = e.target.closest(".column");
    if (col && !col.contains(e.relatedTarget)) col.classList.remove("drag-over");
  });
  view.addEventListener("drop", (e) => {
    const col = e.target.closest(".column");
    if (!col) return;
    e.preventDefault();
    const t = tasks.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    if (t && t.status !== col.dataset.status) {
      t.status = col.dataset.status;
      if (t.status === "done") t.progress = 100;
      save(); toast(`Moved to ${statusLabel(t.status)}`);
    }
    render();
  });

  // Export / Import
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `taskflow-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = safeJSON(await file.text());
    const valid = Array.isArray(data) && data.every((t) => t && t.title && /^\d{4}-\d{2}-\d{2}$/.test(t.start) && /^\d{4}-\d{2}-\d{2}$/.test(t.end));
    if (!valid) { toast("That file isn't a valid TaskFlow export."); e.target.value = ""; return; }
    if (confirm(`Replace your ${tasks.length} current tasks with ${data.length} imported tasks?`)) {
      tasks = data.map((t) => ({
        status: "todo", priority: "medium", progress: 0, description: "", project: "", owner: "",
        ...t, id: t.id || uid(),
      }));
      save(); render(); toast("Tasks imported");
    }
    e.target.value = "";
  });

  // Keyboard shortcut: "n" for new task
  document.addEventListener("keydown", (e) => {
    if (e.key === "n" && !dialog.open && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault(); openDialog();
    }
  });

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  save(); // persist sample data on first visit
  render();
})();
