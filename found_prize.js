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
    btn.setAttribute('data-fp-bound', 'true');
    
    btn.addEventListener('click', async () => {
        if (!confirm("即將開始尋獲抽獎動畫！\n這將從伺服器載入完整歷史軌跡並重置地圖（動畫結束後重新整理網頁即可恢復）。確定要開始嗎？")) return;
        
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
            }
        } else {
            alert("伺服器尚未連線！");
        }
    }); // <--- This closes btn.addEventListener

    async function startAnimation(serverPaths) {
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
            if (p.lat !== undefined && p.lng !== undefined) {
                center = [p.lat, p.lng];
            } else if (p.bounds && p.bounds.length >= 2) {
                center = [(p.bounds[0][0] + p.bounds[1][0]) / 2, (p.bounds[0][1] + p.bounds[1][1]) / 2];
            }
        }
        
        let allPaths = serverPaths && serverPaths.length > 0 ? serverPaths : [];
        
        if (allPaths.length === 0) {
            for(let i=0; i<50; i++) {
                let path = [];
                let lat = center[0] + (Math.random()-0.5)*0.02;
                let lng = center[1] + (Math.random()-0.5)*0.02;
                for(let j=0; j<20; j++) {
                    if (!isNaN(lat) && !isNaN(lng)) path.push({lat, lng});
                    lat += (Math.random()-0.5)*0.0005;
                    lng += (Math.random()-0.5)*0.0005;
                }
                allPaths.push(path);
            }
        }
        
        if (typeof allUsersData !== 'undefined') {
            Object.keys(allUsersData).forEach(k => delete allUsersData[k]);
        }
        if (typeof localHistory !== 'undefined') {
            localHistory.length = 0;
        }
        if (typeof ws !== 'undefined' && ws) {
            ws.close();
        }
        if (typeof markersLayer !== 'undefined' && markersLayer) markersLayer.clearLayers();
        if (typeof sightingsLayer !== 'undefined' && sightingsLayer) sightingsLayer.clearLayers();
        if (typeof routesLayer !== 'undefined' && routesLayer) routesLayer.clearLayers();
        if (typeof isFogVisible !== 'undefined') isFogVisible = true;
        if (typeof renderMap === 'function') renderMap();
        if (typeof requestFogRender === 'function') requestFogRender();
        
        if (typeof map !== 'undefined' && map) {
            const offsetLat = 0.027;
            const offsetLng = 0.029;
            map.fitBounds([
                [center[0] - offsetLat, center[1] - offsetLng],
                [center[0] + offsetLat, center[1] + offsetLng]
            ], {animate: true, duration: 1});
        }
        
        const duration = 60000;
        const startTime = Date.now();
        const spawnInterval = 55000 / joins.length;
        
        function getIconHtml(color, name) {
            const safeName = typeof escapeHTML === 'function' ? escapeHTML(name) : name;
            return `<div class="user-label-container"><div class="user-name-tag pixel-panel marker-name-btn" style="color:#1a202c; pointer-events:none;">${safeName}</div><div class="user-avatar-pixel" style="background-color:${color};"></div></div>`;
        }
        
        const actors = joins.map((j, idx) => {
            const spawnTime = idx * spawnInterval;
            const isIdle = Math.random() < 0.3;
            let path = allPaths[Math.floor(Math.random() * allPaths.length)];
            const maxStartIdx = Math.max(1, path.length - 2);
            const startIdx = Math.floor(Math.random() * maxStartIdx);
            
            let actorColor = '#ffffff';
            if (typeof generateRandomColor === 'function') actorColor = generateRandomColor();
            
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
                lastStepTime: startTime,
                marker: null
            };
        });
        
        let lastRenderTime = 0;
        let animationFrameId;
        
        function animateFrame() {
            const now = Date.now();
            const elapsed = now - startTime;
            
            if (elapsed > duration) {
                cancelAnimationFrame(animationFrameId);
                showCenterToast("🎉 動畫結束！後續抽獎功能建置中...", 6000);
                return;
            }
            
            if (now - lastRenderTime > 100) {
                lastRenderTime = now;
                Object.keys(allUsersData).forEach(k => delete allUsersData[k]);
                
                actors.forEach(actor => {
                    if (elapsed >= actor.spawnTime) {
                        if (!actor.active) {
                            actor.active = true;
                            actor.lastStepTime = now;
                        }
                        
                        if (actor.isIdle) {
                            if (actor.history.length === 0) {
                                const pos = actor.path[actor.pathIdx];
                                let ptLat = pos.lat !== undefined ? pos.lat : pos[0];
                                let ptLng = pos.lng !== undefined ? pos.lng : pos[1];
                                if (ptLat !== undefined && ptLng !== undefined && !isNaN(ptLat) && !isNaN(ptLng)) {
                                    actor.history.push({lat: ptLat, lng: ptLng, timestamp: now});
                                }
                            }
                        } else {
                            const stepInterval = 100; 
                            if (now - actor.lastStepTime > stepInterval) {
                                actor.lastStepTime = now;
                                
                                if (actor.pathIdx < actor.path.length - 1) {
                                    actor.pathIdx++;
                                } else {
                                    actor.path = [...actor.path].reverse();
                                    actor.pathIdx = 0;
                                }
                                
                                const pos = actor.path[actor.pathIdx];
                                if (pos) {
                                    let ptLat = pos.lat !== undefined ? pos.lat : pos[0];
                                    let ptLng = pos.lng !== undefined ? pos.lng : pos[1];
                                    if (ptLat !== undefined && ptLng !== undefined && !isNaN(ptLat) && !isNaN(ptLng)) {
                                        actor.history.push({lat: ptLat, lng: ptLng, timestamp: now});
                                        if (actor.history.length > 300) {
                                            actor.history.shift();
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (actor.history.length > 0) {
                            const latest = actor.history[actor.history.length - 1];
                            
                            if (!actor.marker) {
                                const icon = L.divIcon({className: 'custom-div-icon', html: getIconHtml(actor.color, actor.name)});
                                actor.marker = L.marker([latest.lat, latest.lng], {icon: icon});
                                if (typeof markersLayer !== 'undefined') actor.marker.addTo(markersLayer);
                            } else {
                                actor.marker.setLatLng([latest.lat, latest.lng]);
                            }
                            
                            allUsersData[actor.id] = {
                                userName: actor.name,
                                color: actor.color,
                                history: actor.history,
                                lastUpdate: now
                            };
                        }
                    }
                });
                
                if (typeof requestFogRender === 'function') requestFogRender();
            }
            
            animationFrameId = requestAnimationFrame(animateFrame);
        }
    } // <--- This closes startAnimation
} // <--- This closes initFoundPrizeAnimation

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFoundPrizeAnimation);
} else {
    initFoundPrizeAnimation();
}
