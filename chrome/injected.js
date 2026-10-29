// =========================================================
// momo 答題神隊友 - injected.js (在網頁主環境 MAIN 執行)
// 負責：
// 1. 極簡零副作用 App 檢測放行 (只放行 edmShare.isApp，絕不竄改 UA 與 Cookie)
// 2. 攔截 Momo 官方答題 API 的 fetch 與 XMLHttpRequest
// =========================================================

(function() {
  console.log('[momo 答題神隊友] 網路攔截核心與極簡放行引擎已就緒！');

  // =========================================================
  // 0. 極簡零副作用 App 檢測放行（最少篡改原則）
  // 僅劫持 edmShare.isApp 與 isInMomoApp，絕不竄改 User-Agent / Screen / 登入狀態
  // =========================================================
  (function initMinimalAppBypass() {
    let _edmShare = window.edmShare;
    try {
      Object.defineProperty(window, 'edmShare', {
        get: () => _edmShare,
        set: (val) => {
          _edmShare = val;
          if (_edmShare && typeof _edmShare === 'object') {
            _edmShare.isApp = () => true;
          }
        },
        configurable: true
      });
    } catch (e) {}

    try {
      Object.defineProperty(window, 'isInMomoApp', {
        get: () => () => true,
        set: () => {},
        configurable: true
      });
    } catch (e) {}

    const timer = setInterval(() => {
      if (window.edmShare && !window.edmShare.__isAppBypassed) {
        window.edmShare.isApp = () => true;
        window.edmShare.__isAppBypassed = true;
      }
      window.isInMomoApp = () => true;
    }, 50);
    setTimeout(() => clearInterval(timer), 8000);
  })();

  // =========================================================
  // 1. 滑鼠自動轉觸控事件模擬 (支援手機端點擊觸控)
  // =========================================================
  try {
    let isMouseDown = false;

    function buildTouch(e) {
      return new Touch({
        identifier: Date.now(),
        target: e.target,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        pageX: e.pageX,
        pageY: e.pageY
      });
    }

    function dispatchTouch(type, e, touch) {
      try {
        const touchEvent = new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          touches: type === 'touchend' ? [] : [touch],
          targetTouches: type === 'touchend' ? [] : [touch],
          changedTouches: [touch]
        });
        e.target.dispatchEvent(touchEvent);
      } catch (err) {}
    }

    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.momo-ext-ui')) return;
      isMouseDown = true;
      dispatchTouch('touchstart', e, buildTouch(e));
    }, true);

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      if (e.target && e.target.closest && e.target.closest('.momo-ext-ui')) return;
      dispatchTouch('touchmove', e, buildTouch(e));
    }, true);

    window.addEventListener('mouseup', (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      dispatchTouch('touchend', e, buildTouch(e));
    }, true);
  } catch (e) {
    console.warn('[momo 答題神隊友] 觸控事件模擬初始化失敗:', e);
  }

  // =========================================================
  // 2. 攔截答題與結算 API & 隱身 API 補刀引擎
  // =========================================================
  let currentQuestion = null;
  let lastQuizUrl = '';
  let lastQuizHeaders = {};
  let lastSubmittedAnswerId = null;

  // 監聽使用者在畫面選項上的點擊 (備份最後點選之 choiceId)
  document.addEventListener('click', (e) => {
    try {
      const li = e.target.closest && e.target.closest('#KK_options li');
      if (li && li.dataset && li.dataset.choiceId) {
        lastSubmittedAnswerId = li.dataset.choiceId;
      }
    } catch (err) {}
  }, true);

  function notifyExtension(type, payload) {
    try {
      window.postMessage({
        source: 'MOMO_QUIZ_INJECTED',
        type: type,
        data: payload
      }, '*');
    } catch (e) {
      console.warn('[momo 答題神隊友] postMessage 失敗:', e);
    }
  }

  function inspectPayload(url, json, submittedAnswerId) {
    if (!json || typeof json !== 'object') return;

    // 1. 偵測題目載入 (含 question 及 choices)
    const root = json.data || json;
    if (root.question && Array.isArray(root.choices) && root.choices.length > 0) {
      const qImg = (root.question && (root.question.image || root.question.img || root.question.imgUrl || root.question.pic)) 
        || root.questionImage || root.questionImg || root.img || root.pic || '';

      currentQuestion = {
        questionId: root.questionId || (root.question && root.question.uuid) || (root.question && root.question.id) || '',
        activityId: root.activityId || '',
        questionText: (typeof root.question === 'string') ? root.question : (root.question.text || root.question.title || ''),
        questionImage: qImg,
        choices: root.choices.map(c => ({
          choiceId: c.uuid || c.choiceId || c.id || '',
          text: (c.text || c.title || c.val || '').trim(),
          image: (c.image || c.img || c.imgUrl || '').trim()
        }))
      };
      console.log('[momo 答題神隊友] 偵測到題目載入:', currentQuestion.questionText, '題目圖片:', qImg);
      notifyExtension('QUESTION_LOADED', currentQuestion);
    }

    // 2. 偵測答題結算結果 (含 isCorrect 與 correctAnswerId，支援答對與答錯雙向回報)
    const hasIsCorrect = ('isCorrect' in root) || ('is_correct' in root) || ('correct' in root);
    if (hasIsCorrect && currentQuestion) {
      const isCorrect = Boolean(root.isCorrect || root.is_correct || root.correct);
      let correctId = root.correctAnswerId || root.correctChoiceId || root.correctId || root.answerId;
      const actualSubmittedId = submittedAnswerId || lastSubmittedAnswerId;

      // 核心關鍵修正：momo 官方結算 API 只回傳 { isCorrect: true }，若答對則正解就是剛才送出的 answerId！
      if (!correctId && isCorrect && actualSubmittedId) {
        correctId = actualSubmittedId;
      }

      console.log(`[momo 答題神隊友] 偵測到答題結算！是否答對: ${isCorrect}, 正解ID: ${correctId || '未知'}, 送出ID: ${actualSubmittedId || '無'}`);

      let correctChoice = null;
      let failedChoice = null;
      const wrongChoices = [];

      currentQuestion.choices.forEach(c => {
        if (correctId && c.choiceId === correctId) {
          correctChoice = c;
        } else if (!isCorrect && actualSubmittedId && c.choiceId === actualSubmittedId) {
          failedChoice = c;
          wrongChoices.push(c);
        } else {
          wrongChoices.push(c);
        }
      });

      const reportData = {
        questionText: currentQuestion.questionText,
        questionImage: currentQuestion.questionImage,
        questionId: currentQuestion.questionId,
        activityId: currentQuestion.activityId,
        correctAnswerId: correctId || '',
        correctText: correctChoice ? correctChoice.text : '',
        correctImage: correctChoice ? correctChoice.image : '',
        failedChoiceId: failedChoice ? failedChoice.choiceId : '',
        failedChoiceText: failedChoice ? failedChoice.text : '',
        failedChoiceImage: failedChoice ? failedChoice.image : '',
        allChoices: currentQuestion.choices,
        wrongChoices: wrongChoices,
        isCorrect: isCorrect,
        timestamp: new Date().toISOString()
      };

      notifyExtension('ANSWER_REVEALED', reportData);
    }
  }

  // 攔截 window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = (args[0] && typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url ? args[0].url : '');
    let submittedAnswerId = null;

    // 攔截答題請求 Body 中的 answerId
    if (args[1] && args[1].body) {
      try {
        const reqBody = typeof args[1].body === 'string' ? JSON.parse(args[1].body) : args[1].body;
        if (reqBody && (reqBody.answerId || reqBody.choiceId)) {
          submittedAnswerId = reqBody.answerId || reqBody.choiceId;
          lastSubmittedAnswerId = submittedAnswerId;
        }
      } catch (e) {}
    }

    const response = await originalFetch.apply(this, args);
    try {
      if (url.includes('quiz') || url.includes('activity') || url.includes('game') || url.includes('mmp')) {
        lastQuizUrl = url;
        if (args[1] && args[1].headers) {
          lastQuizHeaders = args[1].headers;
        }
        const clone = response.clone();
        clone.json().then(data => {
          inspectPayload(url, data, submittedAnswerId || lastSubmittedAnswerId);
        }).catch(() => {});
      }
    } catch (err) {}
    return response;
  };

  // 攔截 XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new originalXHR();
    let requestUrl = '';
    let xhrSubmittedAnswerId = null;

    const origOpen = xhr.open;
    xhr.open = function(method, url, ...rest) {
      requestUrl = url;
      return origOpen.apply(xhr, [method, url, ...rest]);
    };

    const origSend = xhr.send;
    xhr.send = function(body) {
      if (body && (requestUrl.includes('quiz') || requestUrl.includes('activity') || requestUrl.includes('game') || requestUrl.includes('mmp'))) {
        try {
          const reqBody = typeof body === 'string' ? JSON.parse(body) : body;
          if (reqBody && (reqBody.answerId || reqBody.choiceId)) {
            xhrSubmittedAnswerId = reqBody.answerId || reqBody.choiceId;
            lastSubmittedAnswerId = xhrSubmittedAnswerId;
          }
        } catch (e) {}
      }
      return origSend.apply(xhr, arguments);
    };

    xhr.addEventListener('load', function() {
      try {
        if (requestUrl && (requestUrl.includes('quiz') || requestUrl.includes('activity') || requestUrl.includes('game') || requestUrl.includes('mmp'))) {
          lastQuizUrl = requestUrl;
          const contentType = xhr.getResponseHeader('content-type') || '';
          if (contentType.includes('json') || xhr.responseType === 'json' || typeof xhr.responseText === 'string') {
            const data = (xhr.responseType === 'json' && xhr.response) ? xhr.response : JSON.parse(xhr.responseText);
            inspectPayload(requestUrl, data, xhrSubmittedAnswerId || lastSubmittedAnswerId);
          }
        }
      } catch (e) {}
    });

    return xhr;
  }
  PatchedXHR.prototype = originalXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

})();
