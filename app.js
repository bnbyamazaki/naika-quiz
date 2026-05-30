// 内科専門医 一問一答アプリ v2.0.0
// データ: window.QB_DATA（data.js）
//
// v2 変更点:
//   - ○×:4択 = 1:4（20% / 80%）
//   - ダミー選択肢ハイブリッド：同id優先 → 同カテゴリ + 類似度 → ランダム
//   - 回答後 Note表示：同idの他短文一覧 + source_note relation リンク

'use strict';

const State = {
  data: null,
  selectedCategories: new Set(),
  selectedCount: 50,
  questions: [],
  currentIndex: 0,
  results: [],
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

  const allBtn = document.createElement('button');
  allBtn.className = 'category-btn all active';
  allBtn.textContent = `全診療科 (${State.data.total})`;
  allBtn.dataset.cat = '__all__';
  container.appendChild(allBtn);

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
  $('categories-container').addEventListener('click', onCategoryClick);
  $('count-container').addEventListener('click', onCountClick);
  $('start-btn').addEventListener('click', startQuiz);
  $('next-btn').addEventListener('click', nextQuestion);
  $('quit-btn').addEventListener('click', () => {
    if (confirm('セッションを中断して最初に戻りますか?')) showScreen('start');
  });
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
  // v2: ○×:4択 = 1:4
  const type = Math.random() < 0.2 ? 'tf' : '4ch';
  if (type === 'tf') return buildTF(item, allItems);
  return build4ch(item, allItems);
}

function buildTF(item, allItems) {
  const isTrue = Math.random() < 0.5;
  if (isTrue) {
    return { item, type: 'tf', statement: item.back, correctAnswer: '○' };
  }
  // 偽文：類似度高いback優先
  let pool = allItems.filter(o => o.back !== item.back && o.category === item.category);
  if (pool.length === 0) pool = allItems.filter(o => o.back !== item.back);
  // 類似度でランキング
  const scored = pool.map(o => ({ o, score: similarity(item, o) }));
  scored.sort((a, b) => b.score - a.score);
  const topN = Math.min(scored.length, 5);
  const fake = scored[Math.floor(Math.random() * topN)].o;
  return { item, type: 'tf', statement: fake.back, correctAnswer: '×' };
}

function build4ch(item, allItems) {
  const distractors = [];
  const usedBacks = new Set([item.back]);

  // Step 1: 同id優先（最大1つ）— Barter/Liddle/17α-OH のような兄弟設問を最優先
  const sameIdPool = allItems.filter(o => o.id === item.id && !usedBacks.has(o.back));
  if (sameIdPool.length > 0) {
    const pick = sameIdPool[Math.floor(Math.random() * sameIdPool.length)];
    distractors.push(pick.back);
    usedBacks.add(pick.back);
  }

  // Step 2: 同カテゴリ + キーワード類似度
  const sameCatPool = allItems.filter(o => o.category === item.category && !usedBacks.has(o.back));
  const scored = sameCatPool.map(o => ({ o, score: similarity(item, o) }));
  scored.sort((a, b) => b.score - a.score);
  // 上位8からランダムに選ぶ（多様性確保）
  const topN = Math.min(scored.length, 8);
  const top = shuffle(scored.slice(0, topN));
  for (const c of top) {
    if (distractors.length >= 3) break;
    if (!usedBacks.has(c.o.back)) {
      distractors.push(c.o.back);
      usedBacks.add(c.o.back);
    }
  }

  // Step 3: 不足分はランダム
  if (distractors.length < 3) {
    const remaining = shuffle(allItems.filter(o => !usedBacks.has(o.back)));
    for (const o of remaining) {
      if (distractors.length >= 3) break;
      distractors.push(o.back);
      usedBacks.add(o.back);
    }
  }

  const choices = shuffle([item.back, ...distractors]);
  return { item, type: '4ch', choices, correctAnswer: item.back };
}

// 文字バイグラムによるJaccard類似度（簡易）
function similarity(a, b) {
  const grams = (s) => {
    const norm = (s || '').replace(/\s/g, '');
    const set = new Set();
    for (let i = 0; i < norm.length - 1; i++) set.add(norm.substr(i, 2));
    return set;
  };
  const A = grams((a.front || '') + (a.back || ''));
  const B = grams((b.front || '') + (b.back || ''));
  if (A.size === 0 || B.size === 0) return 0;
  let common = 0;
  A.forEach(g => { if (B.has(g)) common++; });
  return common / (A.size + B.size - common);
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

  // ── Note表示（v2新機能）──
  renderNote(q.item);

  fb.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// 同idの他短文一覧 + source_noteリンク表示
function renderNote(item) {
  const noteEl = $('note-area');
  noteEl.innerHTML = '';
  let hasContent = false;

  // 同id他短文
  const sameId = State.data.items.filter(o => o.id === item.id && o.front !== item.front);
  if (sameId.length > 0) {
    const title = document.createElement('div');
    title.className = 'note-title';
    title.textContent = `📚 同じ出典の他の知識（${item.id}）`;
    noteEl.appendChild(title);
    const list = document.createElement('div');
    list.className = 'note-list';
    sameId.forEach(s => {
      const row = document.createElement('div');
      row.className = 'note-row';
      row.innerHTML = `<div class="note-q">${esc(s.front)}</div><div class="note-a">${esc(s.back)}</div>`;
      list.appendChild(row);
    });
    noteEl.appendChild(list);
    hasContent = true;
  }

  // source_note (Notion まとめページ)
  if (item.source_note_url) {
    const title = document.createElement('div');
    title.className = 'note-title';
    title.textContent = '📖 関連まとめNote';
    noteEl.appendChild(title);
    const link = document.createElement('a');
    link.className = 'note-link';
    link.href = item.source_note_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Notionで開く →';
    noteEl.appendChild(link);
    hasContent = true;
  }

  noteEl.classList.toggle('hidden', !hasContent);
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
  if (State.currentIndex >= State.questions.length) return;
  State.currentIndex++;
  if (State.currentIndex >= State.questions.length) {
    showResult();
  } else {
    renderQuestion();
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
    const r = Math.round((s.correct / s.total) * 100);
    const el = document.createElement('div');
    el.className = `cat-stat ${r >= 80 ? 'good' : r < 60 ? 'poor' : ''}`;
    el.innerHTML = `<span class="cat-name">${esc(cat)}</span><span class="cat-score">${s.correct}/${s.total} · ${r}%</span>`;
    statsEl.appendChild(el);
  }
}

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

window.addEventListener('DOMContentLoaded', init);
