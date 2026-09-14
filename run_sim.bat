@echo off
chcp 65001 >nul
cd /d %~dp0
echo === محاكي المحادثة (بدون واتساب) ===
node src/sim.js
pause
