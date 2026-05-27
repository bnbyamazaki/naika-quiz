# 内科専門医 一問一答

QBnoteベースの一問一答Webアプリ。

🌐 **公開URL**: https://（GitHub Pages 公開後にここに記載）

## 使い方

- スタート画面で診療科と出題数（10 / 20 / 30 / 50問）を選択
- ○×問題と4択問題がランダムに出題
- 結果画面で診療科別の正答率を確認

## ファイル

- `index.html` — 起点（分割版）
- `style.css` / `app.js` / `data.js` — 各ロジック
- `naika-quiz.html` — 1ファイル版（iCloudで配布する用、参考）

## データ更新

`build_data.py`（プライベートリポジトリ側）を実行して `data.js` を再生成 → このリポジトリにpush

---
Built with vanilla HTML/CSS/JS. No frameworks.
