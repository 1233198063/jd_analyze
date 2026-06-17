#!/bin/bash
set -e

echo "=== JD Analyze Setup ==="

# Backend .env
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env — add your ANTHROPIC_API_KEY"
fi

# Python virtualenv
cd backend
if [ ! -d .venv ]; then
  python3 -m venv .venv
  echo "Created Python virtualenv"
fi
source .venv/bin/activate
pip install -r requirements.txt -q
cd ..

# Frontend deps
cd frontend
npm install --silent
cd ..

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit backend/.env and add ANTHROPIC_API_KEY=sk-ant-..."
echo "  2. Start services: docker compose up postgres redis -d"
echo "  3. Run backend:  cd backend && source .venv/bin/activate && uvicorn app.main:app --reload"
echo "  4. Run frontend: cd frontend && npm run dev"
echo ""
echo "Or use Docker: docker compose up --build"
