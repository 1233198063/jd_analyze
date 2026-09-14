@echo off
cd /d "%~dp0"
set SSL_CERT_FILE=%~dp0certs\combined_cacert.pem
set REQUESTS_CA_BUNDLE=%~dp0certs\combined_cacert.pem
".venv\Scripts\python.exe" scripts\daily_discovery.py >> logs\daily_discovery.log 2>&1
