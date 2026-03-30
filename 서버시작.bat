@echo off
chcp 65001 > nul
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   제이스튜디오 캘린더 서버 시작중...  ║
echo  ╚══════════════════════════════════════╝
echo.
echo  ✔ 잠시 후 크롬이 자동으로 열립니다.
echo  ✔ 주소창 오른쪽 설치 버튼(⊕)을 눌러 앱 설치
echo  ✔ 서버를 끄려면 이 창을 닫으세요.
echo.

:: Python으로 로컬 서버 시작 (포트 8787)
start "" "http://localhost:8787"
python -m http.server 8787

pause
