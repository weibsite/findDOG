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
        this.localType = "尋找中"; // 預設
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

        // 本地 TFJS AI 模型
        this.tfModel = null;
        this.isTFLoading = false;
        this.tfFrameCounter = 0;
    }

    async loadTFModel() {
        if (this.tfModel || this.isTFLoading) return;
        this.isTFLoading = true;
        try {
            console.log("⏳ 正在載入本地端前端 AI 模型...");
            // 載入輕量版 MobileNet
            if (window.mobilenet) {
                this.tfModel = await window.mobilenet.load({version: 2, alpha: 0.5});
                console.log("✅ 前端 AI 模型載入成功！");
            }
        } catch(e) {
            console.error("❌ 前端 AI 模型載入失敗:", e);
        }
        this.isTFLoading = false;
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
                this.loadTFModel();
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
            // 清空畫布 (背景透明)
            this.ctx.clearRect(0, 0, w, h);
            
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
            // 為了取得顏色，我們必須把 video 畫到一個暫存畫布上
            if (!this.tempCanvas) {
                this.tempCanvas = document.createElement('canvas');
                this.tempCanvas.width = 60;
                this.tempCanvas.height = 60;
                this.tempCtx = this.tempCanvas.getContext('2d');
            }
            // 從影片的中心點截取 60x60
            const vidW = this.video.videoWidth;
            const vidH = this.video.videoHeight;
            const vidCx = vidW / 2;
            const vidCy = vidH / 2;
            this.tempCtx.drawImage(this.video, vidCx - 30, vidCy - 30, 60, 60, 0, 0, 60, 60);
            
            const frameData = this.tempCtx.getImageData(0, 0, 60, 60);
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
            
            // 基礎顏色判斷邏輯
            this.localColor = this.guessColor(r, g, b);

            // 本地 AI 貓犬推論 (每 15 幀執行一次，避免卡頓)
            this.tfFrameCounter++;
            if (this.tfModel && this.tfFrameCounter % 15 === 0) {
                // 不 await 阻塞主迴圈，使用 Promise.then
                this.tfModel.classify(this.video).then(predictions => {
                    if (predictions && predictions.length > 0) {
                        const topResult = predictions[0].className.toLowerCase();
                        if (topResult.includes('dog') || topResult.includes('terrier') || topResult.includes('retriever') || topResult.includes('pug') || topResult.includes('spaniel') || topResult.includes('husky')) {
                            this.localType = "犬";
                        } else if (topResult.includes('cat') || topResult.includes('kitten') || topResult.includes('tabby')) {
                            this.localType = "貓";
                        } else {
                            this.localType = "目標";
                        }
                    }
                }).catch(e => console.log("TF classify error:", e));
            }

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
        this.ctx.beginPath(); this.ctx.moveTo(cx + size - corner, cy - size); this.ctx.lineTo(cx + size, cy - size); this.ctx.lineTo(cx + size + corner, cy - size); this.ctx.stroke();
        // 左下
        this.ctx.beginPath(); this.ctx.moveTo(cx - size, cy + size - corner); this.ctx.lineTo(cx - size, cy + size); this.ctx.lineTo(cx - size + corner, cy + size); this.ctx.stroke();
        // 右下
        this.ctx.beginPath(); this.ctx.moveTo(cx + size - corner, cy + size); this.ctx.lineTo(cx + size, cy + size); this.ctx.lineTo(cx + size + corner, cy + size); this.ctx.stroke();
        this.ctx.restore();

        // --- 畫目標頭上的特徵浮動文字 (AR Label) ---
        let displayName = "";
        let isBlurred = false;
        const randomChars = "米克斯柴犬貴賓法鬥柯基虎斑剪耳項圈";

        if (this.slotMachineActive) {
            // 777 滾動特效
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
                // 亂數馬賽克顯示 (本地猜測的顏色 + 亂數中文 + AI 即時判斷的 犬/貓/目標)
                const randWord1 = randomChars.charAt(Math.floor(Math.random() * randomChars.length));
                const randWord2 = randomChars.charAt(Math.floor(Math.random() * randomChars.length));
                // 如果還在載入模型，就顯示尋找中
                const displayType = this.tfModel ? this.localType : "載入AI";
                displayName = `${this.localColor} ${randWord1}${randWord2} ${displayType}`;
                isBlurred = true;
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

        // 畫文字 (模糊效果)
        if (isBlurred) {
            this.ctx.filter = 'blur(4px)';
            this.ctx.fillStyle = '#fcd34d'; // 馬賽克用黃色
        } else {
            this.ctx.fillStyle = this.isServerRecognized ? '#34d399' : '#fcd34d'; // 清晰時用綠色
        }
        
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(displayName, cx, boxY + boxHeight / 2);
        this.ctx.restore();
    }

    async autoCaptureAndDetect() {
        const base64Image = this.takePhotoBase64();
        if (!base64Image) return;

        try {
            const res = await fetch('/api/ar_detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: base64Image })
            });
            const data = await res.json();
            if (data.features) {
                this.isServerRecognized = true;
                this.serverFeatures = data.features;
                // 注意：這裡不發動 777 特效，直接轉綠字
            }
        } catch (e) {
            console.error("AR Server error:", e);
        }
    }

    takePhotoBase64() {
        if (!this.stream) return null;
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = this.video.videoWidth;
        tmpCanvas.height = this.video.videoHeight;
        const tCtx = tmpCanvas.getContext('2d');
        tCtx.drawImage(this.video, 0, 0, tmpCanvas.width, tmpCanvas.height);
        return tmpCanvas.toDataURL('image/jpeg', 0.8);
    }

    async takeFinalPhoto() {
        // 這是給使用者按下「拍照按鈕」時呼叫的最終函式
        const base64Image = this.takePhotoBase64();
        if (!base64Image) return null;

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
window.PokemonARCamera = PokemonARCamera;
