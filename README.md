# 传感器音频合成器 (Sensor Audio Synthesizer)

一个使用手机传感器控制音频的Web应用。

## 功能

- **加速度传感器** → 控制三种波形(正弦波/三角波/方波)的音量
- **陀螺仪传感器** → 控制音高
- **实时可视化** → 显示传感器数据历史曲线
- **触摸控制备用** → 不支持传感器时自动切换到触摸控制模式

## 使用方法

1. 在手机浏览器访问应用
2. 点击"开始"按钮
3. 移动或旋转手机产生音频

## 浏览器兼容性

- **推荐**: Safari (iOS), Firefox (Android)
- **需要HTTPS**: Chrome, Edge

## 技术栈

- TypeScript
- Web Audio API
- Device Motion/Orientation API
- Canvas
- Vite

## 本地开发

```bash
npm install
npm run dev
```

## 部署

部署到Vercel或其他支持HTTPS的平台。

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

Copyright (c) 2026 ChenXin-2009

## 作者

ChenXin-2009

## 贡献

欢迎提交 Issue 和 Pull Request!
