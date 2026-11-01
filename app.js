// 기록은 브라우저(localStorage)에 저장돼요. 같은 브라우저로 다시 열면 그대로 남아 있어요.
const STORAGE_KEY = "bomove-entries";
const TAB_KEY = "bomove-tab";

// 종류마다 다른 말들을 한곳에 모아뒀어요
const TYPES = {
  book: {
    icon: "📚", name: "책", nameI: "책이", unit: "권", verb: "읽은", finished: "다 읽음", doing: "읽는 중", done: "다 읽었어요",
    creator: "지은이", creatorEx: "예: 손원평", titleEx: "예: 아몬드", cover: "책 표지",
  },
  drama: {
    icon: "📺", name: "드라마", nameI: "드라마가", unit: "편", verb: "본", finished: "다 봄", doing: "보는 중", done: "다 봤어요",
    creator: "채널·출연", creatorEx: "예: 넷플릭스, 아이유", titleEx: "예: 폭싹 속았수다", cover: "포스터",
  },
  movie: {
    icon: "🎬", name: "영화", nameI: "영화가", unit: "편", verb: "본", finished: "다 봄", doing: "보는 중", done: "다 봤어요",
    creator: "감독", creatorEx: "예: 봉준호", titleEx: "예: 기생충", cover: "포스터",
  },
};

let entries = load();
let tab = loadTab();    // 지금 보고 있는 탭: book / drama / movie / calendar
let currentStars = 0;   // 지금 폼에서 고른 별점
let currentCover = "";  // 지금 폼에 넣은 표지 사진
let editingId = null;   // 수정 중인 기록의 id (새 기록이면 null)
let detailId = null;    // 자세히 보기 창에 떠 있는 기록
let justDoneId = null;  // 방금 '다 봤어요' 한 기록 (전시관에서 반짝여요)
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0이 1월이에요
let selectedDay = null; // 달력에서 누른 날짜 (예: "2026-10-25")

const $ = (id) => document.getElementById(id);
const form = $("entry-form");

// ---------- 저장 / 불러오기 ----------
function load() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    // 예전 기록에는 status가 없어요 → 다 본 걸로 쳐요
    for (const x of list) if (!x.status) x.status = "done";
    return list;
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

function loadTab() {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === "calendar" || TYPES[saved]) return saved;
  } catch {}
  return "book";
}

// ---------- 화면 그리기 ----------
function render() {
  for (const b of $("tabs").children) b.classList.toggle("active", b.dataset.tab === tab);
  $("collection-view").hidden = tab === "calendar";
  $("calendar-view").hidden = tab !== "calendar";

  if (tab === "calendar") renderCalendarView();
  else renderCollection();
  renderStats();
}

function renderCollection() {
  const t = TYPES[tab];
  const mine = entries.filter((x) => x.type === tab);
  const done = mine.filter((x) => x.status === "done");
  const doing = mine.filter((x) => x.status === "doing");

  $("col-title").textContent = `${t.icon} 나의 ${t.name} 컬렉션`;
  $("add-btn").textContent = `+ ${t.name} 추가`;

  // 전시관
  $("gallery-title").textContent = `다 ${t.verb} ${t.name}`;
  $("gallery-count").textContent = `${done.length}${t.unit}`;
  const sort = $("gallery-sort").value;
  done.sort((a, b) => {
    if (sort === "stars") return b.stars - a.stars || (b.date || "").localeCompare(a.date || "");
    if (sort === "title") return a.title.localeCompare(b.title, "ko");
    return (b.date || "").localeCompare(a.date || "");
  });
  const wall = $("gallery");
  wall.innerHTML = "";
  done.forEach((item, i) => wall.appendChild(makeFrame(item, i)));
  $("gallery-empty").hidden = done.length > 0;
  $("gallery-empty").textContent = `아직 전시된 ${t.nameI} 없어요. 다 ${t.verb} ${t.nameI} 여기에 걸려요!`;
  justDoneId = null;

  // 보는 중
  $("doing-title").textContent = `⏳ ${t.doing} (${doing.length})`;
  const list = $("doing");
  list.innerHTML = "";
  for (const item of doing) list.appendChild(makeEntry(item, true));
  $("doing-empty").hidden = doing.length > 0;
  $("doing-empty").textContent = `${t.doing}인 ${t.nameI} 없어요.`;
}

// 전시관에 거는 액자 하나
function makeFrame(item, i) {
  const li = document.createElement("li");
  li.className = `frame ${item.type}`;
  if (item.stars === 5) li.classList.add("masterpiece");
  if (item.id === justDoneId) li.classList.add("just-done");
  li.style.setProperty("--i", Math.min(i, 20)); // 하나씩 순서대로 나타나게

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", `${item.title} 자세히 보기`);
  btn.addEventListener("click", () => openDetail(item.id));

  const art = document.createElement("div");
  art.className = "art";
  art.appendChild(coverArt(item));
  if (item.stars === 5) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "✨ 인생작";
    art.appendChild(badge);
  }

  // 액자 아래 작품 이름표
  const plaque = document.createElement("div");
  plaque.className = "plaque";
  const name = document.createElement("strong");
  name.textContent = item.title;
  const stars = document.createElement("span");
  stars.className = "stars";
  stars.textContent = item.stars ? starText(item.stars) : "";
  plaque.append(name, stars);

  btn.append(art, plaque);
  li.appendChild(btn);
  return li;
}

// 표지 그림 (없거나 깨지면 제목으로 만든 표지)
function coverArt(item) {
  if (item.cover) {
    const img = document.createElement("img");
    img.src = item.cover;
    img.alt = "";
    img.addEventListener("error", () => img.replaceWith(coverText(item)));
    return img;
  }
  return coverText(item);
}

function coverText(item) {
  const div = document.createElement("div");
  div.className = `cover-text ${item.type}`;
  const icon = document.createElement("span");
  icon.textContent = TYPES[item.type].icon;
  const title = document.createElement("strong");
  title.textContent = item.title;
  div.append(icon, title);
  return div;
}

// 보는 중 / 달력 아래에 나오는 카드
function makeEntry(item, withFinish) {
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
  const h4 = document.createElement("h4");
  h4.textContent = `${TYPES[item.type].icon} ${item.title}`;
  head.appendChild(h4);
  if (item.stars) {
    const stars = document.createElement("span");
    stars.className = "stars";
    stars.textContent = starText(item.stars);
    head.appendChild(stars);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = [item.creator, item.status === "done" ? item.date : ""].filter(Boolean).join(" · ");

  body.append(head, meta);

  if (item.review) {
    const p = document.createElement("p");
    p.className = "review";
    p.textContent = item.review;
    body.appendChild(p);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  if (withFinish) {
    const finishBtn = document.createElement("button");
    finishBtn.className = "primary";
    finishBtn.textContent = `🎉 ${TYPES[item.type].done}`;
    finishBtn.addEventListener("click", () => finish(item.id));
    actions.appendChild(finishBtn);
  }
  const editBtn = document.createElement("button");
  editBtn.textContent = "수정";
  editBtn.addEventListener("click", () => openForm(item.id));
  const delBtn = document.createElement("button");
  delBtn.textContent = "삭제";
  delBtn.addEventListener("click", () => remove(item.id));
  actions.append(editBtn, delBtn);
  body.appendChild(actions);

  return li;
}

function renderStats() {
  $("stats").innerHTML = "";
  for (const [type, t] of Object.entries(TYPES)) {
    const n = entries.filter((x) => x.type === type && x.status === "done").length;
    const span = document.createElement("span");
    span.textContent = `${t.icon} ${t.name} ${n}${t.unit}`;
    $("stats").appendChild(span);
  }
}

function starText(n) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// ---------- 다 봤어요! ----------
function finish(id) {
  const item = entries.find((x) => x.id === id);
  item.status = "done";
  if (!item.date) item.date = today();
  justDoneId = id;
  save();
  render();
  // 전시관에 새로 걸린 걸 보여줘요
  document.querySelector(".frame.just-done")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function remove(id) {
  const item = entries.find((x) => x.id === id);
  if (!confirm(`'${item.title}' 기록을 지울까요?`)) return;
  entries = entries.filter((x) => x.id !== id);
  save();
  render();
}

// ---------- 자세히 보기 창 ----------
function openDetail(id) {
  const item = entries.find((x) => x.id === id);
  const t = TYPES[item.type];
  detailId = id;

  const box = $("detail");
  box.innerHTML = "";
  const art = document.createElement("div");
  art.className = "detail-art";
  art.appendChild(coverArt(item));

  const info = document.createElement("div");
  info.className = "detail-info";
  const h2 = document.createElement("h2");
  h2.textContent = item.title;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = [
    item.creator,
    item.date ? `${item.date.replaceAll("-", ".")} ${t.finished}` : "",
  ].filter(Boolean).join(" · ");
  info.append(h2, meta);
  if (item.stars) {
    const stars = document.createElement("p");
    stars.className = "stars big";
    stars.textContent = starText(item.stars);
    info.appendChild(stars);
  }
  const review = document.createElement("p");
  review.className = "review";
  review.textContent = item.review || "아직 감상평이 없어요.";
  info.appendChild(review);

  box.append(art, info);
  $("detail-dialog").showModal();
}

$("detail-close").addEventListener("click", () => $("detail-dialog").close());
$("detail-edit").addEventListener("click", () => {
  $("detail-dialog").close();
  openForm(detailId);
});
$("detail-delete").addEventListener("click", () => {
  $("detail-dialog").close();
  remove(detailId);
});

// ---------- 기록 쓰기 창 ----------
// id가 있으면 수정, 없으면 새로 쓰기 (preset으로 미리 채울 값을 줄 수 있어요)
function openForm(id, preset = {}) {
  form.reset();
  const item = id ? entries.find((x) => x.id === id) : null;
  const data = item || {
    type: TYPES[tab] ? tab : "book",
    status: "doing",
    title: "", creator: "", date: "", stars: 0, cover: "", review: "",
    ...preset,
  };

  editingId = id || null;
  form.type.value = data.type;
  form.status.value = data.status;
  $("title").value = data.title;
  $("creator").value = data.creator;
  $("date").value = data.date || today();
  $("review").value = data.review;
  currentStars = data.stars;
  currentCover = data.cover || "";

  $("form-title").textContent = item ? "기록 수정하기" : "새 기록 남기기";
  $("save-btn").textContent = item ? "수정 완료" : "저장하기";
  drawStarInput();
  drawCover();
  updateFormLabels();
  $("form-dialog").showModal();
}

// 종류(책/드라마/영화)와 상태에 따라 글자를 바꿔요
function updateFormLabels() {
  const t = TYPES[form.type.value];
  $("doing-label").textContent = t.doing;
  $("done-label").textContent = t.done;
  $("creator-label").textContent = t.creator;
  $("creator").placeholder = t.creatorEx;
  $("title").placeholder = t.titleEx;
  $("cover-label").textContent = t.cover;
  $("date-label").textContent = `다 ${t.verb} 날짜`;
  $("date-field").hidden = form.status.value !== "done";
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const status = form.status.value;
  const data = {
    type: form.type.value,
    status,
    title: $("title").value.trim(),
    creator: $("creator").value.trim(),
    date: status === "done" ? $("date").value : "",
    stars: currentStars,
    cover: currentCover,
    review: $("review").value.trim(),
  };
  if (!data.title) return;

  if (editingId) {
    const target = entries.find((x) => x.id === editingId);
    if (target.status !== "done" && status === "done") justDoneId = editingId;
    Object.assign(target, data);
  } else {
    const id = Date.now().toString(36);
    entries.push({ id, ...data });
    if (status === "done") justDoneId = id;
  }

  // 달력이 아니면, 저장한 종류의 탭으로 이동
  if (tab !== "calendar") tab = data.type;
  if (data.date) {
    calYear = Number(data.date.slice(0, 4));
    calMonth = Number(data.date.slice(5, 7)) - 1;
  }

  save();
  $("form-dialog").close();
  render();
});

$("cancel-btn").addEventListener("click", () => $("form-dialog").close());
for (const radio of form.type) radio.addEventListener("change", updateFormLabels);
for (const radio of form.status) radio.addEventListener("change", updateFormLabels);
$("add-btn").addEventListener("click", () => openForm());

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

// ---------- 달력 ----------
function renderCalendarView() {
  // 달력에는 다 본 것만, 날짜가 있는 것만 나와요
  const done = entries.filter((x) => x.status === "done" && x.date);
  drawCalendar(done);

  const prefix = selectedDay || ymd(calYear, calMonth, 1).slice(0, 7);
  const shown = done
    .filter((x) => x.date.startsWith(prefix))
    .sort((a, b) => b.date.localeCompare(a.date));

  $("day-bar").hidden = !selectedDay;
  if (selectedDay) $("day-label").textContent = `${koDate(selectedDay)} 기록 ${shown.length}개`;

  const list = $("day-list");
  list.innerHTML = "";
  for (const item of shown) list.appendChild(makeEntry(item, false));
  $("day-empty").hidden = shown.length > 0;
  $("day-empty").textContent = selectedDay ? "이 날은 기록이 없어요." : "이번 달은 기록이 없어요.";
}

function drawCalendar(items) {
  $("month-label").textContent = `${calYear}년 ${calMonth + 1}월`;
  drawMonthSummary(items);
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
      cell.classList.add("filled");
      cell.appendChild(coverArt(first));
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

// "10월에는 책 5권, 영화 3편을 봤어요!"
function drawMonthSummary(items) {
  const prefix = ymd(calYear, calMonth, 1).slice(0, 7);
  const inMonth = items.filter((x) => x.date.startsWith(prefix));
  const parts = [];
  for (const [type, t] of Object.entries(TYPES)) {
    const n = inMonth.filter((x) => x.type === type).length;
    if (n) parts.push(`${t.icon} ${t.name} ${n}${t.unit}`);
  }
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

$("prev-month").addEventListener("click", () => moveMonth(-1));
$("next-month").addEventListener("click", () => moveMonth(1));
$("clear-day").addEventListener("click", () => {
  selectedDay = null;
  render();
});
$("write-day").addEventListener("click", () => openForm(null, { status: "done", date: selectedDay }));

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
    for (const x of data) if (!x.status) x.status = "done";
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

$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  tab = btn.dataset.tab;
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {}
  render();
});

$("gallery-sort").addEventListener("change", render);

render();
