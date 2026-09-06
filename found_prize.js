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
                    if (currentSegment.length > 3) allPaths.push(currentSegment);
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
                        
                        let lock = document.getElementById('anim-pointer-lock');
                        if (lock) lock.remove();
                        
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
    
    async function runDrawStyle1(allActors, winners) {
        showCenterToast("🔦 [風格A] 聚光燈輪盤啟動...", 3000);
        allActors.forEach(a => {
            if (a.polyline) a.polyline.setStyle({opacity: 0.1});
        });
        
        let overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; pointer-events:none; transition: background 1s;';
        document.body.appendChild(overlay);
        
        const panTo = (actor, delay) => new Promise(res => {
            setTimeout(() => {
                map.flyTo([actor.currentLat, actor.currentLng], 18, {duration: 0.8});
                res();
            }, delay);
        });
        
        for(let i=0; i<3; i++) {
            let fake = allActors[Math.floor(Math.random() * allActors.length)];
            await panTo(fake, 1200);
        }
        
        await panTo(winners[0], 1500);
        setTimeout(() => {
            winners[0].marker.getElement().style.transform += ' scale(2.5)';
            winners[0].marker.getElement().style.zIndex = 30000;
            showCenterToast(`🎉 第一位中獎者：${winners[0].name}！`, 4000);
        }, 1000);
        
        for(let i=0; i<2; i++) {
            let fake = allActors[Math.floor(Math.random() * allActors.length)];
            await panTo(fake, 1800);
        }
        
        await panTo(winners[1], 1500);
        setTimeout(() => {
            winners[1].marker.getElement().style.transform += ' scale(2.5)';
            winners[1].marker.getElement().style.zIndex = 30000;
            showCenterToast(`🎉 第一位：${winners[0].name}\n🎉 第二位：${winners[1].name}\n\n抽獎結束！`, 10000);
            overlay.style.background = 'rgba(0,0,0,0)';
            setTimeout(() => overlay.remove(), 1000);
        }, 1000);
    }

    async function runDrawStyle2(allActors, winners) {
        showCenterToast("🌪️ [風格B] 迷霧大逃殺開始！毒圈縮小中...", 4000);
        
        if (typeof routesLayer !== 'undefined') routesLayer.clearLayers();
        if (typeof lowResCtx !== 'undefined' && typeof fogCtx !== 'undefined') {
            lowResCtx.globalCompositeOperation = 'source-over';
            lowResCtx.fillStyle = 'black';
            lowResCtx.fillRect(0, 0, lowResCanvas.width, lowResCanvas.height);
            fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
            fogCtx.drawImage(lowResCanvas, 0, 0, lowResCanvas.width, lowResCanvas.height, 0, 0, fogCanvas.width, fogCanvas.height);
        }
        
        let pool = [...allActors];
        const shrinkPool = (targetCount, delay) => new Promise(res => {
            setTimeout(() => {
                let keep = [...winners];
                while(keep.length < targetCount && pool.length > keep.length) {
                    let k = pool[Math.floor(Math.random() * pool.length)];
                    if (!keep.includes(k)) keep.push(k);
                }
                pool.forEach(a => {
                    if (!keep.includes(a) && a.marker) {
                        a.marker.remove();
                        a.active = false;
                    }
                });
                pool = keep;
                
                lowResCtx.globalCompositeOperation = 'source-over';
                lowResCtx.fillRect(0, 0, lowResCanvas.width, lowResCanvas.height);
                lowResCtx.globalCompositeOperation = 'destination-out';
                pool.forEach(a => {
                    let p = map.latLngToContainerPoint([a.currentLat, a.currentLng]);
                    lowResCtx.beginPath();
                    lowResCtx.arc(p.x * 0.08, p.y * 0.08, 15, 0, Math.PI * 2);
                    lowResCtx.fill();
                });
                fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
                fogCtx.drawImage(lowResCanvas, 0, 0, lowResCanvas.width, lowResCanvas.height, 0, 0, fogCanvas.width, fogCanvas.height);
                
                res();
            }, delay);
        });
        
        await shrinkPool(50, 1000);
        await shrinkPool(15, 2000);
        await shrinkPool(2, 2500);
        
        setTimeout(() => {
            map.fitBounds([
                [winners[0].currentLat, winners[0].currentLng],
                [winners[1].currentLat, winners[1].currentLng]
            ], {padding: [50, 50]});
            
            winners.forEach(w => w.marker.getElement().style.transform += ' scale(3)');
            showCenterToast(`🎉 最終存活的兩位幸運兒：\n1. ${winners[0].name}\n2. ${winners[1].name}！`, 10000);
        }, 1000);
    }

    async function runDrawStyle3(allActors, winners) {
        showCenterToast("📡 [風格C] 天降幸運雷達鎖定中...", 3000);
        
        allActors.forEach(a => {
            if (!winners.includes(a)) {
                if (a.marker) a.marker.getElement().style.opacity = '0.3';
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
                
                w.marker.getElement().style.transform += ' scale(2.5)';
                w.marker.getElement().style.zIndex = 30000;
            });
            
            L.polyline([
                [winners[0].currentLat, winners[0].currentLng],
                [winners[1].currentLat, winners[1].currentLng]
            ], {color: '#ef4444', weight: 6, dashArray: '10,10', className: 'radar-line'}).addTo(map);
            
            showCenterToast(`🎯 雷達鎖定完畢！\n🎉 恭喜得獎者：${winners[0].name} & ${winners[1].name}！`, 10000);
        }, 2000);
    }
} // <--- This closes initFoundPrizeAnimation

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFoundPrizeAnimation);
} else {
    initFoundPrizeAnimation();
}
