// found_prize.js
// 尋獲抽獎動畫展示腳本

function initFoundPrizeAnimation() {
    let btn = document.getElementById('found-prize-btn');
    if (!btn) return;
    
    btn.addEventListener('click', async () => {
        let oldLock = document.getElementById('anim-pointer-lock');
        if (oldLock) return;
        
        let csvText = "";
        try {
            const res = await fetch('joins.csv?t=' + Date.now());
            csvText = await res.text();
        } catch(e) {
            alert("無法載入 joins.csv，請確認檔案是否存在。");
            return;
        }
        const lines = csvText.split('\n').map(l => l.trim().replace(/^\uFEFF/, '')).filter(l => l);
        const joins = lines.slice(1).map(l => {
            const parts = l.split(',');
            return { time: parts[0], name: parts[1] };
        }).filter(j => j.name);
        
        if (joins.length < 2) {
            alert("參與人數不足 2 人，無法進行抽獎！");
            return;
        }
        
        let modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.backgroundColor = 'rgba(0,0,0,0.6)';
        modal.style.zIndex = '999999';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        
        modal.innerHTML = `
            <div style="background:white; padding:30px; border:4px solid black; border-radius:10px; width:90%; max-width:400px; text-align:center; box-shadow: 10px 10px 0px rgba(0,0,0,0.8);">
                <h2 style="font-size:26px; font-weight:bold; margin-bottom:15px; color:#1a202c;">尋回任務圓滿達成</h2>
                <p style="font-size:18px; margin-bottom:10px;">感謝 <strong>${joins.length}</strong> 位熱心朋友的參與</p>
                <p style="font-size:16px; margin-bottom:25px; color:#ef4444; font-weight:bold;">奇蹟其實就在身邊，現在為您揭曉 2 位幸運星</p>
                
                <div style="margin-bottom:25px; text-align:left; background:#f3f4f6; padding:15px; border-radius:8px; border:2px solid #d1d5db; display:flex; gap:15px;">
                    <div style="flex:1;">
                        <label style="font-weight:bold; display:block; margin-bottom:8px; color:#374151;">💰 獎金金額：</label>
                        <input type="number" id="fp-prize-amount" value="5000" style="width:100%; padding:10px; border:2px solid #9ca3af; border-radius:5px; font-size:18px; font-weight:bold; box-sizing:border-box;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-weight:bold; display:block; margin-bottom:8px; color:#374151;">🏆 抽獎人數：</label>
                        <input type="number" id="fp-winner-count" value="2" min="1" style="width:100%; padding:10px; border:2px solid #9ca3af; border-radius:5px; font-size:18px; font-weight:bold; box-sizing:border-box;">
                    </div>
                </div>
                
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <button id="fp-start-draw" style="flex:2; padding:15px; background:#f59e0b; color:white; border:3px solid black; border-radius:8px; cursor:pointer; font-weight:bold; font-size:20px; box-shadow: 4px 4px 0px black; text-shadow:1px 1px 0px #b45309;">啟動抽獎</button>
                    <button id="fp-start-share" style="flex:1; padding:15px; background:#8b5cf6; color:white; border:3px solid black; border-radius:8px; cursor:pointer; font-weight:bold; font-size:16px; box-shadow: 4px 4px 0px black;">分享抽獎</button>
                </div>
                <button id="fp-cancel" style="padding:10px 30px; background:#e5e7eb; border:2px solid #9ca3af; border-radius:5px; cursor:pointer; font-weight:bold; color:#4b5563;">取消</button>
            </div>
        `;
        document.body.appendChild(modal);
        
        const startWithStyle = (styleId, overrideJoins = null) => {
            let activeJoins = overrideJoins || joins;
            window.PRIZE_DRAW_STYLE = styleId;
            window.PRIZE_AMOUNT = document.getElementById('fp-prize-amount').value || 5000;
            window.PRIZE_WINNER_COUNT = parseInt(document.getElementById('fp-winner-count').value) || 2;
            modal.innerHTML = `<div style="background:white; padding:20px; border:4px solid black; border-radius:10px; text-align:center;"><h2 style="font-size:24px; font-weight:bold;">準備演出...</h2></div>`;
            showCenterToast("⏳ 正在向伺服器請求完整歷史軌跡...", 60000);
            
            const hideIds = ['admin-panel', 'status-toast', 'project-select-wrapper', 'locate-btn', 'spectator-btn', 'toggle-fog-btn', 'nav-pin-btn', 'force-upload-btn', 'my-route-btn', 'eva-grid-btn', 'playback-controls'];
            hideIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            
            if (typeof ws !== 'undefined' && ws) {
                const originalOnMessage = ws.onmessage;
                ws.onmessage = async (event) => {
                    let res;
                    try {
                        res = JSON.parse(event.data);
                    } catch(e) {
                        if (originalOnMessage) originalOnMessage(event);
                        return;
                    }
                    if (res.type === 'animation_paths_data') {
                        ws.onmessage = originalOnMessage;
                        modal.remove();
                        startAnimation(res.paths, activeJoins);
                    } else {
                        if (originalOnMessage) originalOnMessage(event);
                    }
                };
                if (typeof wsSend === 'function' && typeof currentProjectKey !== 'undefined') {
                    wsSend("admin_get_animation_paths", {project: currentProjectKey});
                } else {
                    ws.send(JSON.stringify({ type: 'get_animation_paths' }));
                }
            } else {
                modal.remove();
                startAnimation(null, activeJoins);
            }
        };
        
        document.getElementById('fp-start-draw').addEventListener('click', () => startWithStyle(4));
        
        document.getElementById('fp-start-share').addEventListener('click', async () => {
            try {
                const res = await fetch('share.csv?t=' + Date.now());
                if (!res.ok) throw new Error("File not found");
                let csvText = await res.text();
                let lines = csvText.trim().replace(/^\uFEFF/, '').split('\n').filter(l => l).map(l => l.trim());
                let shareJoins = lines.slice(1).map(l => {
                    const parts = l.split(',');
                    return { name: parts[0], url: parts.length > 1 ? parts[parts.length - 1] : '' };
                }).filter(j => j.name);
                if (shareJoins.length < 1) {
                    alert("分享清單人數不足！");
                    return;
                }
                document.getElementById('fp-prize-amount').value = 10000;
                document.getElementById('fp-winner-count').value = 1;
                startWithStyle(1, shareJoins);
            } catch (e) {
                console.error(e);
                alert("讀取 share.csv 失敗！請確認檔案是否存在。");
            }
        });
        
        document.getElementById('fp-cancel').addEventListener('click', () => modal.remove());
    });
}

    async function startAnimation(serverPaths, preloadedJoins) {
        try {
            let joins = preloadedJoins;
            if (!joins) {
                let csvText = "";
                try {
                    const res = await fetch('joins.csv?t=' + Date.now());
                    csvText = await res.text();
                } catch(e) {
                    alert("無法載入 joins.csv，請確認檔案是否存在。");
                    return;
                }
                
                const lines = csvText.split('\n').map(l => l.trim().replace(/^\uFEFF/, '')).filter(l => l);
                joins = lines.slice(1).map(l => {
                    const parts = l.split(',');
                    return { time: parts[0], name: parts[1] };
                }).filter(j => j.name);
                
                if (joins.length === 0) {
                    alert("joins.csv 內沒有有效資料！");
                    return;
                }
            }
            
            showCenterToast(`🎉 尋獲抽獎演出開始！\n共載入 ${joins.length} 位參與者...`);
            
            let center = [24.675, 121.767];
            if (typeof PROJECTS !== 'undefined' && typeof currentProjectKey !== 'undefined' && PROJECTS[currentProjectKey]) {
                const p = PROJECTS[currentProjectKey];
                if (p.lat !== undefined && p.lng !== undefined) center = [p.lat, p.lng];
                else if (p.bounds && p.bounds.length >= 2) center = [(p.bounds[0][0] + p.bounds[1][0]) / 2, (p.bounds[0][1] + p.bounds[1][1]) / 2];
            }
            
            const getDist = (lat1, lon1, lat2, lon2) => {
                const R = 6371e3;
                const r1 = lat1 * Math.PI/180, r2 = lat2 * Math.PI/180;
                const d1 = (lat2-lat1) * Math.PI/180, d2 = (lon2-lon1) * Math.PI/180;
                const a = Math.sin(d1/2)*Math.sin(d1/2) + Math.cos(r1)*Math.cos(r2)*Math.sin(d2/2)*Math.sin(d2/2);
                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            };

            let allPaths = [];
            if (serverPaths && serverPaths.length > 0) {
                serverPaths.forEach(rawPath => {
                    let currentSegment = [];
                    for(let i=0; i<rawPath.length; i++) {
                        let pt = rawPath[i];
                        let lat = pt.lat !== undefined ? pt.lat : pt[0];
                        let lng = pt.lng !== undefined ? pt.lng : pt[1];
                        if (isNaN(lat) || isNaN(lng)) continue;
                        
                        // 過濾邊界：若該點距離遺失中心超過 5 公里 (5000公尺)，直接捨棄該點
                        if (getDist(center[0], center[1], lat, lng) > 5000) continue;
                        
                        if (currentSegment.length === 0) {
                            currentSegment.push({lat, lng});
                        } else {
                            let last = currentSegment[currentSegment.length-1];
                            if (getDist(last.lat, last.lng, lat, lng) > 50) {
                                if (currentSegment.length > 3) allPaths.push([...currentSegment]);
                                currentSegment = [{lat, lng}];
                            } else {
                                currentSegment.push({lat, lng});
                            }
                        }
                    }
                    if (currentSegment.length > 3) allPaths.push([...currentSegment]);
                });
            }
            
            if (allPaths.length === 0) {
                for(let i=0; i<50; i++) {
                    let path = [];
                    let lat = center[0] + (Math.random()-0.5)*0.02;
                    let lng = center[1] + (Math.random()-0.5)*0.02;
                    for(let j=0; j<20; j++) {
                        path.push({lat, lng});
                        lat += (Math.random()-0.5)*0.0005;
                        lng += (Math.random()-0.5)*0.0005;
                    }
                    allPaths.push(path);
                }
            }
            
            // 切割過長的軌跡，讓每個人分配到的軌跡變短，不僅能打散人群，也能大幅放慢他們移動的速度
            let fragmentedPaths = [];
            allPaths.forEach(path => {
                const MAX_LEN = 20; // 每個軌跡最多分配 20 個點
                if (path.length > MAX_LEN) {
                    for (let i = 0; i < path.length; i += (MAX_LEN - 1)) {
                        let chunk = path.slice(i, i + MAX_LEN);
                        if (chunk.length >= 2) fragmentedPaths.push(chunk);
                    }
                } else {
                    fragmentedPaths.push(path);
                }
            });
            if (fragmentedPaths.length > 0) allPaths = fragmentedPaths;
            
            if (typeof allUsersData !== 'undefined') Object.keys(allUsersData).forEach(k => delete allUsersData[k]);
            if (typeof localHistory !== 'undefined') localHistory.length = 0;
            if (typeof ws !== 'undefined' && ws) ws.close();
            if (typeof markersLayer !== 'undefined' && markersLayer) markersLayer.clearLayers();
            if (typeof sightingsLayer !== 'undefined' && sightingsLayer) sightingsLayer.clearLayers();
            if (typeof routesLayer !== 'undefined' && routesLayer) routesLayer.clearLayers();
            
            if (typeof isFogVisible !== 'undefined') isFogVisible = true;
            if (typeof isSpectatorMode !== 'undefined') isSpectatorMode = true;
            
            if (typeof map !== 'undefined' && map) {
                const offsetLat = 0.027;
                const offsetLng = 0.029;
                map.fitBounds([
                    [center[0] - offsetLat, center[1] - offsetLng],
                    [center[0] + offsetLat, center[1] + offsetLng]
                ], {animate: false});
            }

            if (typeof window.requestFogRender === 'function' && !window.originalRequestFogRender) {
                window.originalRequestFogRender = window.requestFogRender;
                window.requestFogRender = function() {}; 
            }
            
            if (typeof window.renderMap === 'function' && !window.originalRenderMap) {
                window.originalRenderMap = window.renderMap;
                window.renderMap = function() {}; 
            }
            
            if (typeof lowResCtx !== 'undefined' && typeof fogCtx !== 'undefined') {
                lowResCtx.globalCompositeOperation = 'source-over';
                lowResCtx.fillStyle = 'rgba(15,20,25,0.95)';
                lowResCtx.fillRect(0, 0, lowResCanvas.width, lowResCanvas.height);
                fogCtx.imageSmoothingEnabled = false;
                fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
                fogCtx.drawImage(lowResCanvas, 0, 0, lowResCanvas.width, lowResCanvas.height, 0, 0, fogCanvas.width, fogCanvas.height);
            }
            
            // 建立除錯計數器面板
            let oldCounter = document.getElementById('anim-counter');
            if (oldCounter) oldCounter.remove();
            
            // 關閉地圖上所有圖標與線條的滑鼠感應，避免滑鼠移過去觸發彈出視窗
            let oldLock = document.getElementById('anim-pointer-lock');
            if (oldLock) oldLock.remove();
            let style = document.createElement('style');
            style.id = 'anim-pointer-lock';
            style.innerHTML = `
                .leaflet-marker-pane, .leaflet-overlay-pane, .leaflet-interactive, .leaflet-marker-pane * {
                    pointer-events: none !important;
                }
                #toggle-sighting-track-btn, #spectator-hint {
                    display: none !important;
                }
                body.hide-found-markers .sighting-found-marker {
                    opacity: 0 !important;
                    transition: opacity 2s ease-in-out;
                }
            `;
            document.head.appendChild(style);
            
            // 在前 50 秒隱藏「找到了」標記
            document.body.classList.add('hide-found-markers');
            
            const duration = (window.PRIZE_DRAW_STYLE === 1) ? 10000 : 60000;
            const startTime = Date.now();
            
            const halfCount = Math.floor(joins.length / 2);
            const quarterTime = duration * 0.25;
            const threeQuarterTime = duration * 0.75;
            
            function getIconHtml(color, name) {
                const safeName = typeof escapeHTML === 'function' ? escapeHTML(name) : String(name).replace(/</g, '&lt;');
                return `<div class="user-label-container"><div class="user-name-tag pixel-panel marker-name-btn" style="color:#1a202c; pointer-events:none; font-size:12px;">${safeName}</div><div class="user-avatar-pixel" style="background-color:${color};"></div></div>`;
            }
            
            const actors = joins.map((j, idx) => {
                const isIdle = Math.random() < 0.3;
                let rawPath = allPaths[Math.floor(Math.random() * allPaths.length)];
                
                // 如果是原地不動的幽靈，他的軌跡就只有「最後一個點」，這樣就不會瞬間畫出尾巴了
                let path = isIdle ? [rawPath[rawPath.length - 1]] : rawPath;
                
                let actorColor = '#ffffff';
                if (typeof generateRandomColor === 'function') actorColor = generateRandomColor();
                
                let sTime = 0;
                if (idx < halfCount) {
                    sTime = halfCount > 0 ? (idx / halfCount) * quarterTime : 0;
                } else {
                    let remain = joins.length - halfCount;
                    sTime = quarterTime + (remain > 1 ? ((idx - halfCount) / (remain - 1)) * (threeQuarterTime - quarterTime) : 0);
                }
                
                return {
                    id: 'anim_user_' + idx,
                    idx: idx,
                    name: j.name,
                    url: j.url,
                    spawnTime: sTime,
                    isIdle: isIdle,
                    path: path,
                    pathIdx: 0,
                    lastFogIdx: -1,
                    color: actorColor,
                    active: false,
                    marker: null,
                    polyline: null
                };
            });
            
            let lastRenderTime = 0;
            let animationFrameId;
            let hasTakenSnapshot = false;
            
            let styleId = window.PRIZE_DRAW_STYLE || 1;
            let styleDWon = [];
            let styleDCenter = {lat:0, lng:0}, styleDStartRadius = 0, styleDEndRadius = 0, toxicCircleD = null;
            let styleDLosers = [];
            if (styleId === 4) {
                const getDist = (lat1, lon1, lat2, lon2) => {
                    const R = 6371e3;
                    const r1 = lat1 * Math.PI/180, r2 = lat2 * Math.PI/180;
                    const d1 = (lat2-lat1) * Math.PI/180, d2 = (lon2-lon1) * Math.PI/180;
                    const a = Math.sin(d1/2)*Math.sin(d1/2) + Math.cos(r1)*Math.cos(r2)*Math.sin(d2/2)*Math.sin(d2/2);
                    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                };

                // 1. 尋找「找到了」的出沒點作為毒圈終點
                let foundSighting = null;
                if (typeof allSightings !== 'undefined' && allSightings) {
                    let sArr = Object.values(allSightings).filter(s => s.description && s.description.includes('找到了'));
                    if (sArr.length > 0) {
                        foundSighting = sArr[0]; // 取第一個符合的
                    }
                }
                
                if (foundSighting) {
                    styleDCenter.lat = foundSighting.lat;
                    styleDCenter.lng = foundSighting.lng;
                } else {
                    styleDCenter.lat = map.getCenter().lat;
                    styleDCenter.lng = map.getCenter().lng;
                }
                
                // 2. 選出離這個中心點「最後位置」最近的兩個人作為勝利者
                let distances = actors.map(a => {
                    let aLast = a.path[a.path.length-1];
                    let aLat = aLast.lat !== undefined ? aLast.lat : aLast[0];
                    let aLng = aLast.lng !== undefined ? aLast.lng : aLast[1];
                    return {
                        actor: a,
                        dist: getDist(styleDCenter.lat, styleDCenter.lng, aLat, aLng)
                    };
                });
                
                let winnerCount = window.PRIZE_WINNER_COUNT || 2;
                winnerCount = Math.max(1, Math.min(winnerCount, actors.length));
                
                distances.sort((a, b) => a.dist - b.dist);
                styleDWon = distances.slice(0, winnerCount).map(d => d.actor);
                
                let furthestWinnerDist = Math.max(...distances.slice(0, winnerCount).map(d => d.dist));
                styleDEndRadius = Math.max(20, furthestWinnerDist + 30);
                
                styleDStartRadius = 0;
                actors.forEach(a => {
                    let aFirst = a.path[0];
                    let aLat = aFirst.lat !== undefined ? aFirst.lat : aFirst[0];
                    let aLng = aFirst.lng !== undefined ? aFirst.lng : aFirst[1];
                    let d = getDist(styleDCenter.lat, styleDCenter.lng, aLat, aLng);
                    if (d > styleDStartRadius) styleDStartRadius = d;
                });
                styleDStartRadius += 500; // 加上緩衝，確保一開始毒圈包住所有人
                                
                // 3. 創建超高圖層來顯示毒圈，確保不會被黑霧遮擋
                if (!map.getPane('toxicPaneD')) {
                    map.createPane('toxicPaneD');
                    map.getPane('toxicPaneD').style.zIndex = 99999;
                    map.getPane('toxicPaneD').style.pointerEvents = 'none';
                }
                
                toxicCircleD = L.circle([styleDCenter.lat, styleDCenter.lng], {
                    pane: 'toxicPaneD',
                    color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.1, weight: 4, dashArray: '10, 10'
                });
                
                setTimeout(() => {
                    if (toxicCircleD) toxicCircleD.addTo(map);
                }, 14000);
                
                styleDLosers = actors.filter(a => !styleDWon.includes(a));
                for (let i = styleDLosers.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [styleDLosers[i], styleDLosers[j]] = [styleDLosers[j], styleDLosers[i]];
                }
                
                // 4. 計算並排程漸進式鏡頭放大
                setTimeout(() => {
                    // 先飛到中心點
                    map.flyTo([styleDCenter.lat, styleDCenter.lng], map.getZoom(), {animate: true, duration: 1.0});
                    
                    let finalBounds = L.latLng([styleDCenter.lat, styleDCenter.lng]).toBounds(styleDEndRadius * 2).pad(0.3);
                    let targetZoom = map.getBoundsZoom(finalBounds);
                    let currentZoom = map.getZoom();
                    
                    if (targetZoom > currentZoom) {
                        let zoomSteps = targetZoom - currentZoom;
                        let stepInterval = 45000 / (zoomSteps + 1); // 在最後的 45 秒內平均分配放大次數
                        for (let i = 1; i <= zoomSteps; i++) {
                            setTimeout(() => {
                                if (window.PRIZE_DRAW_STYLE === 4 && map.getZoom() < targetZoom) {
                                    map.setZoom(map.getZoom() + 1, {animate: true});
                                }
                            }, 13500 + i * stepInterval); // 扣掉一開始的 1.5 秒飛入時間
                        }
                    }
                }, 1500);
                
                setTimeout(() => showCenterToast("感謝你們的參與 有你們參與\n讓這個任務成為可能", 5000), 10000);
                setTimeout(() => showCenterToast("我只能以這微小的心意 來表達我的感謝\n謝謝你們 有緣再見!", 5000), 25000);
            }
            
            function animateFrame() {
                try {
                    const now = Date.now();
                    const elapsed = now - startTime;
                    
                    if (now - lastRenderTime > 40) { // 加快渲染頻率，讓插值動畫更滑順
                        lastRenderTime = now;
                        
                        actors.forEach(actor => {
                            if (elapsed >= actor.spawnTime) {
                                if (!actor.active) actor.active = true;
                                
                                let exactIdx = 0;
                                if (!actor.isIdle) {
                                    let aliveTime = elapsed - actor.spawnTime;
                                    let totalWalkTime = duration - actor.spawnTime;
                                    let progress = Math.min(1.0, Math.max(0.0, aliveTime / totalWalkTime));
                                    exactIdx = progress * (actor.path.length - 1);
                                } else {
                                    exactIdx = actor.path.length - 1;
                                }
                                
                                let baseIdx = Math.floor(exactIdx);
                                let remainder = exactIdx - baseIdx;
                                
                                let currentPos = actor.path[baseIdx];
                                let nextPos = actor.path[Math.min(baseIdx + 1, actor.path.length - 1)];
                                
                                if (currentPos && nextPos) {
                                    let cLat = currentPos.lat !== undefined ? currentPos.lat : currentPos[0];
                                    let cLng = currentPos.lng !== undefined ? currentPos.lng : currentPos[1];
                                    let nLat = nextPos.lat !== undefined ? nextPos.lat : nextPos[0];
                                    let nLng = nextPos.lng !== undefined ? nextPos.lng : nextPos[1];
                                    
                                    // 完美線性插值，讓移動跟線條長出來的過程如絲般滑順
                                    let ptLat = cLat + (nLat - cLat) * remainder;
                                    let ptLng = cLng + (nLng - cLng) * remainder;
                                    
                                    actor.currentLat = ptLat;
                                    actor.currentLng = ptLng;
                                    actor.baseIdx = baseIdx;
                                    actor.remainder = remainder;
                                    
                                    if (!actor.marker) {
                                        const icon = L.divIcon({className: 'custom-div-icon', html: getIconHtml(actor.color, actor.name)});
                                        actor.marker = L.marker([ptLat, ptLng], {icon: icon, zIndexOffset: actor.idx * 100000});
                                        if (typeof markersLayer !== 'undefined') actor.marker.addTo(markersLayer);
                                        
                                        // 恢復使用虛線 (dashArray) 來呈現原本一點一點的軌跡視覺效果
                                        actor.polyline = L.polyline([], {color: actor.color, weight: 3, opacity: 0.6, dashArray: '5,5'});
                                        if (typeof routesLayer !== 'undefined') actor.polyline.addTo(routesLayer);
                                    } else {
                                        actor.marker.setLatLng([ptLat, ptLng]);
                                        if (actor.polyline) {
                                            let offsetPath = actor.path.slice(0, baseIdx + 1).map(p => [
                                                (p.lat !== undefined ? p.lat : p[0]),
                                                (p.lng !== undefined ? p.lng : p[1])
                                            ]);
                                            if (remainder > 0) offsetPath.push([ptLat, ptLng]);
                                            actor.polyline.setLatLngs(offsetPath);
                                        }
                                    }
                                }
                            }
                        });
                        
                        if (styleId === 4 && toxicCircleD) {
                            let shrinkElapsed = Math.max(0, elapsed - 15000);
                            let shrinkDuration = duration - 15000;
                            let progress = Math.min(1.0, shrinkElapsed / shrinkDuration);
                            
                            let easeProgress = progress * (2 - progress);
                            let currentRadiusMeters = styleDStartRadius - (styleDStartRadius - styleDEndRadius) * easeProgress;
                            toxicCircleD.setRadius(currentRadiusMeters);
                            
                            const getDist = (lat1, lon1, lat2, lon2) => {
                                const R = 6371e3; const r1 = lat1 * Math.PI/180, r2 = lat2 * Math.PI/180;
                                const d1 = (lat2-lat1) * Math.PI/180, d2 = (lon2-lon1) * Math.PI/180;
                                const a = Math.sin(d1/2)*Math.sin(d1/2) + Math.cos(r1)*Math.cos(r2)*Math.sin(d2/2)*Math.sin(d2/2);
                                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                            };
                            
                            actors.forEach(a => {
                                if (a.active && !styleDWon.includes(a)) {
                                    let dist = getDist(styleDCenter.lat, styleDCenter.lng, a.currentLat, a.currentLng);
                                    if (dist > currentRadiusMeters) {
                                        if (a.marker) a.marker.remove();
                                        if (a.polyline) a.polyline.setStyle({opacity: 0});
                                        a.active = false;
                                    }
                                }
                            });
                            
                            let initialLoserCount = actors.length - styleDWon.length;
                            let targetLoserCount = Math.floor(initialLoserCount * (1 - progress));
                            let currentActiveLosers = actors.filter(a => a.active && !styleDWon.includes(a));
                            
                            if (currentActiveLosers.length > targetLoserCount) {
                                // 根據距離中心點由遠到近排序，優先淘汰離中心點最遠（最靠近毒圈邊緣）的人
                                currentActiveLosers.sort((a, b) => {
                                    let distA = getDist(styleDCenter.lat, styleDCenter.lng, a.currentLat, a.currentLng);
                                    let distB = getDist(styleDCenter.lat, styleDCenter.lng, b.currentLat, b.currentLng);
                                    return distB - distA; 
                                });
                                
                                while (currentActiveLosers.length > targetLoserCount) {
                                    let victim = currentActiveLosers.shift(); // 取出最遠的那個人
                                    if (victim.marker) victim.marker.remove();
                                    if (victim.polyline) victim.polyline.setStyle({opacity: 0});
                                    victim.active = false;
                                }
                            }
                        }
                        
                        if (typeof lowResCtx !== 'undefined' && typeof fogCtx !== 'undefined' && typeof map !== 'undefined') {
                            lowResCtx.globalCompositeOperation = 'source-over';
                            lowResCtx.fillStyle = 'rgba(15,20,25,0.95)';
                            lowResCtx.fillRect(0, 0, lowResCanvas.width, lowResCanvas.height);
                            
                            lowResCtx.globalCompositeOperation = 'destination-out';
                            const FOG_SCALE = 0.08;
                            const c = map.getCenter();
                            const mpp = (40075016.686 * Math.abs(Math.cos(c.lat * Math.PI / 180))) / Math.pow(2, map.getZoom() + 8);
                            const radius = (20 / mpp) * FOG_SCALE;
                            
                            // 恢復原本「一點一點」畫圓圈的除霧方式，但使用高效能批次渲染
                            lowResCtx.fillStyle = 'black';
                            lowResCtx.beginPath();
                            
                            actors.forEach(actor => {
                                if (actor.active && actor.baseIdx >= 0) {
                                    for(let k = 0; k <= actor.baseIdx; k++) {
                                        let curr = actor.path[k];
                                        let tp = map.latLngToContainerPoint([
                                            (curr.lat !== undefined ? curr.lat : curr[0]),
                                            (curr.lng !== undefined ? curr.lng : curr[1])
                                        ]);
                                        // moveTo 斷開路徑，確保畫出來的是獨立的圓圈而不是連線
                                        lowResCtx.moveTo(tp.x * FOG_SCALE + radius, tp.y * FOG_SCALE);
                                        lowResCtx.arc(tp.x * FOG_SCALE, tp.y * FOG_SCALE, radius, 0, Math.PI * 2);
                                    }
                                    
                                    if (actor.remainder > 0 && actor.currentLat !== undefined) {
                                        let currP = map.latLngToContainerPoint([actor.currentLat, actor.currentLng]);
                                        lowResCtx.moveTo(currP.x * FOG_SCALE + radius, currP.y * FOG_SCALE);
                                        lowResCtx.arc(currP.x * FOG_SCALE, currP.y * FOG_SCALE, radius, 0, Math.PI * 2);
                                    }
                                }
                            });
                            
                            // 一次性 Fill，效能比原本快上萬倍，不會當機
                            lowResCtx.fill();
                            
                            fogCtx.imageSmoothingEnabled = false;
                            fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
                            fogCtx.drawImage(lowResCanvas, 0, 0, lowResCanvas.width, lowResCanvas.height, 0, 0, fogCanvas.width, fogCanvas.height);
                        }
                    }
                    
                    if (elapsed > Math.max(0, duration - 10000)) {
                        document.body.classList.remove('hide-found-markers');
                    }
                    
                    if (elapsed > duration) {
                        cancelAnimationFrame(animationFrameId);
                        
                        let oldCounter = document.getElementById('anim-counter');
                        if (oldCounter) oldCounter.remove();
                        
                        // 但保留霧的更新機制以防破圖
                        if (typeof window.originalRequestFogRender === 'function') {
                            window.requestFogRender = window.originalRequestFogRender;
                        }
                        
                        let activeActors = actors.filter(a => a.active && a.marker);
                        let winnerCount = window.PRIZE_WINNER_COUNT || 2;
                        winnerCount = Math.max(1, Math.min(winnerCount, activeActors.length));
                        
                        if (activeActors.length < winnerCount) {
                            alert("進場人數不足，無法進行抽獎！");
                            return;
                        }
                        
                        let styleId = window.PRIZE_DRAW_STYLE || 1;
                        if (styleId === 4) {
                            if (toxicCircleD) toxicCircleD.remove();
                            let names = styleDWon.map(w => w.name).join(' & ');
                            let msg = `🎯 大逃殺毒圈收縮完畢：\n🎉 恭喜得獎者：${names}！`;
                            triggerFinalReveal(actors, styleDWon, msg);
                            return;
                        }
                        
                        let winners = [];
                        let w1 = activeActors[Math.floor(Math.random() * activeActors.length)];
                        winners.push(w1);
                        
                        const getDist = (lat1, lon1, lat2, lon2) => {
                            const R = 6371e3;
                            const r1 = lat1 * Math.PI/180, r2 = lat2 * Math.PI/180;
                            const d1 = (lat2-lat1) * Math.PI/180, d2 = (lon2-lon1) * Math.PI/180;
                            const a = Math.sin(d1/2)*Math.sin(d1/2) + Math.cos(r1)*Math.cos(r2)*Math.sin(d2/2)*Math.sin(d2/2);
                            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                        };
                        
                        // 若需要多位得獎者，依序找出距離最近的人加入
                        while (winners.length < winnerCount) {
                            let closest = null;
                            let minDist = Infinity;
                            activeActors.forEach(a => {
                                if (!winners.includes(a)) {
                                    // 找與目前所有得獎者群集最靠近的人（簡單取與w1的距離）
                                    let d = getDist(w1.currentLat, w1.currentLng, a.currentLat, a.currentLng);
                                    if (d < minDist) {
                                        minDist = d;
                                        closest = a;
                                    }
                                }
                            });
                            if (closest) winners.push(closest);
                            else break;
                        }
                        
                        if (styleId === 1) runDrawStyle1(activeActors, winners);
                        else if (styleId === 2) runDrawStyle2(activeActors, winners);
                        else if (styleId === 3) runDrawStyle3(activeActors, winners);
                        
                        return;
                    }
                    
                    animationFrameId = requestAnimationFrame(animateFrame);
                } catch(err) {
                    console.error("animateFrame Error: ", err);
                    alert("動畫發生錯誤: " + err.message);
                }
            }
            animationFrameId = requestAnimationFrame(animateFrame);
        } catch(err) {
            console.error("startAnimation Error: ", err);
            alert("初始化動畫失敗: " + err.message);
        }
    }
    
    async function triggerFinalReveal(allActors, winners, message) {
        // 如果兩名得獎者重疊或太近，將他們左右錯開 (像是頒獎台排排站)
        const getDist = (lat1, lon1, lat2, lon2) => {
            const R = 6371e3;
            const r1 = lat1 * Math.PI/180, r2 = lat2 * Math.PI/180;
            const d1 = (lat2-lat1) * Math.PI/180, d2 = (lon2-lon1) * Math.PI/180;
            const a = Math.sin(d1/2)*Math.sin(d1/2) + Math.cos(r1)*Math.cos(r2)*Math.sin(d2/2)*Math.sin(d2/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };
        
        if (winners.length === 2) {
            let wDist = getDist(winners[0].currentLat, winners[0].currentLng, winners[1].currentLat, winners[1].currentLng);
            if (wDist < 30) {
                // 緯度 1 度約 111111 公尺
                let lngOffset = (25 / 111111) / Math.cos(winners[0].currentLat * Math.PI / 180);
                winners[0].currentLng -= lngOffset;
                winners[1].currentLng += lngOffset;
                
                // 加入平滑滑動特效
                if (winners[0].marker && winners[0].marker.getElement()) {
                    winners[0].marker.getElement().style.transition = 'transform 0.5s ease-out';
                    winners[0].marker.setLatLng([winners[0].currentLat, winners[0].currentLng]);
                }
                if (winners[1].marker && winners[1].marker.getElement()) {
                    winners[1].marker.getElement().style.transition = 'transform 0.5s ease-out';
                    winners[1].marker.setLatLng([winners[1].currentLat, winners[1].currentLng]);
                }
            }
        }
        
        // C 風格的招牌：將所有非中獎者淡化
        allActors.forEach(a => {
            if (!winners.includes(a)) {
                if (a.marker && a.marker.getElement()) {
                    a.marker.getElement().style.opacity = '0.3';
                }
                if (a.polyline) a.polyline.setStyle({opacity: 0.1});
            }
        });
        
        let bounds = L.latLngBounds(winners.map(w => [w.currentLat, w.currentLng]));
        map.fitBounds(bounds, {padding: [100, 100], maxZoom: 18});
        
        setTimeout(() => {
            winners.forEach((w, i) => {
                let circle = L.circleMarker([w.currentLat, w.currentLng], {
                    radius: 10,
                    color: i === 0 ? '#fbbf24' : '#60a5fa',
                    fillColor: i === 0 ? '#f59e0b' : '#3b82f6',
                    fillOpacity: 0.8,
                    weight: 4
                }).addTo(map);
                
                let r = 10;
                let iv = setInterval(() => {
                    r += 5;
                    circle.setRadius(r);
                    circle.setStyle({opacity: Math.max(0, 1 - r/150), fillOpacity: Math.max(0, 0.8 - r/150)});
                    if (r > 150) {
                        clearInterval(iv);
                        circle.remove();
                    }
                }, 50);
                
                // 改對內部容器操作，避免 Leaflet 覆寫 transform
                if (w.marker && w.marker.getElement()) {
                    let inner = w.marker.getElement().querySelector('.user-label-container');
                    if (inner) {
                        inner.style.transition = 'transform 0.3s';
                        inner.style.transform = 'scale(2.5)';
                        inner.style.transformOrigin = 'bottom center';
                    }
                    w.marker.getElement().style.zIndex = 30000;
                }
            });
            
            if (winners.length >= 2) {
                let latlngs = winners.map(w => [w.currentLat, w.currentLng]);
                latlngs.push([winners[0].currentLat, winners[0].currentLng]);
                L.polyline(latlngs, {color: '#ef4444', weight: 6, dashArray: '10,10', className: 'radar-line'}).addTo(map);
            }
            
            let amount = window.PRIZE_AMOUNT || 5000;
            let overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
            overlay.style.zIndex = '999999';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            
            let winnerHTML = winners.map(w => {
                let nameHtml = w.url ? `<a href="${w.url}" target="_blank" style="color:#2563eb; font-size:26px; text-decoration:underline; cursor:pointer;">${w.name}</a>` : `<span style="color:#2563eb; font-size:26px;">${w.name}</span>`;
                return `<p style="font-size:22px; font-weight:bold; margin-bottom:10px;">恭喜 ${nameHtml}</p>`;
            }).join('');
            
            overlay.innerHTML = `
                <div style="background:white; padding:30px; border:4px solid black; border-radius:10px; text-align:center; max-width:90%; width:400px; box-shadow: 10px 10px 0px black;">
                    <h2 style="font-size:32px; font-weight:bold; color:#ef4444; margin-bottom:20px; text-shadow: 2px 2px 0px #fcd34d;">幸運星誕生</h2>
                    <div style="max-height:40vh; overflow-y:auto; margin-bottom:15px;">
                        ${winnerHTML}
                    </div>
                    <div style="font-size:24px; font-weight:bold; margin-bottom:30px; background:#fef3c7; padding:15px; border:2px dashed #d97706; color:#b45309; border-radius:8px;">
                        獲得獎金 ${amount} 💰
                    </div>
                    <button id="fp-final-confirm" style="padding:15px 50px; font-size:22px; font-weight:bold; background:#10b981; color:white; border:3px solid black; cursor:pointer; box-shadow:4px 4px 0px black; border-radius:8px; transition:transform 0.1s;">確認</button>
                </div>
            `;
            document.body.appendChild(overlay);
            
            document.getElementById('fp-final-confirm').addEventListener('click', () => {
                overlay.remove();
                // 演出徹底結束，解除鎖定並還原 UI
                let lock = document.getElementById('anim-pointer-lock');
                if (lock) lock.remove();
                
                const showIds = ['admin-panel', 'project-select-wrapper', 'locate-btn', 'spectator-btn', 'toggle-fog-btn', 'nav-pin-btn', 'force-upload-btn', 'my-route-btn', 'eva-grid-btn', 'playback-controls'];
                showIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = '';
                });
                
                isSpectatorMode = false;
                if (typeof map !== 'undefined' && map) map.dragging.enable();
                
                let foundBtn = document.getElementById('found-prize-btn');
                if (foundBtn) {
                    foundBtn.innerText = "✨ 再次抽獎";
                    foundBtn.style.background = "#10b981";
                }
            });
        }, 1000);
    }

    async function runDrawStyle1(allActors, winners) {
        allActors.forEach(a => {
            if (a.polyline) a.polyline.setStyle({opacity: 0.1});
        });
        
        let overlay = document.createElement('div');
        // 使用 CSS 放射狀漸層，在畫面正中央挖出一個「全亮」的聚光燈洞
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 100px, rgba(0,0,0,0.8) 250px); z-index:10000; pointer-events:none; transition: background 1s;';
        document.body.appendChild(overlay);
        
        let candidateText = document.createElement('div');
        candidateText.style.cssText = 'position:fixed; top:20px; right:20px; background:rgba(0,0,0,0.8); color:#fbbf24; padding:10px 20px; border-radius:10px; font-size:20px; font-weight:bold; z-index:10001; border:2px solid #fbbf24; pointer-events:none; transition: opacity 0.3s;';
        document.body.appendChild(candidateText);
        
        let candidateIndex = 1;

        const panAndPop = async (actor) => {
            candidateText.innerHTML = `🔍 尋找候選人 ${candidateIndex}/5...`;
            map.flyTo([actor.currentLat, actor.currentLng], 18, {duration: 0.8});
            
            // 等待鏡頭飛到定位
            await new Promise(r => setTimeout(r, 800));
            
            candidateText.innerHTML = `🎯 鎖定候選人 ${candidateIndex}！`;
            candidateIndex++;
            
            // 放大標籤：對內部容器操作，避免 Leaflet 覆寫
            if (actor.marker && actor.marker.getElement()) {
                let inner = actor.marker.getElement().querySelector('.user-label-container');
                if (inner) {
                    inner.style.transition = 'transform 0.3s';
                    inner.style.transform = 'scale(2.5)';
                    inner.style.transformOrigin = 'bottom center';
                }
                actor.marker.getElement().style.zIndex = 30000;
            }
            
            // 停頓 600ms 讓畫面看清楚候選人
            await new Promise(r => setTimeout(r, 600));
            
            // 縮小復原
            if (actor.marker && actor.marker.getElement()) {
                let inner = actor.marker.getElement().querySelector('.user-label-container');
                if (inner) {
                    inner.style.transform = 'scale(1)';
                }
                actor.marker.getElement().style.zIndex = '';
            }
        };
        
        // 準備 5 名候選人 (包含 2 名真正得獎者，以及 3 名煙霧彈)
        let losers = allActors.filter(a => !winners.includes(a));
        let candidates = [...winners];
        
        while(candidates.length < 5 && losers.length > 0) {
            let fake = losers.splice(Math.floor(Math.random() * losers.length), 1)[0];
            candidates.push(fake);
        }
        
        // 打亂順序，避免最後一個總是得獎者
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        
        // 依序點名候選人
        for(let i=0; i<candidates.length; i++) {
            await panAndPop(candidates[i]);
        }
        
        // 篩選結束，將結果傳給最終演出
        candidateText.remove();
        overlay.style.background = 'rgba(0,0,0,0)';
        setTimeout(() => overlay.remove(), 1000);
        let names = winners.map(w => w.name).join(' & ');
        triggerFinalReveal(allActors, winners, `🎯 輪盤鎖定完畢！\n🎉 恭喜得獎者：${names}！`);
    }

    async function runDrawStyle2(allActors, winners) {
        showCenterToast("🌪️ [風格B] 迷霧大逃殺開始！毒圈收縮中...", 5000);
        
        if (typeof routesLayer !== 'undefined') routesLayer.clearLayers();
        
        let centerLat = (winners[0].currentLat + winners[1].currentLat) / 2;
        let centerLng = (winners[0].currentLng + winners[1].currentLng) / 2;
        
        // 使用真實地理距離(公尺)來計算毒圈
        const getDist = (lat1, lon1, lat2, lon2) => {
            const R = 6371e3;
            const r1 = lat1 * Math.PI/180, r2 = lat2 * Math.PI/180;
            const d1 = (lat2-lat1) * Math.PI/180, d2 = (lon2-lon1) * Math.PI/180;
            const a = Math.sin(d1/2)*Math.sin(d1/2) + Math.cos(r1)*Math.cos(r2)*Math.sin(d2/2)*Math.sin(d2/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };
        
        let nw = map.getBounds().getNorthWest();
        let startRadiusMeters = getDist(centerLat, centerLng, nw.lat, nw.lng); 
        
        let wDistMeters = getDist(winners[0].currentLat, winners[0].currentLng, winners[1].currentLat, winners[1].currentLng);
        let endRadiusMeters = Math.max(20, wDistMeters / 2 + 30); // 縮到剛好包住兩個得獎者
        
        // 建立紅色毒圈 (Leaflet 圓形，會自動跟隨地圖縮放，不會破圖)
        let toxicCircle = L.circle([centerLat, centerLng], {
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.1,
            weight: 4,
            dashArray: '10, 10'
        }).addTo(map);
        
        let startTime = Date.now();
        let duration = 8000; // 延長至 8 秒，讓運鏡更充足
        
        // 為了確保最後必定只剩 2 人，需要強制隨機淘汰圈內的非得獎者
        let totalLosers = allActors.filter(a => a.active && !winners.includes(a));
        let initialLoserCount = totalLosers.length;
        // 打亂順序，這樣 pop() 就是隨機淘汰
        for (let i = totalLosers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [totalLosers[i], totalLosers[j]] = [totalLosers[j], totalLosers[i]];
        }
        
        const decayFrame = () => {
            let elapsed = Date.now() - startTime;
            let progress = Math.min(1.0, elapsed / duration);
            
            // 平滑收縮曲線
            let easeProgress = progress * (2 - progress);
            let currentRadiusMeters = startRadiusMeters - (startRadiusMeters - endRadiusMeters) * easeProgress;
            
            // 更新地圖上的毒圈大小
            toxicCircle.setRadius(currentRadiusMeters);
            
            // 目標非得獎者存活數量 (隨時間線性遞減至 0)
            let targetLoserCount = Math.floor(initialLoserCount * (1 - progress));
            
            // 物理淘汰：殺死真實在毒圈外的人 (用真實地理距離判斷)
            allActors.forEach(a => {
                if (a.active && !winners.includes(a)) {
                    let dist = getDist(centerLat, centerLng, a.currentLat, a.currentLng);
                    if (dist > currentRadiusMeters) {
                        if (a.marker) a.marker.remove();
                        if (a.polyline) a.polyline.setStyle({opacity: 0});
                        a.active = false;
                    }
                }
            });
            
            // 劇情淘汰：如果物理淘汰殺得不夠快 (例如大家都擠在圈內)，強制暗殺超出配額的非得獎者
            let currentActiveLosers = allActors.filter(a => a.active && !winners.includes(a));
            while (currentActiveLosers.length > targetLoserCount) {
                // 從 totalLosers 取出一個還活著的人來殺
                let victim = totalLosers.pop();
                if (victim && victim.active) {
                    if (victim.marker) victim.marker.remove();
                    if (victim.polyline) victim.polyline.setStyle({opacity: 0});
                    victim.active = false;
                    currentActiveLosers = allActors.filter(a => a.active && !winners.includes(a));
                } else if (!victim) {
                    break;
                }
            }
            
            // 維持原本地圖底層的黑霧顯示方式 (0.02 漸隱，而不是直接塗黑)
            if (typeof lowResCtx !== 'undefined' && typeof fogCtx !== 'undefined') {
                lowResCtx.globalCompositeOperation = 'source-over';
                lowResCtx.fillStyle = 'rgba(15,20,25,0.02)';
                lowResCtx.fillRect(0, 0, lowResCanvas.width, lowResCanvas.height);
                
                lowResCtx.globalCompositeOperation = 'destination-out';
                lowResCtx.beginPath();
                allActors.forEach(a => {
                    if (a.active) {
                        let p = map.latLngToContainerPoint([a.currentLat, a.currentLng]);
                        lowResCtx.moveTo(p.x * 0.08 + 15, p.y * 0.08);
                        lowResCtx.arc(p.x * 0.08, p.y * 0.08, 15, 0, Math.PI * 2);
                    }
                });
                lowResCtx.fill();
                
                fogCtx.imageSmoothingEnabled = false;
                fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
                fogCtx.drawImage(lowResCanvas, 0, 0, lowResCanvas.width, lowResCanvas.height, 0, 0, fogCanvas.width, fogCanvas.height);
            }
            
            if (progress < 1.0) {
                requestAnimationFrame(decayFrame);
            } else {
                toxicCircle.remove();
                setTimeout(() => {
                    triggerFinalReveal(allActors, winners, `🎯 大逃殺毒圈收縮完畢：\n🎉 恭喜得獎者：${winners[0].name} & ${winners[1].name}！`);
                }, 500);
            }
        };
        
        // 先飛到毒圈正中央
        map.flyTo([centerLat, centerLng], map.getZoom(), {animate: true, duration: 1.0});
        
        setTimeout(() => {
            requestAnimationFrame(decayFrame);
            
            // 計算最後兩個人的邊界，取得最適合的 Zoom Level (加上一些 padding 避免貼邊)
            let finalBounds = L.latLngBounds(
                [winners[0].currentLat, winners[0].currentLng],
                [winners[1].currentLat, winners[1].currentLng]
            ).pad(0.3);
            
            let targetZoom = map.getBoundsZoom(finalBounds);
            
            // 分三次慢慢放大畫面，但絕對不超過能包覆兩人的最大 Zoom Level
            let stepDelay = duration / 4;
            for(let i=1; i<=3; i++) {
                setTimeout(() => {
                    if (map.getZoom() < targetZoom) {
                        map.setZoom(map.getZoom() + 1, {animate: true});
                    }
                }, i * stepDelay);
            }
            
        }, 1200);
    }

    async function runDrawStyle3(allActors, winners) {
        showCenterToast("📡 [風格C] 天降幸運雷達鎖定中...", 3000);
        triggerFinalReveal(allActors, winners, `🎯 雷達鎖定完畢！\n🎉 恭喜得獎者：${winners[0].name} & ${winners[1].name}！`);
    }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFoundPrizeAnimation);
} else {
    initFoundPrizeAnimation();
}
