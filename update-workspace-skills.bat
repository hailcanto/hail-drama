@echo off
echo 更新 workspace skills 到桌面端用户数据目录
echo.

set "SOURCE=%~dp0backend\workspace\skills"
set "APPDATA_DIR=%APPDATA%\hail-drama"
set "TARGET=%APPDATA_DIR%\workspace\skills"

echo 源目录: %SOURCE%
echo 目标目录: %TARGET%
echo.

if not exist "%TARGET%" (
    echo 创建目标目录...
    mkdir "%TARGET%"
)

echo 复制 skills 文件...
xcopy /E /I /Y "%SOURCE%\video-prompt-minimax-h3" "%TARGET%\video-prompt-minimax-h3\"

echo.
echo ✓ 更新完成！请重启桌面端应用。
pause
