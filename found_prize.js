// found_prize.js
// 尋獲抽獎動畫展示腳本

document.addEventListener('DOMContentLoaded', () => {
    // 延遲綁定，確保 index.htm 中的 DOM 已經完全載入
    setTimeout(() => {
        const btn = document.getElementById('found-prize-btn');
        if (!btn) {
            console.error("找不到尋獲抽獎按鈕 (found-prize-btn)");
            return;
        }
        
        btn.addEventListener('click', async () => {
            if (!confirm("即將開始尋獲抽獎動畫！\n這將重置您當前的地圖畫面（動畫結束後重新整理網頁即可恢復）。確定要開始嗎？")) return;
            
            // 1. 隱藏不必要的 UI，只留地圖
            const hideIds = ['admin-panel', 'status-toast', 'project-select-wrapper', 'locate-btn', 'spectator-btn', 'toggle-fog-btn', 'nav-pin-btn', 'force-upload-btn', 'my-route-btn', 'eva-grid-btn', 'playback-controls'];
            hideIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            
            // 2. 讀取 joins.csv
            let csvText = "";
            try {
                // 為了避免快取問題，加上時間戳
                const res = await fetch('joins.csv?t=' + Date.now());
                csvText = await res.text();
            } catch(e) {
                alert("無法載入 joins.csv，請確認檔案是否存在。");
                return;
            }
            
            // 解析 CSV
            const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
            const joins = lines.slice(1).map(l => {
                const parts = l.split(',');
                return { time: parts[0], name: parts[1] };
            }).filter(j => j.name);
            
            if (joins.length === 0) {
                alert("joins.csv 內沒有有效資料！");
                return;
            }
            
            showCenterToast(`🎉 尋獲抽獎演出開始！\n共載入 ${joins.length} 位參與者...`);
            
            // 3. 收集歷史路徑 (從當前所有志工身上收集)
            let allPaths = [];
            // typeof allUsersData !== 'undefined' 確保全域變數存在
            if (typeof allUsersData !== 'undefined') {
                Object.values(allUsersData).forEach(u => {
                    if (u.history && u.history.length > 5) {
                        allPaths.push(u.history);
                    }
                });
            }
            if (typeof localHistory !== 'undefined' && localHistory.length > 5) {
                allPaths.push(localHistory);
            }
            
            // 專案中心點
            let center = [24.675, 121.767]; // 宜蘭預設
            if (typeof PROJECTS !== 'undefined' && typeof currentProjectKey !== 'undefined' && PROJECTS[currentProjectKey]) {
                const p = PROJECTS[currentProjectKey];
                center = [p.lat, p.lng];
            }
            
            // 如果剛好沒有人有歷史軌跡，隨機產生一些在中心點附近的假軌跡備用
            if (allPaths.length === 0) {
                for(let i=0; i<50; i++) {
                    let path = [];
                    let lat = center[0] + (Math.random()-0.5)*0.02; // 約 1~2 公里
                    let lng = center[1] + (Math.random()-0.5)*0.02;
                    for(let j=0; j<20; j++) {
                        path.push({lat, lng});
                        // 隨機往某方向移動
                        lat += (Math.random()-0.5)*0.0005;
                        lng += (Math.random()-0.5)*0.0005;
                    }
                    allPaths.push(path);
                }
            }
            
            // 4. 重置地圖狀態 (清場)
            // 將所有真實用戶與軌跡清除，進入動畫模式
            if (typeof allUsersData !== 'undefined') {
                Object.keys(allUsersData).forEach(k => delete allUsersData[k]);
            }
            if (typeof localHistory !== 'undefined') {
                localHistory.length = 0;
            }
            
            // 關閉 ws，避免伺服器傳來真實更新打斷動畫
            if (typeof ws !== 'undefined' && ws) {
                ws.close();
            }
            
            // 清除圖層
            if (typeof markersLayer !== 'undefined' && markersLayer) markersLayer.clearLayers();
            if (typeof sightingsLayer !== 'undefined' && sightingsLayer) sightingsLayer.clearLayers();
            if (typeof routesLayer !== 'undefined' && routesLayer) routesLayer.clearLayers();
            
            // 確保迷霧存在並開啟
            if (typeof isFogVisible !== 'undefined') isFogVisible = true;
            
            // 繪製全黑地圖
            if (typeof renderMap === 'function') renderMap();
            if (typeof requestFogRender === 'function') requestFogRender();
            
            // 移動視角到中心點
            if (typeof map !== 'undefined' && map) {
                map.setView(center, 14, {animate: true, duration: 1});
            }
            
            // 5. 設定動畫參數
            const duration = 60000; // 總時長 1 分鐘 (60秒)
            const startTime = Date.now();
            
            // 計算每位進場的間隔。保留最後 5 秒作為演出結尾發酵時間
            const spawnInterval = 55000 / joins.length;
            
            // 產生所有的演員
            const actors = joins.map((j, idx) => {
                const spawnTime = idx * spawnInterval;
                // 30% 機率原地發呆，70% 會四處探索
                const isIdle = Math.random() < 0.3;
                
                // 隨機分配一條路線給他
                let path = allPaths[Math.floor(Math.random() * allPaths.length)];
                
                // 決定起始點 (不要全部從頭開始)
                const maxStartIdx = Math.max(1, path.length - 2);
                const startIdx = Math.floor(Math.random() * maxStartIdx);
                
                let actorColor = '#ffffff';
                if (typeof generateRandomColor === 'function') {
                    actorColor = generateRandomColor();
                }
                
                return {
                    id: 'anim_user_' + idx,
                    name: j.name,
                    spawnTime: spawnTime,
                    isIdle: isIdle,
                    path: path,
                    pathIdx: startIdx,
                    history: [],
                    color: actorColor,
                    active: false,
                    lastStepTime: 0
                };
            });
            
            let lastRenderTime = 0;
            let animationFrameId;
            
            // 6. 動畫迴圈
            function animateFrame() {
                const now = Date.now();
                const elapsed = now - startTime;
                
                if (elapsed > duration) {
                    // 動畫結束
                    cancelAnimationFrame(animationFrameId);
                    showCenterToast("🎉 動畫結束！後續抽獎功能建置中...", 6000);
                    return;
                }
                
                // 限制渲染頻率，約 100ms 更新一次畫面，避免效能崩潰
                if (now - lastRenderTime > 100) {
                    lastRenderTime = now;
                    
                    // 清空當前使用者資料，只放動畫中「已進場」的人
                    Object.keys(allUsersData).forEach(k => delete allUsersData[k]);
                    
                    let activeCount = 0;
                    actors.forEach(actor => {
                        // 判斷是否該進場了
                        if (elapsed >= actor.spawnTime) {
                            actor.active = true;
                            activeCount++;
                            
                            // 更新位置
                            if (actor.isIdle) {
                                // 發呆模式：只給定起點
                                if (actor.history.length === 0) {
                                    const pos = actor.path[actor.pathIdx];
                                    if (pos) actor.history.push({lat: pos.lat, lng: pos.lng, timestamp: now});
                                }
                            } else {
                                // 探索模式：每隔一段時間走一步
                                const stepInterval = 200; // 每 200ms 走一步
                                if (now - actor.lastStepTime > stepInterval) {
                                    actor.lastStepTime = now;
                                    
                                    if (actor.pathIdx < actor.path.length - 1) {
                                        actor.pathIdx++;
                                    } else {
                                        // 走到底了，反轉路徑往回走
                                        actor.path = [...actor.path].reverse();
                                        actor.pathIdx = 0;
                                    }
                                    
                                    const pos = actor.path[actor.pathIdx];
                                    if (pos) {
                                        actor.history.push({lat: pos.lat, lng: pos.lng, timestamp: now});
                                        // 保持歷史軌跡長度，避免畫面太滿
                                        if (actor.history.length > 50) {
                                            actor.history.shift();
                                        }
                                    }
                                }
                            }
                            
                            // 寫入 allUsersData 以供 renderMap 與 requestFogRender 使用
                            if (actor.history.length > 0) {
                                allUsersData[actor.id] = {
                                    userName: actor.name,
                                    color: actor.color,
                                    history: actor.history,
                                    lastUpdate: now
                                };
                            }
                        }
                    });
                    
                    // 呼叫原本的渲染函式
                    if (typeof renderMap === 'function') renderMap();
                    if (typeof requestFogRender === 'function') requestFogRender();
                }
                
                animationFrameId = requestAnimationFrame(animateFrame);
            }
            
            // 開始動畫
            animationFrameId = requestAnimationFrame(animateFrame);
            
        });
    }, 1000);
});
