// camera_ar.js
// 專門處理寶可夢風格 AR 擴增實境與特徵辨識

class PokemonARCamera {
    constructor(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.stream = null;
        this.isProcessing = false;
        
        this.animFrameId = null;
        
        // 辨識狀態
        this.localColor = "未知";
        this.localType = "犬"; // 預設
        this.serverFeatures = [];
        this.isServerRecognized = false;
        
        // 畫面穩定度偵測
        this.lastFrameData = null;
        this.stableFrames = 0;
        this.lastAutoCaptureTime = 0;

        // 特效狀態
        this.slotMachineActive = false;
        this.slotMachineTicks = 0;
        this.slotTargetFeatures = [];
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
            this.video.srcObject = this.stream;
            
            // 確保影片載入後再開始繪製
            this.video.onloadedmetadata = () => {
                this.video.play();
                this.updateCanvasSize();
                this.animFrameId = requestAnimationFrame(() => this.arLoop());
            };
        } catch (err) {
            console.error("相機權限遭拒或發生錯誤:", err);
            alert("無法開啟相機，請檢查權限設定！");
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        this.isServerRecognized = false;
        this.serverFeatures = [];
        this.stableFrames = 0;
        this.slotMachineActive = false;
    }

    updateCanvasSize() {
        // 同步 Canvas 尺寸與影片一致
        if (this.video.videoWidth) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
        }
    }

    arLoop() {
        if (!this.stream) return;

        this.updateCanvasSize();
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        if (w > 0 && h > 0) {
            // 1. 繪製攝影機畫面
            this.ctx.drawImage(this.video, 0, 0, w, h);
            
            // 2. 進行本地端輕量級分析 (中心點顏色與穩定度)
            this.analyzeLocalFrame(w, h);
            
            // 3. 繪製 AR 特效 (準星與浮動文字)
            this.drawARUI(w, h);
        }

        this.animFrameId = requestAnimationFrame(() => this.arLoop());
    }

    analyzeLocalFrame(w, h) {
        if (this.slotMachineActive) return; // 正在跑特效時不分析

        const centerX = Math.floor(w / 2);
        const centerY = Math.floor(h / 2);
        const boxSize = 60; // 取中心 60x60 的區域
        
        try {
            const frameData = this.ctx.getImageData(centerX - boxSize/2, centerY - boxSize/2, boxSize, boxSize);
            const data = frameData.data;
            
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i+1];
                b += data[i+2];
            }
            const count = data.length / 4;
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            
            // 基礎顏色判斷邏apos
            this.localColor = this.guessColor(r, g, b);

            // 畫面穩定度偵測 (簡單透過與上一幀的差異計算)
            if (this.lastFrameData) {
                let diff = Math.abs(r - this.lastFrameData.r) + Math.abs(g - this.lastFrameData.g) + Math.abs(b - this.lastFrameData.b);
                if (diff < 15) {
                    this.stableFrames++;
                } else {
                    this.stableFrames = 0;
                }
            }
            this.lastFrameData = { r, g, b };

            // 如果畫面穩定超過一定時間 (例如約 1.5 秒 = 45 frames)，且沒有發送過，自動截圖送後端
            const now = Date.now();
            if (this.stableFrames > 45 && !this.isServerRecognized && (now - this.lastAutoCaptureTime > 3000)) {
                this.lastAutoCaptureTime = now;
                this.stableFrames = 0;
                this.autoCaptureAndDetect();
            }

        } catch (e) {
            // 可能因為 CORS 或尚未載入完成
        }
    }

    guessColor(r, g, b) {
        const brightness = (r + g + b) / 3;
        if (brightness < 60) return "黑色";
        if (brightness > 200) return "白色";
        if (r > g + 30 && r > b + 30) return "棕色";
        if (r > 150 && g > 120 && b < 100) return "黃色";
        return "花色"; // 混合色
    }

    drawARUI(w, h) {
        const cx = w / 2;
        const cy = h / 2;

        // --- 畫中心寶可夢準星 ---
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // Red-500
        this.ctx.lineWidth = 4;
        
        const size = 100; // 準星大小
        const corner = 20; // 轉角長度
        
        // 左上
        this.ctx.beginPath(); this.ctx.moveTo(cx - size, cy - size + corner); this.ctx.lineTo(cx - size, cy - size); this.ctx.lineTo(cx - size + corner, cy - size); this.ctx.stroke();
        // 右上
        this.ctx.beginPath(); this.ctx.moveTo(cx + size - corner, cy - size); this.ctx.lineTo(cx + size, cy - size); this.ctx.lineTo(cx + size, cy - size + corner); this.ctx.stroke();
        // 左下
        this.ctx.beginPath(); this.ctx.moveTo(cx - size, cy + size - corner); this.ctx.lineTo(cx - size, cy + size); this.ctx.lineTo(cx - size + corner, cy + size); this.ctx.stroke();
        // 右下
        this.ctx.beginPath(); this.ctx.moveTo(cx + size - corner, cy + size); this.ctx.lineTo(cx + size, cy + size); this.ctx.lineTo(cx + size, cy + size - corner); this.ctx.stroke();
        this.ctx.restore();

        // --- 畫目標頭上的特徵浮動文字 (AR Label) ---
        let displayName = "";

        if (this.slotMachineActive) {
            // 777 滾動特效
            const randomChars = "█▇▆▅▄▃▂阿偉米克斯黑白黃棕斑點立耳短尾";
            displayName = this.slotTargetFeatures.map(feat => {
                return (Math.random() > 0.3) ? feat : randomChars.charAt(Math.floor(Math.random() * randomChars.length)) + randomChars.charAt(Math.floor(Math.random() * randomChars.length));
            }).join(" ");
            
            this.slotMachineTicks--;
            if (this.slotMachineTicks <= 0) {
                this.slotMachineActive = false;
                this.isServerRecognized = true;
                this.serverFeatures = this.slotTargetFeatures;
            }
        } else {
            if (this.isServerRecognized && this.serverFeatures.length > 0) {
                // 清晰顯示伺服器回傳的真實特徵
                displayName = this.serverFeatures.join(" ");
            } else {
                // 馬賽克顯示 (本地猜測的顏色 + 馬賽克 + 犬/貓)
                displayName = `${this.localColor} ▇▇ ${this.localType}`;
            }
        }

        // 畫標籤對話框背景
        this.ctx.save();
        this.ctx.font = "bold 24px 'Courier New', monospace";
        const textWidth = this.ctx.measureText(displayName).width;
        const boxWidth = textWidth + 40;
        const boxHeight = 40;
        const boxX = cx - boxWidth / 2;
        const boxY = cy - size - 60; // 顯示在框框上方

        // 黑底白邊，符合地圖的 pixel 風格
        this.ctx.fillStyle = 'rgba(26, 32, 44, 0.85)'; // bg-gray-900
        this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        this.ctx.strokeStyle = '#f59e0b'; // 黃色邊框
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // 小三角形指針
        this.ctx.beginPath();
        this.ctx.moveTo(cx - 10, boxY + boxHeight);
        this.ctx.lineTo(cx + 10, boxY + boxHeight);
        this.ctx.lineTo(cx, boxY + boxHeight + 10);
        this.ctx.fill();
        this.ctx.stroke();

        // 畫文字
        this.ctx.fillStyle = this.isServerRecognized ? '#34d399' : '#fcd34d'; // 清晰時用綠色，馬賽克用黃色
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(displayName, cx, boxY + boxHeight / 2);
        this.ctx.restore();
    }

    async autoCaptureAndDetect() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        console.log("畫面穩定，自動擷取特徵...");

        try {
            // 將 Canvas 轉為 Base64 送給後端
            const base64Image = this.canvas.toDataURL("image/jpeg", 0.7);
            
            const response = await fetch('/api/ar_detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: base64Image })
            });

            if (response.ok) {
                const result = await response.json();
                this.serverFeatures = result.features;
                this.localType = result.type || "犬";
                // 打開清晰顯示
                this.isServerRecognized = true;
            }
        } catch (e) {
            console.error("自動辨識失敗:", e);
        } finally {
            this.isProcessing = false;
        }
    }

    async takeFinalPhoto() {
        // 使用者真正按下拍照鍵時觸發
        // 會再送一次伺服器，若結果改變則觸發 777 特效
        console.log("📷 使用者按下快門，進行最終確認！");
        
        // 記錄拍照瞬間的清晰截圖 (不含 AR 特效)
        // 因為 this.ctx 已經畫上 AR 了，我們從 video 直接截
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.video.videoWidth;
        tempCanvas.height = this.video.videoHeight;
        tempCanvas.getContext('2d').drawImage(this.video, 0, 0);
        const base64Image = tempCanvas.toDataURL("image/jpeg", 0.9);

        // 先假裝特效正在跑
        this.isServerRecognized = false;
        
        try {
            const response = await fetch('/api/ar_detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: base64Image })
            });

            if (response.ok) {
                const result = await response.json();
                const newFeatures = result.features;
                
                // 比對原本特徵，不一樣就跑 777 特效
                if (newFeatures.join("") !== this.serverFeatures.join("")) {
                    this.slotMachineActive = true;
                    this.slotMachineTicks = 60; // 滾動 60 個 frame (約 1 秒)
                    this.slotTargetFeatures = newFeatures;
                    this.localType = result.type || "犬";
                } else {
                    this.isServerRecognized = true;
                }
            } else {
                this.isServerRecognized = true; // 失敗就恢復原狀
            }
        } catch (e) {
            console.error("最終辨識失敗:", e);
            this.isServerRecognized = true; // 失敗就恢復原狀
        }
        
        return base64Image; // 回傳乾淨的照片供使用者儲存或上傳
    }
}
