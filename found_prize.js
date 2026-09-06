// found_prize.js
// 尋獲抽獎動畫展示腳本

function initFoundPrizeAnimation() {
    const btn = document.getElementById('found-prize-btn');
    if (!btn) {
        console.error("找不到尋獲抽獎按鈕 (found-prize-btn)");
        setTimeout(initFoundPrizeAnimation, 1000);
        return;
    }
    
    if (btn.hasAttribute('data-fp-bound')) return;
    btn.addEventListener('click', async () => {
        let oldModal = document.getElementById('fp-style-modal');
        if (oldModal) oldModal.remove();
        
        let modal = document.createElement('div');
        modal.id = 'fp-style-modal';
        modal.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:20px; z-index:999999; border:4px solid black; box-shadow:5px 5px 0px black; text-align:center; min-width:320px; font-family:sans-serif;';
        
        modal.innerHTML = `
            <h2 style="font-size:20px; font-weight:bold; margin-bottom:15px; color:#1f2937;">🎉 選擇最後的抽獎呈現方式</h2>
            <p style="font-size:14px; margin-bottom:15px; color:#4b5563; line-height:1.5;">60秒的進場動畫結束後，將自動抽出 2 位幸運兒。<br>請選擇您想測試的視覺特效：</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button id="fp-style-1" style="padding:12px; background:#3b82f6; color:white; border:2px solid black; cursor:pointer; font-weight:bold; font-size:16px;">🔦 風格 A：聚光燈輪盤 (運鏡切換)</button>
                <button id="fp-style-2" style="padding:12px; background:#8b5cf6; color:white; border:2px solid black; cursor:pointer; font-weight:bold; font-size:16px;">🌪️ 風格 B：迷霧大逃殺 (毒圈縮小)</button>
                <button id="fp-style-3" style="padding:12px; background:#ef4444; color:white; border:2px solid black; cursor:pointer; font-weight:bold; font-size:16px;">📡 風格 C：天降幸運雷達 (全局鎖定)</button>
            </div>
            <button id="fp-cancel" style="margin-top:15px; padding:8px 20px; background:#d1d5db; border:2px solid black; cursor:pointer; font-weight:bold;">取消</button>
        `;
        document.body.appendChild(modal);
        
        const startWithStyle = (styleId) => {
            modal.remove();
            window.PRIZE_DRAW_STYLE = styleId;
            
            const hideIds = ['admin-panel', 'status-toast', 'project-select-wrapper', 'locate-btn', 'spectator-btn', 'toggle-fog-btn', 'nav-pin-btn', 'force-upload-btn', 'my-route-btn', 'eva-grid-btn', 'playback-controls'];
            hideIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            
            showCenterToast("⏳ 正在向伺服器請求完整歷史軌跡...", 60000);
        
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
                        startAnimation(res.paths);
                    } else {
                        if (originalOnMessage) originalOnMessage(event);
                    }
                };
                
                if (typeof wsSend === 'function' && typeof currentProjectKey !== 'undefined') {
                    wsSend("admin_get_animation_paths", {project: currentProjectKey});
                } else {
                    ws.send(JSON.stringify({ type: 'get_animation_paths' }));
                }
            }
        };
        
        document.getElementById('fp-style-1').onclick = () => startWithStyle(1);
        document.getElementById('fp-style-2').onclick = () => startWithStyle(2);
        document.getElementById('fp-style-3').onclick = () => startWithStyle(3);
        document.getElementById('fp-cancel').onclick = () => modal.remove();
    });

    async function startAnimation(serverPaths) {
        try {
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
            
            if (joins.length === 0) {
                alert("joins.csv 內沒有有效資料！");
                return;
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
            let counterDiv = document.createElement('div');
            counterDiv.id = 'anim-counter';
            counterDiv.style.cssText = 'position:fixed; top:70px; right:10px; z-index:99999; background:rgba(0,0,0,0.85); color:white; padding:12px; border-radius:8px; font-size:14px; border:1px solid #3b82f6; box-shadow: 0 4px 6px rgba(0,0,0,0.3); pointer-events:auto;';
            document.body.appendChild(counterDiv);
            
            // 關閉地圖上所有圖標與線條的滑鼠感應，避免滑鼠移過去觸發彈出視窗
            let oldLock = document.getElementById('anim-pointer-lock');
            if (oldLock) oldLock.remove();
            let style = document.createElement('style');
            style.id = 'anim-pointer-lock';
            style.innerHTML = `
                .leaflet-marker-pane, .leaflet-overlay-pane, .leaflet-interactive {
                    pointer-events: none !important;
                }
                #toggle-sighting-track-btn, #spectator-hint {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
            
            const duration = 60000;
            const startTime = Date.now();
            // 修正進場間隔：確保所有人在前 45 秒內全部進場完畢
            const spawnInterval = 45000 / joins.length;
            
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
                
                return {
                    id: 'anim_user_' + idx,
                    name: j.name,
                    spawnTime: idx * spawnInterval,
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
                                        actor.marker = L.marker([ptLat, ptLng], {icon: icon, zIndexOffset: 20000});
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
                        
                        // 更新除錯面板
                        let activeActors = actors.filter(a => a.active).length;
                        let renderedMarkers = document.querySelectorAll('.custom-div-icon').length;
                        counterDiv.innerHTML = `
                            <div style="margin-bottom:5px; font-weight:bold; color:#10b981;">📊 渲染狀態監控</div>
                            動畫進度: ${Math.min(60, Math.floor(elapsed/1000))}s / 60s<br>
                            名單總人數: ${joins.length}<br>
                            已進場人數: ${activeActors}<br>
                            畫面中標記數: <span style="color:#f59e0b; font-weight:bold;">${renderedMarkers}</span>
                        `;
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
                        if (activeActors.length < 2) {
                            alert("進場人數不足 2 人，無法進行抽獎！");
                            return;
                        }
                        let winners = [];
                        while(winners.length < 2) {
                            let w = activeActors[Math.floor(Math.random() * activeActors.length)];
                            if (!winners.includes(w)) winners.push(w);
                        }
                        
                        let styleId = window.PRIZE_DRAW_STYLE || 1;
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
        // C 風格的招牌：將所有非中獎者淡化
        allActors.forEach(a => {
            if (!winners.includes(a)) {
                if (a.marker && a.marker.getElement()) {
                    a.marker.getElement().style.opacity = '0.3';
                }
                if (a.polyline) a.polyline.setStyle({opacity: 0.1});
            }
        });
        
        map.fitBounds([
            [winners[0].currentLat, winners[0].currentLng],
            [winners[1].currentLat, winners[1].currentLng]
        ], {padding: [100, 100]});
        
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
            
            L.polyline([
                [winners[0].currentLat, winners[0].currentLng],
                [winners[1].currentLat, winners[1].currentLng]
            ], {color: '#ef4444', weight: 6, dashArray: '10,10', className: 'radar-line'}).addTo(map);
            
            showCenterToast(message, 10000);
            
            // 演出徹底結束，解除鎖定並還原 UI
            let lock = document.getElementById('anim-pointer-lock');
            if (lock) lock.remove();
        }, 2000);
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
        
        // 篩選結束，將結果傳給 C 進行最終演出
        candidateText.remove();
        overlay.style.background = 'rgba(0,0,0,0)';
        setTimeout(() => overlay.remove(), 1000);
        triggerFinalReveal(allActors, winners, `🎯 輪盤鎖定完畢！\n🎉 恭喜得獎者：${winners[0].name} & ${winners[1].name}！`);
    }

    async function runDrawStyle2(allActors, winners) {
        showCenterToast("🌪️ [風格B] 迷霧大逃殺開始！毒霧腐蝕中...", 5000);
        
        if (typeof routesLayer !== 'undefined') routesLayer.clearLayers();
        
        let centerLat = (winners[0].currentLat + winners[1].currentLat) / 2;
        let centerLng = (winners[0].currentLng + winners[1].currentLng) / 2;
        
        // 使用真實地理距離(公尺)來計算毒圈，這樣當地圖放大時，毒圈才不會跑位
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
        
        let startTime = Date.now();
        let duration = 8000; // 延長至 8 秒，讓運鏡更充足
        
        const decayFrame = () => {
            let elapsed = Date.now() - startTime;
            let progress = Math.min(1.0, elapsed / duration);
            
            // 平滑收縮曲線
            let easeProgress = progress * (2 - progress);
            let currentRadiusMeters = startRadiusMeters - (startRadiusMeters - endRadiusMeters) * easeProgress;
            
            // 將真實地理半徑轉換為當前畫面縮放級別下的 Pixel 半徑
            let centerPoint = map.latLngToContainerPoint([centerLat, centerLng]);
            let edgeLat = centerLat + (currentRadiusMeters / 111111); // 緯度1度約111公里
            let edgePoint = map.latLngToContainerPoint([edgeLat, centerLng]);
            let currentRadiusPixels = Math.abs(edgePoint.y - centerPoint.y);
            
            // 殺死毒圈外的人 (用真實地理距離判斷)
            allActors.forEach(a => {
                if (a.active && !winners.includes(a)) {
                    let dist = getDist(centerLat, centerLng, a.currentLat, a.currentLng);
                    if (dist > currentRadiusMeters) {
                        if (a.marker) a.marker.remove();
                        a.active = false;
                    }
                }
            });
            
            // Render
            if (typeof lowResCtx !== 'undefined' && typeof fogCtx !== 'undefined') {
                lowResCtx.globalCompositeOperation = 'source-over';
                lowResCtx.fillStyle = 'black';
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
                
                // 畫毒圈外圍的紅色濃霧
                lowResCtx.globalCompositeOperation = 'source-over';
                lowResCtx.fillStyle = 'rgba(20,0,0,0.85)';
                lowResCtx.beginPath();
                lowResCtx.rect(0, 0, lowResCanvas.width, lowResCanvas.height);
                lowResCtx.moveTo(centerPoint.x * 0.08 + currentRadiusPixels * 0.08, centerPoint.y * 0.08);
                lowResCtx.arc(centerPoint.x * 0.08, centerPoint.y * 0.08, currentRadiusPixels * 0.08, 0, Math.PI * 2, true);
                lowResCtx.fill();
                
                // 紅色邊界線
                lowResCtx.strokeStyle = 'rgba(255,50,50,0.8)';
                lowResCtx.lineWidth = 1;
                lowResCtx.beginPath();
                lowResCtx.arc(centerPoint.x * 0.08, centerPoint.y * 0.08, currentRadiusPixels * 0.08, 0, Math.PI * 2);
                lowResCtx.stroke();
                
                fogCtx.imageSmoothingEnabled = false;
                fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
                fogCtx.drawImage(lowResCanvas, 0, 0, lowResCanvas.width, lowResCanvas.height, 0, 0, fogCanvas.width, fogCanvas.height);
            }
            
            if (progress < 1.0) {
                requestAnimationFrame(decayFrame);
            } else {
                setTimeout(() => {
                    triggerFinalReveal(allActors, winners, `🎯 大逃殺毒圈收縮完畢：\n🎉 恭喜得獎者：${winners[0].name} & ${winners[1].name}！`);
                }, 500);
            }
        };
        
        // 先飛到毒圈正中央
        map.flyTo([centerLat, centerLng], map.getZoom(), {animate: true, duration: 1.0});
        
        setTimeout(() => {
            requestAnimationFrame(decayFrame);
            
            // 分三次慢慢放大畫面 (配合毒圈收縮)
            setTimeout(() => map.setZoom(map.getZoom() + 1), 2000);
            setTimeout(() => map.setZoom(map.getZoom() + 1), 4000);
            setTimeout(() => map.setZoom(map.getZoom() + 1), 6000);
        }, 1200);
    }

    async function runDrawStyle3(allActors, winners) {
        showCenterToast("📡 [風格C] 天降幸運雷達鎖定中...", 3000);
        triggerFinalReveal(allActors, winners, `🎯 雷達鎖定完畢！\n🎉 恭喜得獎者：${winners[0].name} & ${winners[1].name}！`);
    }
} // <--- This closes initFoundPrizeAnimation

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFoundPrizeAnimation);
} else {
    initFoundPrizeAnimation();
}
