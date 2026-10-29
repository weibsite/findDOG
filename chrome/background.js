// =========================================================
// momo 答題神隊友 - background.js (Service Worker)
// 負責：題庫快取同步、官方正解伺服器回傳、獨立手機視窗開啟
// 維持瀏覽器原生 User-Agent 與網路環境，確保 BitBrowser 登入狀態不丟失
// =========================================================

// CDN 題庫與伺服器常數 (由 Service Worker 發送，突破網頁端 CSP 限制)
const CDN_JSON_URL = 'https://finddog.online/momo_questions.json';
const SERVER_AUTO_LEARN_URL = 'https://api.9ysong.shop/callback2/api/auto-learn';

async function fetchCdnBank() {
  try {
    const res = await fetch(`${CDN_JSON_URL}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.questions && Array.isArray(data.questions)) {
        chrome.storage.local.set({
          cachedBank: data.questions,
          bankLastModified: data.last_modified || '',
          bankUpdatedTime: new Date().toLocaleTimeString()
        });
        console.log(`[momo 答題神隊友 SW] 題庫已由 Service Worker 成功同步，共 ${data.questions.length} 題！`);
        return data.questions;
      }
    }
  } catch (err) {
    console.warn('[momo 答題神隊友 SW] 同步 CDN 題庫失敗:', err);
  }
  return null;
}

async function reportAutoLearn(payload) {
  try {
    const res = await fetch(SERVER_AUTO_LEARN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      console.log('[momo 答題神隊友 SW] 官方正解已由 Service Worker 成功送達！');
    }
  } catch (err) {
    console.warn('[momo 答題神隊友 SW] 自動學習上傳失敗:', err);
  }
}

async function reportAutoLearnBatch(reports) {
  if (!reports || reports.length === 0) return;
  try {
    const res = await fetch(SERVER_AUTO_LEARN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports: reports, count: reports.length, batch: true })
    });
    if (res.ok) {
      console.log(`[momo 答題神隊友 SW] 🎯 整局 ${reports.length} 道題目已批次成功送達伺服器！`);
    }
  } catch (err) {
    console.warn('[momo 答題神隊友 SW] 批次自動學習上傳失敗:', err);
  }
}

// 清除舊版本殘留的 declarativeNetRequest 偽裝規則，徹底還原原生瀏覽器環境
async function clearLegacyDisguiseRules() {
  try {
    if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateDynamicRules) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1001]
      });
      console.log('[momo 答題神隊友 SW] 已確認清除舊版 App UA 偽裝規則，維持瀏覽器原生登入狀態。');
    }
  } catch (e) {
    // 忽略錯誤
  }
}

// 監聽擴充套件安裝與啟動事件
chrome.runtime.onInstalled.addListener(() => {
  clearLegacyDisguiseRules();
  fetchCdnBank();
});

chrome.runtime.onStartup.addListener(() => {
  clearLegacyDisguiseRules();
  fetchCdnBank();
});

// 監聽來自 content.js 或 popup.js 的請求 (突破網頁端 CSP 限制)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. 同步 CDN 題庫
  if (request.action === 'syncBank') {
    fetchCdnBank().then(questions => {
      sendResponse({ status: 'ok', questions: questions });
    });
    return true; // 異步回應
  }

  // 2. 自動回報官方正解至伺服器 (支援整局結束批次回報與舊版單題回報)
  if (request.action === 'autoLearnBatch') {
    reportAutoLearnBatch(request.reports);
    sendResponse({ status: 'ok' });
    return true;
  }

  if (request.action === 'autoLearn') {
    reportAutoLearn(request.payload);
    sendResponse({ status: 'ok' });
    return true;
  }

  // 3. 開啟手機獨立視窗請求 (免 F12，獨立 420x900 小視窗)
  if (request.action === 'openMobileWindow') {
    const MOMO_QUIZ_URL = 'https://www.momoshop.com.tw/edm/cmmedm.jsp?npn=1vEJn4Ny1oqt&n=1&viewport=mobile';
    let targetUrl = request.url;
    if (!targetUrl || targetUrl.startsWith('chrome://') || targetUrl.startsWith('edge://') || !targetUrl.includes('npn=')) {
      targetUrl = MOMO_QUIZ_URL;
    } else {
      // 確保帶有 viewport=mobile
      try {
        const u = new URL(targetUrl);
        if (u.hostname.includes('momoshop.com.tw') && !u.searchParams.has('viewport')) {
          u.searchParams.set('viewport', 'mobile');
          targetUrl = u.toString();
        }
      } catch (e) {}
    }

    chrome.windows.create({
      url: targetUrl,
      type: 'popup',
      width: 420,
      height: 900,
      focused: true
    }, (createdWin) => {
      sendResponse({ status: 'ok', windowId: createdWin ? createdWin.id : null });
    });
    return true; // 異步回應
  }

  // 4. Cookie 槽位管理功能 (1~9 槽位備份、還原、匯入、匯出、清空)
  if (request.action === 'saveCookiesToSlot') {
    saveCookiesToSlot(request.slot).then(res => sendResponse(res));
    return true;
  }

  if (request.action === 'loadCookiesFromSlot') {
    loadCookiesFromSlot(request.slot).then(res => sendResponse(res));
    return true;
  }

  if (request.action === 'getCookieSlotsInfo') {
    getCookieSlotsInfo().then(res => sendResponse(res));
    return true;
  }

  if (request.action === 'importCookieStringToSlot') {
    importCookieStringToSlot(request.slot, request.cookieString).then(res => sendResponse(res));
    return true;
  }

  if (request.action === 'exportCookieSlotString') {
    exportCookieSlotString(request.slot).then(res => sendResponse(res));
    return true;
  }

  if (request.action === 'clearCookieSlot') {
    clearCookieSlot(request.slot).then(res => sendResponse(res));
    return true;
  }
});

// =========================================================
// Cookie 槽位核心操作 (讀取、儲存、清除、字串匯入匯出)
// =========================================================

/**
 * 從 cookies 中解析會員名稱與登入標記
 */
function extractUserInfo(cookies) {
  let userName = '';
  let isLoggedIn = false;
  if (!cookies || !Array.isArray(cookies)) return { userName: '', isLoggedIn: false };

  for (const c of cookies) {
    if (!c || !c.name) continue;
    if (c.name === 'loginUser' && c.value) {
      try {
        const decoded = decodeURIComponent(c.value.replace(/\+/g, ' ')).trim();
        if (decoded) userName = decoded;
      } catch (e) {
        userName = c.value;
      }
    }
    if (c.name === 'LOGINSESSION' || c.name === 'st') {
      if (c.value && c.value.trim().length > 0) {
        isLoggedIn = true;
      }
    }
  }
  return { userName, isLoggedIn };
}

/**
 * 準備寫入 chrome.cookies.set 的安全參數物件
 * 解決 sameSite='unspecified' 致命報錯、domain 前導點、hostOnly 等相容性問題
 */
function prepareCookieDetails(c) {
  let domain = (c.domain || 'www.momoshop.com.tw').trim();
  const host = domain.startsWith('.') ? domain.slice(1) : domain;
  const path = c.path && c.path.startsWith('/') ? c.path : '/';
  const url = `https://${host}${path}`;

  const details = {
    url: url,
    name: c.name,
    value: c.value,
    path: path,
    secure: Boolean(c.secure),
    httpOnly: Boolean(c.httpOnly)
  };

  // 如果不是 host-only cookie，且具有 domain，設定 domain (不可帶開頭的點)
  if (!c.hostOnly && domain) {
    details.domain = host;
  }

  // sameSite 只能是 'no_restriction', 'lax', 'strict' 之一，絕不可傳入 'unspecified'
  if (c.sameSite === 'no_restriction' || c.sameSite === 'lax' || c.sameSite === 'strict') {
    details.sameSite = c.sameSite;
  }

  // 如果不是 session cookie，且 expirationDate 有效才傳入
  if (!c.session && typeof c.expirationDate === 'number') {
    const nowSec = Math.floor(Date.now() / 1000);
    if (c.expirationDate > nowSec) {
      details.expirationDate = c.expirationDate;
    }
  }

  if (c.storeId) {
    details.storeId = c.storeId;
  }

  return details;
}

/**
 * 獲取所有 MOMO 相關 Cookies (廣泛涵蓋主網域、子網域與關鍵 URL)
 */
async function getAllMomoCookies() {
  const seen = new Set();
  const allCookies = [];

  function addCookie(c) {
    if (!c || !c.name) return;
    const key = `${c.domain}|${c.path}|${c.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      allCookies.push(c);
    }
  }

  // 1. 依據 Domain 查詢（包含子網域）
  const domains = ['momoshop.com.tw', 'momo.com.tw'];
  for (const d of domains) {
    try {
      const list = await chrome.cookies.getAll({ domain: d });
      if (Array.isArray(list)) list.forEach(addCookie);
    } catch (e) {}
  }

  // 2. 依據常用 URL 查詢（確保 host-only cookie 完整納入）
  const urls = [
    'https://www.momoshop.com.tw/',
    'https://m.momoshop.com.tw/',
    'https://event.momoshop.com.tw/',
    'https://member.momoshop.com.tw/',
    'https://momoshop.com.tw/'
  ];
  for (const u of urls) {
    try {
      const list = await chrome.cookies.getAll({ url: u });
      if (Array.isArray(list)) list.forEach(addCookie);
    } catch (e) {}
  }

  return allCookies;
}

/**
 * 完全清除當前瀏覽器的所有 MOMO Cookies
 */
async function clearAllMomoCookies() {
  const current = await getAllMomoCookies();
  let removedCount = 0;
  for (const c of current) {
    try {
      let domain = (c.domain || 'www.momoshop.com.tw').trim();
      const host = domain.startsWith('.') ? domain.slice(1) : domain;
      const path = c.path && c.path.startsWith('/') ? c.path : '/';
      const removeDetails = {
        url: `https://${host}${path}`,
        name: c.name
      };
      if (c.storeId) {
        removeDetails.storeId = c.storeId;
      }
      await chrome.cookies.remove(removeDetails);
      removedCount++;
    } catch (e) {}
  }
  return removedCount;
}

/**
 * 將當前 Cookies 儲存至指定槽位
 */
async function saveCookiesToSlot(slot) {
  const cookies = await getAllMomoCookies();
  const { userName, isLoggedIn } = extractUserInfo(cookies);
  const meta = {
    savedAt: new Date().toLocaleString(),
    timestamp: Date.now(),
    count: cookies.length,
    userName: userName || (isLoggedIn ? '已登入會員' : '未登入狀態'),
    isLoggedIn: isLoggedIn
  };
  await chrome.storage.local.set({
    [`momo_cookie_slot_${slot}`]: cookies,
    [`momo_cookie_meta_${slot}`]: meta
  });
  return { success: true, slot: slot, count: cookies.length, meta: meta };
}

/**
 * 從指定槽位還原 Cookies
 */
async function loadCookiesFromSlot(slot) {
  const key = `momo_cookie_slot_${slot}`;
  const data = await chrome.storage.local.get([key]);
  const targetCookies = data[key];

  // 清除現有的所有 MOMO cookies
  await clearAllMomoCookies();

  if (targetCookies && Array.isArray(targetCookies) && targetCookies.length > 0) {
    let restoredCount = 0;
    let failedCount = 0;
    for (const c of targetCookies) {
      try {
        const details = prepareCookieDetails(c);
        await chrome.cookies.set(details);
        restoredCount++;
      } catch (e) {
        failedCount++;
        console.warn('[SW Cookie] 寫入 cookie 失敗:', c.name, e);
      }
    }
    const { userName, isLoggedIn } = extractUserInfo(targetCookies);
    return {
      success: true,
      action: 'restored',
      slot: slot,
      count: restoredCount,
      failed: failedCount,
      userName: userName,
      isLoggedIn: isLoggedIn
    };
  } else {
    // 空槽位：代表初始狀態 (已全數清除)
    return { success: true, action: 'cleared', slot: slot, count: 0 };
  }
}

/**
 * 匯入 raw cookie 字串 (相容 document.cookie 與 allenbear23 工具格式)
 */
async function importCookieStringToSlot(slot, cookieStr) {
  if (!cookieStr || typeof cookieStr !== 'string') {
    return { success: false, error: 'Cookie 字串為空' };
  }

  const hasLoginSession = cookieStr.includes('LOGINSESSION');
  const hasSt = cookieStr.includes('st=');
  if (!hasLoginSession && !hasSt) {
    return {
      success: false,
      error: '⚠️ 此字串未包含登入憑證 (缺少 LOGINSESSION 或 st)，請確認您複製的是已登入狀態的 momo Cookie！'
    };
  }

  const parts = cookieStr.split(';');
  const cookies = [];
  let userName = '';

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const name = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!name) continue;

    if (name === 'loginUser') {
      try {
        userName = decodeURIComponent(value.replace(/\+/g, ' ')).trim();
      } catch (e) {
        userName = value;
      }
    }

    cookies.push({
      name: name,
      value: value,
      domain: '.momoshop.com.tw',
      path: '/',
      secure: true,
      httpOnly: (name === 'LOGINSESSION' || name === 'st'),
      hostOnly: false,
      session: true
    });
  }

  if (cookies.length === 0) {
    return { success: false, error: '未能成功解析出任何 Cookie 項目' };
  }

  const meta = {
    savedAt: new Date().toLocaleString(),
    timestamp: Date.now(),
    count: cookies.length,
    userName: userName || '已匯入會員',
    isLoggedIn: true,
    source: 'imported'
  };

  await chrome.storage.local.set({
    [`momo_cookie_slot_${slot}`]: cookies,
    [`momo_cookie_meta_${slot}`]: meta
  });

  return { success: true, slot: slot, count: cookies.length, meta: meta };
}

/**
 * 匯出槽位 (或當前) 的 Cookies 為 standard document.cookie 字串
 */
async function exportCookieSlotString(slot) {
  let cookies = [];
  if (slot) {
    const key = `momo_cookie_slot_${slot}`;
    const data = await chrome.storage.local.get([key]);
    cookies = data[key] || [];
  } else {
    cookies = await getAllMomoCookies();
  }

  if (!cookies || cookies.length === 0) {
    return { success: false, error: '槽位為空或沒有任何 Cookie' };
  }

  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const { userName } = extractUserInfo(cookies);
  return { success: true, cookieString: cookieStr, count: cookies.length, userName: userName };
}

/**
 * 清空指定槽位資料
 */
async function clearCookieSlot(slot) {
  await chrome.storage.local.remove([
    `momo_cookie_slot_${slot}`,
    `momo_cookie_meta_${slot}`
  ]);
  return { success: true, slot: slot };
}

/**
 * 取得 1~9 所有槽位的 metadata
 */
async function getCookieSlotsInfo() {
  const keys = [];
  for (let i = 1; i <= 9; i++) {
    keys.push(`momo_cookie_meta_${i}`);
  }
  const data = await chrome.storage.local.get(keys);
  const slots = {};
  for (let i = 1; i <= 9; i++) {
    slots[i] = data[`momo_cookie_meta_${i}`] || null;
  }
  return slots;
}
