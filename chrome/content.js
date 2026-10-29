// =========================================================
// momo 答題神隊友 - content.js (擴充套件內容腳本)
// 負責：題庫快取同步、頁面高亮輔助提示、自動將官方正解回傳伺服器
// =========================================================

(function() {
  console.log('[momo 答題神隊友] 內容腳本已載入！');

  const CDN_JSON_URL = 'https://finddog.online/momo_questions.json';
  const SERVER_AUTO_LEARN_URL = 'https://api.9ysong.shop/callback2/api/auto-learn';

  let localQuestions = [];
  let isQuestionsLoaded = false;
  let isMobileFrameEnabled = true;

  // =========================================================
  // 0. 自動切換手機版網址與強制解鎖手機遊戲區域
  // =========================================================
  function ensureMobileUrl() {
    try {
      if (window.location.hostname === 'www.momoshop.com.tw') {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('viewport')) {
          const path = url.pathname.toLowerCase();
          if (path.includes('/edm/') || path.includes('/activity/') || path.includes('/mmp-') || path.includes('/main/') || path.includes('/goods/')) {
            url.searchParams.set('viewport', 'mobile');
            console.log('[momo 答題神隊友] 🔄 自動補全手機版參數:', url.toString());
            window.history.replaceState({}, '', url.toString());
          }
        }
      }
    } catch (e) {
      console.warn('[momo 答題神隊友] 檢查手機網址異常:', e);
    }
  }

  ensureMobileUrl();

  // 注入解鎖樣式：永久隱藏 PC 版「請使用手機開啟」阻擋層，直接解鎖真實遊戲內容
  const unlockStyle = document.createElement('style');
  unlockStyle.id = 'momo-ext-unlock-style';
  unlockStyle.textContent = `
    .Area_knowledgeKing.for_pc { display: none !important; }
    .Area_knowledgeKing.for_phone { display: block !important; }
  `;
  (document.head || document.documentElement).appendChild(unlockStyle);

  // =========================================================
  // 1. 自動手機排版與畫框模擬 (430px iPhone 16 Pro 規格)
  // =========================================================
  function applyMobileFrame(enable) {
    isMobileFrameEnabled = enable;
    let styleEl = document.getElementById('momo-ext-mobile-style');

    if (enable) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'momo-ext-mobile-style';
        styleEl.textContent = `
          html.momo-mobile-active {
            background-color: #121214 !important;
            display: flex !important;
            justify-content: center !important;
            min-height: 100vh !important;
            overflow-x: hidden !important;
          }
          body.momo-mobile-active {
            width: 430px !important;
            max-width: 430px !important;
            min-width: 430px !important;
            min-height: 100vh !important;
            margin: 0 auto !important;
            background-color: #ffffff !important;
            box-shadow: 0 0 50px rgba(0, 0, 0, 0.6) !important;
            position: relative !important;
            transform: translateZ(0) !important;
            overflow-x: hidden !important;
            transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.35s ease !important;
          }
          html.momo-mobile-active [style*="position: fixed"],
          html.momo-mobile-active [style*="position:fixed"] {
            max-width: 430px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
          }
        `;
        (document.head || document.documentElement).appendChild(styleEl);
      }

      document.documentElement.classList.add('momo-mobile-active');
      if (document.body) document.body.classList.add('momo-mobile-active');

      // 補上手機 Viewport meta
      if (!document.querySelector('meta[name="viewport"]')) {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        (document.head || document.documentElement).appendChild(meta);
      }
    } else {
      if (styleEl) styleEl.remove();
      document.documentElement.classList.remove('momo-mobile-active');
      if (document.body) document.body.classList.remove('momo-mobile-active');
    }
  }

  // 智慧排版過渡監聽：先全版顯示主頁說明，點擊開始挑戰時再自動縮小為手機答題畫面
  function initSmartLayoutWatcher() {
    document.addEventListener('click', (e) => {
      // 點擊「開始遊戲 / 開始挑戰」按鈕 -> 平滑切換為 430px 縮小手機畫框
      const playBtn = e.target && (e.target.id === 'btn_play' || e.target.closest('#btn_play'));
      if (playBtn) {
        console.log('[momo 答題神隊友] 🎮 點擊開始挑戰，自動切換至 430px 手機答題畫框！');
        applyMobileFrame(true);
      }

      // 點擊「回到主頁 / 返回」按鈕 -> 自動恢復全螢幕寬版顯示
      const backBtn = e.target && (e.target.closest('#KK_backBtn') || e.target.closest('#KK_goBackBtn'));
      if (backBtn) {
        console.log('[momo 答題神隊友] 🏠 返回活動主頁，自動恢復全螢幕寬版顯示！');
        applyMobileFrame(false);
      }
    }, true);

    // 監聽題目載入事件，確保答題時一定維持手機畫框
    window.addEventListener('message', (e) => {
      if (e.data && e.data.source === 'MOMO_QUIZ_INJECTED' && e.data.type === 'QUESTION_LOADED') {
        applyMobileFrame(true);
      }
    });

    // 動態觀察畫面元素：若當前正在答題頁 (#box_game)，自動維持手機模式
    const observer = new MutationObserver(() => {
      const boxGame = document.getElementById('box_game');
      if (boxGame && boxGame.style.display !== 'none' && !document.documentElement.classList.contains('momo-mobile-active')) {
        applyMobileFrame(true);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  initSmartLayoutWatcher();

  // =========================================================
  // 雙軌保險 2：動態監聽畫面選項之 is_correct / is_wrong 標記 (DOM 結算觀測器)
  // =========================================================
  function initSmartAnswerObserver() {
    let checkTimer = null;
    const observer = new MutationObserver(() => {
      if (checkTimer) return;
      checkTimer = setTimeout(() => {
        checkTimer = null;
        const optionsList = document.getElementById('KK_options');
        if (!optionsList) return;

        const correctLi = optionsList.querySelector('li.is_correct');
        const wrongLi = optionsList.querySelector('li.is_wrong, li.wrong, li.is_error, li.selected.wrong');

        if (!correctLi && !wrongLi) return;

        const qTitleEl = document.getElementById('KK_questionTitle');
        const qText = qTitleEl ? qTitleEl.textContent.trim() : '';
        const qImgWrap = document.getElementById('KK_questionImage');
        const qImgEl = qImgWrap ? qImgWrap.querySelector('img') : null;
        const qImg = (qImgEl && qImgWrap.style.display !== 'none') ? qImgEl.src.trim() : '';

        if (!qText && !qImg) return;

        if (correctLi) {
          const correctTxtEl = correctLi.querySelector('.txt');
          const correctImgEl = correctLi.querySelector('img');
          const ansText = correctTxtEl ? correctTxtEl.textContent.trim() : '';
          const ansImage = correctImgEl ? correctImgEl.src.trim() : '';

          if (!ansText && !ansImage) return;

          const wrongChoices = [];
          optionsList.querySelectorAll('li:not(.is_correct)').forEach(li => {
            const t = li.querySelector('.txt');
            const img = li.querySelector('img');
            if (t && t.textContent.trim()) wrongChoices.push({ text: t.textContent.trim(), image: '' });
            else if (img && img.src.trim()) wrongChoices.push({ text: '', image: img.src.trim() });
          });

          handleAnswerRevealed({
            questionText: qText,
            questionImage: qImg,
            correctText: ansText,
            correctImage: ansImage,
            wrongChoices: wrongChoices,
            allChoices: [],
            isCorrect: true
          });
        } else if (wrongLi) {
          const wrongTxtEl = wrongLi.querySelector('.txt');
          const wrongImgEl = wrongLi.querySelector('img');
          const failText = wrongTxtEl ? wrongTxtEl.textContent.trim() : '';
          const failImage = wrongImgEl ? wrongImgEl.src.trim() : '';

          if (failText || failImage) {
            handleAnswerRevealed({
              questionText: qText,
              questionImage: qImg,
              failedChoiceText: failText,
              failedChoiceImage: failImage,
              wrongChoices: [],
              allChoices: [],
              isCorrect: false
            });
          }
        }
      }, 100);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  initSmartAnswerObserver();

  // 1. 初始化設定與題庫快取
  chrome.storage.local.get({
    enableHighlight: true,
    enableAutoReport: true,
    enableMobileView: true,
    contributedCount: 0,
    cachedBank: null,
    bankLastModified: ''
  }, function(settings) {
    // 智慧判斷：若初始載入即在答題頁則套用手機框，若在活動主頁/起始頁(#box_start)則先保持寬版主頁顯示
    const isAlreadyInGame = document.getElementById('box_game') && document.getElementById('box_game').style.display !== 'none';
    if (settings.enableMobileView && isAlreadyInGame) {
      applyMobileFrame(true);
    }
    if (settings.cachedBank && Array.isArray(settings.cachedBank)) {
      localQuestions = settings.cachedBank;
      isQuestionsLoaded = true;
      console.log(`[momo 答題神隊友] 已載入快取題庫 ${localQuestions.length} 題`);
    }
    // 背景同步最新 CDN 題庫
    refreshBankFromCdn();
  });

  function refreshBankFromCdn() {
    // 透過 Service Worker 代理請求，徹底解決網頁 CSP (Content Security Policy) 阻擋 fetch 的問題
    chrome.runtime.sendMessage({ action: 'syncBank' }, function(response) {
      if (chrome.runtime.lastError) {
        console.warn('[momo 答題神隊友] 同步題庫訊息發送異常:', chrome.runtime.lastError);
        return;
      }
      if (response && response.questions && Array.isArray(response.questions)) {
        localQuestions = response.questions;
        isQuestionsLoaded = true;
        console.log(`[momo 答題神隊友] 題庫已由 Service Worker 同步最新版，共 ${localQuestions.length} 題！`);
      }
    });
  }

  // 2. 監聽 injected.js 拋出的事件
  window.addEventListener('message', function(event) {
    if (event.source !== window || !event.data || event.data.source !== 'MOMO_QUIZ_INJECTED') {
      return;
    }

    const { type, data } = event.data;

    if (type === 'QUESTION_LOADED') {
      handleQuestionLoaded(data);
    } else if (type === 'ANSWER_REVEALED') {
      handleAnswerRevealed(data);
    }
  });

  // =========================================================
  // 核心模組：智慧解析題庫答案 (提取指定序號 1~4 或 A~D、排除備註、提取多候選詞與別名)
  // 例如：'3．紅色 (bug題，選1是錯的)' => designatedIndex: 3, cleanText: '紅色'
  // 例如：'特潤超導全方位修護露(小棕瓶)' => candidates: ['特潤超導全方位修護露', '小棕瓶']
  // 例如：'嬰兒尿布/拉拉褲' => candidates: ['嬰兒尿布/拉拉褲', '嬰兒尿布', '拉拉褲']
  // =========================================================
  function parseTargetAnswer(rawAns) {
    const raw = (rawAns || '').trim();
    let designatedIndex = null;

    // 1. 檢測選項順序 (1~4 或 A~D)
    // 模式 A: 英文序號 A. B. C. D.
    const matchAlpha = raw.match(/^([a-dA-D])[\.．、\s]+/);
    if (matchAlpha) {
      designatedIndex = matchAlpha[1].toUpperCase().charCodeAt(0) - 64; // A=1, B=2, C=3, D=4
    }

    // 模式 B: 選項X、圖片X、圖X (例如 選項4：4G, 選項1．紫色, 圖片3：有一個女生)
    if (!designatedIndex) {
      const matchOpt = raw.match(/^(?:選項|圖片|圖)\s*([1-4])[\s:：\.．、]*/);
      if (matchOpt) {
        designatedIndex = parseInt(matchOpt[1], 10);
      }
    }

    // 模式 C: 數字序號 1~4
    // 若為全形點「．」、頓號「、」或空格：絕對是選項編號 (例如 2．390元, 4．1199g)
    // 若為半形點「.」：需排除小數點/頻率 (例如 2.4GHz, 1.8L)，但若接多位數字或單位 (例如 2.390元, 4.74900) 則判定為選項序號
    if (!designatedIndex) {
      const matchNum = raw.match(/^([1-4])([．、\s]+|[\.](?!\d|[gG][hH][zZ])|(?:\.(?=\d{2,}|\d+[元百千萬個包瓶])))/);
      if (matchNum) {
        designatedIndex = parseInt(matchNum[1], 10);
      }
    }

    // 模式 D: 1號、2號、3號、4號 或 第1、第2...
    if (!designatedIndex) {
      const matchNo = raw.match(/^(?:第)?([1-4])號[\s\.\、\．]*/);
      if (matchNo) {
        designatedIndex = parseInt(matchNo[1], 10);
      }
    }

    // 模式 E: 選1、選2、選3、選4 (且後方不能接其他數字，排除 選390)
    if (!designatedIndex) {
      const matchPick = raw.match(/^選([1-4])(?!\d)[\s\.\、\．]*/);
      if (matchPick) {
        designatedIndex = parseInt(matchPick[1], 10);
      }
    }

    // 模式 F: 括號內備註如「(看到經典款選2)」，排除「選1是錯的」以及「選390」
    if (!designatedIndex) {
      const matchParen = raw.match(/[\(（][^\)）]*?選\s*([1-4])(?!\d|\s*是錯)[^\)）]*?[\)）]/);
      if (matchParen) {
        designatedIndex = parseInt(matchParen[1], 10);
      }
    }

    // 2. 清洗核心答案文字
    let clean = raw;
    clean = clean.replace(/^[a-dA-D][\.．、\s]+/, '');
    clean = clean.replace(/^(?:選項|圖片|圖)\s*[1-4][\s:：\.．、]*/, '');
    clean = clean.replace(/^[1-4]([．、\s]+|[\.](?!\d|[gG][hH][zZ])|(?:\.(?=\d{2,}|\d+[元百千萬個包瓶])))/, '');
    clean = clean.replace(/^(?:第)?[1-4]號[\s\.\、\．]*/, '');
    clean = clean.replace(/^選[1-4](?!\d)[\s\.\、\．]*/, '');

    // 處理箭頭說明 (例如 Glide→這是牙線, 題目關鍵字→精華液)
    if (clean.includes('→') || clean.includes('->') || clean.includes('➔')) {
      const parts = clean.split(/[→➔]|\->/);
      if (parts[0].includes('關鍵字') || parts[0].includes('題目')) {
        clean = parts[1] || clean;
      } else {
        clean = parts[0] || clean;
      }
    }

    // 提取括號內的可能別名 (例如 特潤超導全方位修護露(小棕瓶) => 提取 '小棕瓶')
    const aliases = [];
    const parenMatches = clean.match(/[\(（](.*?)[\)）]/g);
    if (parenMatches) {
      parenMatches.forEach(p => {
        const pClean = p.replace(/[\(（\)）]/g, '').trim();
        // 排除單純說明性質字串
        if (!/bug|錯|選|解析|題目|關鍵字|看到|圖片|瓶身|包裝|中間|朝|個/i.test(pClean)) {
          if (pClean.length >= 2) {
            aliases.push(pClean);
          }
        }
      });
    }

    // 去除所有括號備註說明，並清除未閉合或多餘的括號殘留 (例如 45分貝(圖書館悄悄話, 只能選390)))
    clean = clean.replace(/[\(（].*?[\)）]/g, '');
    clean = clean.replace(/[\(（][^\)）]*$/, '');
    clean = clean.replace(/[\)）]+$/, '').trim();

    // 3. 組合所有可能的候選文字清單 (支援斜線別名與去除「元」的比對)
    const candidates = [];
    if (clean) {
      candidates.push(clean);
      if (clean.endsWith('元') && clean.length > 1) {
        const noYuan = clean.slice(0, -1).trim();
        if (noYuan && !candidates.includes(noYuan)) {
          candidates.push(noYuan);
        }
      }
      if (clean.includes('/') || clean.includes('／')) {
        clean.split(/[/／]/).forEach(part => {
          const pt = part.trim();
          if (pt && !candidates.includes(pt)) {
            candidates.push(pt);
          }
        });
      }
    }
    aliases.forEach(a => {
      if (!candidates.includes(a)) {
        candidates.push(a);
      }
    });

    return { designatedIndex, cleanText: clean, candidates };
  }

  // =========================================================
  // 處理 1：題目載入時，比對題庫、高亮提示並智慧自動答題
  // 若程式或API無法確定正解，自動出現已知正解與錯誤答案供手動處理！
  // =========================================================
  function handleQuestionLoaded(qData) {
    dismissManualDecisionCard();

    chrome.storage.local.get({
      enableHighlight: true,
      enableAutoClick: true,
      autoClickDelay: 850
    }, function(cfg) {
      const qText = (qData.questionText || '').trim();
      let qImg = (qData.questionImage || '').trim();

      // 若 API 未附帶題目圖片，嘗試由 DOM 補充取得題目圖片
      if (!qImg) {
        const domImg = document.querySelector('#KK_question img, .Area_question img, .quiz_question img, #box_game .question img, .box_question img');
        if (domImg && domImg.src) {
          qImg = domImg.src;
        }
      }

      if (!qText && !qImg) return;

      // 在題庫中搜尋匹配 (雙軌引擎：優先題目圖片 UUID 精準比對)
      const matched = findMatchingQuestion(qText, qImg);
      let targetChoice = null;
      let isDefiniteMatch = false;

      if (!matched) {
        console.log('[momo 答題神隊友] 本題為全新題目，題庫尚無紀錄。交由使用者手動作答！');
        showFloatingNotice('💡 遇到全新題目！題庫無紀錄，請手動作答（神隊友將在答題後自動學習正解）！', '#0284c7');
        showManualDecisionCard(null, qData);
        return;
      }

      console.log('[momo 答題神隊友] 命中題庫紀錄！', matched);

      const { designatedIndex, cleanText, candidates } = parseTargetAnswer(matched.ans);
      const ansTargetImg = (matched.img_url || '').split('/').pop().split('?')[0];

      // 優先策略 1: 若題庫註明指定序號 (例如「3．紅色 (bug題，選1是錯的)」、「選項4：4G」=> 直接鎖定第 X 個選項)
      if (designatedIndex && designatedIndex >= 1 && designatedIndex <= qData.choices.length) {
        const candidate = qData.choices[designatedIndex - 1];
        candidate.choiceOrder = designatedIndex;
        targetChoice = candidate;
        isDefiniteMatch = true;
        console.log(`[momo 答題神隊友] 🎯 命中指定順序題！直接鎖定第 ${designatedIndex} 個選項：【${candidate.text || candidate.choiceId}】`);
        if (cfg.enableAutoClick) {
          showFloatingNotice(`🎯 神隊友鎖定第 ${designatedIndex} 個選項：【${cleanText || candidate.text || '指定選項'}】`, '#10b981');
        } else {
          showFloatingNotice(`🎯 已標記第 ${designatedIndex} 個選項：【${cleanText || candidate.text || '指定選項'}】（自動作答已關閉，請點選）`, '#f59e0b');
        }
      } else {
        // 策略 2: 多候選詞文字雙向模糊比對 (含斜線別名、括號別名) 與圖片 UUID 比對
        targetChoice = qData.choices.find((c, idx) => {
          if (c.text && candidates.length > 0) {
            const cleanCTxt = c.text.replace(/[\s\-_,，.。?？!！]/g, '').toLowerCase();
            for (const cand of candidates) {
              const cleanCand = cand.replace(/[\s\-_,，.。?？!！]/g, '').toLowerCase();
              if (cleanCTxt && cleanCand && (cleanCTxt === cleanCand || cleanCTxt.includes(cleanCand) || cleanCand.includes(cleanCTxt))) {
                c.choiceOrder = idx + 1;
                return true;
              }
            }
          }
          if (ansTargetImg && c.image && c.image.includes(ansTargetImg)) {
            c.choiceOrder = idx + 1;
            return true;
          }
          return false;
        });

        if (targetChoice) {
          isDefiniteMatch = true;
          if (cfg.enableAutoClick) {
            showFloatingNotice(`🎯 神隊友找到正解：【${cleanText || matched.ans}】`, '#10b981');
          } else {
            showFloatingNotice(`🎯 已標記正解：【${cleanText || matched.ans}】（自動作答已關閉，請手動點選）`, '#f59e0b');
          }
        } else {
          // 策略 3: 原版 test.exe 排除法 (若答案未知但有已知錯誤選項)
          const wrongList = (matched.wrong || []);
          const wrongImgList = (matched.wrong_imgs || []);
          const availableChoices = qData.choices.filter((c, idx) => {
            const isWrongTxt = wrongList.some(w => w && c.text && c.text.trim() === w.trim());
            const isWrongImg = wrongImgList.some(wi => wi && c.image && c.image.includes(wi.split('/').pop().split('?')[0]));
            if (!isWrongTxt && !isWrongImg) {
              c.choiceOrder = idx + 1;
              return true;
            }
            return false;
          });

          if (availableChoices.length === 1) {
            targetChoice = availableChoices[0];
            isDefiniteMatch = true;
            console.log(`[momo 答題神隊友] 💡 透過已知錯誤排除法，鎖定唯一剩餘選項：`, targetChoice);
            if (cfg.enableAutoClick) {
              showFloatingNotice(`💡 排除已知錯誤，鎖定唯一選項：【${targetChoice.text || '候選選項'}】`, '#3b82f6');
            } else {
              showFloatingNotice(`💡 排除已知錯誤，已標記推薦選項：【${targetChoice.text || '候選選項'}】（請手動點選）`, '#f59e0b');
            }
          } else {
            // 剩餘 > 1 個選項或無法確定，無法做出決策
            isDefiniteMatch = false;
            targetChoice = null;
          }
        }
      }

      // 當程式或API無法做出肯定選擇時，彈出已知正解與錯誤答案，供使用者手動處理！
      if (!isDefiniteMatch || !targetChoice) {
        console.warn('[momo 答題神隊友] ⚠️ 無法確定唯一正解，呼叫手動決策面板！', matched);
        showManualDecisionCard(matched, qData);
        markChoicesOnPage(matched, qData.choices);
        return;
      }

      // 無論是否開啟自動點擊，只要找到正解一律高亮標記！
      if (cfg.enableHighlight && targetChoice) {
        highlightOptionOnPage(matched, targetChoice, qData.choices, !cfg.enableAutoClick);
      }

      // 執行智慧自動答題引擎 (僅在 enableAutoClick 開啟時自動作答)
      if (cfg.enableAutoClick && targetChoice) {
        executeAutoAnswer(matched, targetChoice, qData);
      } else {
        console.log('[momo 答題神隊友] ✋ 自動作答點擊功能已關閉，本題只標記不作答！');
      }
    });
  }

  // =========================================================
  // 智慧自動答題引擎 (單純模擬點選目標選項與確認按鈕，已關閉 API 偷偷送出)
  // =========================================================
  function executeAutoAnswer(matched, targetChoice, qData) {
    chrome.storage.local.get({
      enableAutoClick: true,
      answerSpeed: 10,
      answerJitter: 0.2, // 使用者自訂隨機抖動 (預設 ±0.2s，最少 0.1s，最高 0.7s)
      autoClickDelay: 500
    }, function(cfg) {
      if (!cfg.enableAutoClick || !targetChoice) return;

      const speed = Math.max(1, Math.min(10, parseInt(cfg.answerSpeed) || 10));
      // 當 speed = 10 (最快): 倍率 1.0x (基準延遲 500ms)
      // 當 speed = 1  (最慢): 倍率 10.0x (基準延遲 5000ms)
      const multiplier = 1 + (10 - speed) * 1.0;
      const baseDelay = 500;
      const targetBaseDelay = baseDelay * multiplier;

      // 擬真隨機抖動機制：由使用者自主設定 (範圍 ±0.1s ~ ±0.7s，預設 ±0.2s)
      const userJitterSec = Math.max(0.1, Math.min(0.7, parseFloat(cfg.answerJitter) || 0.2));
      const jitterRange = Math.round(userJitterSec * 1000);
      const randomFactor = (Math.random() * 2 - 1); // 介於 -1.0 到 +1.0
      const jitter = Math.round(randomFactor * jitterRange);

      // 安全保護下限：確保最快不低於 200ms (確保留有網頁渲染與選項點選反應時間)
      const delay = Math.max(200, Math.round(targetBaseDelay + jitter));

      console.log(`[momo 答題神隊友] 🤖 自動作答就緒 (速度級別: ${speed}/10, 基準: ${targetBaseDelay}ms, 自訂抖動: ±${jitterRange}ms, 實際浮動: ${jitter >= 0 ? '+' : ''}${jitter}ms, 最終延遲: ${delay}ms)，預計執行點擊...`);

      setTimeout(() => {
        // 1. 步驟 1：觸發目標選項擬真點擊 (自動選擇)
        const clicked = triggerOptionClick(targetChoice);
        if (clicked) {
          console.log('[momo 答題神隊友] 🎯 步驟 1：已自動選中目標選項，準備點擊確認...');
          // 2. 步驟 2：Momo 官方前端需要點擊 #KK_actionBtn 確認按鈕！
          // 連鎖點擊延遲：加入 180ms ~ 280ms 擬真輕微隨機微調
          const confirmDelay = Math.round(180 + Math.random() * 100);
          setTimeout(() => {
            const actionBtn = document.getElementById('KK_actionBtn') || document.querySelector('.btn_action');
            if (actionBtn && actionBtn.style.display !== 'none') {
              actionBtn.click();
              console.log('[momo 答題神隊友] 🚀 步驟 2：已連鎖點擊確認按鈕 (#KK_actionBtn)！');
            }
          }, confirmDelay);
        } else {
          console.warn('[momo 答題神隊友] ⚠️ 畫面上未找到對應選項按鈕，切換手動決策面板！');
          showManualDecisionCard(matched, qData);
          markChoicesOnPage(matched, qData.choices);
        }
      }, delay);
    });
  }

  function triggerOptionClick(targetChoice) {
    const el = findOptionElement(targetChoice);
    if (!el) return false;

    try {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

      // 擬真滑鼠 + 指針事件
      el.dispatchEvent(new MouseEvent('mouseover', opts));
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));

      // 原生觸控事件
      if (window.Touch && window.TouchEvent) {
        try {
          const touch = new Touch({ identifier: Date.now(), target: el, clientX: x, clientY: y });
          el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
          el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
        } catch (e) {}
      }

      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      el.click();

      // 支援 React / Next.js 內部 onClick 事件
      for (const key in el) {
        if (key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$')) {
          const props = el[key];
          if (props && typeof props.onClick === 'function') {
            props.onClick({ preventDefault: () => {}, stopPropagation: () => {}, target: el, currentTarget: el });
          }
        }
      }

      // 視覺反饋按壓微縮放
      el.style.transform = 'scale(0.95)';
      setTimeout(() => { el.style.transform = ''; }, 150);

      return true;
    } catch (err) {
      console.warn('[momo 答題神隊友] triggerOptionClick 異常:', err);
      return false;
    }
  }

  function findOptionElement(targetChoice) {
    if (!targetChoice) return null;
    const targetId = targetChoice.choiceId;

    // 1. Momo 官方原生結構：#KK_options li[data-choice-id="UUID"]
    if (targetId) {
      const byOfficial = document.querySelector(`#KK_options li[data-choice-id="${targetId}"]`);
      if (byOfficial) return byOfficial;
      const byAttr = document.querySelector(`[data-choice-id="${targetId}"], [data-id="${targetId}"], [id*="${targetId}"], [value="${targetId}"]`);
      if (byAttr) return byAttr;
    }

    // 2. 指定序號題 (例如指定第 3 個選項 => #KK_options li:nth-child(3))
    if (targetChoice.choiceOrder) {
      const byOrder = document.querySelector(`#KK_options li:nth-child(${targetChoice.choiceOrder})`);
      if (byOrder) return byOrder;
    }

    // 3. 比對文字與圖片內容
    const targetText = (targetChoice.text || '').trim();
    const targetImg = (targetChoice.image || '').split('/').pop().split('?')[0];

    const candidates = document.querySelectorAll('#KK_options li, button, [role="button"], a, label, div');
    for (const el of candidates) {
      if (el.classList.contains('momo-ext-ui') || el.closest('.momo-ext-ui')) continue;
      if (el.offsetWidth > 420 || el.offsetHeight > 200) continue;

      const txt = el.textContent ? el.textContent.trim() : '';
      const imgEl = el.querySelector('img') || (el.tagName === 'IMG' ? el : null);

      if (targetText && txt && (txt === targetText || txt.includes(targetText) || targetText.includes(txt))) {
        if (el.offsetWidth >= 30 && el.offsetHeight >= 20) return el;
      }

      if (targetImg && imgEl) {
        const src = imgEl.getAttribute('src') || '';
        if (src.includes(targetImg)) {
          return el;
        }
      }
    }
    return null;
  }

  function normalizeText(str) {
    if (!str) return '';
    return str.replace(/[\s\-_,，.。?？!！:：()（）~～/／]/g, '').toLowerCase();
  }

  function findMatchingQuestion(qText, qImg) {
    if (!localQuestions || localQuestions.length === 0) return null;

    const cleanQ = normalizeText(qText);
    const qImgBase = qImg ? qImg.split('/').pop().split('?')[0].toLowerCase() : '';

    // =========================================================
    // 軌道 1：題目附帶圖片 (優先以題目圖片 UUID 精準命中)
    // =========================================================
    if (qImgBase) {
      // 步驟 1A: 題目圖片 UUID 絕對精準命中 (100% 官方檔名/UUID 匹配)
      for (const item of localQuestions) {
        const itemQImg = (item.q_img || '').split('/').pop().split('?')[0].toLowerCase();
        if (itemQImg && (itemQImg === qImgBase || itemQImg.includes(qImgBase) || qImgBase.includes(itemQImg))) {
          console.log(`[momo 答題神隊友] 🎯 依題目圖片 UUID 精準命中題庫 #${item.id}：【${item.q}】`);
          return item;
        }
      }

      // 步驟 1B: 兼容以答案圖片欄位儲存題目圖片 UUID (歷史資料兼容)
      for (const item of localQuestions) {
        const itemAnsImg = (item.img_url || '').split('/').pop().split('?')[0].toLowerCase();
        if (itemAnsImg && (itemAnsImg === qImgBase || itemAnsImg.includes(qImgBase) || qImgBase.includes(itemAnsImg))) {
          console.log(`[momo 答題神隊友] 🎯 依答案圖片 UUID 命中題庫 #${item.id}：【${item.q}】`);
          return item;
        }
      }

      // 步驟 1C: 題目文字完全相同，且該題庫題目尚未登記任何圖片 (自動配對升級)
      if (cleanQ) {
        for (const item of localQuestions) {
          const itemQ = normalizeText(item.q);
          const itemQImg = (item.q_img || '').trim();
          if (!itemQImg && itemQ && (cleanQ === itemQ || cleanQ.includes(itemQ) || itemQ.includes(cleanQ))) {
            console.log(`[momo 答題神隊友] 💡 文字命中未登記圖片之題目 #${item.id}，答題結算後將自動綁定圖片進化！`);
            return item;
          }
        }
      }

      // 若文字相同但題庫中已有「不同」的圖片 UUID，絕不盲目冒領，避免 #5 與 #13 互相干擾！
      console.warn(`[momo 答題神隊友] ⚠️ 題目圖片 ${qImgBase} 尚未收錄，安全退避至手動決策！`);
      return null;
    }

    // =========================================================
    // 軌道 2：純文字題目 (Text-only Question)
    // =========================================================
    if (cleanQ) {
      // 優先匹配同樣沒有題目圖片的純文字題目
      for (const item of localQuestions) {
        const itemQ = normalizeText(item.q);
        const itemQImg = (item.q_img || '').trim();
        if (!itemQImg && itemQ && (cleanQ === itemQ || cleanQ.includes(itemQ) || itemQ.includes(cleanQ))) {
          return item;
        }
      }
      // 次選寬鬆匹配
      for (const item of localQuestions) {
        const itemQ = normalizeText(item.q);
        if (itemQ && (cleanQ === itemQ || cleanQ.includes(itemQ) || itemQ.includes(cleanQ))) {
          return item;
        }
      }
    }

    return null;
  }

  function highlightOptionOnPage(matchedItem, targetChoice, choices, isManualOnly = false) {
    // 延遲等待 DOM 渲染完畢
    setTimeout(() => {
      const targetEl = findOptionElement(targetChoice);
      if (targetEl) {
        targetEl.style.outline = '4px solid #10b981';
        targetEl.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.7)';
        targetEl.style.borderRadius = '8px';
        targetEl.style.transition = 'all 0.3s ease';
        targetEl.style.position = 'relative';

        // 加上醒目的正解標籤
        let badge = targetEl.querySelector('.momo-target-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'momo-target-badge momo-ext-ui';
          targetEl.appendChild(badge);
        }
        badge.textContent = isManualOnly ? '🎯 正解 (請點選)' : '🎯 正解';
        badge.style.cssText = `
          position: absolute;
          top: -8px;
          right: 8px;
          background: ${isManualOnly ? '#d97706' : '#10b981'};
          color: #ffffff;
          font-size: 11px;
          font-weight: bold;
          padding: 2px 8px;
          border-radius: 10px;
          z-index: 100;
          pointer-events: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        `;

        // 若為只標記模式，將其他非正解選項進行視覺半透明弱化，一眼即可鎖定正解
        if (isManualOnly && choices && Array.isArray(choices)) {
          choices.forEach(c => {
            if (c !== targetChoice) {
              const otherEl = findOptionElement(c);
              if (otherEl) {
                otherEl.style.opacity = '0.5';
                otherEl.style.filter = 'grayscale(50%)';
                otherEl.style.transition = 'opacity 0.3s ease';
              }
            }
          });
        }
      }
    }, 300);
  }

  // =========================================================
  // 下一步 / 下一題按鈕智慧辨識與精準擬真點擊模組
  // =========================================================
  function findNextStepButton() {
    // 優先順序 1: 官方主要按鈕 #KK_actionBtn
    const officialBtn = document.getElementById('KK_actionBtn');
    if (officialBtn && officialBtn.style.display !== 'none') {
      return officialBtn;
    }

    // 優先順序 2: .box_game-btn 內的連結或按鈕
    const boxBtn = document.querySelector('.box_game-btn a, .box_game-btn button, .btn_action');
    if (boxBtn && boxBtn.style.display !== 'none') {
      return boxBtn;
    }

    // 優先順序 3: 依關鍵文字搜尋按鈕 (包含「下」、「題」、「步」)
    const candidates = document.querySelectorAll('#box_game a, #box_game button, .go_bt, [role="button"]');
    for (const el of candidates) {
      if (el.style.display === 'none' || el.offsetParent === null) continue;
      const t = (el.textContent || '').trim();
      if (t.includes('下') && (t.includes('題') || t.includes('步') || t.includes('頁'))) {
        return el;
      }
    }
    return null;
  }

  function clickNextStepButton(targetEl) {
    const el = targetEl || findNextStepButton();
    if (!el) return false;

    try {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

      // 派發擬真滑鼠與指標事件
      el.dispatchEvent(new MouseEvent('mouseover', opts));
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));

      // 派發觸控事件 (支援手機端 App / 觸控環境)
      if (window.Touch && window.TouchEvent) {
        try {
          const touch = new Touch({ identifier: Date.now(), target: el, clientX: x, clientY: y });
          el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
          el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
        } catch (e) {}
      }

      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      if (typeof el.click === 'function') {
        el.click();
      }
      return true;
    } catch (err) {
      try { el.click(); return true; } catch (e) { return false; }
    }
  }

  function triggerAutoNextStepWatcher() {
    let attempts = 0;
    const maxAttempts = 18; // 輪詢約 3 秒
    const timer = setInterval(() => {
      attempts++;
      const btn = findNextStepButton();
      const text = btn ? (btn.textContent || '').trim() : '';

      // 當按鈕文字已切換為「下一題」或「下一步」，或畫面上已出現答對回饋
      const isReady = btn && (text.includes('下') || document.querySelector('#box_game.is_feedback'));

      if (isReady || attempts >= 4) {
        clearInterval(timer);
        console.log(`[momo 答題神隊友] ⏭️ 偵測到「下一步」按鈕已就緒 (${text})，正在自動觸發點擊！`);
        clickNextStepButton(btn);

        // 350ms 後守門狗二次確認：若按鈕仍顯示且文字仍包含「下」，補點一次確保切換成功
        setTimeout(() => {
          const stillBtn = findNextStepButton();
          const stillText = stillBtn ? (stillBtn.textContent || '').trim() : '';
          if (stillBtn && stillText.includes('下')) {
            clickNextStepButton(stillBtn);
          }
        }, 350);
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 180);
  }

  // =========================================================
  // 處理 2：答題結算時，自動回報官方正解或排除錯誤選項 (協同進化)
  // =========================================================
  let lastReportedQuestionKey = '';

  function handleAnswerRevealed(reportData) {
    dismissManualDecisionCard();

    // 答題結算時，復原被弱化的選項透明度
    document.querySelectorAll('#KK_options li, button, [role="button"]').forEach(el => {
      if (el.style.opacity === '0.5') el.style.opacity = '';
      if (el.style.filter === 'grayscale(50%)') el.style.filter = '';
    });

    chrome.storage.local.get({
      enableAutoReport: true,
      enableAutoClick: true,
      enableAutoNext: true,
      contributedCount: 0
    }, function(cfg) {
      // 1. 若開啟「自動下一步」且答對，啟動主動輪詢點擊「下一題 / 下一步」
      if (cfg.enableAutoNext !== false && reportData.isCorrect) {
        triggerAutoNextStepWatcher();
      }

      if (!cfg.enableAutoReport) return;

      const qText = (reportData.questionText || '').trim();
      const ansText = (reportData.correctText || '').trim();
      const ansImage = (reportData.correctImage || '').trim();
      const failedText = (reportData.failedChoiceText || '').trim();
      const failedImage = (reportData.failedChoiceImage || '').trim();
      let qImg = (reportData.questionImage || '').trim();

      // 若結算未帶 questionImage，嘗試由 DOM 補足
      if (!qImg) {
        const domImg = document.querySelector('#KK_question img, .Area_question img, .quiz_question img, #box_game .question img, .box_question img');
        if (domImg && domImg.src) {
          qImg = domImg.src;
        }
      }

      if (!qText && !qImg) return;

      const isCorrect = Boolean(reportData.isCorrect);

      // 核心升級：答對時須有正解；答錯時須有確認被排除的選項
      if (isCorrect && !ansText && !ansImage) return;
      if (!isCorrect && !failedText && !failedImage) return;

      // 防抖去重：避免同一題因 DOM 與網路攔截雙軌觸發而重複回傳
      const dedupeKey = isCorrect
        ? `${qText}||${qImg}||ANS:${ansText}||${ansImage}`
        : `${qText}||${qImg}||FAIL:${failedText}||${failedImage}`;

      if (lastReportedQuestionKey === dedupeKey) {
        return;
      }
      lastReportedQuestionKey = dedupeKey;

      // 組合錯誤選項清單
      const wrongList = [];
      const wrongImgList = [];

      if (isCorrect) {
        // 答對情況：未選選項均為已知錯誤選項
        (reportData.wrongChoices || []).forEach(c => {
          if (c && c.text && c.text.trim()) wrongList.push(c.text.trim());
          if (c && c.image && c.image.trim()) wrongImgList.push(c.image.trim());
        });
      } else {
        // 答錯情況：剛才點選失敗的項目為明確已知錯誤選項
        if (failedText) wrongList.push(failedText);
        if (failedImage) wrongImgList.push(failedImage);
      }

      const payload = {
        question: qText,
        questionImage: qImg,
        answer: isCorrect ? (ansText || (ansImage ? '[圖片答案]' : '')) : '',
        answerImage: isCorrect ? ansImage : '',
        wrongOptions: wrongList,
        wrongImages: wrongImgList,
        allChoices: reportData.allChoices || [],
        isCorrect: isCorrect,
        submittedAt: new Date().toLocaleString(),
        client: 'momo-evolution-extension-v2'
      };

      console.log(`[momo 答題神隊友] 正在委派 Service Worker 回傳伺服器 (${isCorrect ? '官方正解' : '答錯排除選項'})...`, payload);

      chrome.runtime.sendMessage({
        action: 'autoLearn',
        payload: payload
      }, function() {
        const newCount = (cfg.contributedCount || 0) + 1;
        chrome.storage.local.set({ contributedCount: newCount });
        if (isCorrect) {
          showFloatingNotice(`🎉 感謝貢獻！官方正解已同步全網題庫！(已累積貢獻 ${newCount} 題)`, '#d81e5b');
        } else {
          showFloatingNotice(`💡 已自動將剛才排除的錯誤選項同步全網題庫，加速收斂正解！`, '#f59e0b');
        }
      });
    });
  }

  // =========================================================
  // 手動決策看板模組 (當程式/API無法自動判定時，顯示已知正解與錯誤選項)
  // =========================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function dismissManualDecisionCard() {
    const card = document.getElementById('momo-manual-decision-card');
    if (card) {
      card.remove();
    }
    document.querySelectorAll('.momo-wrong-badge, .momo-cand-badge').forEach(b => b.remove());
    document.querySelectorAll('#KK_options li').forEach(li => {
      li.style.opacity = '';
      li.style.filter = '';
      li.style.border = '';
    });
  }

  function showManualDecisionCard(matched, qData) {
    dismissManualDecisionCard();

    // 動態注入呼吸邊框動畫樣式
    if (!document.getElementById('momo-manual-helper-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'momo-manual-helper-style';
      styleEl.textContent = `
        @keyframes momoPulseBorder {
          0%, 100% { border-color: #ef4444; box-shadow: 0 16px 36px rgba(0,0,0,0.65), 0 0 16px rgba(239, 68, 68, 0.45); }
          50% { border-color: #f59e0b; box-shadow: 0 16px 36px rgba(0,0,0,0.65), 0 0 22px rgba(245, 158, 11, 0.55); }
        }
      `;
      document.head.appendChild(styleEl);
    }

    const card = document.createElement('div');
    card.id = 'momo-manual-decision-card';
    card.className = 'momo-ext-ui';
    card.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 380px;
      background: rgba(24, 24, 27, 0.96);
      backdrop-filter: blur(12px);
      border: 2px solid #ef4444;
      border-radius: 14px;
      padding: 14px 16px;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483647;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65);
      animation: momoPulseBorder 2.2s infinite ease-in-out;
      user-select: none;
    `;

    const knownAns = (matched && matched.ans) ? matched.ans.trim() : '';
    const knownImg = (matched && matched.img_url) ? matched.img_url : '';
    const wrongList = (matched && matched.wrong && matched.wrong.length > 0) ? matched.wrong : [];
    const wrongImgs = (matched && matched.wrong_imgs && matched.wrong_imgs.length > 0) ? matched.wrong_imgs : [];

    const qText = (qData && qData.questionText) ? qData.questionText : '';
    const qImg = (qData && qData.questionImage) ? qData.questionImage : ((matched && matched.q_img) ? matched.q_img : '');

    let qHeaderHtml = '';
    if (qText || qImg) {
      qHeaderHtml = `
        <div style="background: rgba(255,255,255,0.06); border-radius: 8px; padding: 6px 10px; margin-bottom: 8px; font-size: 13px;">
          <div style="font-weight: 600; color: #f3f4f6; margin-bottom: ${qImg ? '4px' : '0'};">${escapeHtml(qText)}</div>
          ${qImg ? `<div style="text-align: center; margin-top: 4px;"><img src="${escapeHtml(qImg)}" style="max-height: 60px; max-width: 120px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: #fff;" onerror="this.style.display='none'"></div>` : ''}
        </div>
      `;
    }

    let ansHtml = '';
    if (knownAns) {
      ansHtml = `
        <div style="background: rgba(16, 185, 129, 0.16); border: 1px solid rgba(16, 185, 129, 0.45); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: #34d399; font-weight: bold; margin-bottom: 2px;">🌟 資料庫已知正解：</div>
          <div style="font-size: 15px; color: #ffffff; font-weight: 800; word-break: break-all;">${escapeHtml(knownAns)}</div>
        </div>
      `;
    } else if (knownImg) {
      ansHtml = `
        <div style="background: rgba(16, 185, 129, 0.16); border: 1px solid rgba(16, 185, 129, 0.45); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: #34d399; font-weight: bold; margin-bottom: 4px;">🌟 資料庫已知正解圖片：</div>
          <img src="${escapeHtml(knownImg)}" style="max-height: 55px; border-radius: 6px; border: 1px solid #10b981; display: block;" />
        </div>
      `;
    } else {
      ansHtml = `
        <div style="background: rgba(59, 130, 246, 0.16); border: 1px solid rgba(59, 130, 246, 0.45); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: #60a5fa; font-weight: bold;">💡 全新或無明確正解題，請參考下方排除選項！</div>
        </div>
      `;
    }

    let wrongHtml = '';
    if (wrongList.length > 0) {
      wrongHtml = `
        <div style="background: rgba(239, 68, 68, 0.16); border: 1px solid rgba(239, 68, 68, 0.45); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: #f87171; font-weight: bold; margin-bottom: 3px;">❌ 資料庫已知錯誤答案 (請避開)：</div>
          <div style="font-size: 13px; color: #fca5a5; font-weight: 600; line-height: 1.4;">${wrongList.map(w => `• ${escapeHtml(w)}`).join('<br>')}</div>
        </div>
      `;
    } else if (wrongImgs.length > 0) {
      wrongHtml = `
        <div style="background: rgba(239, 68, 68, 0.16); border: 1px solid rgba(239, 68, 68, 0.45); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: #f87171; font-weight: bold;">❌ 已記錄 ${wrongImgs.length} 張錯誤選項圖片 (已於畫面標記)</div>
        </div>
      `;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 14px; color: #fbbf24;">
          <span style="font-size: 16px;">⚠️</span>
          <span>無法自動確定，請手動點選！</span>
        </div>
        <button id="momo-close-decision-card" style="background: rgba(255,255,255,0.1); border: none; color: #d1d5db; border-radius: 50%; width: 22px; height: 22px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
      </div>
      ${qHeaderHtml}
      ${ansHtml}
      ${wrongHtml}
      <div style="font-size: 11px; color: #9ca3af; text-align: center; margin-top: 6px;">
        👇 畫面已將錯誤選項打 ❌，請直接手動點選正解
      </div>
    `;

    document.body.appendChild(card);

    const closeBtn = document.getElementById('momo-close-decision-card');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        dismissManualDecisionCard();
      });
    }
  }

  function markChoicesOnPage(matched, choices) {
    if (!choices || choices.length === 0) return;

    const wrongList = (matched && matched.wrong) ? matched.wrong : [];
    const wrongImgs = (matched && matched.wrong_imgs) ? matched.wrong_imgs : [];

    choices.forEach((choice, idx) => {
      const el = findOptionElement(choice) || document.querySelector(`#KK_options li:nth-child(${idx + 1})`);
      if (!el) return;

      const isWrongTxt = wrongList.some(w => w && choice.text && choice.text.trim() === w.trim());
      const isWrongImg = wrongImgs.some(wi => wi && choice.image && choice.image.includes(wi.split('/').pop().split('?')[0]));

      if (isWrongTxt || isWrongImg) {
        el.style.opacity = '0.35';
        el.style.filter = 'grayscale(100%)';
        el.style.border = '2px solid #ef4444';
        el.style.position = 'relative';

        if (!el.querySelector('.momo-wrong-badge')) {
          const badge = document.createElement('span');
          badge.className = 'momo-wrong-badge momo-ext-ui';
          badge.textContent = '❌ 已知錯誤';
          badge.style.cssText = `
            position: absolute;
            top: 4px;
            right: 6px;
            background: #ef4444;
            color: #ffffff;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            z-index: 10;
            pointer-events: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          `;
          el.appendChild(badge);
        }
      } else {
        el.style.border = '2px dashed #f59e0b';
        el.style.position = 'relative';

        if (!el.querySelector('.momo-cand-badge')) {
          const badge = document.createElement('span');
          badge.className = 'momo-cand-badge momo-ext-ui';
          badge.textContent = '👉 推薦選項';
          badge.style.cssText = `
            position: absolute;
            top: 4px;
            right: 6px;
            background: #f59e0b;
            color: #ffffff;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            z-index: 10;
            pointer-events: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          `;
          el.appendChild(badge);
        }
      }
    });
  }

  // =========================================================
  // 畫面懸浮提示框 (半透明、可點擊穿透、居中顯示)
  // =========================================================
  function showFloatingNotice(text, bgColor = '#10b981') {
    let toast = document.getElementById('momo-quiz-buddy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'momo-quiz-buddy-toast';
      toast.style.cssText = `
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%) translateY(-10px);
        z-index: 2147483647;
        color: #ffffff;
        padding: 8px 16px;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        opacity: 0;
        transition: all 0.25s ease;
        pointer-events: none !important;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.25);
        max-width: 90vw;
        text-align: center;
        user-select: none;
      `;
      document.body.appendChild(toast);
    }

    function hexToRgba(hex, alpha = 0.75) {
      let c = (hex || '').replace('#', '');
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      if (c.length === 6) {
        const num = parseInt(c, 16);
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
      }
      return hex;
    }

    toast.style.background = hexToRgba(bgColor, 0.75);
    toast.textContent = text;
    toast.style.opacity = '0.9';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.pointerEvents = 'none';

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 2800);
  }

  // =========================================================
  // 畫面頂端神隊友助手按鈕與設定面板 (遊戲開始時自動隱藏)
  // =========================================================
  let topAssistantBtn = null;

  function setTopAssistantVisible(visible) {
    if (!topAssistantBtn) {
      topAssistantBtn = document.getElementById('momo-ext-top-assistant');
    }
    if (!topAssistantBtn) return;

    if (visible) {
      topAssistantBtn.style.display = 'flex';
      topAssistantBtn.style.pointerEvents = 'auto';
      setTimeout(() => {
        if (topAssistantBtn && topAssistantBtn.style.display !== 'none') {
          topAssistantBtn.style.opacity = '1';
          topAssistantBtn.style.transform = 'translateY(0)';
        }
      }, 20);
    } else {
      topAssistantBtn.style.opacity = '0';
      topAssistantBtn.style.pointerEvents = 'none';
      topAssistantBtn.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (topAssistantBtn && topAssistantBtn.style.opacity === '0') {
          topAssistantBtn.style.display = 'none';
        }
      }, 250);
    }
  }

  function initTopAssistantWidget() {
    if (document.getElementById('momo-ext-top-assistant')) return;

    // 注入頂部按鈕在手機畫框中的定位樣式
    if (!document.getElementById('momo-ext-top-assistant-style')) {
      const st = document.createElement('style');
      st.id = 'momo-ext-top-assistant-style';
      st.textContent = `
        #momo-ext-top-assistant {
          position: fixed;
          top: 10px;
          right: 14px;
          z-index: 2147483640;
        }
        @media (min-width: 450px) {
          html.momo-mobile-active #momo-ext-top-assistant {
            right: calc(50% - 200px) !important;
          }
        }
      `;
      (document.head || document.documentElement).appendChild(st);
    }

    topAssistantBtn = document.createElement('div');
    topAssistantBtn.id = 'momo-ext-top-assistant';
    topAssistantBtn.className = 'momo-ext-ui';
    topAssistantBtn.innerHTML = `
      <span style="font-size: 13px;">⚙️</span>
      <span style="font-weight: 700; letter-spacing: 0.5px;">神隊友設定</span>
    `;
    topAssistantBtn.style.cssText = `
      background: rgba(30, 41, 59, 0.9);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 20px;
      color: #ffffff;
      padding: 5px 12px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      transition: opacity 0.25s ease, transform 0.2s ease, background 0.2s ease;
      user-select: none;
    `;

    topAssistantBtn.addEventListener('mouseenter', () => {
      topAssistantBtn.style.background = 'rgba(51, 65, 85, 0.98)';
      topAssistantBtn.style.transform = 'translateY(-1px) scale(1.02)';
    });
    topAssistantBtn.addEventListener('mouseleave', () => {
      topAssistantBtn.style.background = 'rgba(30, 41, 59, 0.9)';
      topAssistantBtn.style.transform = 'none';
    });

    topAssistantBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettingsModal();
    });

    (document.body || document.documentElement).appendChild(topAssistantBtn);

    // 檢查遊戲狀態切換
    function checkGameActive() {
      const boxGame = document.getElementById('box_game');
      const isPlaying = boxGame && boxGame.style.display !== 'none' && !boxGame.classList.contains('is_hide');
      setTopAssistantVisible(!isPlaying);
    }

    // 1. 點擊開始遊戲按鈕時，立即自動隱藏
    document.addEventListener('click', (e) => {
      const isPlay = e.target && (e.target.id === 'btn_play' || e.target.closest('#btn_play') || (e.target.className && String(e.target.className).includes('btn-play')));
      if (isPlay) {
        setTopAssistantVisible(false);
      }
      const isBack = e.target && (e.target.closest('#KK_backBtn') || e.target.closest('#KK_goBackBtn'));
      if (isBack) {
        setTopAssistantVisible(true);
      }
    }, true);

    // 2. 題目載入事件 (遊戲進行中)
    window.addEventListener('message', (e) => {
      if (e.data && e.data.source === 'MOMO_QUIZ_INJECTED' && e.data.type === 'QUESTION_LOADED') {
        setTopAssistantVisible(false);
      }
    });

    // 3. MutationObserver 動態偵測
    const stateObserver = new MutationObserver(() => {
      checkGameActive();
    });
    stateObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    checkGameActive();
  }

  function openSettingsModal() {
    let modal = document.getElementById('momo-ext-settings-modal');
    if (modal) modal.remove();

    chrome.storage.local.get({
      enableAutoClick: true,
      enableAutoNext: true,
      answerSpeed: 10,
      answerJitter: 0.2
    }, function(cfg) {
      modal = document.createElement('div');
      modal.id = 'momo-ext-settings-modal';
      modal.className = 'momo-ext-ui';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        user-select: none;
      `;

      function getSpeedInfo(speed, jitter) {
        const s = Math.max(1, Math.min(10, parseInt(speed) || 10));
        const j = Math.max(0.1, Math.min(0.7, parseFloat(jitter) || 0.2));
        const baseSec = (0.5 * (1 + (10 - s))).toFixed(1);
        const jStr = `±${j.toFixed(1)}s`;
        if (s === 10) return { text: `⚡ 最快 (約0.5s ${jStr})`, color: '#10b981', desc: `平均約 0.5 秒 (隨機 ${jStr} 浮動)` };
        if (s >= 8) return { text: `🚀 快速 (約${baseSec}s ${jStr})`, color: '#10b981', desc: `平均約 ${baseSec} 秒 (隨機 ${jStr} 浮動)` };
        if (s >= 5) return { text: `🚶 中速 (約${baseSec}s ${jStr})`, color: '#3b82f6', desc: `平均約 ${baseSec} 秒 (隨機 ${jStr} 浮動)` };
        if (s >= 2) return { text: `⏳ 慢速 (約${baseSec}s ${jStr})`, color: '#f59e0b', desc: `平均約 ${baseSec} 秒 (隨機 ${jStr} 浮動)` };
        return { text: `🐢 最慢 (約${baseSec}s ${jStr})`, color: '#ef4444', desc: `平均約 ${baseSec} 秒 (隨機 ${jStr} 浮動)` };
      }

      const spd = cfg.answerSpeed || 10;
      const jtr = parseFloat(cfg.answerJitter) || 0.2;
      const initialSpeed = getSpeedInfo(spd, jtr);

      modal.innerHTML = `
        <div id="momo-modal-card" style="background: rgba(24, 24, 27, 0.96); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 16px; width: 100%; max-width: 380px; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); color: #ffffff;">
          <!-- 頂部標題 -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 16px; color: #f3f4f6;">
              <span style="font-size: 18px;">⚙️</span>
              <span>神隊友手機助手設定</span>
            </div>
            <button id="momo-modal-close-btn" style="background: rgba(255,255,255,0.1); border: none; color: #cbd5e1; border-radius: 50%; width: 28px; height: 28px; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
          </div>

          <!-- 開關 1: 自動選擇正解 -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc;">🤖 自動選擇正解</div>
              <div id="momo-modal-autoclick-desc" style="font-size: 11px; color: ${cfg.enableAutoClick ? '#34d399' : '#f59e0b'}; margin-top: 2px;">
                ${cfg.enableAutoClick ? '🟢 已開啟：找到正解時自動勾選' : '🟠 已關閉：只標記正解，不自動點選'}
              </div>
            </div>
            <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
              <input type="checkbox" id="momo-modal-toggle-autoclick" ${cfg.enableAutoClick ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span id="momo-slider-autoclick" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ${cfg.enableAutoClick ? '#10b981' : '#475569'}; border-radius: 24px; transition: 0.3s;"></span>
              <span id="momo-dot-autoclick" style="position: absolute; content: ''; height: 18px; width: 18px; left: ${cfg.enableAutoClick ? '23px' : '3px'}; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s;"></span>
            </label>
          </div>

          <!-- 開關 2: 自動點擊下一步 -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc;">⏩ 自動點擊下一步</div>
              <div id="momo-modal-autonext-desc" style="font-size: 11px; color: ${cfg.enableAutoNext !== false ? '#34d399' : '#94a3b8'}; margin-top: 2px;">
                ${cfg.enableAutoNext !== false ? '🟢 已開啟：答對後自動進入下一題' : '⚪ 已關閉：手動點擊下一步'}
              </div>
            </div>
            <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
              <input type="checkbox" id="momo-modal-toggle-autonext" ${cfg.enableAutoNext !== false ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span id="momo-slider-autonext" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ${cfg.enableAutoNext !== false ? '#10b981' : '#475569'}; border-radius: 24px; transition: 0.3s;"></span>
              <span id="momo-dot-autonext" style="position: absolute; content: ''; height: 18px; width: 18px; left: ${cfg.enableAutoNext !== false ? '23px' : '3px'}; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s;"></span>
            </label>
          </div>

          <!-- 設定項 3: 答題速度調整 (左右滑桿) -->
          <div style="padding: 12px 0 6px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc;">⏱️ 答題速度調整</div>
              <span id="momo-modal-speed-badge" style="font-size: 11px; font-weight: 700; color: ${initialSpeed.color}; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px;">
                ${initialSpeed.text}
              </span>
            </div>
            <div style="padding: 6px 0;">
              <input type="range" id="momo-modal-speed-slider" min="1" max="10" step="1" value="${spd}" style="width: 100%; accent-color: #8b5cf6; cursor: pointer; height: 6px; border-radius: 3px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-top: 4px; font-weight: 600;">
                <span>🐢 最慢 (1/10 速度)</span>
                <span>⚡ 目前最快 (1.0x)</span>
              </div>
            </div>
          </div>

          <!-- 設定項 4: 隨機抖動範圍調整 (左右滑桿 ±0.1s ~ ±0.7s) -->
          <div style="padding: 10px 0 6px 0; border-top: 1px solid rgba(255,255,255,0.08); margin-top: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc;">🎲 隨機抖動範圍</div>
              <span id="momo-modal-jitter-badge" style="font-size: 11px; font-weight: 700; color: #f59e0b; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); padding: 2px 8px; border-radius: 10px;">
                ±${jtr.toFixed(1)} 秒
              </span>
            </div>
            <div style="padding: 6px 0;">
              <input type="range" id="momo-modal-jitter-slider" min="0.1" max="0.7" step="0.1" value="${jtr}" style="width: 100%; accent-color: #f59e0b; cursor: pointer; height: 6px; border-radius: 3px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-top: 4px; font-weight: 600;">
                <span>🎯 最少 (±0.1s)</span>
                <span>🌊 最高 (±0.7s)</span>
              </div>
            </div>
            <div id="momo-modal-speed-desc" style="font-size: 11px; color: #cbd5e1; text-align: center; margin-top: 6px; background: rgba(255,255,255,0.06); padding: 6px; border-radius: 8px;">
              💡 目前設定：${initialSpeed.text}（${initialSpeed.desc}）
            </div>
          </div>

          <!-- Cookie 槽位管理 -->
          <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.12);">
            <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 8px;">🍪 Cookie 帳號槽位管理</div>
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 10px;">選擇槽位 (1~9)，再按儲存或讀取</div>
            <!-- 9 個槽位按鈕 -->
            <div id="momo-cookie-slots" style="display: grid; grid-template-columns: repeat(9, 1fr); gap: 5px; margin-bottom: 10px;">
              ${[1,2,3,4,5,6,7,8,9].map(i => `
                <button data-slot="${i}" class="momo-slot-btn" style="
                  aspect-ratio: 1/1;
                  background: rgba(255,255,255,0.07);
                  border: 2px solid rgba(255,255,255,0.15);
                  border-radius: 8px;
                  color: #cbd5e1;
                  font-size: 14px;
                  font-weight: 700;
                  cursor: pointer;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  padding: 0;
                  position: relative;
                  transition: all 0.2s;
                  min-height: 34px;
                ">${i}</button>
              `).join('')}
            </div>
            <!-- 槽位狀態說明 -->
            <div id="momo-slot-status" style="font-size: 11px; color: #94a3b8; text-align: center; background: rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 8px; margin-bottom: 10px; min-height: 18px;">
              請先選擇一個槽位 (1~9)
            </div>
            <!-- 儲存 / 讀取 按鈕 -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button id="momo-cookie-save-btn" style="
                padding: 9px 0;
                background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                border: none; border-radius: 9px;
                color: #fff; font-weight: 700; font-size: 13px;
                cursor: not-allowed; opacity: 0.5;
                box-shadow: 0 3px 10px rgba(59,130,246,0.3);
              ">💾 儲存 Cookie</button>
              <button id="momo-cookie-load-btn" style="
                padding: 9px 0;
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                border: none; border-radius: 9px;
                color: #fff; font-weight: 700; font-size: 13px;
                cursor: not-allowed; opacity: 0.5;
                box-shadow: 0 3px 10px rgba(139,92,246,0.3);
              ">📂 讀取 Cookie</button>
            </div>
          </div>

          <!-- 關閉按鈕 -->
          <button id="momo-modal-save-btn" style="width: 100%; margin-top: 14px; padding: 10px; background: linear-gradient(135deg, #10b981, #059669); border: none; border-radius: 10px; color: #ffffff; font-weight: 700; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
            關閉設定
          </button>
        </div>
      `;

      document.body.appendChild(modal);

      function closeModal() {
        if (modal) modal.remove();
      }
      document.getElementById('momo-modal-close-btn').addEventListener('click', closeModal);
      document.getElementById('momo-modal-save-btn').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      const chkAutoClick = document.getElementById('momo-modal-toggle-autoclick');
      chkAutoClick.addEventListener('change', () => {
        const checked = chkAutoClick.checked;
        document.getElementById('momo-slider-autoclick').style.background = checked ? '#10b981' : '#475569';
        document.getElementById('momo-dot-autoclick').style.left = checked ? '23px' : '3px';
        const desc = document.getElementById('momo-modal-autoclick-desc');
        desc.textContent = checked ? '🟢 已開啟：找到正解時自動勾選' : '🟠 已關閉：只標記正解，不自動點選';
        desc.style.color = checked ? '#34d399' : '#f59e0b';
        chrome.storage.local.set({ enableAutoClick: checked });
      });

      const chkAutoNext = document.getElementById('momo-modal-toggle-autonext');
      chkAutoNext.addEventListener('change', () => {
        const checked = chkAutoNext.checked;
        document.getElementById('momo-slider-autonext').style.background = checked ? '#10b981' : '#475569';
        document.getElementById('momo-dot-autonext').style.left = checked ? '23px' : '3px';
        const desc = document.getElementById('momo-modal-autonext-desc');
        desc.textContent = checked ? '🟢 已開啟：答對後自動進入下一題' : '⚪ 已關閉：手動點擊下一步';
        desc.style.color = checked ? '#34d399' : '#94a3b8';
        chrome.storage.local.set({ enableAutoNext: checked });
      });

      const speedSlider = document.getElementById('momo-modal-speed-slider');
      const jitterSlider = document.getElementById('momo-modal-jitter-slider');

      function refreshModalDisplays() {
        const sVal = parseInt(speedSlider ? speedSlider.value : 10) || 10;
        const jVal = parseFloat(jitterSlider ? jitterSlider.value : 0.2) || 0.2;
        const info = getSpeedInfo(sVal, jVal);

        const badge = document.getElementById('momo-modal-speed-badge');
        if (badge) {
          badge.textContent = info.text;
          badge.style.color = info.color;
        }
        const jBadge = document.getElementById('momo-modal-jitter-badge');
        if (jBadge) {
          jBadge.textContent = `±${jVal.toFixed(1)} 秒`;
        }
        const descEl = document.getElementById('momo-modal-speed-desc');
        if (descEl) {
          descEl.textContent = `💡 目前設定：${info.text}（${info.desc}）`;
        }
      }

      if (speedSlider) {
        speedSlider.addEventListener('input', () => {
          refreshModalDisplays();
          chrome.storage.local.set({ answerSpeed: parseInt(speedSlider.value) || 10 });
        });
      }

      if (jitterSlider) {
        jitterSlider.addEventListener('input', () => {
          refreshModalDisplays();
          chrome.storage.local.set({ answerJitter: parseFloat(jitterSlider.value) || 0.2 });
        });
      }

      // ── Cookie 槽位管理 ──────────────────────────────────────
      let selectedSlot = null;

      function showToast(msg, color = '#10b981') {
        let toast = document.getElementById('momo-slot-toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = 'momo-slot-toast';
          toast.style.cssText = `
            position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
            background: rgba(24,24,27,0.97); border: 1px solid rgba(255,255,255,0.2);
            color: #fff; padding: 10px 20px; border-radius: 12px;
            font-size: 13px; font-weight: 700; z-index: 2147483647;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            transition: opacity 0.4s;
          `;
          (document.body || document.documentElement).appendChild(toast);
        }
        toast.style.color = color;
        toast.textContent = msg;
        toast.style.opacity = '1';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
      }

      function updateSlotButtons(slotsInfo) {
        document.querySelectorAll('.momo-slot-btn').forEach(btn => {
          const n = parseInt(btn.dataset.slot);
          const meta = slotsInfo && slotsInfo[n];
          const isSelected = (n === selectedSlot);
          btn.style.borderColor = isSelected ? '#8b5cf6' : (meta ? '#10b981' : 'rgba(255,255,255,0.15)');
          btn.style.background = isSelected ? 'rgba(139,92,246,0.3)' : (meta ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.07)');
          btn.style.color = isSelected ? '#c4b5fd' : (meta ? '#34d399' : '#cbd5e1');
          if (meta) {
            const uName = meta.userName || '已存';
            btn.title = `槽位 ${n}【${uName}】(${meta.count}個Cookie)`;
          } else {
            btn.title = `槽位 ${n} (空)`;
          }
          // 小點標示有資料
          let dot = btn.querySelector('.slot-dot');
          if (meta) {
            if (!dot) {
              dot = document.createElement('span');
              dot.className = 'slot-dot';
              dot.style.cssText = 'position:absolute;top:3px;right:4px;width:5px;height:5px;background:#10b981;border-radius:50%;';
              btn.appendChild(dot);
            }
          } else {
            if (dot) dot.remove();
          }
        });
      }

      function updateActionButtons() {
        const saveBtn = document.getElementById('momo-cookie-save-btn');
        const loadBtn = document.getElementById('momo-cookie-load-btn');
        if (!saveBtn || !loadBtn) return;
        const enabled = selectedSlot !== null;
        saveBtn.style.opacity = enabled ? '1' : '0.5';
        saveBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
        loadBtn.style.opacity = enabled ? '1' : '0.5';
        loadBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
      }

      // 初始載入槽位資訊
      let currentSlotsInfo = {};
      chrome.runtime.sendMessage({ action: 'getCookieSlotsInfo' }, (res) => {
        if (res) {
          currentSlotsInfo = res;
          updateSlotButtons(currentSlotsInfo);
        }
      });

      // 槽位按鈕點擊
      document.getElementById('momo-cookie-slots').addEventListener('click', (e) => {
        const btn = e.target.closest('.momo-slot-btn');
        if (!btn) return;
        const n = parseInt(btn.dataset.slot);
        selectedSlot = (selectedSlot === n) ? null : n; // 再次點擊取消選擇
        updateSlotButtons(currentSlotsInfo);
        updateActionButtons();
        const statusEl = document.getElementById('momo-slot-status');
        if (selectedSlot === null) {
          statusEl.textContent = '請先選擇一個槽位 (1~9)';
          statusEl.style.color = '#94a3b8';
        } else {
          const meta = currentSlotsInfo[selectedSlot];
          if (meta) {
            const userTag = meta.userName ? `【${meta.userName}】` : '';
            statusEl.innerHTML = `✅ 槽位 ${selectedSlot}${userTag} · ${meta.count} 個 Cookie · 存於 ${meta.savedAt}`;
            statusEl.style.color = '#34d399';
          } else {
            statusEl.textContent = `⬜ 槽位 ${selectedSlot} 目前為空 (讀取將清除所有登入 Cookie)`;
            statusEl.style.color = '#f59e0b';
          }
        }
      });

      // 儲存按鈕
      document.getElementById('momo-cookie-save-btn').addEventListener('click', () => {
        if (selectedSlot === null) return;
        const saveBtn = document.getElementById('momo-cookie-save-btn');
        saveBtn.textContent = '⏳ 儲存中...';
        saveBtn.disabled = true;
        chrome.runtime.sendMessage({ action: 'saveCookiesToSlot', slot: selectedSlot }, (res) => {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 儲存 Cookie';
          if (res && res.success) {
            currentSlotsInfo[selectedSlot] = res.meta;
            updateSlotButtons(currentSlotsInfo);
            const statusEl = document.getElementById('momo-slot-status');
            const userTag = res.meta.userName ? `【${res.meta.userName}】` : '';
            statusEl.innerHTML = `✅ 槽位 ${selectedSlot}${userTag} 已儲存 ${res.count} 個 Cookie`;
            statusEl.style.color = '#34d399';
            showToast(`✅ 槽位 ${selectedSlot}${userTag} 已儲存 ${res.count} 個 Cookie！`);
            if (!res.meta.isLoggedIn) {
              alert('⚠️ 提示：目前 momo 似乎未登入 (未偵測到 LOGINSESSION 或 st)！\n此槽位儲存為登出狀態，未來讀取時將會處於未登入。');
            }
          } else {
            showToast('❌ 儲存失敗，請再試一次', '#ef4444');
          }
        });
      });

      // 讀取按鈕
      document.getElementById('momo-cookie-load-btn').addEventListener('click', () => {
        if (selectedSlot === null) return;
        const meta = currentSlotsInfo[selectedSlot];
        const userTag = (meta && meta.userName) ? `【${meta.userName}】` : '';
        const confirmMsg = meta
          ? `確定要讀取槽位 ${selectedSlot}${userTag} 的 Cookie？\n(將覆蓋目前登入狀態，頁面會自動重新載入)`
          : `槽位 ${selectedSlot} 為空，讀取將清除所有 MOMO Cookie (登出狀態)\n確定繼續？`;
        if (!window.confirm(confirmMsg)) return;
        const loadBtn = document.getElementById('momo-cookie-load-btn');
        loadBtn.textContent = '⏳ 讀取中...';
        loadBtn.disabled = true;
        chrome.runtime.sendMessage({ action: 'loadCookiesFromSlot', slot: selectedSlot }, (res) => {
          if (res && res.success) {
            const restoredTag = res.userName ? `【${res.userName}】` : '';
            const msg = res.action === 'restored'
              ? `📂 槽位 ${selectedSlot}${restoredTag} 已還原 ${res.count} 個 Cookie，即將重新載入...`
              : `🧹 已清除所有 Cookie (空槽位)，即將重新載入...`;
            showToast(msg, '#8b5cf6');
            setTimeout(() => { window.location.reload(); }, 800);
          } else {
            loadBtn.disabled = false;
            loadBtn.textContent = '📂 讀取 Cookie';
            showToast('❌ 讀取失敗，請再試一次', '#ef4444');
          }
        });
      });
    });
  }

  // 初始載入頂端助手按鈕
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTopAssistantWidget);
  } else {
    initTopAssistantWidget();
  }

  // 監聽外部設定變更
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.enableMobileView) {
        applyMobileFrame(changes.enableMobileView.newValue);
      }
    }
  });

})();
