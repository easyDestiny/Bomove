// 기록은 브라우저(localStorage)에 저장돼요. 같은 브라우저로 다시 열면 그대로 남아 있어요.
const STORAGE_KEY = "bomove-entries";

let entries = load();
let currentStars = 0;   // 지금 폼에서 고른 별점
let editingId = null;   // 수정 중인 기록의 id (새 기록이면 null)
let filter = "all";     // 전체 / 책 / 영화
let view = "list";      // 목록 / 달력
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0이 1월이에요
let selectedDay = null; // 달력에서 누른 날짜 (예: "2026-10-25")

const $ = (id) => document.getElementById(id);
const form = $("entry-form");

// ---------- 저장 / 불러오기 ----------
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    alert("저장에 실패했어요. 백업 파일로 저장해 두세요.");
  }
}

// ---------- 별점 입력 ----------
function drawStarInput() {
  const box = $("star-input");
  box.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "★";
    btn.setAttribute("aria-label", `${i}점`);
    if (i <= currentStars) btn.classList.add("on");
    btn.addEventListener("click", () => {
      // 같은 별을 한 번 더 누르면 별점 취소
      currentStars = currentStars === i ? 0 : i;
      drawStarInput();
    });
    box.appendChild(btn);
  }
}

function starText(n) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// 책이면 "지은이", 영화면 "감독"
function updateCreatorLabel() {
  const type = form.type.value;
  $("creator-label").textContent = type === "book" ? "지은이" : "감독";
  $("creator").placeholder = type === "book" ? "예: 손원평" : "예: 봉준호";
}

// ---------- 폼 저장 ----------
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const data = {
    type: form.type.value,
    title: $("title").value.trim(),
    creator: $("creator").value.trim(),
    date: $("date").value,
    stars: currentStars,
    review: $("review").value.trim(),
  };
  if (!data.title) return;

  if (editingId) {
    const target = entries.find((x) => x.id === editingId);
    Object.assign(target, data);
  } else {
    entries.push({ id: Date.now().toString(36), ...data });
  }

  // 달력에서는 방금 저장한 기록이 있는 달로 이동
  if (data.date) {
    calYear = Number(data.date.slice(0, 4));
    calMonth = Number(data.date.slice(5, 7)) - 1;
  }

  save();
  resetForm();
  render();
});

function resetForm() {
  form.reset();
  $("date").value = today();
  currentStars = 0;
  editingId = null;
  $("form-title").textContent = "새 기록 남기기";
  $("save-btn").textContent = "저장하기";
  $("cancel-btn").hidden = true;
  drawStarInput();
  updateCreatorLabel();
}

function startEdit(id) {
  const item = entries.find((x) => x.id === id);
  editingId = id;
  form.type.value = item.type;
  $("title").value = item.title;
  $("creator").value = item.creator;
  $("date").value = item.date;
  $("review").value = item.review;
  currentStars = item.stars;
  $("form-title").textContent = "기록 수정하기";
  $("save-btn").textContent = "수정 완료";
  $("cancel-btn").hidden = false;
  drawStarInput();
  updateCreatorLabel();
  form.scrollIntoView({ behavior: "smooth" });
}

function remove(id) {
  const item = entries.find((x) => x.id === id);
  if (!confirm(`'${item.title}' 기록을 지울까요?`)) return;
  entries = entries.filter((x) => x.id !== id);
  save();
  render();
}

// ---------- 목록 그리기 ----------
function render() {
  const keyword = $("search").value.trim().toLowerCase();
  const sort = $("sort").value;

  let shown = entries.filter((x) => filter === "all" || x.type === filter);
  if (keyword) {
    shown = shown.filter((x) =>
      [x.title, x.creator, x.review].join(" ").toLowerCase().includes(keyword)
    );
  }

  $("calendar").hidden = view !== "calendar";
  $("day-bar").hidden = view !== "calendar" || !selectedDay;
  if (view === "calendar") {
    drawCalendar(shown);
    // 날짜를 눌렀으면 그 날 기록만, 아니면 이번 달 기록만 아래에 보여줘요
    const prefix = selectedDay || ymd(calYear, calMonth, 1).slice(0, 7);
    shown = shown.filter((x) => (x.date || "").startsWith(prefix));
    if (selectedDay) $("day-label").textContent = `${koDate(selectedDay)} 기록 ${shown.length}개`;
  }

  shown.sort((a, b) => {
    if (sort === "stars") return b.stars - a.stars;
    if (sort === "title") return a.title.localeCompare(b.title, "ko");
    return (b.date || "").localeCompare(a.date || "");
  });

  const list = $("list");
  list.innerHTML = "";
  for (const item of shown) {
    list.appendChild(makeEntry(item));
  }
  $("empty").hidden = shown.length > 0;
  $("empty").textContent =
    view === "calendar"
      ? selectedDay ? "이 날은 기록이 없어요." : "이번 달은 기록이 없어요."
      : "아직 기록이 없어요. 위에서 첫 기록을 남겨보세요!";

  renderStats();
}

// ---------- 달력 그리기 ----------
function drawCalendar(items) {
  $("month-label").textContent = `${calYear}년 ${calMonth + 1}월`;
  const box = $("cal-days");
  box.innerHTML = "";

  const firstWeekday = new Date(calYear, calMonth, 1).getDay(); // 1일이 무슨 요일인지
  const lastDate = new Date(calYear, calMonth + 1, 0).getDate(); // 이번 달은 며칠까지인지

  // 1일 앞의 빈칸
  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "cell blank";
    box.appendChild(blank);
  }

  for (let d = 1; d <= lastDate; d++) {
    const key = ymd(calYear, calMonth, d);
    const dayItems = items.filter((x) => x.date === key);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    if (key === today()) cell.classList.add("today");
    if (key === selectedDay) cell.classList.add("selected");
    cell.setAttribute("aria-label", `${koDate(key)}, 기록 ${dayItems.length}개`);

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = d;
    cell.appendChild(num);

    // 칸이 작아서 2개까지만 보여주고 나머지는 +숫자로
    for (const item of dayItems.slice(0, 2)) {
      const chip = document.createElement("span");
      chip.className = `chip ${item.type}`;
      chip.title = item.title;
      const icon = document.createElement("span");
      icon.textContent = item.type === "book" ? "📚" : "🎬";
      const name = document.createElement("span");
      name.className = "chip-title";
      name.textContent = " " + item.title;
      chip.append(icon, name);
      cell.appendChild(chip);
    }
    if (dayItems.length > 2) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = `+${dayItems.length - 2}`;
      cell.appendChild(more);
    }

    cell.addEventListener("click", () => {
      selectedDay = selectedDay === key ? null : key; // 한 번 더 누르면 선택 취소
      render();
    });
    box.appendChild(cell);
  }
}

function moveMonth(step) {
  const d = new Date(calYear, calMonth + step, 1);
  calYear = d.getFullYear();
  calMonth = d.getMonth();
  selectedDay = null;
  render();
}

// 글자는 textContent로 넣어서, 감상평에 무엇을 써도 안전하게 보여요
function makeEntry(item) {
  const li = document.createElement("li");
  li.className = `entry ${item.type}`;

  const head = document.createElement("div");
  head.className = "entry-head";
  const h3 = document.createElement("h3");
  h3.textContent = (item.type === "book" ? "📚 " : "🎬 ") + item.title;
  const stars = document.createElement("span");
  stars.className = "stars";
  stars.textContent = starText(item.stars);
  head.append(h3, stars);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = [item.creator, item.date].filter(Boolean).join(" · ");

  li.append(head, meta);

  if (item.review) {
    const p = document.createElement("p");
    p.className = "review";
    p.textContent = item.review;
    li.appendChild(p);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const editBtn = document.createElement("button");
  editBtn.textContent = "수정";
  editBtn.addEventListener("click", () => startEdit(item.id));
  const delBtn = document.createElement("button");
  delBtn.textContent = "삭제";
  delBtn.addEventListener("click", () => remove(item.id));
  actions.append(editBtn, delBtn);
  li.appendChild(actions);

  return li;
}

function renderStats() {
  const books = entries.filter((x) => x.type === "book").length;
  const movies = entries.length - books;
  const rated = entries.filter((x) => x.stars > 0);
  const avg = rated.length
    ? (rated.reduce((sum, x) => sum + x.stars, 0) / rated.length).toFixed(1)
    : "-";
  $("stats").innerHTML = "";
  for (const text of [`📚 책 ${books}권`, `🎬 영화 ${movies}편`, `평균 ★ ${avg}`]) {
    const span = document.createElement("span");
    span.textContent = text;
    $("stats").appendChild(span);
  }
}

// ---------- 백업 ----------
$("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bomove-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error();
    if (!confirm(`${data.length}개 기록을 불러올까요? 지금 있는 기록은 바뀌어요.`)) return;
    entries = data;
    save();
    render();
  } catch {
    alert("백업 파일을 읽지 못했어요.");
  }
  e.target.value = "";
});

// ---------- 기타 ----------
// 한국 시간 기준 오늘 날짜 ("2026-10-25" 모양)
function today() {
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth(), now.getDate());
}

function ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// "2026-10-25" → "10월 25일"
function koDate(key) {
  return `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;
}

$("views").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  view = btn.dataset.view;
  for (const b of $("views").children) b.classList.toggle("active", b === btn);
  render();
});

$("prev-month").addEventListener("click", () => moveMonth(-1));
$("next-month").addEventListener("click", () => moveMonth(1));
$("clear-day").addEventListener("click", () => {
  selectedDay = null;
  render();
});
$("write-day").addEventListener("click", () => {
  resetForm();
  $("date").value = selectedDay;
  form.scrollIntoView({ behavior: "smooth" });
  $("title").focus();
});

$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  filter = btn.dataset.filter;
  for (const b of $("tabs").children) b.classList.toggle("active", b === btn);
  render();
});

$("search").addEventListener("input", render);
$("sort").addEventListener("change", render);
$("cancel-btn").addEventListener("click", resetForm);
for (const radio of form.type) radio.addEventListener("change", updateCreatorLabel);

resetForm();
render();
