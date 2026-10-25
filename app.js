// 기록은 브라우저(localStorage)에 저장돼요. 같은 브라우저로 다시 열면 그대로 남아 있어요.
const STORAGE_KEY = "bomove-entries";

let entries = load();
let currentStars = 0;   // 지금 폼에서 고른 별점
let currentCover = "";  // 지금 폼에 넣은 표지 사진
let editingId = null;   // 수정 중인 기록의 id (새 기록이면 null)
let filter = "all";     // 전체 / 책 / 영화
let view = "calendar";  // 달력 / 목록 (처음엔 달력)
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
  $("cover-label").textContent = type === "book" ? "책 표지" : "영화 포스터";
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
    cover: currentCover,
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
  currentCover = "";
  editingId = null;
  $("form-title").textContent = "새 기록 남기기";
  $("save-btn").textContent = "저장하기";
  $("cancel-btn").hidden = true;
  drawStarInput();
  drawCover();
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
  currentCover = item.cover || "";
  $("form-title").textContent = "기록 수정하기";
  $("save-btn").textContent = "수정 완료";
  $("cancel-btn").hidden = false;
  drawStarInput();
  drawCover();
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
  $("search").hidden = view === "calendar";
  $("sort").hidden = view === "calendar";
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
  drawMonthSummary();
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

    // 그 날 본 게 있으면 칸을 표지 그림으로 가득 채워요 (여러 개면 첫 번째 것)
    const first = dayItems[0];
    if (first) {
      cell.classList.add("filled", first.type);
      if (first.cover) {
        const img = document.createElement("img");
        img.src = first.cover;
        img.alt = "";
        // 이미지 주소가 깨지면 제목 칸으로 바꿔요
        img.addEventListener("error", () => img.replaceWith(coverText(first)));
        cell.appendChild(img);
      } else {
        cell.appendChild(coverText(first));
      }
    }

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = d;
    cell.appendChild(num);

    if (dayItems.length > 1) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = `+${dayItems.length - 1}`;
      cell.appendChild(more);
    }

    cell.addEventListener("click", () => {
      selectedDay = selectedDay === key ? null : key; // 한 번 더 누르면 선택 취소
      render();
    });
    box.appendChild(cell);
  }
}

// 표지 사진이 없을 때 대신 보여줄 제목 칸
function coverText(item) {
  const span = document.createElement("span");
  span.className = "cover-text";
  span.textContent = item.title;
  return span;
}

// "10월에는 책 5권, 영화 3편을 봤어요!"
function drawMonthSummary() {
  const prefix = ymd(calYear, calMonth, 1).slice(0, 7);
  const inMonth = entries.filter((x) => (x.date || "").startsWith(prefix));
  const books = inMonth.filter((x) => x.type === "book").length;
  const movies = inMonth.length - books;

  const parts = [];
  if (books) parts.push(`📚 책 ${books}권`);
  if (movies) parts.push(`🎬 영화 ${movies}편`);
  $("month-summary").textContent = parts.length
    ? `${calMonth + 1}월에는 ${parts.join(", ")}을 봤어요!`
    : `${calMonth + 1}월의 첫 기록을 남겨보세요`;
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

  if (item.cover) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = item.cover;
    img.alt = `${item.title} 표지`;
    img.addEventListener("error", () => img.remove());
    li.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "entry-body";
  li.appendChild(body);

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

  body.append(head, meta);

  if (item.review) {
    const p = document.createElement("p");
    p.className = "review";
    p.textContent = item.review;
    body.appendChild(p);
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
  body.appendChild(actions);

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

// ---------- 표지 사진 ----------
function drawCover() {
  const preview = $("cover-preview");
  preview.hidden = !currentCover;
  if (currentCover) preview.src = currentCover;
  $("cover-remove").hidden = !currentCover;
  $("cover-url").value = currentCover.startsWith("data:") ? "" : currentCover;
}

// 휴대폰 사진은 너무 커서, 작게 줄여서 저장해요 (한 장에 20KB 정도)
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((ok, fail) => {
    img.onload = ok;
    img.onerror = fail;
    img.src = url;
  });
  const scale = Math.min(1, 360 / img.height, 240 / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/jpeg", 0.8);
}

$("cover-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    currentCover = await shrinkImage(file);
    drawCover();
  } catch {
    alert("사진을 읽지 못했어요.");
  }
  e.target.value = "";
});

$("cover-url").addEventListener("change", () => {
  currentCover = $("cover-url").value.trim();
  drawCover();
});

$("cover-remove").addEventListener("click", () => {
  currentCover = "";
  drawCover();
});

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
$("write-new").addEventListener("click", () => {
  resetForm();
  form.scrollIntoView({ behavior: "smooth" });
  $("title").focus();
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
