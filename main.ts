/**
 * Sensor Audio Synthesizer
 * 
 * A web application that uses mobile device sensors to control audio synthesis.
 * 
 * @author ChenXin-2009
 * @license MIT
 * @copyright 2026 ChenXin-2009
 */

class SensorAudioSynthesizer {
    private audioContext: AudioContext | null = null;
    private oscillators: { sine: OscillatorNode; triangle: OscillatorNode; square: OscillatorNode } | null = null;
    private gainNodes: { sine: GainNode; triangle: GainNode; square: GainNode } | null = null;
    private isRunning = false;
    
    // 录音相关
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private recordedAudio: AudioBuffer | null = null;
    private audioSource: AudioBufferSourceNode | null = null;
    private recordedGainNode: GainNode | null = null;
    private isRecording = false;
    private useRecordedAudio = false;
    
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private dataHistory: { 
        accX: number[], 
        accY: number[], 
        accZ: number[], 
        gyroX: number[], 
        gyroY: number[], 
        gyroZ: number[], 
        time: number[] 
    } = { accX: [], accY: [], accZ: [], gyroX: [], gyroY: [], gyroZ: [], time: [] };
    private maxDataPoints = 500;
    private lastDrawTime = 0;
    private drawInterval = 33; // 30fps
    
    constructor() {
        this.canvas = document.getElementById('chart') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    private resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    
    async start() {
        if (this.isRunning) return;
        
        try {
            const hasMotion = typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
            const hasOrientation = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
            let hasPermission = false;
            
            try {
                hasPermission = hasMotion && typeof (window as any).DeviceMotionEvent.requestPermission === 'function';
            } catch (e) {
                hasPermission = false;
            }
            
            console.log('传感器诊断:', { hasMotion, hasOrientation, hasPermission });
            
            this.updateStatus(`正在启动...<br>传感器: ${hasMotion ? '✓' : '✗'} 方向: ${hasOrientation ? '✓' : '✗'}`);
            
            // iOS权限请求
            if (hasPermission) {
                try {
                    const motionPermission = await (window as any).DeviceMotionEvent.requestPermission();
                    console.log('Motion权限:', motionPermission);
                    
                    if (motionPermission !== 'granted') {
                        throw new Error('传感器权限被拒绝');
                    }
                    
                    try {
                        if (typeof (window as any).DeviceOrientationEvent.requestPermission === 'function') {
                            const orientationPermission = await (window as any).DeviceOrientationEvent.requestPermission();
                            console.log('Orientation权限:', orientationPermission);
                        }
                    } catch (e) {
                        console.log('Orientation权限请求跳过');
                    }
                } catch (permError) {
                    console.error('权限请求失败:', permError);
                    throw new Error(`权限请求失败`);
                }
            }
            
            // 如果不支持传感器,使用触摸控制
            if (!hasMotion && !hasOrientation) {
                this.updateStatus('⚠️ 不支持传感器,已切换到触摸控制模式');
                this.startTouchMode();
                return;
            }
            
            // 初始化音频
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            
            // 如果使用录制的音频
            if (this.useRecordedAudio && this.recordedAudio) {
                this.startRecordedAudioPlayback();
            } else {
                // 使用合成器
                this.oscillators = {
                    sine: this.audioContext.createOscillator(),
                    triangle: this.audioContext.createOscillator(),
                    square: this.audioContext.createOscillator()
                };
                
                this.gainNodes = {
                    sine: this.audioContext.createGain(),
                    triangle: this.audioContext.createGain(),
                    square: this.audioContext.createGain()
                };
                
                this.oscillators.sine.type = 'sine';
                this.oscillators.triangle.type = 'triangle';
                this.oscillators.square.type = 'square';
                
                this.oscillators.sine.frequency.value = 440;
                this.oscillators.triangle.frequency.value = 550;
                this.oscillators.square.frequency.value = 660;
                
                this.oscillators.sine.connect(this.gainNodes.sine).connect(this.audioContext.destination);
                this.oscillators.triangle.connect(this.gainNodes.triangle).connect(this.audioContext.destination);
                this.oscillators.square.connect(this.gainNodes.square).connect(this.audioContext.destination);
                
                this.gainNodes.sine.gain.value = 0;
                this.gainNodes.triangle.gain.value = 0;
                this.gainNodes.square.gain.value = 0;
                
                this.oscillators.sine.start();
                this.oscillators.triangle.start();
                this.oscillators.square.start();
            }
            
            window.addEventListener('devicemotion', this.handleMotion, { passive: true });
            window.addEventListener('deviceorientation', this.handleOrientation, { passive: true });
            
            this.isRunning = true;
            const mode = this.useRecordedAudio ? '录音' : '合成器';
            this.updateStatus(`✓ 运行中 (${mode}模式) - 移动设备以产生声音`);
            this.toggleButtons();
            
            this.updateDisplay('accX', '等待数据...');
            this.updateDisplay('accY', '等待数据...');
            this.updateDisplay('accZ', '等待数据...');
            this.updateDisplay('gyroX', '等待数据...');
            this.updateDisplay('gyroY', '等待数据...');
            this.updateDisplay('gyroZ', '等待数据...');
            
            setTimeout(() => {
                if (this.dataHistory.accX.length === 0 && this.dataHistory.gyroX.length === 0) {
                    this.updateStatus('⚠️ 未检测到传感器数据<br>请尝试其他浏览器');
                }
            }, 5000);
            
        } catch (error: any) {
            this.updateStatus(`❌ 错误: ${error?.message || error}`);
            console.error('启动失败:', error);
        }
    }
    
    stop() {
        if (!this.isRunning) return;
        
        window.removeEventListener('devicemotion', this.handleMotion);
        window.removeEventListener('deviceorientation', this.handleOrientation);
        window.removeEventListener('touchmove', this.handleTouch);
        window.removeEventListener('touchend', this.handleTouchEnd);
        
        if (this.oscillators) {
            this.oscillators.sine.stop();
            this.oscillators.triangle.stop();
            this.oscillators.square.stop();
        }
        
        if (this.audioSource) {
            this.audioSource.stop();
            this.audioSource = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.isRunning = false;
        this.updateStatus('已停止');
        this.toggleButtons();
    }
    
    async startRecording() {
        if (this.isRecording) return;
        
        try {
            console.log('请求麦克风权限...');
            this.updateStatus('请求麦克风权限...');
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('麦克风权限已授予');
            
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('收到音频数据:', event.data.size, 'bytes');
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = async () => {
                console.log('录音停止,处理音频数据...');
                this.updateStatus('处理录音数据...');
                
                try {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    console.log('音频Blob大小:', audioBlob.size, 'bytes');
                    
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    console.log('ArrayBuffer大小:', arrayBuffer.byteLength, 'bytes');
                    
                    // 创建音频上下文如果不存在
                    if (!this.audioContext) {
                        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                    }
                    
                    this.recordedAudio = await this.audioContext.decodeAudioData(arrayBuffer);
                    console.log('音频解码成功,时长:', this.recordedAudio.duration, '秒');
                    
                    this.updateStatus(`✓ 录音完成 (${this.recordedAudio.duration.toFixed(1)}秒)<br>点击"使用录音"按钮`);
                    
                    // 停止麦克风
                    stream.getTracks().forEach(track => track.stop());
                    
                    // 显示使用录音按钮
                    const useRecBtn = document.getElementById('useRecBtn') as HTMLButtonElement;
                    if (useRecBtn) {
                        useRecBtn.style.display = 'block';
                        console.log('显示"使用录音"按钮');
                    }
                } catch (decodeError) {
                    console.error('音频解码失败:', decodeError);
                    this.updateStatus(`❌ 音频解码失败: ${decodeError}`);
                }
            };
            
            this.mediaRecorder.onerror = (event: any) => {
                console.error('录音错误:', event.error);
                this.updateStatus(`❌ 录音错误: ${event.error}`);
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            this.updateStatus('🔴 录音中... 请说话');
            this.toggleRecordButtons();
            
            console.log('录音已开始');
            
        } catch (error: any) {
            console.error('录音失败:', error);
            this.updateStatus(`❌ 录音失败: ${error?.message || error}`);
        }
    }
    
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            console.log('没有正在进行的录音');
            return;
        }
        
        console.log('停止录音...');
        this.mediaRecorder.stop();
        this.isRecording = false;
        this.toggleRecordButtons();
    }
    
    useRecordedAudio() {
        console.log('切换到录音模式, recordedAudio:', this.recordedAudio);
        
        if (!this.recordedAudio) {
            this.updateStatus('❌ 没有录音可用');
            console.error('没有录音数据');
            return;
        }
        
        // 停止当前播放
        if (this.isRunning) {
            console.log('停止当前播放');
            this.stop();
        }
        
        this.useRecordedAudio = true;
        this.updateStatus(`✓ 已切换到录音模式 (${this.recordedAudio.duration.toFixed(1)}秒)<br>点击"开始"按钮`);
        console.log('已切换到录音模式');
    }
    
    useSynthesizer() {
        this.useRecordedAudio = false;
        this.updateStatus('✓ 已切换到合成器模式');
    }
    
    private startRecordedAudioPlayback() {
        if (!this.recordedAudio || !this.audioContext) {
            console.error('无法启动录音播放: recordedAudio或audioContext为空');
            return;
        }
        
        console.log('启动录音播放,时长:', this.recordedAudio.duration, '秒');
        
        // 创建循环播放的音频源
        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.recordedAudio;
        this.audioSource.loop = true;
        
        this.recordedGainNode = this.audioContext.createGain();
        this.recordedGainNode.gain.value = 0;
        
        this.audioSource.connect(this.recordedGainNode).connect(this.audioContext.destination);
        this.audioSource.start();
        
        console.log('录音播放已启动');
    }
    
    private toggleRecordButtons() {
        const startRecBtn = document.getElementById('startRecBtn') as HTMLButtonElement;
        const stopRecBtn = document.getElementById('stopRecBtn') as HTMLButtonElement;
        
        if (this.isRecording) {
            startRecBtn.style.display = 'none';
            stopRecBtn.style.display = 'block';
        } else {
            startRecBtn.style.display = 'block';
            stopRecBtn.style.display = 'none';
        }
    }
    
    private startTouchMode() {
        // 初始化音频
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        this.oscillators = {
            sine: this.audioContext.createOscillator(),
            triangle: this.audioContext.createOscillator(),
            square: this.audioContext.createOscillator()
        };
        
        this.gainNodes = {
            sine: this.audioContext.createGain(),
            triangle: this.audioContext.createGain(),
            square: this.audioContext.createGain()
        };
        
        this.oscillators.sine.type = 'sine';
        this.oscillators.triangle.type = 'triangle';
        this.oscillators.square.type = 'square';
        
        this.oscillators.sine.frequency.value = 440;
        this.oscillators.triangle.frequency.value = 550;
        this.oscillators.square.frequency.value = 660;
        
        this.oscillators.sine.connect(this.gainNodes.sine).connect(this.audioContext.destination);
        this.oscillators.triangle.connect(this.gainNodes.triangle).connect(this.audioContext.destination);
        this.oscillators.square.connect(this.gainNodes.square).connect(this.audioContext.destination);
        
        this.gainNodes.sine.gain.value = 0;
        this.gainNodes.triangle.gain.value = 0;
        this.gainNodes.square.gain.value = 0;
        
        this.oscillators.sine.start();
        this.oscillators.triangle.start();
        this.oscillators.square.start();
        
        window.addEventListener('touchmove', this.handleTouch, { passive: false });
        window.addEventListener('touchend', this.handleTouchEnd);
        
        this.isRunning = true;
        this.updateStatus('✓ 触摸控制模式<br>滑动屏幕产生声音');
        this.toggleButtons();
    }
    
    private handleTouch = (event: TouchEvent) => {
        event.preventDefault();
        
        if (!this.gainNodes || !this.oscillators || event.touches.length === 0) return;
        
        const touch = event.touches[0];
        const x = touch.clientX / window.innerWidth;
        const y = touch.clientY / window.innerHeight;
        
        // X轴控制音量
        const volume = x * 0.3;
        this.gainNodes.sine.gain.value = volume;
        this.gainNodes.triangle.gain.value = volume * 0.8;
        this.gainNodes.square.gain.value = volume * 0.6;
        
        // Y轴控制音高
        const freq = 200 + (1 - y) * 1000;
        this.oscillators.sine.frequency.value = freq;
        this.oscillators.triangle.frequency.value = freq * 1.2;
        this.oscillators.square.frequency.value = freq * 1.5;
        
        // 更新显示
        this.updateDisplay('accX', (x * 10).toFixed(2));
        this.updateDisplay('accY', (y * 10).toFixed(2));
        this.updateDisplay('accZ', '0.00');
        this.updateDisplay('gyroX', freq.toFixed(1));
        this.updateDisplay('gyroY', (freq * 1.2).toFixed(1));
        this.updateDisplay('gyroZ', (freq * 1.5).toFixed(1));
        
        this.addAccData(x * 10, y * 10, 0);
        this.addGyroData(freq, freq * 1.2, freq * 1.5);
    };
    
    private handleTouchEnd = () => {
        if (!this.gainNodes) return;
        
        // 松开手指时音量归零
        this.gainNodes.sine.gain.value = 0;
        this.gainNodes.triangle.gain.value = 0;
        this.gainNodes.square.gain.value = 0;
    };
    
    private handleMotion = (event: DeviceMotionEvent) => {
        const acc = event.acceleration || event.accelerationIncludingGravity;
        if (!acc) return;
        
        const x = Math.abs(acc.x || 0);
        const y = Math.abs(acc.y || 0);
        const z = Math.abs(acc.z || 0);
        
        // 如果使用录制的音频
        if (this.useRecordedAudio && this.recordedGainNode) {
            // 合并三个加速度为一个总音量
            const totalAcc = Math.sqrt(x*x + y*y + z*z);
            const maxAcc = 30;
            const volume = Math.min(totalAcc / maxAcc, 1);
            
            const currentTime = this.audioContext!.currentTime;
            this.recordedGainNode.gain.setTargetAtTime(volume, currentTime, 0.01);
            
            this.updateDisplay('accX', `${x.toFixed(2)} (总:${totalAcc.toFixed(2)})`);
            this.updateDisplay('accY', y.toFixed(2));
            this.updateDisplay('accZ', z.toFixed(2));
            
            this.addAccData(x, y, z);
            return;
        }
        
        // 使用合成音频
        if (!this.gainNodes) return;
        
        const maxAcc = 20;
        const volumeX = Math.min(x / maxAcc, 1) * 0.3;
        const volumeY = Math.min(y / maxAcc, 1) * 0.3;
        const volumeZ = Math.min(z / maxAcc, 1) * 0.3;
        
        const currentTime = this.audioContext!.currentTime;
        this.gainNodes.sine.gain.setTargetAtTime(volumeX, currentTime, 0.01);
        this.gainNodes.triangle.gain.setTargetAtTime(volumeY, currentTime, 0.01);
        this.gainNodes.square.gain.setTargetAtTime(volumeZ, currentTime, 0.01);
        
        this.updateDisplay('accX', x.toFixed(2));
        this.updateDisplay('accY', y.toFixed(2));
        this.updateDisplay('accZ', z.toFixed(2));
        
        this.addAccData(x, y, z);
    };
    
    private handleOrientation = (event: DeviceOrientationEvent) => {
        if (!this.oscillators) return;
        
        const alpha = event.alpha || 0;
        const beta = event.beta || 0;
        const gamma = event.gamma || 0;
        
        // alpha: 0-360度 (指南针方向)
        const freqX = this.mapRange(alpha, 0, 360, 200, 800);
        // beta: 0度朝上音调高, 180度朝下音调低
        const freqY = this.mapRange(beta, 0, 180, 1000, 300);
        // gamma: -90到90度 (左右倾斜)
        const freqZ = this.mapRange(gamma, -90, 90, 400, 1200);
        
        // 立即设置频率,不使用ramp以提高响应速度
        const currentTime = this.audioContext!.currentTime;
        this.oscillators.sine.frequency.setTargetAtTime(freqX, currentTime, 0.01);
        this.oscillators.triangle.frequency.setTargetAtTime(freqY, currentTime, 0.01);
        this.oscillators.square.frequency.setTargetAtTime(freqZ, currentTime, 0.01);
        
        this.updateDisplay('gyroX', alpha.toFixed(1));
        this.updateDisplay('gyroY', beta.toFixed(1));
        this.updateDisplay('gyroZ', gamma.toFixed(1));
        
        // 只记录陀螺仪数据
        this.addGyroData(alpha, beta, gamma);
    };
    
    private mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
        return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }
    
    private addAccData(x: number, y: number, z: number) {
        this.dataHistory.accX.push(x);
        this.dataHistory.accY.push(y);
        this.dataHistory.accZ.push(z);
        
        if (this.dataHistory.accX.length > this.maxDataPoints) {
            this.dataHistory.accX.shift();
            this.dataHistory.accY.shift();
            this.dataHistory.accZ.shift();
        }
        
        this.requestDraw();
    }
    
    private addGyroData(alpha: number, beta: number, gamma: number) {
        this.dataHistory.gyroX.push(alpha);
        this.dataHistory.gyroY.push(beta);
        this.dataHistory.gyroZ.push(gamma);
        this.dataHistory.time.push(Date.now());
        
        if (this.dataHistory.gyroX.length > this.maxDataPoints) {
            this.dataHistory.gyroX.shift();
            this.dataHistory.gyroY.shift();
            this.dataHistory.gyroZ.shift();
            this.dataHistory.time.shift();
        }
        
        this.requestDraw();
    }
    
    private requestDraw() {
        // 限制绘制频率以提高性能
        const now = Date.now();
        if (now - this.lastDrawTime >= this.drawInterval) {
            this.drawChart();
            this.lastDrawTime = now;
        }
    }
    
    private drawChart() {
        const rect = this.canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        this.ctx.clearRect(0, 0, width, height);
        
        if (this.dataHistory.accX.length < 2) return;
        
        const dataLength = this.dataHistory.accX.length;
        
        // 绘制加速度曲线 (上半部分)
        const maxAcc = Math.max(
            ...this.dataHistory.accX, 
            ...this.dataHistory.accY, 
            ...this.dataHistory.accZ, 
            10
        );
        
        const halfHeight = height / 2;
        
        // 加速度X - 红色
        this.ctx.strokeStyle = '#FF5252';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.dataHistory.accX.forEach((value, index) => {
            const x = (index / dataLength) * width;
            const y = halfHeight - (value / maxAcc) * halfHeight * 0.8;
            if (index === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
        
        // 加速度Y - 绿色
        this.ctx.strokeStyle = '#4CAF50';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.dataHistory.accY.forEach((value, index) => {
            const x = (index / dataLength) * width;
            const y = halfHeight - (value / maxAcc) * halfHeight * 0.8;
            if (index === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
        
        // 加速度Z - 蓝色
        this.ctx.strokeStyle = '#2196F3';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.dataHistory.accZ.forEach((value, index) => {
            const x = (index / dataLength) * width;
            const y = halfHeight - (value / maxAcc) * halfHeight * 0.8;
            if (index === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
        
        // 绘制陀螺仪曲线 (下半部分)
        const maxGyroX = Math.max(...this.dataHistory.gyroX, 360);
        const maxGyroY = Math.max(...this.dataHistory.gyroY, 180);
        const maxGyroZ = Math.max(...this.dataHistory.gyroZ, 90);
        
        // 陀螺仪X (alpha) - 橙色
        this.ctx.strokeStyle = '#FF9800';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.dataHistory.gyroX.forEach((value, index) => {
            const x = (index / dataLength) * width;
            const y = halfHeight + (value / maxGyroX) * halfHeight * 0.8;
            if (index === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
        
        // 陀螺仪Y (beta) - 紫色
        this.ctx.strokeStyle = '#9C27B0';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.dataHistory.gyroY.forEach((value, index) => {
            const x = (index / dataLength) * width;
            const y = halfHeight + (value / maxGyroY) * halfHeight * 0.8;
            if (index === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
        
        // 陀螺仪Z (gamma) - 青色
        this.ctx.strokeStyle = '#00BCD4';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.dataHistory.gyroZ.forEach((value, index) => {
            const x = (index / dataLength) * width;
            const y = halfHeight + ((value + 90) / (maxGyroZ + 90)) * halfHeight * 0.8;
            if (index === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
        
        // 绘制分隔线
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, halfHeight);
        this.ctx.lineTo(width, halfHeight);
        this.ctx.stroke();
        
        // 绘制图例
        this.ctx.font = '10px sans-serif';
        
        // 加速度图例
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText('加速度:', 5, 12);
        
        this.ctx.fillStyle = '#FF5252';
        this.ctx.fillRect(45, 7, 15, 2);
        this.ctx.fillText('X', 62, 12);
        
        this.ctx.fillStyle = '#4CAF50';
        this.ctx.fillRect(75, 7, 15, 2);
        this.ctx.fillText('Y', 92, 12);
        
        this.ctx.fillStyle = '#2196F3';
        this.ctx.fillRect(105, 7, 15, 2);
        this.ctx.fillText('Z', 122, 12);
        
        // 陀螺仪图例
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText('陀螺仪:', 5, height - 5);
        
        this.ctx.fillStyle = '#FF9800';
        this.ctx.fillRect(45, height - 10, 15, 2);
        this.ctx.fillText('α', 62, height - 5);
        
        this.ctx.fillStyle = '#9C27B0';
        this.ctx.fillRect(75, height - 10, 15, 2);
        this.ctx.fillText('β', 92, height - 5);
        
        this.ctx.fillStyle = '#00BCD4';
        this.ctx.fillRect(105, height - 10, 15, 2);
        this.ctx.fillText('γ', 122, height - 5);
    }
    
    private updateDisplay(id: string, value: string) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }
    
    private updateStatus(message: string) {
        const status = document.getElementById('status');
        if (status) status.innerHTML = message;
    }
    
    private toggleButtons() {
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
        
        if (this.isRunning) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
        } else {
            startBtn.style.display = 'block';
            stopBtn.style.display = 'none';
        }
    }
}

let app: SensorAudioSynthesizer;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    app = new SensorAudioSynthesizer();
    
    document.getElementById('startBtn')?.addEventListener('click', () => app.start());
    document.getElementById('stopBtn')?.addEventListener('click', () => app.stop());
    document.getElementById('diagBtn')?.addEventListener('click', runDiagnostics);
    document.getElementById('startRecBtn')?.addEventListener('click', () => app.startRecording());
    document.getElementById('stopRecBtn')?.addEventListener('click', () => app.stopRecording());
    document.getElementById('useRecBtn')?.addEventListener('click', () => app.useRecordedAudio());
    document.getElementById('useSynthBtn')?.addEventListener('click', () => app.useSynthesizer());
}

function runDiagnostics() {
    console.log('诊断按钮被点击');
    
    const status = document.getElementById('status');
    if (!status) {
        alert('错误: 找不到状态显示区域');
        return;
    }
    
    status.innerHTML = '<p>正在诊断...</p>';
    
    try {
        const hasMotion = typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
        const hasOrientation = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
        let hasPermission = false;
        
        try {
            hasPermission = hasMotion && typeof (window as any).DeviceMotionEvent.requestPermission === 'function';
        } catch (e) {
            hasPermission = false;
        }
        
        const info = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            hasMotion,
            hasOrientation,
            hasPermission,
            isSecureContext: window.isSecureContext,
            protocol: window.location.protocol
        };
        
        console.log('设备诊断:', info);
        
        const browserName = info.userAgent.includes('Chrome') ? 'Chrome' : 
                           info.userAgent.includes('Safari') ? 'Safari' : 
                           info.userAgent.includes('Firefox') ? 'Firefox' : 
                           info.userAgent.includes('Edge') ? 'Edge' : '其他';
        
        status.innerHTML = `
            <div style="text-align: left; font-size: 11px; line-height: 1.8;">
                <strong>设备诊断:</strong><br>
                浏览器: ${browserName}<br>
                平台: ${info.platform}<br>
                DeviceMotion: ${info.hasMotion ? '✓' : '✗'}<br>
                DeviceOrientation: ${info.hasOrientation ? '✓' : '✗'}<br>
                需要权限: ${info.hasPermission ? '是(iOS)' : '否'}<br>
                安全上下文: ${info.isSecureContext ? '✓' : '✗'}<br>
                协议: ${info.protocol}<br>
                <br>正在测试传感器(3秒)...
            </div>
        `;
        
        let motionReceived = false;
        let orientationReceived = false;
        
        const testMotion = (e: DeviceMotionEvent) => {
            motionReceived = true;
            console.log('✓ 收到Motion事件');
            window.removeEventListener('devicemotion', testMotion);
        };
        
        const testOrientation = (e: DeviceOrientationEvent) => {
            orientationReceived = true;
            console.log('✓ 收到Orientation事件');
            window.removeEventListener('deviceorientation', testOrientation);
        };
        
        window.addEventListener('devicemotion', testMotion, true);
        window.addEventListener('deviceorientation', testOrientation, true);
        
        setTimeout(() => {
            window.removeEventListener('devicemotion', testMotion);
            window.removeEventListener('deviceorientation', testOrientation);
            
            let recommendation = '';
            if (!motionReceived && !orientationReceived) {
                if (!info.isSecureContext) {
                    recommendation = '<br><br><strong style="color: #ff6b6b;">需要HTTPS访问</strong>';
                } else if (browserName === 'Chrome') {
                    recommendation = '<br><br><strong style="color: #ffa726;">尝试Safari浏览器</strong>';
                } else {
                    recommendation = '<br><br><strong style="color: #ff6b6b;">浏览器可能不支持</strong>';
                }
            }
            
            status.innerHTML = `
                <div style="text-align: left; font-size: 11px; line-height: 1.8;">
                    <strong>设备诊断:</strong><br>
                    浏览器: ${browserName}<br>
                    平台: ${info.platform}<br>
                    DeviceMotion: ${info.hasMotion ? '✓' : '✗'}<br>
                    DeviceOrientation: ${info.hasOrientation ? '✓' : '✗'}<br>
                    需要权限: ${info.hasPermission ? '是(iOS)' : '否'}<br>
                    安全上下文: ${info.isSecureContext ? '✓' : '✗'}<br>
                    协议: ${info.protocol}<br>
                    <br><strong>传感器测试:</strong><br>
                    Motion: ${motionReceived ? '✓ 收到' : '✗ 未收到'}<br>
                    Orientation: ${orientationReceived ? '✓ 收到' : '✗ 未收到'}
                    ${recommendation}
                </div>
            `;
        }, 3000);
        
    } catch (error: any) {
        console.error('诊断出错:', error);
        status.innerHTML = `<p style="color: #ff6b6b;">诊断出错: ${error?.message || error}</p>`;
    }
}
