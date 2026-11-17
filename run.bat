@echo off
echo =======================================
echo Starting DocuVerse AI Server...
echo =======================================
call venv\Scripts\activate
python -m uvicorn backend.main1:app --reload
pause

