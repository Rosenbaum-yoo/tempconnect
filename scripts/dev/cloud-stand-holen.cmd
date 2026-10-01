@echo off
rem ===========================================================================
rem cloud-stand-holen.cmd - Doppelklick-Huelle fuer cloud-stand-holen.sh (Windows)
rem ===========================================================================
rem Owner 2026-10-01: "und auch mergen in gewissen Abstaenden immer wenn etwas
rem neues im frontend zu sehen waere automatisch, damit ich lokal auch gucken kann"
rem
rem   Doppelklick                          holt alle 30 Minuten den Cloud-Stand
rem                                        und baut nach. Fenster offen lassen
rem                                        (minimiert genuegt), Schliessen beendet.
rem   cloud-stand-holen.cmd einmal         nur einmal holen und bauen
rem   cloud-stand-holen.cmd autostart      startet es ab der naechsten Anmeldung
rem                                        von selbst (minimiert, Autostart-Ordner)
rem   cloud-stand-holen.cmd autostart-aus  nimmt das wieder heraus
rem
rem Braucht Git for Windows. Was das Skript tut und was es nie tut (nie bei
rem ungesicherten Aenderungen, nie waehrend eines Testlaufs, nie pushen, bei
rem Konflikt Abbruch): siehe cloud-stand-holen.sh. Nur ASCII in dieser Datei -
rem cmd.exe liest sie in der OEM-Codepage.
rem ===========================================================================
setlocal
set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not exist "%GITBASH%" goto ohne_git
set "AUTOSTART=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TempConnect Cloud-Stand.cmd"
cd /d "%~dp0"
if /i "%~1"=="einmal" goto einmal
if /i "%~1"=="autostart" goto autostart
if /i "%~1"=="autostart-aus" goto autostart_aus
if not "%~1"=="" goto hilfe
title TempConnect Cloud-Stand
"%GITBASH%" cloud-stand-holen.sh --bauen --wiederholen 30
goto :eof

:einmal
"%GITBASH%" cloud-stand-holen.sh --bauen
pause
goto :eof

:autostart
> "%AUTOSTART%" echo @start "TempConnect Cloud-Stand" /min "%~f0"
echo Eingerichtet: startet ab der naechsten Anmeldung minimiert von selbst.
echo Wieder herausnehmen: cloud-stand-holen.cmd autostart-aus
pause
goto :eof

:autostart_aus
if exist "%AUTOSTART%" del "%AUTOSTART%"
echo Autostart herausgenommen.
pause
goto :eof

:hilfe
echo Unbekannte Angabe: %1
echo Moeglich: einmal ^| autostart ^| autostart-aus   (ohne Angabe: alle 30 Minuten)
pause
goto :eof

:ohne_git
echo Git Bash nicht gefunden. Bitte Git for Windows installieren:
echo https://git-scm.com/download/win
pause
exit /b 2
