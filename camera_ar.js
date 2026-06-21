// camera_ar.js
// 專門處理寶可夢風格 AR 擴增實境與特徵辨識

class PokemonARCamera {
    constructor(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.stream = null;
        
        this.animFrameId = null;
        
        // 辨識狀態
        this.localColor = "未知";
        this.localType = "尋找中"; // 預設
        this.localTypeLock = false; // 只要有1次答案就會固定這個答案
        this.serverFeatures = [];
        this.isServerRecognized = false;
        
        // 畫面擷取
        this.lastFrameData = null;
        this.lastAutoCaptureTime = 0;
        this.isUploadingToServer = false; // 避免重複上傳

        // 特效狀態
        this.slotMachineActive = false;
        this.slotMachineTicks = 0;
        this.slotTargetFeatures = [];
        this.slotCurrentChars = "";

        // 本地 TFJS AI 模型
        this.tfModel = null;
        this.isTFLoading = false;
        this.tfFrameCounter = 0;

        // 拍照定格縮放
        this.isFrozen = false;
        this.frozenImage = null;
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
        this.slotMachineActive = false;
        this.isFrozen = false;
        this.frozenImage = null;
        this.localTypeLock = false;
        this.localType = "尋找中";
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
            this.ctx.clearRect(0, 0, w, h);
            
            if (this.isFrozen && this.frozenImage && this.frozenImage.complete) {
                // 定格狀態：繪製定格影像並放大
                this.ctx.save();
                this.ctx.translate(w/2, h/2);
                this.ctx.scale(1.15, 1.15); // 放大
                this.ctx.drawImage(this.frozenImage, -w/2, -h/2, w, h);
                this.ctx.restore();
                
                // 只繪製 AR UI，不分析
                this.drawARUI(w, h);
            } else {
                // 正常即時狀態
                this.analyzeLocalFrame(w, h);
                this.drawARUI(w, h);
            }
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

            // 本地 AI 貓犬推論 (只要有1次答案就會固定，避免閃爍)
            this.tfFrameCounter++;
            if (this.tfModel && !this.localTypeLock && this.tfFrameCounter % 15 === 0) {
                this.tfModel.classify(this.video).then(predictions => {
                    if (predictions && predictions.length > 0 && !this.localTypeLock) {
                        const topResult = predictions[0].className.toLowerCase();
                        if (topResult.includes('dog') || topResult.includes('terrier') || topResult.includes('retriever') || topResult.includes('pug') || topResult.includes('spaniel') || topResult.includes('husky')) {
                            this.localType = "犬";
                            this.localTypeLock = true;
                            this.typeLockTime = Date.now();
                        } else if (topResult.includes('cat') || topResult.includes('kitten') || topResult.includes('tabby')) {
                            this.localType = "貓";
                            this.localTypeLock = true;
                            this.typeLockTime = Date.now();
                        } else {
                            this.localType = "目標";
                        }
                    }
                }).catch(e => console.log("TF classify error:", e));
            }

            // 伺服器推論 (不強求穩定秒數，定時送且等伺服器回傳後才送下一次)
            const now = Date.now();
            if (!this.isUploadingToServer && !this.isServerRecognized && (now - this.lastAutoCaptureTime > 4000)) {
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

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // Red-500
        this.ctx.lineWidth = 4;
        
        // --- 畫拍照正中間的十字準星 ---
        this.ctx.beginPath(); this.ctx.moveTo(cx - 15, cy); this.ctx.lineTo(cx + 15, cy); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(cx, cy - 15); this.ctx.lineTo(cx, cy + 15); this.ctx.stroke();

        // --- 畫外圍角括號準星 ---
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
        const now = Date.now();
        // 產生獨立頻率的亂數文字，並混入方塊字元來保證真正的馬賽克效果
        const getRandStr = (seed, length) => {
            const blocks = ["█", "▓", "▒", "░", "█"];
            const chars = "米克斯柴犬貴賓法鬥柯基虎斑剪耳項圈";
            let res = "";
            for(let i=0; i<length; i++) {
                // 大幅提升變換速度：原 500ms -> 50ms
                const tick = Math.floor(now / (50 + seed*10 + i*15));
                if (tick % 3 === 0) {
                    res += blocks[(tick + seed) % blocks.length];
                } else {
                    const index = (tick * 17 + seed * 31 + i * 13) % chars.length;
                    res += chars.charAt(index);
                }
            }
            return res;
        };

        let parts = [];

        if (this.slotMachineActive) {
            // 777 滾動特效：伺服器定格期間，特徵字非同步跳動，維持模糊
            this.slotTargetFeatures.forEach((feat, idx) => {
                parts.push({ text: getRandStr(idx + 10, feat.length), blur: true });
                parts.push({ text: " ", blur: false });
            });
            this.slotMachineTicks--;
            if (this.slotMachineTicks <= 0) {
                this.slotMachineActive = false;
                this.isServerRecognized = true;
                this.serverFeatures = this.slotTargetFeatures;
            }
        } else if (this.isServerRecognized && this.serverFeatures.length > 0) {
            // 伺服器回傳：全清晰
            this.serverFeatures.forEach(feat => {
                parts.push({ text: feat, blur: false });
                parts.push({ text: " ", blur: false });
            });
        } else {
            // 本地掃描階段 (先判斷種族，再鎖定顏色)
            
            // 顏色 (Color)
            // 如果種族已經判斷出來，過 1 秒才鎖定顏色 (解析層次感)
            let isColorLocked = this.localTypeLock && (now - this.typeLockTime > 1000);
            if (isColorLocked) {
                parts.push({ text: this.localColor, blur: false });
            } else {
                parts.push({ text: getRandStr(1, 2), blur: true });
            }
            parts.push({ text: " ", blur: false });

            // 特徵 (Features) - 等待伺服器前永遠模糊跳動
            parts.push({ text: getRandStr(2, 2), blur: true });
            parts.push({ text: " ", blur: false });

            // 種族 (Race)
            if (this.localTypeLock) {
                parts.push({ text: this.localType, blur: false });
            } else {
                if (!this.tfModel) {
                    parts.push({ text: "載入AI", blur: true });
                } else {
                    parts.push({ text: getRandStr(3, 1), blur: true });
                }
            }
        }

        // 移除最後的空白
        if (parts.length > 0 && parts[parts.length - 1].text === " ") parts.pop();

        // 畫標籤對話框背景
        this.ctx.save();
        this.ctx.font = "bold 24px 'Courier New', monospace";
        
        // 計算總寬度
        let textWidth = 0;
        parts.forEach(p => {
            textWidth += this.ctx.measureText(p.text).width;
        });
        
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

        // 分段畫文字 (部分模糊，部分清晰)
        let currentX = boxX + 20;
        const textY = boxY + boxHeight / 2;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';

        parts.forEach(p => {
            if (p.blur) {
                this.ctx.filter = 'blur(4px)';
                this.ctx.fillStyle = '#fcd34d'; // 馬賽克用黃色
            } else {
                this.ctx.filter = 'none';
                this.ctx.fillStyle = this.isServerRecognized ? '#34d399' : '#fcd34d'; // 伺服器清晰為綠色，本地鎖定為黃色
            }
            this.ctx.fillText(p.text, currentX, textY);
            currentX += this.ctx.measureText(p.text).width;
        });
        
        this.ctx.filter = 'none'; // reset
        this.ctx.restore();
    }

    async autoCaptureAndDetect() {
        this.lastAutoCaptureTime = Date.now();
        const base64Image = this.takePhotoBase64();
        if (!base64Image) return;

        this.isUploadingToServer = true;
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
            }
        } catch (e) {
            console.error("AR Server error:", e);
        } finally {
            this.isUploadingToServer = false;
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
        // 1. 立即拍照
        const base64Image = this.takePhotoBase64();
        if (!base64Image) return null;

        // 2. 設定定格與放大
        this.frozenImage = new Image();
        this.frozenImage.src = base64Image;
        this.isFrozen = true;
        
        // 3. 趁定格的3秒鐘期間問伺服器這是什麼品種
        const serverTask = fetch('/api/ar_detect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: base64Image })
        }).then(res => res.json()).then(data => {
            if (data.features) {
                const newFeatures = data.features;
                // 不管怎樣都顯示 777 特效讓定格畫面有科技感
                this.slotMachineActive = true;
                this.slotMachineTicks = 120; // 滾動 120 個 frame (2 秒)，搭配 3 秒定格
                this.slotTargetFeatures = newFeatures;
            }
        }).catch(e => {
            console.error("最終辨識失敗:", e);
        });

        // 4. 定住 3 秒
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 結束定格
        this.isFrozen = false;
        return base64Image;
    }
}
window.PokemonARCamera = PokemonARCamera;
