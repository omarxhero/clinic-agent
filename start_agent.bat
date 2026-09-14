@echo off
chcp 65001 >nul
cd /d %~dp0
echo === بوت الاستقبال — تشغيل واتساب ===
node src/index.js
pause
