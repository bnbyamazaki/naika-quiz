// 内科専門医 一問一答アプリ
// データ: window.QB_DATA（data.js）

'use strict';

const State = {
  data: null,
  selectedCategories: new Set(),  // 空 = 全診療科
  selectedCount: 50,
  questions: [],
  currentIndex: 0,
  results: [],   // { item, type, userAnswer, correctAnswer, isCorrect }
};

const $ = (id) => document.getElementById(id);

// ─────────────────────────────────────────
// 起動
// ─────────────────────────────────────────
function init() {
  State.data = window.QB_DATA;
  if (!State.data || !State.data.items) {
    document.body.innerHTML = '<div style="padding:40px;color:#e63946;text-align:center;">データを読み込めませんでした。<br>data.js が存在するか確認してください。</div>';
    return;
  }
  $('data-version').textContent = `v${State.data.version} / ${State.data.total}問 / ${State.data.generated_at}`;
  buildCategoryButtons();
  bindEvents();
}

function buildCategoryButtons() {
  const container = $('categories-container');
  container.innerHTML = '';

  // 「全診療科」
  const allBtn = document.createElement('button');
  allBtn.className = 'category-btn all active';
  allBtn.textContent = `全診療科 (${State.data.total})`;
  allBtn.dataset.cat = '__all__';
  container.appendChild(allBtn);

  // 各カテゴリ
  for (const cat of State.data.categories) {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.dataset.cat = cat;
    const count = State.data.category_counts[cat];
    btn.textContent = `${cat} (${count})`;
    container.appendChild(btn);
  }
}

function bindEvents() {
  // カテゴリ
  $('categories-container').addEventListener('click', onCategoryClick);
  // 出題数
  $('count-container').addEventListener('click', onCountClick);
  // 開始
  $('start-btn').addEventListener('click', startQuiz);
  // 次へ
  $('next-btn').addEventListener('click', nextQuestion);
  // 中断
  $('quit-btn').addEventListener('click', () => {
    if (confirm('セッションを中断して最初に戻りますか?')) showScreen('start');
  });
  // もう一度
  $('restart-btn').addEventListener('click', () => showScreen('start'));
}

function onCategoryClick(e) {
  const btn = e.target.closest('.category-btn');
  if (!btn) return;
  const cat = btn.dataset.cat;
  if (cat === '__all__') {
    State.selectedCategories.clear();
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    document.querySelector('.category-btn.all').classList.remove('active');
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) {
      State.selectedCategories.add(cat);
    } else {
      State.selectedCategories.delete(cat);
    }
    if (State.selectedCategories.size === 0) {
      document.querySelector('.category-btn.all').classList.add('active');
    }
  }
}

function onCountClick(e) {
  const btn = e.target.closest('.count-btn');
  if (!btn) return;
  document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  State.selectedCount = parseInt(btn.dataset.count, 10);
}

// ─────────────────────────────────────────
// セッション開始
// ─────────────────────────────────────────
function startQuiz() {
  let pool = State.data.items;
  if (State.selectedCategories.size > 0) {
    pool = pool.filter(item => State.selectedCategories.has(item.category));
  }
  if (pool.length === 0) {
    alert('該当する問題がありません');
    return;
  }

  const shuffled = shuffle([...pool]);
  const count = Math.min(State.selectedCount, shuffled.length);
  const selected = shuffled.slice(0, count);

  State.questions = selected.map(item => buildQuestion(item, State.data.items));
  State.currentIndex = 0;
  State.results = [];

  showScreen('quiz');
  renderQuestion();
}

// ─────────────────────────────────────────
// 出題生成
// ─────────────────────────────────────────
function buildQuestion(item, allItems) {
  const type = Math.random() < 0.5 ? 'tf' : '4ch';
  if (type === 'tf') return buildTF(item, allItems);
  return build4ch(item, allItems);
}

function buildTF(item, allItems) {
  const isTrue = Math.random() < 0.5;
  if (isTrue) {
    return {
      item,
      type: 'tf',
      statement: item.back,
      correctAnswer: '○',
    };
  }
  // 偽の文を作る: 同categoryの別back優先、なければ全体から
  let pool = allItems.filter(o => o.back !== item.back && o.category === item.category);
  if (pool.length === 0) {
    pool = allItems.filter(o => o.back !== item.back);
  }
  const fake = pool[Math.floor(Math.random() * pool.length)];
  return {
    item,
    type: 'tf',
    statement: fake.back,
    correctAnswer: '×',
  };
}

function build4ch(item, allItems) {
  let pool = allItems.filter(o => o.back !== item.back && o.category === item.category);
  if (pool.length < 3) {
    const extras = allItems.filter(o => o.back !== item.back && o.category !== item.category);
    pool = pool.concat(shuffle(extras).slice(0, 3 - pool.length));
  }
  const distractors = shuffle(pool).slice(0, 3).map(o => o.back);
  const choices = shuffle([item.back, ...distractors]);
  return {
    item,
    type: '4ch',
    choices,
    correctAnswer: item.back,
  };
}

// ─────────────────────────────────────────
// 問題描画
// ─────────────────────────────────────────
function renderQuestion() {
  const q = State.questions[State.currentIndex];
  const total = State.questions.length;

  $('progress-current').textContent = State.currentIndex + 1;
  $('progress-total').textContent = total;
  $('progress-bar').style.width = `${(State.currentIndex / total) * 100}%`;
  $('quiz-category').textContent = q.item.category;

  $('question-id').textContent = q.item.id;
  $('question-text').textContent = q.item.front;
  $('question-type').textContent = q.type === 'tf' ? '○ × 問題' : '4択問題';

  const area = $('answer-area');
  area.innerHTML = '';
  $('feedback').classList.add('hidden');

  if (q.type === 'tf') {
    renderTF(q, area);
  } else {
    render4ch(q, area);
  }
}

function renderTF(q, area) {
  const statement = document.createElement('div');
  statement.className = 'tf-statement';
  statement.textContent = q.statement;
  area.appendChild(statement);

  const btnWrap = document.createElement('div');
  btnWrap.className = 'tf-buttons';

  const maru = document.createElement('button');
  maru.className = 'tf-btn maru';
  maru.textContent = '○';
  maru.dataset.answer = '○';

  const batsu = document.createElement('button');
  batsu.className = 'tf-btn batsu';
  batsu.textContent = '×';
  batsu.dataset.answer = '×';

  btnWrap.appendChild(maru);
  btnWrap.appendChild(batsu);
  area.appendChild(btnWrap);

  btnWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.tf-btn');
    if (!btn || btn.disabled) return;
    handleAnswer(btn.dataset.answer);
  });
}

function render4ch(q, area) {
  q.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = choice;
    btn.dataset.answer = choice;
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      handleAnswer(choice);
    });
    area.appendChild(btn);
  });
}

// ─────────────────────────────────────────
// 解答処理
// ─────────────────────────────────────────
function handleAnswer(userAnswer) {
  // 二重解答防止：同じ問題ですでに回答済みなら無視
  if (State.results.length > State.currentIndex) return;
  const q = State.questions[State.currentIndex];
  if (!q) return;
  const isCorrect = userAnswer === q.correctAnswer;

  State.results.push({
    item: q.item,
    type: q.type,
    userAnswer,
    correctAnswer: q.correctAnswer,
    isCorrect,
  });

  // ボタンを無効化＋色付け
  document.querySelectorAll('.tf-btn, .choice-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.answer === q.correctAnswer) {
      btn.classList.add('correct');
    } else if (btn.dataset.answer === userAnswer && !isCorrect) {
      btn.classList.add('wrong');
    }
  });

  showFeedback(q, isCorrect);
}

function showFeedback(q, isCorrect) {
  const fb = $('feedback');
  fb.classList.remove('hidden');

  const result = $('feedback-result');
  result.textContent = isCorrect ? '✓ 正解' : '✗ 不正解';
  result.className = `feedback-result ${isCorrect ? 'correct' : 'wrong'}`;

  const ans = $('feedback-answer');
  if (q.type === 'tf') {
    if (q.correctAnswer === '○') {
      ans.innerHTML = `<span class="label">この組み合わせは正しい</span><strong>${esc(q.item.front)}</strong><br>→ ${esc(q.item.back)}`;
    } else {
      ans.innerHTML = `<span class="label">本来の正解</span>${esc(q.item.front)}<br>→ <strong>${esc(q.item.back)}</strong><br><span class="label" style="margin-top:8px;">提示された文は別の問題の答え</span>`;
    }
  } else {
    ans.innerHTML = `<span class="label">正解</span><strong>${esc(q.correctAnswer)}</strong>`;
  }
  // スクロールで「次へ」を見せる
  fb.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ─────────────────────────────────────────
// 次へ / 結果
// ─────────────────────────────────────────
function nextQuestion() {
  // 結果画面表示中の二重進行防止
  if (State.currentIndex >= State.questions.length) return;
  State.currentIndex++;
  if (State.currentIndex >= State.questions.length) {
    showResult();
  } else {
    renderQuestion();
    // 画面を上にスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function showResult() {
  showScreen('result');

  const correctCount = State.results.filter(r => r.isCorrect).length;
  const total = State.results.length;
  const rate = total === 0 ? 0 : Math.round((correctCount / total) * 100);

  $('score-correct').textContent = correctCount;
  $('score-total').textContent = total;
  $('score-rate').textContent = `${rate}%`;

  // 診療科別
  const catMap = {};
  for (const r of State.results) {
    const c = r.item.category;
    if (!catMap[c]) catMap[c] = { correct: 0, total: 0 };
    catMap[c].total++;
    if (r.isCorrect) catMap[c].correct++;
  }

  const statsEl = $('category-stats');
  statsEl.innerHTML = '';
  const entries = Object.entries(catMap).sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total));
  for (const [cat, s] of entries) {
    const rate = Math.round((s.correct / s.total) * 100);
    const el = document.createElement('div');
    el.className = `cat-stat ${rate >= 80 ? 'good' : rate < 60 ? 'poor' : ''}`;
    el.innerHTML = `<span class="cat-name">${esc(cat)}</span><span class="cat-score">${s.correct}/${s.total} · ${rate}%</span>`;
    statsEl.appendChild(el);
  }
}

// ─────────────────────────────────────────
// 画面切替・ユーティリティ
// ─────────────────────────────────────────
function showScreen(name) {
  ['start', 'quiz', 'result'].forEach(s => {
    $(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
  window.scrollTo({ top: 0 });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 起動
window.addEventListener('DOMContentLoaded', init);
