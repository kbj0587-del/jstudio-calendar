const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 8080;

// PWA에 필요한 헤더 설정
app.use((req, res, next) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// manifest.json 올바른 MIME 타입
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

// 정적 파일 서빙
app.use(express.static(__dirname, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// SPA 폴백
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 제이스튜디오 캘린더 실행 중 → port ${PORT}`);
});
