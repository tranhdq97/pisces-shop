# Pisces Shop — F&B Management System

Hệ thống quản lý nhà hàng/quán ăn toàn diện: menu, bàn, đơn hàng, kho, công thức, bảng lương, SOP và dashboard phân tích.

## Mục lục

- [Tổng quan hệ thống](#tổng-quan-hệ-thống)
- [Kiến trúc](#kiến-trúc)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt & Chạy](#cài-đặt--chạy)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Biến môi trường](#biến-môi-trường)
- [Cơ sở dữ liệu](#cơ-sở-dữ-liệu)
- [Tạo tài khoản superadmin](#tạo-tài-khoản-superadmin)
- [Phân quyền người dùng](#phân-quyền-người-dùng)
- [Tính năng theo module](#tính-năng-theo-module)
- [API](#api)
- [Chạy test](#chạy-test)
- [Deploy production](#deploy-production)

---

## Tổng quan hệ thống

Pisces Shop là ứng dụng quản lý F&B (Food & Beverage) với giao diện web, hỗ trợ nhiều vai trò người dùng (superadmin, admin, manager, waiter, kitchen). Hệ thống gồm:

| Module | Chức năng |
|--------|-----------|
| **Dashboard** | KPI tổng quan, doanh thu, biểu đồ theo giờ, top món bán |
| **Menu** | Quản lý danh mục và món ăn (giá, thứ tự) |
| **Bàn** | Trạng thái bàn realtime, thanh toán, ghi nhận dọn bàn |
| **Đơn hàng** | Tạo/theo dõi đơn, FSM trạng thái, lọc theo ngày/bàn |
| **Kho** | Nhập/xuất nguyên liệu, theo dõi tồn kho, chi phí |
| **Công thức** | Liên kết món ăn với nguyên liệu kho |
| **Bảng lương** | Hồ sơ nhân viên, chấm công, tính lương |
| **SOP** | Quy trình chuẩn (Standard Operating Procedure), phân quyền đọc theo vai trò |
| **Người dùng** | Duyệt đăng ký, quản lý tài khoản |
| **Phân quyền** | Quản lý roles & permissions linh hoạt (RBAC) |

---

## Kiến trúc

```
pisces-shop/
├── app/                        # FastAPI backend
│   ├── core/                   # Config, DB, security, base model
│   │   ├── config.py           # Pydantic-settings singleton
│   │   ├── database.py         # Async SQLAlchemy engine
│   │   ├── security.py         # JWT auth, password hashing
│   │   ├── base_model.py       # Base với UUID PK, audit fields
│   │   ├── enums.py            # UserRole enum
│   │   ├── exceptions.py       # AppException → JSON error
│   │   ├── permissions.py      # Permission constants
│   │   └── request_context.py  # ContextVar per async request
│   ├── modules/                # Feature modules
│   │   ├── auth/               # Xác thực & người dùng
│   │   ├── menu/               # Danh mục & món ăn
│   │   ├── orders/             # Đơn hàng
│   │   ├── tables/             # Bàn
│   │   ├── inventory/          # Kho nguyên liệu
│   │   ├── recipes/            # Công thức
│   │   ├── payroll/            # Bảng lương
│   │   ├── sop/                # Quy trình chuẩn
│   │   ├── dashboard/          # Thống kê
│   │   └── rbac/               # Phân quyền
│   └── main.py                 # App entrypoint, router mount
├── alembic/                    # DB migrations
├── scripts/                    # Tiện ích CLI
├── tests/                      # Test suite
│   ├── api/                    # API-level tests
│   ├── services/               # Service-level tests
│   └── unit/                   # Unit tests
└── frontend/                   # React frontend
    └── src/
        ├── api/                # Axios API clients
        ├── components/         # UI components dùng chung
        ├── hooks/              # useAuth, ...
        ├── i18n/               # Đa ngôn ngữ (vi/en)
        └── pages/              # Trang ứng dụng
```

**Stack:**
- **Backend:** Python 3.11+ · FastAPI · SQLAlchemy 2.0 (Async) · Pydantic v2 · PostgreSQL · JWT
- **Frontend:** React 19 · Vite 8 · Tailwind CSS v4 · React Router v7 · TanStack Query v5 · Recharts

---

## Yêu cầu hệ thống

- Python **3.11+**
- Node.js **18+**
- PostgreSQL **14+**

---

## Cài đặt & Chạy

### Backend

```bash
# 1. Clone và vào thư mục
git clone <repo-url>
cd pisces-shop

# 2. Tạo và kích hoạt virtual environment
python -m venv venv
source venv/bin/activate        # macOS/Linux
# hoặc: venv\Scripts\activate   # Windows

# 3. Cài dependencies
pip install -r requirements.txt

# 4. Tạo file .env từ mẫu
cp .env.example .env
# Chỉnh sửa .env với thông tin database và secret key của bạn

# 5. Chạy migrations
alembic upgrade head

# 6. Tạo tài khoản superadmin (lần đầu)
PYTHONPATH=. venv/bin/python scripts/create_superadmin.py \
  --email admin@shop.com \
  --full_name "Admin" \
  --password "Admin1234"

# 7. Chạy server
PYTHONPATH=. venv/bin/uvicorn app.main:app --reload
```

Backend chạy tại: http://localhost:8000
API docs (Swagger): http://localhost:8000/docs

### Frontend

```bash
# Từ thư mục gốc
cd frontend

# Cài dependencies
npm install

# Chạy dev server
npm run dev
```

Frontend chạy tại: http://localhost:5173

> **Lưu ý:** Vite proxy tự động chuyển tiếp `/api/*` đến `http://localhost:8000` — không cần cấu hình CORS khi phát triển.

---

## Biến môi trường

Tạo file `.env` ở thư mục gốc (xem `.env.example`):

```env
# PostgreSQL connection string (asyncpg driver)
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/pisces_db

# JWT signing secret — đặt chuỗi ngẫu nhiên dài, bảo mật
SECRET_KEY=change-me-to-a-long-random-string

# Chế độ debug
DEBUG=false

# Thời gian hết hạn JWT (phút)
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

---

## Cơ sở dữ liệu

### Tạo database

```sql
-- Kết nối PostgreSQL
CREATE DATABASE pisces_db;
CREATE DATABASE pisces_test;  -- Chỉ cần cho test
```

### Chạy migrations

```bash
# Áp dụng tất cả migrations
alembic upgrade head

# Tạo migration mới sau khi thay đổi models
alembic revision --autogenerate -m "mô tả thay đổi"
alembic upgrade head
```

---

## Tạo tài khoản superadmin

Bước bắt buộc sau khi setup lần đầu:

```bash
PYTHONPATH=. venv/bin/python scripts/create_superadmin.py \
  --email admin@shop.com \
  --full_name "Tên Admin" \
  --password "MatKhau@123"
```

Tài khoản superadmin được tạo với `is_active=True`, `is_approved=True`, sẵn sàng đăng nhập ngay.

---

## Phân quyền người dùng

### Các vai trò (Roles)

| Vai trò | Mô tả |
|---------|-------|
| `superadmin` | Toàn quyền hệ thống, duyệt/từ chối đăng ký |
| `admin` | Quản lý toàn bộ nghiệp vụ |
| `manager` | Tương tự admin, quản lý vận hành |
| `waiter` | Phục vụ: tạo đơn, thanh toán, dọn bàn |
| `kitchen` | Nhà bếp: xem & bắt đầu xử lý đơn |

### Luồng đăng ký

1. Nhân viên đăng ký tài khoản tại `/register`
2. Tài khoản ở trạng thái `is_approved=False` (chờ duyệt)
3. Superadmin vào trang **Người dùng** → duyệt hoặc từ chối
4. Sau khi duyệt, nhân viên mới có thể đăng nhập

### Permissions (RBAC)

Mỗi vai trò có tập hợp permissions cụ thể. Superadmin có thể tùy chỉnh qua trang `/roles`:

| Permission | Chức năng |
|-----------|-----------|
| `dashboard.view` | Xem dashboard |
| `menu.view` / `menu.edit` | Xem/sửa menu |
| `orders.view` / `orders.edit` | Xem/tạo/sửa đơn |
| `orders.start` | Chuyển đơn sang In Progress (bếp) |
| `tables.view` / `tables.edit` | Xem/quản lý bàn |
| `tables.pay` | Thanh toán bàn |
| `tables.clear` | Ghi nhận dọn bàn |
| `inventory.view` / `inventory.edit` | Xem/quản lý kho |
| `recipe.view` / `recipe.edit` | Xem/quản lý công thức |
| `payroll.view` / `payroll.edit` | Xem/quản lý bảng lương |
| `payroll.hours_submit` | Nhân viên nộp giờ làm |
| `sop.view` / `sop.edit` | Xem/soạn SOP |
| `users.manage` | Quản lý người dùng |
| `roles.manage` | Quản lý phân quyền |

---

## Tính năng theo module

### Dashboard (`/`)
- KPI: doanh thu hôm nay, số đơn, giá trị trung bình, chi phí kho
- Biểu đồ doanh thu theo giờ (tự động đổi sang múi giờ local)
- Top món bán theo danh mục, với tab lọc theo danh mục

### Menu (`/menu`)
- Quản lý danh mục (tên, thứ tự hiển thị)
- Quản lý món ăn (tên, giá, danh mục)
- Xóa danh mục bị chặn nếu còn món bên trong

### Bàn (`/tables`)
- Trạng thái bàn: `FREE` / `OCCUPIED` / `NEEDS_CLEARING` / `CLOSED`
- Thanh toán: tất cả đơn active → COMPLETED, bàn → NEEDS_CLEARING
- Dọn bàn: cập nhật trạng thái về FREE

### Đơn hàng (`/orders`)
- Tạo đơn, thêm món, chọn bàn
- FSM trạng thái: `PENDING` → `IN_PROGRESS` → `DELIVERED` → `COMPLETED`
- Có thể cancel bất kỳ lúc nào khi đơn còn active
- Lọc theo trạng thái, bàn, khoảng ngày
- Sửa món khi đơn đang PENDING/IN_PROGRESS

### Kho (`/inventory`)
- Quản lý nguyên liệu (tên, đơn vị tính)
- Nhập/xuất kho với giá đơn vị, tự tính tổng chi phí
- Số lượng âm được phép (xuất/điều chỉnh kho)
- Lịch sử nhập xuất lọc theo ngày

### Công thức (`/recipes`)
- Liên kết món ăn → nguyên liệu với định lượng
- Hỗ trợ ghi chú cho từng nguyên liệu

### Bảng lương (`/payroll`)
- Hồ sơ nhân viên: chức vụ, lương cơ bản, hệ số giờ
- Chấm công: nhập số giờ làm việc theo ngày
- Tính lương theo kỳ (draft → confirmed → paid)
- Hỗ trợ thưởng, khấu trừ, lương overtime

### SOP (`/sop`)
- Soạn thảo quy trình chuẩn dạng từng bước
- Phân quyền đọc: chọn vai trò nào được xem SOP đó
- Editor chỉ dành cho người có `sop.edit`

### Người dùng (`/users`)
- Danh sách người dùng đã được duyệt
- Duyệt/từ chối tài khoản đăng ký mới (superadmin)

### Phân quyền (`/roles`)
- Xem và chỉnh permissions cho từng vai trò
- Thay đổi có hiệu lực ngay sau khi người dùng refresh token

---

## API

Tài liệu API đầy đủ tại: **http://localhost:8000/docs** (Swagger UI)

Base URL: `http://localhost:8000/api/v1`

### Xác thực

```http
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded

username=admin@shop.com&password=Admin1234
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

Sử dụng token trong header:
```http
Authorization: Bearer eyJ...
```

### Các endpoint chính

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/auth/register` | Đăng ký tài khoản |
| `POST` | `/auth/login` | Đăng nhập |
| `GET` | `/auth/me` | Thông tin người dùng hiện tại |
| `GET` | `/auth/users` | Danh sách người dùng |
| `GET` | `/auth/pending` | Tài khoản chờ duyệt |
| `POST` | `/auth/approve/{id}` | Duyệt tài khoản |
| `POST` | `/auth/reject/{id}` | Từ chối tài khoản |
| `GET` | `/menu/categories` | Danh sách danh mục |
| `POST` | `/menu/categories` | Tạo danh mục |
| `GET` | `/menu/items` | Danh sách món ăn |
| `POST` | `/menu/items` | Tạo món ăn |
| `GET` | `/orders` | Danh sách đơn hàng |
| `POST` | `/orders` | Tạo đơn hàng |
| `PATCH` | `/orders/{id}/status` | Cập nhật trạng thái đơn |
| `GET` | `/tables` | Danh sách bàn + trạng thái |
| `PATCH` | `/tables/{id}/pay` | Thanh toán bàn |
| `PATCH` | `/tables/{id}/clear` | Ghi nhận dọn bàn |
| `GET` | `/inventory/items` | Danh sách nguyên liệu |
| `GET` | `/dashboard/summary` | KPI tổng quan |
| `GET` | `/health` | Health check |

---

## Chạy test

```bash
# Tạo test database trước
psql -c "CREATE DATABASE pisces_test;"

# Chạy toàn bộ test suite
PYTHONPATH=. venv/bin/pytest tests/ -v

# Chạy một file test cụ thể
PYTHONPATH=. venv/bin/pytest tests/api/test_auth.py -v

# Chạy với output chi tiết hơn
PYTHONPATH=. venv/bin/pytest tests/ -v --tb=short
```

Test dùng PostgreSQL (`pisces_test`) với SAVEPOINT isolation — dữ liệu không tồn tại giữa các test.

---

## Deploy production

### Build frontend

```bash
cd frontend
npm run build
# Output: frontend/dist/
```

### Chạy backend (production)

```bash
# Backend tự phục vụ frontend static files từ frontend/dist/
PYTHONPATH=. venv/bin/uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4
```

> **Lưu ý:** CORS production được cấu hình cho `https://pisces-shop.online`. Nếu deploy lên domain khác, cập nhật `origins` trong `app/main.py`.

### Checklist production

- [ ] Tạo `SECRET_KEY` ngẫu nhiên dài (≥32 ký tự)
- [ ] Đặt `DEBUG=false`
- [ ] Dùng HTTPS
- [ ] Đặt `ACCESS_TOKEN_EXPIRE_MINUTES` phù hợp
- [ ] Backup database định kỳ
- [ ] Chạy `alembic upgrade head` trước khi deploy phiên bản mới

---

## Đa ngôn ngữ

Hệ thống hỗ trợ **Tiếng Việt** (mặc định) và **English**. Người dùng chuyển ngôn ngữ qua nút EN/VI ở cuối sidebar.

Locale files: `frontend/src/i18n/locales/vi.js` và `en.js`.
