.PHONY: dev backend frontend docker-up docker-down migrate

dev: docker-up backend &
	cd frontend && npm run dev

backend:
	cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

docker-up:
	docker compose up postgres redis -d

docker-down:
	docker compose down

migrate:
	cd backend && source .venv/bin/activate && alembic upgrade head

migrate-new:
	cd backend && source .venv/bin/activate && alembic revision --autogenerate -m "$(msg)"

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install
