// =========================================================
// momo 答題神隊友 - popup.js
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  const bankStatusEl = document.getElementById('bankStatus');
  const bankCountEl = document.getElementById('bankCount');
  const contributedCountEl = document.getElementById('contributedCount');
  const btnStep2OpenWindow = document.getElementById('btnStep2OpenWindow');
  const btnSync = document.getElementById('btnSync');

  const MOMO_QUIZ_URL = 'https://www.momoshop.com.tw/edm/cmmedm.jsp?npn=1vEJn4Ny1oqt&n=1&viewport=mobile';

  const toggleAutoClick = document.getElementById('toggleAutoClick');
  const autoClickDesc = document.getElementById('autoClickDesc');
  const toggleAutoNext = document.getElementById('toggleAutoNext');
  const autoNextDesc = document.getElementById('autoNextDesc');
  const rangeAnswerSpeed = document.getElementById('rangeAnswerSpeed');
  const speedValueBadge = document.getElementById('speedValueBadge');
  const rangeAnswerJitter = document.getElementById('rangeAnswerJitter');
  const jitterValueBadge = document.getElementById('jitterValueBadge');

  function getSpeedInfo(speed, jitter) {
    const s = Math.max(1, Math.min(10, parseInt(speed) || 10));
    const j = Math.max(0.1, Math.min(0.7, parseFloat(jitter) || 0.2));
    const baseSec = (0.5 * (1 + (10 - s))).toFixed(1);
    const jStr = `±${j.toFixed(1)}s`;
    if (s === 10) return { text: `⚡ 最快 (約0.5s ${jStr})`, color: '#10b981' };
    if (s >= 8) return { text: `🚀 快速 (約${baseSec}s ${jStr})`, color: '#10b981' };
    if (s >= 5) return { text: `🚶 中速 (約${baseSec}s ${jStr})`, color: '#3b82f6' };
    if (s >= 2) return { text: `⏳ 慢速 (約${baseSec}s ${jStr})`, color: '#f59e0b' };
    return { text: `🐢 最慢 (約${baseSec}s ${jStr})`, color: '#ef4444' };
  }

  function updateDisplays(speed, jitter) {
    const s = speed !== undefined ? speed : (parseInt(rangeAnswerSpeed ? rangeAnswerSpeed.value : 10) || 10);
    const j = jitter !== undefined ? jitter : (parseFloat(rangeAnswerJitter ? rangeAnswerJitter.value : 0.2) || 0.2);

    if (speedValueBadge) {
      const info = getSpeedInfo(s, j);
      speedValueBadge.textContent = info.text;
      speedValueBadge.style.color = info.color;
    }
    if (jitterValueBadge) {
      jitterValueBadge.textContent = `±${j.toFixed(1)} 秒`;
    }
  }

  function updateSpeedDisplay(speed) {
    updateDisplays(speed, undefined);
  }

  function updateAutoClickDesc(enabled) {
    if (!autoClickDesc) return;
    if (enabled) {
      autoClickDesc.textContent = '🟢 已開啟：找到正解時自動勾選目標選項';
      autoClickDesc.style.color = '#10b981';
    } else {
      autoClickDesc.textContent = '🟠 已關閉：只標記高亮正解，不自動點選';
      autoClickDesc.style.color = '#f59e0b';
    }
  }

  function updateAutoNextDesc(enabled) {
    if (!autoNextDesc) return;
    if (enabled) {
      autoNextDesc.textContent = '🟢 已開啟：答對後自動點擊按鈕進入下一題';
      autoNextDesc.style.color = '#10b981';
    } else {
      autoNextDesc.textContent = '⚪ 已關閉：答對後停留畫面，手動點擊下一步';
      autoNextDesc.style.color = '#94a3b8';
    }
  }

  // 1. 讀取並維持使用者開關設定
  chrome.storage.local.get({
    enableMobileView: true,
    enableAutoClick: true,
    enableAutoNext: true,
    answerSpeed: 10,
    answerJitter: 0.2,
    enableHighlight: true,
    enableAutoReport: true
  }, (cfg) => {
    if (toggleAutoClick) {
      toggleAutoClick.checked = cfg.enableAutoClick;
      updateAutoClickDesc(cfg.enableAutoClick);

      toggleAutoClick.addEventListener('change', () => {
        const isEnabled = toggleAutoClick.checked;
        chrome.storage.local.set({ enableAutoClick: isEnabled });
        updateAutoClickDesc(isEnabled);
      });
    }

    if (toggleAutoNext) {
      toggleAutoNext.checked = cfg.enableAutoNext !== false;
      updateAutoNextDesc(cfg.enableAutoNext !== false);

      toggleAutoNext.addEventListener('change', () => {
        const isEnabled = toggleAutoNext.checked;
        chrome.storage.local.set({ enableAutoNext: isEnabled });
        updateAutoNextDesc(isEnabled);
      });
    }

    const curSpeed = cfg.answerSpeed || 10;
    const curJitter = parseFloat(cfg.answerJitter) || 0.2;

    if (rangeAnswerSpeed) {
      rangeAnswerSpeed.value = curSpeed;
      rangeAnswerSpeed.addEventListener('input', () => {
        const val = parseInt(rangeAnswerSpeed.value) || 10;
        updateDisplays(val, undefined);
        chrome.storage.local.set({ answerSpeed: val });
      });
    }

    if (rangeAnswerJitter) {
      rangeAnswerJitter.value = curJitter;
      rangeAnswerJitter.addEventListener('input', () => {
        const jVal = parseFloat(rangeAnswerJitter.value) || 0.2;
        updateDisplays(undefined, jVal);
        chrome.storage.local.set({ answerJitter: jVal });
      });
    }

    updateDisplays(curSpeed, curJitter);
  });

  // 2. 載入目前題庫與貢獻狀態
  chrome.storage.local.get({
    contributedCount: 0,
    cachedBank: [],
    bankUpdatedTime: ''
  }, (items) => {
    contributedCountEl.textContent = `${items.contributedCount} 題`;

    const count = (items.cachedBank && items.cachedBank.length) || 0;
    bankCountEl.textContent = `${count.toLocaleString()} 題`;

    if (count > 0) {
      bankStatusEl.textContent = `已連線 CDN (${items.bankUpdatedTime || '最新'})`;
      bankStatusEl.style.color = '#10b981';
    } else {
      bankStatusEl.textContent = '尚未同步';
      bankStatusEl.style.color = '#f59e0b';
    }
  });

  // 3. 開啟 420x900 獨立手機小視窗 (免開 F12)
  if (btnStep2OpenWindow) {
    btnStep2OpenWindow.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs && tabs[0];
        let currentUrl = (currentTab && currentTab.url) || MOMO_QUIZ_URL;

        if (!currentUrl.includes('npn=')) {
          currentUrl = MOMO_QUIZ_URL;
        } else {
          try {
            const u = new URL(currentUrl);
            if (u.hostname.includes('momoshop.com.tw') && !u.searchParams.has('viewport')) {
              u.searchParams.set('viewport', 'mobile');
              currentUrl = u.toString();
            }
          } catch (e) {
            currentUrl = MOMO_QUIZ_URL;
          }
        }

        chrome.runtime.sendMessage({
          action: 'openMobileWindow',
          url: currentUrl
        });
        window.close();
      });
    });
  }

  // 4. 手動立即檢查題庫更新 (委派 Service Worker 處理)
  if (btnSync) {
    btnSync.addEventListener('click', () => {
      btnSync.disabled = true;
      btnSync.textContent = '⏳ 同步中...';

      chrome.runtime.sendMessage({ action: 'syncBank' }, (response) => {
        if (response && response.questions && Array.isArray(response.questions)) {
          const count = response.questions.length;
          const nowStr = new Date().toLocaleTimeString();
          bankCountEl.textContent = `${count.toLocaleString()} 題`;
          bankStatusEl.textContent = `同步成功 (${nowStr})`;
          bankStatusEl.style.color = '#10b981';
          btnSync.textContent = '✅ 已是最新版本！';
          setTimeout(() => {
            btnSync.disabled = false;
            btnSync.textContent = '🔄 立即檢查題庫更新';
          }, 1500);
        } else {
          bankStatusEl.textContent = '同步失敗';
          bankStatusEl.style.color = '#ef4444';
          btnSync.textContent = '❌ 同步失敗，請稍候重試';
          setTimeout(() => {
            btnSync.disabled = false;
            btnSync.textContent = '🔄 立即檢查題庫更新';
          }, 2000);
        }
      });
    });
  }

  // 5. Cookie 槽位管理
  (function initCookieSlots() {
    const slotsContainer = document.getElementById('popup-cookie-slots');
    const statusEl = document.getElementById('popup-slot-status');
    const saveBtn = document.getElementById('popup-cookie-save-btn');
    const loadBtn = document.getElementById('popup-cookie-load-btn');
    if (!slotsContainer || !saveBtn || !loadBtn) return;

    let selectedSlot = null;
    let currentSlotsInfo = {};

    // 建立 9 個槽位按鈕
    for (let i = 1; i <= 9; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.slot = String(i);
      btn.className = 'popup-slot-btn';
      btn.textContent = String(i);
      btn.style.cssText = [
        'aspect-ratio:1/1',
        'min-height:30px',
        'background:rgba(255,255,255,0.07)',
        'border:2px solid rgba(255,255,255,0.15)',
        'border-radius:7px',
        'color:#cbd5e1',
        'font-size:13px',
        'font-weight:700',
        'cursor:pointer',
        'position:relative',
        'transition:all 0.2s'
      ].join(';');
      slotsContainer.appendChild(btn);
    }

    function updateSlotButtons() {
      slotsContainer.querySelectorAll('.popup-slot-btn').forEach(function(btn) {
        const n = parseInt(btn.dataset.slot);
        const meta = currentSlotsInfo[n];
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
        let dot = btn.querySelector('.slot-dot');
        if (meta) {
          if (!dot) {
            dot = document.createElement('span');
            dot.className = 'slot-dot';
            dot.style.cssText = 'position:absolute;top:2px;right:3px;width:5px;height:5px;background:#10b981;border-radius:50%';
            btn.appendChild(dot);
          }
        } else {
          if (dot) dot.remove();
        }
      });
    }

    function updateActionButtons() {
      const enabled = selectedSlot !== null;
      saveBtn.style.opacity = enabled ? '1' : '0.5';
      saveBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
      loadBtn.style.opacity = enabled ? '1' : '0.5';
      loadBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }

    function updateStatus() {
      if (selectedSlot === null) {
        statusEl.textContent = '請先選擇一個槽位 (1~9)';
        statusEl.style.color = '#94a3b8';
      } else {
        const meta = currentSlotsInfo[selectedSlot];
        if (meta) {
          const userTag = meta.userName ? `【${meta.userName}】` : '';
          statusEl.textContent = `✅ 槽位 ${selectedSlot}${userTag}：${meta.count} 個 Cookie · ${meta.savedAt}`;
          statusEl.style.color = '#34d399';
        } else {
          statusEl.textContent = `⬜ 槽位 ${selectedSlot} 為空 (讀取將清除所有登入 Cookie)`;
          statusEl.style.color = '#f59e0b';
        }
      }
    }

    // 初始讀取槽位資訊
    chrome.runtime.sendMessage({ action: 'getCookieSlotsInfo' }, function(res) {
      if (res) {
        currentSlotsInfo = res;
        updateSlotButtons();
      }
    });

    // 槽位按鈕點擊
    slotsContainer.addEventListener('click', function(e) {
      const btn = e.target.closest('.popup-slot-btn');
      if (!btn) return;
      const n = parseInt(btn.dataset.slot);
      selectedSlot = (selectedSlot === n) ? null : n;
      updateSlotButtons();
      updateActionButtons();
      updateStatus();
    });

    // 儲存 Cookie
    saveBtn.addEventListener('click', function() {
      if (selectedSlot === null) return;
      saveBtn.textContent = '⏳ 儲存中...';
      saveBtn.disabled = true;
      chrome.runtime.sendMessage({ action: 'saveCookiesToSlot', slot: selectedSlot }, function(res) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 儲存';
        if (res && res.success) {
          currentSlotsInfo[selectedSlot] = res.meta;
          updateSlotButtons();
          updateStatus();
          const userTag = res.meta.userName ? `【${res.meta.userName}】` : '';
          statusEl.textContent = `✅ 槽位 ${selectedSlot}${userTag} 已儲存 ${res.count} 個 Cookie`;
          statusEl.style.color = '#34d399';
          if (!res.meta.isLoggedIn) {
            alert('⚠️ 提示：目前 momo 似乎未登入 (未偵測到 LOGINSESSION 或 st)！\n此槽位儲存為登出狀態，未來讀取時將會處於未登入。');
          }
        } else {
          statusEl.textContent = '❌ 儲存失敗，請再試一次';
          statusEl.style.color = '#ef4444';
        }
      });
    });

    // 讀取 Cookie
    loadBtn.addEventListener('click', function() {
      if (selectedSlot === null) return;
      const meta = currentSlotsInfo[selectedSlot];
      const userTag = (meta && meta.userName) ? `【${meta.userName}】` : '';
      const confirmMsg = meta
        ? `確定要讀取槽位 ${selectedSlot}${userTag} 的 Cookie？\n(將覆蓋目前登入狀態，頁面會自動重新載入)`
        : `槽位 ${selectedSlot} 為空，讀取將清除所有 MOMO Cookie (登出狀態)\n確定繼續？`;
      if (!window.confirm(confirmMsg)) return;
      loadBtn.textContent = '⏳ 讀取中...';
      loadBtn.disabled = true;
      chrome.runtime.sendMessage({ action: 'loadCookiesFromSlot', slot: selectedSlot }, function(res) {
        if (res && res.success) {
          const restoredTag = res.userName ? `【${res.userName}】` : '';
          statusEl.textContent = res.action === 'restored'
            ? `📂 槽位 ${selectedSlot}${restoredTag} 已還原 ${res.count} 個 Cookie，即將重新載入...`
            : '🧹 已清除所有 Cookie，即將重新載入...';
          statusEl.style.color = '#8b5cf6';
          // 重新整理當前分頁後關閉 popup
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs[0]) chrome.tabs.reload(tabs[0].id);
          });
          setTimeout(function() { window.close(); }, 600);
        } else {
          loadBtn.disabled = false;
          loadBtn.textContent = '📂 讀取';
          statusEl.textContent = '❌ 讀取失敗，請再試一次';
          statusEl.style.color = '#ef4444';
        }
      });
    });
  })();
});
