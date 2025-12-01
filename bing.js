// ==UserScript==
// @name         Bing Auto Search (Human-Like Behavior)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  1文字ずつ入力、Enter検索、人間らしいスクロールと待機を行う自動巡回ツール
// @author       You
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // --- 定数・キー定義 ---
    const K = {
        KEYWORDS: 'bhb_keywords',
        KEY_INDEX: 'bhb_key_index',
        SUB_INDEX: 'bhb_sub_index', // 1ワード内の何件目か
        IS_RUNNING: 'bhb_is_running',
        STATE: 'bhb_state',

        // 設定保存用
        CONF_VISIT_COUNT: 'bhb_conf_visit_count',
        CONF_VISIT_MIN: 'bhb_conf_visit_min',
        CONF_VISIT_MAX: 'bhb_conf_visit_max',
        SAVED_TEXT: 'bhb_saved_text'
    };

    // 状態定義
    const STATE = {
        IDLE: 'idle',
        GO_HOME: 'go_home',         // Bingトップへ移動
        TYPING: 'typing',           // 入力中
        WAIT_RESULTS: 'wait_results',// 検索結果待ち＆クリック
        VISITING: 'visiting'        // サイト閲覧中
    };

    // --- スタイル定義 (UI) ---
    const style = document.createElement('style');
    style.textContent = `
        #bhb-panel {
            position: fixed; top: 20px; right: 20px; width: 350px;
            background: #ffffff; border: 1px solid #ccc; border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.25); z-index: 2147483647;
            font-family: "Segoe UI", sans-serif; display: none; color: #333; font-size: 13px;
        }
        #bhb-panel.active { display: block; }
        .bhb-header {
            background: #0078d4; color: white; padding: 12px 15px;
            border-radius: 7px 7px 0 0; display: flex;
            justify-content: space-between; align-items: center; cursor: move;
        }
        .bhb-body { padding: 15px; max-height: 80vh; overflow-y: auto; }
        .bhb-textarea {
            width: 100%; height: 100px; padding: 8px; margin-bottom: 12px;
            border: 1px solid #ccc; border-radius: 4px;
            resize: vertical; font-family: monospace; box-sizing: border-box;
        }
        .bhb-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .bhb-input-group { display: flex; align-items: center; gap: 5px; }
        input[type="number"] { width: 50px; padding: 5px; border: 1px solid #ddd; border-radius: 4px; text-align: center; }

        .bhb-btn-group { display: flex; gap: 10px; margin-top: 15px; }
        .bhb-btn {
            flex: 1; padding: 10px; border: none; border-radius: 4px;
            cursor: pointer; font-weight: bold; transition: 0.2s;
        }
        .bhb-primary { background: #0078d4; color: white; }
        .bhb-primary:hover { background: #005a9e; }
        .bhb-secondary { background: #f0f0f0; color: #333; }
        .bhb-secondary:hover { background: #e0e0e0; }

        #bhb-toggle {
            position: fixed; bottom: 20px; right: 20px;
            width: 55px; height: 55px; background: #0078d4; color: white;
            border: none; border-radius: 50%; font-size: 26px; cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3); z-index: 2147483646;
            transition: transform 0.2s;
        }
        #bhb-toggle:hover { transform: scale(1.1); }

        #bhb-status {
            position: fixed; bottom: 20px; left: 20px;
            background: rgba(30, 30, 30, 0.9); color: white;
            padding: 12px 20px; border-radius: 8px;
            z-index: 2147483647; font-size: 13px;
            display: flex; align-items: center; gap: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            border-left: 4px solid #0078d4;
        }
    `;
    document.head.appendChild(style);

    // --- UI構築 ---
    const panel = document.createElement('div');
    panel.id = 'bhb-panel';
    panel.innerHTML = `
        <div class="bhb-header"><h3>Bing Human-Like Search v6</h3><span style="cursor:pointer;font-size:20px;" id="bhb-close">×</span></div>
        <div class="bhb-body">
            <label style="font-weight:bold; display:block; margin-bottom:5px;">検索キーワード (改行区切り)</label>
            <textarea class="bhb-textarea" id="bhb-keywords" placeholder="例:\n天気\nニュース\nWeb小説"></textarea>

            <div style="background:#f9f9f9; padding:10px; border-radius:5px; margin-bottom:10px;">
                <div class="bhb-row">
                    <label>1ワードの巡回数:</label>
                    <div class="bhb-input-group">
                        <input type="number" id="bhb-visit-count" value="2" min="1" max="10"> <span>件</span>
                    </div>
                </div>
                <div class="bhb-row">
                    <label>サイト滞在時間(秒):</label>
                    <div class="bhb-input-group">
                        <input type="number" id="bhb-visit-min" value="5" min="2">
                        <span>～</span>
                        <input type="number" id="bhb-visit-max" value="10" min="3">
                    </div>
                </div>
            </div>

            <div style="font-size:11px; color:#666; line-height:1.4;">
                ※ Bingトップで1文字ずつ入力し、Enterで検索します。<br>
                ※ サイト閲覧中は人間らしくランダムにスクロールします。
            </div>

            <div class="bhb-btn-group">
                <button class="bhb-btn bhb-secondary" id="bhb-save">設定保存</button>
                <button class="bhb-btn bhb-primary" id="bhb-start">巡回開始</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'bhb-toggle';
    toggleBtn.textContent = '👨‍💻';
    document.body.appendChild(toggleBtn);

    // --- 要素参照 ---
    const els = {
        keywords: panel.querySelector('#bhb-keywords'),
        visitCount: panel.querySelector('#bhb-visit-count'),
        visitMin: panel.querySelector('#bhb-visit-min'),
        visitMax: panel.querySelector('#bhb-visit-max'),
        saveBtn: panel.querySelector('#bhb-save'),
        startBtn: panel.querySelector('#bhb-start'),
        closeBtn: panel.querySelector('#bhb-close')
    };

    // --- ユーティリティ関数 ---
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // --- UIイベント ---
    toggleBtn.onclick = () => panel.classList.toggle('active');
    els.closeBtn.onclick = () => panel.classList.remove('active');

    // ドラッグ移動
    let isDrag = false, iX, iY;
    panel.querySelector('.bhb-header').onmousedown = e => {
        if(e.target === els.closeBtn) return;
        isDrag = true; iX = e.clientX - panel.offsetLeft; iY = e.clientY - panel.offsetTop;
    };
    document.onmousemove = e => { if(isDrag){ panel.style.left=(e.clientX-iX)+'px'; panel.style.top=(e.clientY-iY)+'px'; panel.style.right='auto'; }};
    document.onmouseup = () => isDrag = false;

    // 設定保存・読込
    function loadSettings() {
        els.keywords.value = GM_getValue(K.SAVED_TEXT, '');
        els.visitCount.value = GM_getValue(K.CONF_VISIT_COUNT, 2);
        els.visitMin.value = GM_getValue(K.CONF_VISIT_MIN, 5);
        els.visitMax.value = GM_getValue(K.CONF_VISIT_MAX, 10);
    }

    els.saveBtn.onclick = () => {
        GM_setValue(K.SAVED_TEXT, els.keywords.value);
        GM_setValue(K.CONF_VISIT_COUNT, parseInt(els.visitCount.value));
        GM_setValue(K.CONF_VISIT_MIN, parseInt(els.visitMin.value));
        GM_setValue(K.CONF_VISIT_MAX, parseInt(els.visitMax.value));
        alert('設定を保存しました');
    };

    // --- 開始ボタン ---
    els.startBtn.onclick = () => {
        const text = els.keywords.value.trim();
        if (!text) return alert('キーワードを入力してください');
        const keywords = text.split('\n').map(k => k.trim()).filter(k => k);

        // 設定保存
        els.saveBtn.click();

        // 状態初期化
        GM_setValue(K.KEYWORDS, keywords);
        GM_setValue(K.KEY_INDEX, 0);
        GM_setValue(K.SUB_INDEX, 0);
        GM_setValue(K.IS_RUNNING, true);
        GM_setValue(K.STATE, STATE.GO_HOME); // まずBingトップへ

        panel.classList.remove('active');

        // 即座に実行
        mainLoop();
    };

    // --- 人間らしい入力アクション ---

    // 1文字ずつタイプする
    async function simulateTyping(element, text) {
        element.focus();
        element.value = '';

        await sleep(random(300, 600)); // 最初の「ため」

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // イベント発火
            element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

            // ランダムな打鍵間隔 (ミスタイプ風の遅延や、素早い入力を混在)
            const speed = random(1, 10) > 8 ? random(150, 300) : random(30, 100);
            await sleep(speed);
        }
    }

    // Enterキーを押して遷移
    async function simulateEnter(element) {
        await sleep(random(400, 800)); // 入力完了後の「ため」

        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

        // 万が一フォーム送信されない場合の保険
        const form = element.closest('form');
        if (form) {
             // 少し待って遷移しなければsubmitボタンを押すかsubmitする
             setTimeout(() => {
                 const btn = form.querySelector('input[type="submit"], button[type="submit"], #sb_form_go');
                 if(btn) btn.click();
                 else form.submit();
             }, 500);
        }
    }

    // 人間らしいスクロール (読んでるふり)
    async function simulateHumanScroll(durationMs) {
        const startTime = Date.now();
        const endTime = startTime + durationMs;

        while (Date.now() < endTime) {
            // スクロール量の決定（大きく動くか、少し読むか）
            const scrollAmount = random(50, 300);
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });

            // 次の動作までの待機（読んでいる時間）
            // 短い待機(サッと読む)と長い待機(じっくり読む)を混ぜる
            const pause = random(1, 10) > 7 ? random(1500, 3000) : random(500, 1500);

            await sleep(pause);

            // 時々少し戻る（読み返し）
            if (random(1, 10) > 8) {
                window.scrollBy({ top: -random(50, 150), behavior: 'smooth' });
                await sleep(random(500, 1000));
            }

            // ページ下部に到達したら終了
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 100) {
                break;
            }
        }
    }

    // --- メインループ ---
    async function mainLoop() {
        if (!GM_getValue(K.IS_RUNNING, false)) return;

        const keywords = GM_getValue(K.KEYWORDS, []);
        const keyIndex = GM_getValue(K.KEY_INDEX, 0);
        const subIndex = GM_getValue(K.SUB_INDEX, 0); // 0始まり (0=1位, 1=2位...)
        const currentState = GM_getValue(K.STATE, STATE.IDLE);

        // 完了判定
        if (keyIndex >= keywords.length) {
            finish();
            return;
        }

        const currentKeyword = keywords[keyIndex];
        const visitCountTarget = GM_getValue(K.CONF_VISIT_COUNT, 2);

        showStatus(currentState, keyIndex + 1, keywords.length, subIndex + 1, currentKeyword);

        // --- 状態ごとの処理 ---

        // 1. Bingトップへ移動
        if (currentState === STATE.GO_HOME) {
            // Bingトップにいなければ移動
            if (location.hostname !== 'www.bing.com' || location.pathname.length > 1) {
                location.href = 'https://www.bing.com/';
                return;
            }

            // Bingトップに到着したら次のフェーズへ
            // (ページロード待機のため、リロード後にここに来る)
            await sleep(random(1000, 2000));
            GM_setValue(K.STATE, STATE.TYPING);
            mainLoop(); // 即時実行
        }

        // 2. 入力・検索実行
        else if (currentState === STATE.TYPING) {
            // 検索ボックスを探す
            const input = document.querySelector('#sb_form_q');
            if (input) {
                await simulateTyping(input, currentKeyword);

                // 次の状態をセットしてからEnter (画面遷移が発生するため)
                GM_setValue(K.STATE, STATE.WAIT_RESULTS);
                await simulateEnter(input);
            } else {
                // ボックスが見つからない場合(異常系)、強制的にURL遷移
                const url = `https://www.bing.com/search?q=${encodeURIComponent(currentKeyword)}`;
                GM_setValue(K.STATE, STATE.WAIT_RESULTS);
                location.href = url;
            }
        }

        // 3. 検索結果待ち ＆ クリック
        else if (currentState === STATE.WAIT_RESULTS) {
            // 検索結果ページにいるか確認
            if (!location.href.includes('search')) {
                // まだトップページなどにいる場合、待つ（リロード待ち）
                return;
            }

            await sleep(random(1500, 2500)); // 検索結果を見る時間

            // リンク取得 (広告を除く、通常の検索結果)
            const links = document.querySelectorAll('#b_results > li.b_algo h2 a, #b_results > li.b_topborder h2 a');
            const target = links[subIndex];

            if (target) {
                console.log(`Clicking result #${subIndex + 1}`);
                GM_setValue(K.STATE, STATE.VISITING);

                // リンクを目立たせる（デバッグ用兼、フォーカス演出）
                target.style.outline = "2px solid red";
                await sleep(500);

                target.click();
                // クリックで遷移しなかった場合のフォールバック
                setTimeout(() => { if(GM_getValue(K.STATE) === STATE.VISITING) location.href = target.href; }, 1000);
            } else {
                // リンクがない場合、次のキーワードへスキップ
                console.log("Link not found, skipping");
                goNextKeyword();
            }
        }

        // 4. サイト閲覧中
        else if (currentState === STATE.VISITING) {
            // サイト滞在時間
            const minWait = GM_getValue(K.CONF_VISIT_MIN, 5);
            const maxWait = GM_getValue(K.CONF_VISIT_MAX, 10);
            const waitTime = random(minWait, maxWait) * 1000;

            // 人間らしいスクロールを実行（この関数の中で時間をつぶす）
            await simulateHumanScroll(waitTime);

            // 次の行動決定
            const nextSubIndex = subIndex + 1;

            if (nextSubIndex < visitCountTarget) {
                // 同じキーワードで次の順位のサイトへ
                GM_setValue(K.SUB_INDEX, nextSubIndex);

                // 「戻る」動作の代わりに、検索結果URLへ直接戻る
                // (人間がブラウザの戻るボタンを押す挙動に近い)
                GM_setValue(K.STATE, STATE.WAIT_RESULTS);

                const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(currentKeyword)}`;
                location.href = searchUrl;
            } else {
                // 次のキーワードへ
                goNextKeyword();
            }
        }
    }

    function goNextKeyword() {
        const keywords = GM_getValue(K.KEYWORDS, []);
        const currentKeyIndex = GM_getValue(K.KEY_INDEX, 0);
        const nextKeyIndex = currentKeyIndex + 1;

        if (nextKeyIndex < keywords.length) {
            GM_setValue(K.KEY_INDEX, nextKeyIndex);
            GM_setValue(K.SUB_INDEX, 0);

            // 新しいキーワードなので、またトップページから入力しなおす
            GM_setValue(K.STATE, STATE.GO_HOME);
            location.href = 'https://www.bing.com/';
        } else {
            // 完了
            GM_setValue(K.KEY_INDEX, nextKeyIndex);
            finish();
        }
    }

    // ステータス表示
    function showStatus(state, kIdx, kTotal, sIdx, word) {
        let el = document.getElementById('bhb-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'bhb-status';
            document.body.appendChild(el);
        }

        let msg = '';
        if (state === STATE.GO_HOME) msg = '🏠 Bingトップへ移動中...';
        else if (state === STATE.TYPING) msg = '⌨️ キーワード入力中...';
        else if (state === STATE.WAIT_RESULTS) msg = `🔍 検索結果から ${sIdx} 件目を探しています...`;
        else if (state === STATE.VISITING) msg = '📖 サイト閲覧中 (スクロール操作)...';

        el.innerHTML = `
            <div style="flex:1">
                <div style="font-weight:bold; color:#ffdd57;">${kIdx}/${kTotal}: ${word}</div>
                <div style="color:#ddd;">${msg}</div>
            </div>
            <button id="bhb-stop" style="background:#e74c3c;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">停止</button>
        `;

        document.getElementById('bhb-stop').onclick = () => {
            GM_setValue(K.IS_RUNNING, false);
            el.remove();
            alert('停止しました');
        };
    }

    function finish() {
        GM_setValue(K.IS_RUNNING, false);
        const el = document.getElementById('bhb-status');
        if(el) el.remove();
        alert('✅ すべての自動巡回が完了しました');
    }

    // 初期化
    loadSettings();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mainLoop);
    } else {
        mainLoop();
    }

})();
