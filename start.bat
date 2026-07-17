@echo off
chcp 65001 >nul
title 小草莓家族 - 云端版
cd /d "%~dp0"

echo.
echo 🍓 小草莓家族 - 多人协同云端版
echo ================================
echo.

set NODE="C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe"

echo [1/2] 启动本地服务器 (端口 3000)...
start /B %NODE% server.js

timeout /t 3 /nobreak >nul

echo [2/2] 创建公网隧道...
echo.
echo 隧道建立后，会显示类似这样的地址：
echo   https://xxxxx.serveousercontent.com
echo.
echo 把那个地址分享给其他人，大家就能一起编辑同一份数据了！
echo （别人打开若先看到一行提示，点 "Continue to Site" 即可）
echo.
echo ⚠️ 关闭此窗口会断开连接，请保持窗口运行。
echo ================================
echo.

ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:3000 serveo.net
