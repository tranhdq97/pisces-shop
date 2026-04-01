#!/usr/bin/env bash
# Pisces Shop — setup & chạy stack Docker (PostgreSQL + BE + FE build trong một image).
# Dùng được trên macOS và Linux (cần Docker Engine + Compose plugin).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

err() { echo "error: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || err "Cần cài Docker (Docker Desktop trên macOS, hoặc docker.io + compose trên Linux)."
docker info >/dev/null 2>&1 || err "Docker daemon chưa chạy. Hãy mở Docker Desktop hoặc khởi động dịch vụ docker."

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  err "Cần Docker Compose (lệnh: docker compose hoặc docker-compose)."
fi

if [[ ! -f "${ROOT}/compose.env" ]]; then
  cp "${ROOT}/compose.env.example" "${ROOT}/compose.env"
  echo "Đã tạo compose.env từ compose.env.example (chỉnh SECRET_KEY nếu cần)."
fi

echo "Đang build và khởi động db + web..."
"${COMPOSE[@]}" up -d --build

echo ""
echo "Ứng dụng: http://localhost:8000"
echo "API docs:  http://localhost:8000/docs"
echo ""
echo "Dữ liệu mẫu: nhóm SOP « SOP chung » (chào khách, xử lý sự cố, quy tắc & thưởng phạt) "
echo "  được tạo tự động lần đầu backend khởi động nếu chưa có trong database."
echo ""
echo "Lần đầu, tạo superadmin (chạy một lần):"
echo "  docker compose exec web python scripts/create_superadmin.py \\"
echo "    --email admin@shop.com --full_name Admin --password 'Admin1234'"
echo ""
echo "Xem log: docker compose logs -f web"
echo "Dừng:    docker compose down"
