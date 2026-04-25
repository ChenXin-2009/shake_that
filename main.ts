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
    
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private dataHistory: { acc: number[], gyro: number[], time: number[] } = { acc: [], gyro: [], time: [] };
    private maxDataPoints = 100;
    
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
            
            window.addEventListener('devicemotion', this.handleMotion, true);
            window.addEventListener('deviceorientation', this.handleOrientation, true);
            
            this.isRunning = true;
            this.updateStatus('✓ 运行中 - 移动设备以产生声音');
            this.toggleButtons();
            
            this.updateDisplay('accX', '等待数据...');
            this.updateDisplay('accY', '等待数据...');
            this.updateDisplay('accZ', '等待数据...');
            this.updateDisplay('gyroX', '等待数据...');
            this.updateDisplay('gyroY', '等待数据...');
            this.updateDisplay('gyroZ', '等待数据...');
            
            setTimeout(() => {
                if (this.dataHistory.acc.length === 0 && this.dataHistory.gyro.length === 0) {
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
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.isRunning = false;
        this.updateStatus('已停止');
        this.toggleButtons();
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
        
        this.addDataPoint(x * 10, freq);
    };
    
    private handleTouchEnd = () => {
        if (!this.gainNodes) return;
        
        // 松开手指时音量归零
        this.gainNodes.sine.gain.value = 0;
        this.gainNodes.triangle.gain.value = 0;
        this.gainNodes.square.gain.value = 0;
    };
    
    private handleMotion = (event: DeviceMotionEvent) => {
        console.log('Motion event:', event);
        
        const acc = event.acceleration || event.accelerationIncludingGravity;
        if (!acc || !this.gainNodes) return;
        
        const x = Math.abs(acc.x || 0);
        const y = Math.abs(acc.y || 0);
        const z = Math.abs(acc.z || 0);
        
        const maxAcc = 20;
        const volumeX = Math.min(x / maxAcc, 1) * 0.3;
        const volumeY = Math.min(y / maxAcc, 1) * 0.3;
        const volumeZ = Math.min(z / maxAcc, 1) * 0.3;
        
        const currentTime = this.audioContext!.currentTime;
        this.gainNodes.sine.gain.linearRampToValueAtTime(volumeX, currentTime + 0.1);
        this.gainNodes.triangle.gain.linearRampToValueAtTime(volumeY, currentTime + 0.1);
        this.gainNodes.square.gain.linearRampToValueAtTime(volumeZ, currentTime + 0.1);
        
        this.updateDisplay('accX', x.toFixed(2));
        this.updateDisplay('accY', y.toFixed(2));
        this.updateDisplay('accZ', z.toFixed(2));
        
        const totalAcc = Math.sqrt(x*x + y*y + z*z);
        this.addDataPoint(totalAcc, 0);
    };
    
    private handleOrientation = (event: DeviceOrientationEvent) => {
        console.log('Orientation event:', event);
        
        if (!this.oscillators) return;
        
        const alpha = event.alpha || 0;
        const beta = event.beta || 0;
        const gamma = event.gamma || 0;
        
        const freqX = this.mapRange(alpha, 0, 360, 200, 800);
        const freqY = this.mapRange(beta, -180, 180, 300, 1000);
        const freqZ = this.mapRange(gamma, -90, 90, 400, 1200);
        
        const currentTime = this.audioContext!.currentTime;
        this.oscillators.sine.frequency.linearRampToValueAtTime(freqX, currentTime + 0.1);
        this.oscillators.triangle.frequency.linearRampToValueAtTime(freqY, currentTime + 0.1);
        this.oscillators.square.frequency.linearRampToValueAtTime(freqZ, currentTime + 0.1);
        
        this.updateDisplay('gyroX', alpha.toFixed(1));
        this.updateDisplay('gyroY', beta.toFixed(1));
        this.updateDisplay('gyroZ', gamma.toFixed(1));
        
        const avgFreq = (freqX + freqY + freqZ) / 3;
        this.addDataPoint(0, avgFreq);
    };
    
    private mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
        return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }
    
    private addDataPoint(acc: number, gyro: number) {
        this.dataHistory.acc.push(acc);
        this.dataHistory.gyro.push(gyro);
        this.dataHistory.time.push(Date.now());
        
        if (this.dataHistory.acc.length > this.maxDataPoints) {
            this.dataHistory.acc.shift();
            this.dataHistory.gyro.shift();
            this.dataHistory.time.shift();
        }
        
        this.drawChart();
    }
    
    private drawChart() {
        const rect = this.canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        this.ctx.clearRect(0, 0, width, height);
        
        if (this.dataHistory.acc.length < 2) return;
        
        const maxAcc = Math.max(...this.dataHistory.acc, 10);
        const maxGyro = Math.max(...this.dataHistory.gyro, 1000);
        
        this.ctx.strokeStyle = '#4CAF50';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.dataHistory.acc.forEach((value, index) => {
            const x = (index / this.maxDataPoints) * width;
            const y = height - (value / maxAcc) * height * 0.4;
            if (index === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
        
        this.ctx.strokeStyle = '#2196F3';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.dataHistory.gyro.forEach((value, index) => {
            const x = (index / this.maxDataPoints) * width;
            const y = height - (value / maxGyro) * height * 0.4 - height * 0.5;
            if (index === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText('加速度', 10, 20);
        this.ctx.fillStyle = '#4CAF50';
        this.ctx.fillRect(70, 12, 20, 3);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText('频率', 10, 40);
        this.ctx.fillStyle = '#2196F3';
        this.ctx.fillRect(70, 32, 20, 3);
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
