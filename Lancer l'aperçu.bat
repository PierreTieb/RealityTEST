@echo off
chcp 65001 >nul
rem Aperçu local de l'appli : petit serveur sur ce PC + ouverture du navigateur.
rem La caméra (webcam, visualiseur) fonctionne à cette adresse. Fermer cette fenêtre arrête l'aperçu.
cd /d "%~dp0"
echo Aperçu de l'appli : http://localhost:8765/
echo (Ferme cette fenêtre pour arrêter l'aperçu. Après une modification, appuie sur F5 dans le navigateur.)
start "" "http://localhost:8765/"
python -m http.server 8765 --bind 127.0.0.1 2>nul || py -m http.server 8765 --bind 127.0.0.1
pause
