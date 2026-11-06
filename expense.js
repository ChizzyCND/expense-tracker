/* ==========================================================================
   My Expense Tracker (vanilla JS, data saved in the browser's localStorage)
   ========================================================================== */
"use strict";

/* ---------- 1. Settings and helpers ---------- */
const STORE_KEY = "et-transactions";
const THEME_KEY = "et-theme";

const CATEGORIES = {
  expense: ["Food", "Transportation", "Shopping", "Bills", "Education", "Entertainment", "Healthcare", "Other"],
  income: ["Salary", "Business", "Other"],
};
const ALL_CATEGORIES = [...new Set([...CATEGORIES.expense, ...CATEGORIES.income])];
const PALETTE = ["#0f766e", "#f59e0b", "#6366f1", "#ef4444", "#0ea5e9", "#a855f7", "#84cc16", "#64748b"];

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
const compact = new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 });

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const prettyDate = (s) => parseISO(s).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Money is added up in kobo (whole numbers) so decimals never drift
const sumKobo = (list) => list.reduce((t, x) => t + Math.round(x.amount * 100), 0);
const fmt = (kobo) => money.format(kobo / 100);
const ofType = (list, type) => list.filter((t) => t.type === type);

/* ---------- 2. Saved data ---------- */
function isValid(t) {
  return t && typeof t === "object" && (t.type === "income" || t.type === "expense") &&
    Number.isFinite(t.amount) && t.amount > 0 && typeof t.description === "string" && validDate(t.date);
}

function sampleData() {
  const now = new Date();
  const base = [
    ["income", "Salary", "Monthly salary", 250000, 1],
    ["income", "Business", "Freelance project", 60000, 12],
    ["expense", "Food", "Groceries", 32000, 3],
    ["expense", "Transportation", "Fuel and ride fares", 21000, 6],
    ["expense", "Bills", "Electricity and data", 24000, 8],
    ["expense", "Shopping", "Clothing", 28000, 14],
    ["expense", "Entertainment", "Cinema and outing", 12000, 17],
    ["expense", "Education", "Online course", 15000, 19],
    ["expense", "Healthcare", "Pharmacy", 9000, 22],
  ];
  const factor = [1, 0.9, 1.1];
  const list = [];
  for (let m = 0; m < 3; m++) {
    base.forEach(([type, category, description, amount, day]) => {
      if (m === 0 && day > now.getDate()) return; // no future-dated samples
      list.push({
        id: uid(), type, category, description, sample: true, created: Date.now(),
        amount: Math.round((amount * factor[m]) / 100) * 100,
        date: toISO(new Date(now.getFullYear(), now.getMonth() - m, day)),
      });
    });
  }
  return list;
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { /* storage blocked */ }
  if (raw === null) return sampleData(); // first visit
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list)
      ? list.filter(isValid).map((t) => ({ ...t, id: t.id || uid(), category: t.category || "Other", created: t.created || 0 }))
      : [];
  } catch (e) { return []; }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(tx)); } catch (e) { /* ignore */ }
}

let tx = load();
let editingId = null;
const charts = {};

/* ---------- 3. Small UI helpers ---------- */
let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

function fillSelect(select, options, selected) {
  select.innerHTML = options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
  select.value = options.some((o) => o.value === selected) ? selected : options[0].value;
}

function populateCategories(selected) {
  const type = $("form").elements.type.value;
  fillSelect($("category"), CATEGORIES[type].map((c) => ({ value: c, label: c })), selected);
}

/* ---------- 4. Rendering ---------- */
function renderCards() {
  const inc = sumKobo(ofType(tx, "income"));
  const exp = sumKobo(ofType(tx, "expense"));
  $("balance").textContent = fmt(inc - exp);
  $("income").textContent = fmt(inc);
  $("expenses").textContent = fmt(exp);
  $("count").textContent = tx.length.toLocaleString("en-NG");
  $("sampleBanner").hidden = !tx.some((t) => t.sample);
}

function renderMonthly() {
  const month = $("month").value || toISO(new Date()).slice(0, 7);
  const list = tx.filter((t) => t.date.startsWith(month));
  const inc = sumKobo(ofType(list, "income"));
  const exp = sumKobo(ofType(list, "expense"));

  $("mIncome").textContent = fmt(inc);
  $("mExpense").textContent = fmt(exp);
  $("mNet").textContent = fmt(inc - exp);
  $("mNet").className = inc - exp < 0 ? "exp" : "inc";
  $("mCount").textContent = list.length;

  const byCat = {};
  ofType(list, "expense").forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + Math.round(t.amount * 100); });
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  $("mTop").textContent = top ? `${top[0]} (${fmt(top[1])})` : "No expenses this month";
}

function filtered() {
  const q = $("search").value.trim().toLowerCase();
  const type = $("fType").value, cat = $("fCat").value, from = $("fFrom").value, to = $("fTo").value;
  return tx
    .filter((t) =>
      (!type || t.type === type) && (!cat || t.category === cat) &&
      (!from || t.date >= from) && (!to || t.date <= to) &&
      (!q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}

function rowHTML(t, i) {
  const sign = t.type === "income" ? "+" : "−";
  const name = esc(t.description);
  return `<tr style="animation-delay:${Math.min(i, 12) * 25}ms">
    <td class="desc" data-label="Description">${name}</td>
    <td data-label="Category"><span class="chip">${esc(t.category)}</span></td>
    <td data-label="Date">${prettyDate(t.date)}</td>
    <td data-label="Type"><span class="badge ${t.type}">${t.type === "income" ? "Income" : "Expense"}</span></td>
    <td class="num ${t.type === "income" ? "inc" : "exp"}" data-label="Amount">${sign}${money.format(t.amount)}</td>
    <td class="acts">
      <button class="icon-btn" data-act="edit" data-id="${t.id}" aria-label="Edit ${name}" title="Edit"><svg class="ic"><use href="#i-edit"/></svg></button>
      <button class="icon-btn del" data-act="delete" data-id="${t.id}" aria-label="Delete ${name}" title="Delete"><svg class="ic"><use href="#i-trash"/></svg></button>
    </td></tr>`;
}

function renderTable() {
  const list = filtered();
  $("rows").innerHTML = list.map(rowHTML).join("");
  $("tableWrap").hidden = list.length === 0;
  $("empty").hidden = list.length > 0;
  $("resultCount").textContent = tx.length ? `Showing ${list.length} of ${tx.length}` : "";

  if (!list.length) {
    const none = tx.length === 0;
    $("emptyTitle").textContent = none ? "No transactions yet" : "No matching transactions";
    $("emptyText").textContent = none
      ? "Add your first income or expense to start tracking your money, or load sample data to explore."
      : "Try a different search or reset the filters.";
    $("emptyAdd").hidden = !none;
    $("loadSample").hidden = !none;
  }
}

/* ---------- 5. Charts (Chart.js) ---------- */
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function drawChart(id, config, hasData) {
  if (charts[id]) { charts[id].destroy(); charts[id] = null; }
  const canvas = $(id);
  const note = canvas.parentElement.querySelector(".nodata");
  const ready = typeof Chart !== "undefined";
  canvas.hidden = !(hasData && ready);
  note.hidden = hasData && ready;
  note.textContent = !ready ? "The chart library could not load. Check your internet connection." : "Add transactions to see this chart.";
  if (hasData && ready) charts[id] = new Chart(canvas, config);
}

function chartOptions(withAxes) {
  const muted = cssVar("--muted");
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: muted, usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: (c) => {
            const name = c.chart.config.type === "line" ? c.dataset.label : c.label;
            return ` ${name}: ${money.format(c.parsed.y ?? c.parsed)}`;
          },
        },
      },
    },
  };
  if (withAxes) {
    options.scales = {
      x: { ticks: { color: muted }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: muted, callback: (v) => "₦" + compact.format(v) }, grid: { color: cssVar("--line") } },
    };
  }
  return options;
}

function renderCharts() {
  const inc = sumKobo(ofType(tx, "income")) / 100;
  const exp = sumKobo(ofType(tx, "expense")) / 100;

  // Income vs expenses
  const totalsOptions = chartOptions(true);
  totalsOptions.plugins.legend.display = false;
  drawChart("chartTotals", {
    type: "bar",
    data: { labels: ["Income", "Expenses"], datasets: [{ data: [inc, exp], backgroundColor: [cssVar("--inc"), cssVar("--exp")], borderRadius: 10, maxBarThickness: 90 }] },
    options: totalsOptions,
  }, inc + exp > 0);

  // Expenses by category
  const byCat = {};
  ofType(tx, "expense").forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + Math.round(t.amount * 100); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const catOptions = chartOptions(false);
  catOptions.cutout = "62%";
  catOptions.plugins.legend.position = "bottom";
  drawChart("chartCats", {
    type: "doughnut",
    data: { labels: cats.map((c) => c[0]), datasets: [{ data: cats.map((c) => c[1] / 100), backgroundColor: PALETTE, borderColor: cssVar("--surface"), borderWidth: 3 }] },
    options: catOptions,
  }, cats.length > 0);

  // Monthly trend, last 6 months
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: d.toLocaleDateString("en-NG", { month: "short" }) });
  }
  const series = (type) => months.map((m) => sumKobo(ofType(tx, type).filter((t) => t.date.startsWith(m.key))) / 100);
  const incomeSeries = series("income"), expenseSeries = series("expense");
  const line = (label, data, color, fill) => ({ label, data, borderColor: color, backgroundColor: color + "22", fill, tension: 0.35, pointRadius: 4, borderWidth: 2.5 });
  const trendOptions = chartOptions(true);
  trendOptions.plugins.legend.position = "bottom";
  drawChart("chartTrend", {
    type: "line",
    data: { labels: months.map((m) => m.label), datasets: [line("Expenses", expenseSeries, cssVar("--exp"), true), line("Income", incomeSeries, cssVar("--inc"), false)] },
    options: trendOptions,
  }, [...incomeSeries, ...expenseSeries].some((v) => v > 0));
}

function renderAll() {
  renderCards();
  renderMonthly();
  renderTable();
  renderCharts();
}

/* ---------- 6. Add, edit and delete ---------- */
function resetForm() {
  $("form").reset();
  editingId = null;
  $("date").value = toISO(new Date());
  $("formTitle").textContent = "Add transaction";
  $("saveBtn").textContent = "Add transaction";
  $("cancelEdit").hidden = true;
  $("formError").textContent = "";
  populateCategories();
}

function readForm() {
  const f = $("form").elements;
  const type = f.type.value;
  const description = $("desc").value.trim().replace(/\s+/g, " ");
  const amount = Math.round(parseFloat($("amount").value) * 100) / 100;
  const date = $("date").value;
  const category = $("category").value;

  if (!description) return { error: "Please enter a description." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than zero." };
  if (amount > 1e12) return { error: "That amount is too large." };
  if (!validDate(date)) return { error: "Please choose a valid date." };
  if (!CATEGORIES[type].includes(category)) return { error: "Please choose a category." };
  return { value: { type, description, amount, date, category } };
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const result = readForm();
  if (result.error) {
    $("formError").textContent = result.error;
    return;
  }
  if (editingId) {
    const item = tx.find((t) => t.id === editingId);
    if (item) { Object.assign(item, result.value); delete item.sample; }
    toast("Transaction updated");
  } else {
    tx.push({ id: uid(), created: Date.now(), ...result.value });
    toast("Transaction added");
  }
  save();
  resetForm();
  renderAll();
  $("desc").focus();
});

$("form").addEventListener("change", (e) => {
  if (e.target.name === "type") populateCategories();
});

$("cancelEdit").addEventListener("click", resetForm);

function startEdit(id) {
  const t = tx.find((x) => x.id === id);
  if (!t) return;
  editingId = id;
  $("form").elements.type.value = t.type;
  populateCategories(t.category);
  $("desc").value = t.description;
  $("amount").value = t.amount;
  $("date").value = t.date;
  $("formError").textContent = "";
  $("formTitle").textContent = "Edit transaction";
  $("saveBtn").textContent = "Save changes";
  $("cancelEdit").hidden = false;
  $("add").scrollIntoView({ behavior: "smooth" });
  $("desc").focus({ preventScroll: true });
}

let pendingDelete = null;
function askDelete(id) {
  const t = tx.find((x) => x.id === id);
  if (!t) return;
  pendingDelete = id;
  $("confirmText").textContent = `${t.description} (${money.format(t.amount)}) will be removed permanently.`;
  const dialog = $("confirm");
  dialog.returnValue = "";
  dialog.showModal();
}

$("confirm").addEventListener("close", () => {
  if ($("confirm").returnValue === "ok" && pendingDelete) {
    tx = tx.filter((t) => t.id !== pendingDelete);
    if (editingId === pendingDelete) resetForm();
    save();
    renderAll();
    toast("Transaction deleted");
  }
  pendingDelete = null;
});

$("rows").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  if (btn.dataset.act === "edit") startEdit(btn.dataset.id);
  else askDelete(btn.dataset.id);
});

/* ---------- 7. Filters ---------- */
["search", "fType", "fCat", "fFrom", "fTo"].forEach((id) => {
  $(id).addEventListener(id === "search" ? "input" : "change", renderTable);
});

$("resetFilters").addEventListener("click", () => {
  ["search", "fType", "fCat", "fFrom", "fTo"].forEach((id) => { $(id).value = ""; });
  renderTable();
});

$("month").addEventListener("change", renderMonthly);

/* ---------- 8. Sample data, export and theme ---------- */
$("clearSample").addEventListener("click", () => {
  tx = tx.filter((t) => !t.sample);
  save();
  renderAll();
  toast("Sample data cleared");
});

$("loadSample").addEventListener("click", () => {
  tx = tx.concat(sampleData());
  save();
  renderAll();
});

// Stops spreadsheet apps from running text such as "=1+1" as a formula
const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

$("exportBtn").addEventListener("click", () => {
  if (!tx.length) { toast("Nothing to export yet"); return; }
  const rows = [["Date", "Type", "Category", "Description", "Amount (NGN)"]];
  [...tx].sort((a, b) => b.date.localeCompare(a.date)).forEach((t) => {
    rows.push([t.date, t.type, t.category, t.description, t.amount.toFixed(2)]);
  });
  const csv = "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `expense-tracker-${toISO(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast("CSV exported");
});

$("themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  renderCharts(); // charts read their colours from the theme
});

/* ---------- 9. Start ---------- */
fillSelect($("fCat"), [{ value: "", label: "All categories" }, ...ALL_CATEGORIES.map((c) => ({ value: c, label: c }))], "");
$("month").value = toISO(new Date()).slice(0, 7);
resetForm();
save();
renderAll();

// Chart.js loads with "defer"; if it was not ready yet, draw again once the page has fully loaded
window.addEventListener("load", renderCharts);