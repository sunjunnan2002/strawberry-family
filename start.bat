@echo off
chcp 65001 >nul
title 小草莓家族 - 云端版

echo.
echo 🍓 小草莓家族 - 多人协同云端版
echo ================================
echo.

REM 启动 Node.js 服务器
set NODE="C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe"
set SERVER="C:\Users\Administrator\WorkBuddy\2026-07-14-15-36-33\小草莓家族-cloud\server.js"

echo [1/2] 启动本地服务器 (端口 3000)...
start /B %NODE% %SERVER%

REM 等待服务器启动
timeout /t 3 /nobreak >nul

REM 创建 SSH 隧道
echo [2/2] 创建公网隧道...
echo.
echo 隧道建立后，会显示类似这样的地址:
echo   https://xxxxx.serveousercontent.com
echo.
echo 分享这个地址给其他人，大家就能一起编辑了！
echo.
echo ⚠️ 关闭此窗口会断开连接，请保持运行。
echo ================================
echo.

ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:3000 serveo.net
