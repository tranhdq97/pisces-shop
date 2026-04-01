# Hướng dẫn sử dụng Pisces Shop

Tài liệu này dành cho nhân viên mới bắt đầu sử dụng hệ thống quản lý nhà hàng **Pisces**. Không cần kiến thức kỹ thuật — chỉ cần đọc phần tương ứng với vai trò của bạn.

---

## Mục lục

1. [Đăng ký & Đăng nhập](#1-đăng-ký--đăng-nhập)
2. [Giao diện chính](#2-giao-diện-chính)
3. [Hướng dẫn theo vai trò](#3-hướng-dẫn-theo-vai-trò)
4. [Dashboard — Tổng quan](#4-dashboard--tổng-quan)
5. [Quản lý Bàn](#5-quản-lý-bàn)
6. [Đơn hàng](#6-đơn-hàng)
7. [Menu & Thực đơn](#7-menu--thực-đơn)
8. [Kho nguyên liệu](#8-kho-nguyên-liệu)
9. [Công thức nấu ăn](#9-công-thức-nấu-ăn)
10. [Bảng lương & Chấm công](#10-bảng-lương--chấm-công)
11. [Quy trình chuẩn (SOP)](#11-quy-trình-chuẩn-sop)
12. [Quản lý người dùng](#12-quản-lý-người-dùng)
13. [Câu hỏi thường gặp](#13-câu-hỏi-thường-gặp)

---

## 1. Đăng ký & Đăng nhập

### Đăng ký lần đầu

1. Truy cập hệ thống và nhấn **"Register"** bên dưới form đăng nhập.
2. Điền đầy đủ: họ tên, email, mật khẩu.
3. Nhấn **Đăng ký**.
4. Tài khoản của bạn sẽ ở trạng thái **chờ duyệt** — hệ thống sẽ thông báo cho quản trị viên.
5. Sau khi được duyệt, bạn có thể đăng nhập bình thường.

> **Lưu ý:** Tài khoản mới cần được quản trị viên duyệt trước khi sử dụng. Nếu sau 1-2 ngày vẫn chưa đăng nhập được, hãy liên hệ quản lý.

### Đăng nhập

1. Nhập **email** và **mật khẩu**.
2. Nhấn **Sign in**.
3. Hệ thống tự động chuyển đến trang phù hợp với vai trò của bạn:
   - Admin / Manager → **Dashboard**
   - Phục vụ / Bếp → **Đơn hàng**

### Quên mật khẩu

> Hệ thống không gửi email tự động. Để đặt lại mật khẩu, bạn cần liên hệ quản trị viên để nhận **mã reset 1 lần**.

#### Hướng dẫn dành cho nhân viên

**Bước 1 — Liên hệ quản trị viên**

Báo cho admin/quản lý biết bạn cần đặt lại mật khẩu. Cung cấp **email đăng ký** để admin tạo đúng mã cho tài khoản của bạn.

**Bước 2 — Nhận mã reset**

Admin sẽ đưa cho bạn một mã gồm **8 ký tự in hoa**, ví dụ: `A3X9PK72`

- Mã chỉ có hiệu lực trong **30 phút**
- Sử dụng được **1 lần duy nhất**
- Nếu nhập sai hoặc để hết hạn → yêu cầu admin tạo mã mới

**Bước 3 — Đặt lại mật khẩu**

1. Vào trang đăng nhập → nhấn **"Quên mật khẩu?"** (bên dưới form).
2. Điền vào form:
   - **Email:** địa chỉ email tài khoản của bạn
   - **Mã đặt lại:** mã 8 ký tự nhận từ admin (không phân biệt hoa/thường)
   - **Mật khẩu mới:** tối thiểu 8 ký tự
   - **Xác nhận mật khẩu mới:** nhập lại đúng mật khẩu vừa đặt
3. Nhấn **"Đặt lại mật khẩu"**.
4. Khi thành công, màn hình thông báo ✅ → nhấn **"Về trang đăng nhập"** và đăng nhập bằng mật khẩu mới.

**Các lỗi thường gặp:**

| Thông báo lỗi | Nguyên nhân | Cách xử lý |
|--------------|------------|-----------|
| *Mã đặt lại không hợp lệ hoặc đã hết hạn* | Nhập sai mã, mã đã dùng, hoặc quá 30 phút | Yêu cầu admin tạo mã mới |
| *Email không đúng* | Email nhập khác với email đăng ký | Kiểm tra lại email tài khoản |
| *Mật khẩu xác nhận không khớp* | Hai ô mật khẩu khác nhau | Nhập lại cẩn thận |
| *Mật khẩu quá ngắn* | Ít hơn 8 ký tự | Đặt mật khẩu từ 8 ký tự trở lên |

---

#### Hướng dẫn dành cho Admin/Manager

**Khi nhân viên yêu cầu reset mật khẩu:**

1. Vào **Người dùng** (sidebar).
2. Chọn tab **Nhân viên**.
3. Tìm nhân viên cần reset → nhấn nút **🔑 Tạo mã reset** ở cuối dòng.
4. Popup xuất hiện hiển thị mã 8 ký tự:

   ```
   ┌─────────────────────────────────────┐
   │  Mã đặt lại mật khẩu               │
   │  Mã reset cho Nguyễn Văn A          │
   │                                     │
   │  [ A 3 X 9 P K 7 2 ]  [Sao chép]   │
   │                                     │
   │  ⚠ Hết hạn sau 30 phút.            │
   │    Chỉ dùng một lần.               │
   └─────────────────────────────────────┘
   ```

5. Nhấn **"Sao chép"** hoặc đọc thẳng mã cho nhân viên qua điện thoại/chat.
6. Nhấn **Đóng** — mã đã được lưu trong hệ thống.

> **Lưu ý bảo mật:**
> - Mã chỉ hiện **1 lần**, hệ thống không lưu mã gốc — nếu quên thì tạo mã mới.
> - Nhấn **"Tạo mã reset"** lần 2 sẽ **huỷ mã cũ** và tạo mã mới.
> - Không tạo mã cho tài khoản `superadmin`.
> - Chỉ trao mã trực tiếp hoặc qua kênh bảo mật — tránh đăng mã lên nhóm chat chung.

---

## 2. Giao diện chính

### Thanh điều hướng (Sidebar)

Thanh bên trái chứa tất cả các mục chức năng. Bạn chỉ thấy những mục mà vai trò của mình được phép truy cập.

```
🍴 Pisces
─────────────
📊 Dashboard
🍽️  Menu
🪑 Bàn
📋 Đơn hàng
📦 Kho
📖 Công thức
💰 Bảng lương
📄 SOP
👥 Người dùng   [3]  ← badge số tài khoản chờ duyệt
🔐 Phân quyền
─────────────
  EN | VI         ← chuyển ngôn ngữ
  Nguyễn Văn A
  manager
```

- Badge số đỏ trên **Người dùng** báo có tài khoản mới đang chờ duyệt (chỉ quản trị viên thấy).
- Nhấn **EN / VI** để chuyển ngôn ngữ — tuỳ chọn được lưu lại cho lần sau.

### Đổi ngôn ngữ

Kéo xuống cuối sidebar → nhấn **EN** để chuyển sang tiếng Anh, hoặc **VI** để dùng tiếng Việt.

---

## 3. Hướng dẫn theo vai trò

Tìm vai trò của bạn để biết cần dùng những tính năng nào.

### Phục vụ (Waiter)

Các tính năng chính:

| Tính năng | Dùng để làm gì |
|-----------|----------------|
| [Đơn hàng](#6-đơn-hàng) | Tạo đơn mới, giao món, huỷ đơn |
| [Bàn](#5-quản-lý-bàn) | Xem trạng thái bàn, thanh toán, ghi nhận dọn |
| [Chấm công](#10-bảng-lương--chấm-công) | Nộp giờ làm việc hàng ngày |
| [SOP](#11-quy-trình-chuẩn-sop) | Đọc quy trình phục vụ |

**Quy trình phục vụ một bàn:**
1. Vào **Bàn** → xác nhận bàn còn trống (màu xanh).
2. Vào **Đơn hàng** → nhấn **Đơn mới** → chọn bàn → thêm món → xác nhận.
3. Theo dõi đơn chuyển từ *Pending* → *In Progress* (bếp xử lý) → *Delivered* (bạn giao).
4. Khi khách thanh toán: vào **Bàn** → nhấn **Thanh toán** trên bàn đó → in bill → xác nhận.
5. Sau khi khách đi: nhấn **Dọn bàn** để bàn trở về trạng thái trống.

---

### Nhà bếp (Kitchen)

| Tính năng | Dùng để làm gì |
|-----------|----------------|
| [Đơn hàng](#6-đơn-hàng) | Xem đơn mới, bắt đầu chế biến |
| [Công thức](#9-công-thức-nấu-ăn) | Tra cứu định lượng nguyên liệu |
| [SOP](#11-quy-trình-chuẩn-sop) | Đọc quy trình bếp |

**Quy trình xử lý đơn:**
1. Vào **Đơn hàng** → tab **Pending** → xem đơn mới vào.
2. Nhấn **Bắt đầu** để nhận đơn → trạng thái chuyển sang *In Progress*.
3. Sau khi nấu xong, phục vụ sẽ nhấn **Giao** để báo đã mang ra bàn.

---

### Quản lý / Admin (Manager / Admin)

Có toàn quyền với tất cả tính năng:

| Tính năng | Dùng để làm gì |
|-----------|----------------|
| [Dashboard](#4-dashboard--tổng-quan) | Theo dõi doanh thu, hiệu suất |
| [Menu](#7-menu--thực-đơn) | Cập nhật thực đơn, giá cả |
| [Bàn](#5-quản-lý-bàn) | Thêm/sửa/xoá bàn |
| [Kho](#8-kho-nguyên-liệu) | Nhập/xuất nguyên liệu |
| [Bảng lương](#10-bảng-lương--chấm-công) | Duyệt công, tính lương |
| [Người dùng](#12-quản-lý-người-dùng) | Duyệt tài khoản mới |

---

## 4. Dashboard — Tổng quan

**Ai dùng:** Admin, Manager

Trang Dashboard cung cấp cái nhìn toàn diện về tình hình kinh doanh. Các mục có thể **thu gọn/mở rộng** bằng cách nhấn vào tiêu đề mục.

### Chọn khoảng thời gian

Ở đầu trang có các nút lọc nhanh:

- **Hôm nay** — mặc định khi mở
- **Tuần này** / **Tháng này** / **Năm này**
- **Tuỳ chỉnh** — chọn ngày bắt đầu và kết thúc bất kỳ

---

### Khối KPI (luôn hiển thị)

**Hàng 1 — Khối lượng đơn:**
- Tổng đơn / Đơn hoàn thành / Đơn huỷ

**Hàng 2 — Tài chính:**
- Doanh thu *(kèm giá trị đơn trung bình)*
- Chi phí nhập kho *(nguyên liệu đã nhập trong kỳ)*
- Lợi nhuận gộp *(xanh = có lãi, đỏ = lỗ)*

**Hàng 3 — Hiệu suất vận hành:**

| Chỉ số | Ý nghĩa |
|--------|---------|
| Tỷ lệ huỷ đơn | % đơn bị huỷ trong kỳ |
| Food Cost Ratio | Chi phí nguyên liệu / Doanh thu — `< 28%` xanh, `28–35%` vàng, `> 35%` đỏ |
| Số món TB / đơn | Trung bình bao nhiêu món mỗi đơn |
| Thời gian TB 1 bàn | Từ lúc gọi món đến thanh toán |
| Giờ cao điểm | Giờ có nhiều đơn nhất trong ngày |
| Ngày nhộn nhịp nhất | Thứ trong tuần có doanh thu cao nhất |

---

### Hiệu suất bàn *(có thể thu gọn)*

Bảng top bàn với **3 tab sắp xếp**:

| Tab | Sắp xếp theo |
|-----|-------------|
| **Doanh thu** | Bàn mang lại doanh thu cao nhất |
| **Số đơn** | Bàn có nhiều đơn hàng nhất |
| **Thời gian TB** | Bàn có thời gian ngồi trung bình cao nhất |

Các cột: Tên bàn · Số phiên · TB phiên (phút) · Số đơn · Doanh thu

---

### Hiệu suất nhân viên *(có thể thu gọn)*

Bảng tổng hợp hoạt động nhân viên trong kỳ. Nhấn tab vai trò (Tất cả / Phục vụ / Bếp…) để lọc.

| Cột | Ý nghĩa |
|-----|---------|
| Giờ làm | Tổng giờ ca đã được **duyệt** trong kỳ |
| Số đơn | Đơn hàng nhân viên đó tạo (mọi trạng thái) |
| Doanh thu phụ trách | Tổng doanh thu từ đơn đã hoàn thành do họ tạo |

---

### Thực đơn bán chạy *(có thể thu gọn)*

Bảng món bán chạy, nhấn tab để lọc theo **danh mục**. Số trong ngoặc là tổng số lượng đã bán.

---

### Biểu đồ xu hướng

Nhấn tiêu đề để mở rộng. Có **3 tab** biểu đồ:

| Tab | Nội dung |
|-----|---------|
| **Doanh thu theo ngày** | Đường doanh thu từng ngày *(chỉ có dữ liệu khi chọn khoảng > 1 ngày)* |
| **Doanh thu theo thứ** | Cột doanh thu theo thứ trong tuần (thứ 2 → CN) |
| **Đơn theo giờ** | Cột số đơn theo giờ trong ngày — nhận biết giờ cao điểm |

---

## 5. Quản lý Bàn

**Ai dùng:** Phục vụ, Manager, Admin

### Trạng thái bàn

Mỗi bàn hiển thị với màu sắc khác nhau:

| Màu | Trạng thái | Ý nghĩa |
|-----|-----------|---------|
| 🟢 Xanh | **Trống** | Bàn chưa có khách |
| 🟡 Vàng | **Có khách** | Đang có đơn hàng đang xử lý |
| 🟠 Cam | **Cần dọn** | Khách đã thanh toán, chưa dọn bàn |
| ⬜ Xám | **Đóng** | Bàn tạm không phục vụ |

### Thanh toán cho bàn

1. Nhấn nút **Thanh toán** (màu vàng) trên bàn có khách.
2. Popup bill hiện ra: danh sách tất cả đơn, tổng tiền.
3. *(Tuỳ chọn)* Nhấn **In bill** để in ra máy in nhiệt.
4. Nhấn **Xác nhận thanh toán** — tất cả đơn của bàn chuyển sang *Hoàn thành*, bàn chuyển sang trạng thái *Cần dọn*.

### Ghi nhận dọn bàn

Sau khi khách đi và bàn đã được dọn sạch: nhấn nút **Dọn bàn** → bàn trở về trạng thái **Trống**.

### Thêm / Sửa bàn *(Admin/Manager)*

- Nhấn **Bàn mới** → nhập tên, số thứ tự, chọn trạng thái hoạt động.
- Nhấn biểu tượng ✏️ trên bàn để chỉnh sửa.
- Nhấn 🗑️ để xoá *(chỉ được xoá nếu bàn chưa từng có đơn hàng)*.
- Nhấn biểu tượng toggle để bật/tắt hoạt động của bàn.

---

## 6. Đơn hàng

**Ai dùng:** Phục vụ, Bếp, Manager, Admin

### Tạo đơn mới

1. Nhấn nút **Đơn mới** (góc phải trên).
2. **Chọn bàn** từ danh sách bàn đang hoạt động.
3. **Thêm món:** duyệt theo danh mục hoặc tìm kiếm tên món → nhấn **+** để thêm, **−** để bớt.
4. *(Tuỳ chọn)* Nhập ghi chú cho đơn.
5. Kiểm tra tổng tiền → nhấn **Xác nhận**.

### Theo dõi & xử lý đơn

Các tab lọc theo trạng thái:

| Tab | Ý nghĩa | Ai xử lý |
|-----|---------|---------|
| **Pending** | Đơn vừa tạo, chờ bếp nhận | Bếp nhấn "Bắt đầu" |
| **In Progress** | Đang chế biến | Phục vụ nhấn "Giao" sau khi bếp xong |
| **Delivered** | Đã mang ra bàn | Chờ thanh toán |
| **Completed** | Đã thanh toán | Không cần thao tác |
| **Cancelled** | Đã huỷ | Chỉ xem |

### Lọc đơn hàng

- **Theo trạng thái:** nhấn các tab ở trên.
- **Theo bàn:** nhập tên bàn vào ô tìm kiếm.
- **Theo ngày:** chọn khoảng thời gian ở phần lọc ngày. Nhấn **Hôm nay** để quay về hôm nay.

Khi xem nhiều ngày, đơn được nhóm theo từng ngày.

### Sửa món trong đơn

*(Chỉ được sửa khi đơn đang Pending hoặc In Progress)*

1. Nhấn biểu tượng ✏️ trên đơn cần sửa.
2. Chỉnh số lượng từng món hoặc thêm/xoá món.
3. Nhấn **Lưu** — giá sẽ được tính lại theo thực đơn hiện tại.

### Huỷ đơn

Nhấn nút **Huỷ** (đỏ) trên đơn hàng → xác nhận. Chỉ huỷ được khi đơn chưa hoàn thành.

---

## 7. Menu & Thực đơn

**Ai dùng:** Admin, Manager

### Quản lý danh mục

- Nhấn **Danh mục mới** để thêm (tên + số thứ tự hiển thị).
- Nhấn ✏️ để đổi tên hoặc thứ tự.
- Nhấn 🗑️ để xoá *(chỉ xoá được nếu danh mục không còn món nào)*.

### Quản lý món ăn

- Nhấn **Món mới** → điền tên, giá, chọn danh mục.
- Giá được lưu và áp dụng ngay khi tạo đơn mới. Đơn đã tạo trước **không bị ảnh hưởng** khi đổi giá.
- Nhấn ✏️ để sửa thông tin món, 🗑️ để xoá khỏi thực đơn.

> **Mẹo:** Dùng số thứ tự (sort order) để sắp xếp danh mục và món theo thứ tự bạn muốn hiển thị trên màn hình đặt món.

---

## 8. Kho nguyên liệu

**Ai dùng:** Admin, Manager *(xem: Kitchen)*

### Tab Nguyên liệu

Danh sách tất cả nguyên liệu trong kho:
- Tên, đơn vị tính (kg, lít, hộp…), số lượng hiện tại.
- Nguyên liệu **sắp hết** được đánh dấu nhãn vàng ⚠️ **Low Stock**.

#### Thêm nguyên liệu mới

1. Nhấn **Nguyên liệu mới**.
2. Điền: tên, đơn vị tính (vd: kg, lít), ngưỡng cảnh báo hết hàng.
3. Nhấn **Lưu**.

#### Nhập / Xuất kho

1. Nhấn biểu tượng 📦 (Add Entry) trên dòng nguyên liệu.
2. Điền:
   - **Số lượng:** dương (+) để nhập kho, âm (−) để xuất/điều chỉnh.
   - **Đơn giá:** *(tuỳ chọn, dùng để tính chi phí)*
   - **Ghi chú:** nguồn hàng, lý do xuất…
3. Nhấn **Lưu** — tồn kho tự cập nhật.

#### Xem lịch sử theo nguyên liệu

Nhấn biểu tượng 🕐 (History) → popup hiện lịch sử nhập/xuất của riêng nguyên liệu đó, có thể lọc theo ngày.

### Tab Nhật ký

Xem toàn bộ hoạt động nhập/xuất kho của tất cả nguyên liệu:
- Lọc theo khoảng ngày.
- Số lượng **xanh** = nhập vào, **đỏ** = xuất ra.
- Hiển thị người thực hiện và thời gian.

---

## 9. Công thức nấu ăn

**Ai dùng:** Admin, Manager, Bếp *(chỉ xem)*

Trang này liên kết từng món ăn trong thực đơn với nguyên liệu cần dùng và định lượng.

### Xem công thức

Chọn món ăn từ danh sách → xem danh sách nguyên liệu và số lượng cần dùng cho 1 phần.

### Tạo / Cập nhật công thức *(Admin/Manager)*

1. Chọn món ăn cần thiết lập công thức.
2. Nhấn **Chỉnh sửa**.
3. Thêm từng nguyên liệu: chọn từ kho, nhập định lượng, ghi chú nếu cần.
4. Nhấn **Lưu** — toàn bộ công thức được thay thế.

---

## 10. Bảng lương & Chấm công

**Ai dùng:** Tất cả *(chấm công)* · Admin/Manager *(duyệt, tính lương)*

### Nhân viên: Nộp giờ làm

1. Vào **Bảng lương** → tab **Giờ làm**.
2. Nhấn **Thêm ca làm**.
3. Chọn: ngày, loại ca (**Thường** hoặc **Tăng ca**), số giờ, ghi chú.
4. Nhấn **Lưu** → ca làm xuất hiện với trạng thái **Chờ duyệt** (vàng).

**Trạng thái ca làm:**
- 🟡 **Chờ duyệt** — quản lý chưa xem
- 🟢 **Đã duyệt** — được tính vào lương
- 🔴 **Từ chối** — không tính, liên hệ quản lý nếu sai

### Quản lý: Duyệt giờ làm

1. Vào **Bảng lương** → tab **Giờ làm** → mục **Chờ duyệt**.
2. Xem danh sách ca làm của nhân viên chờ xác nhận.
3. Nhấn **Duyệt** hoặc **Từ chối** cho từng dòng.

### Quản lý: Tính lương tháng

1. Dùng nút **◀ ▶** để chọn tháng.
2. Vào tab **Bảng lương** → xem bảng tổng hợp lương từng nhân viên.
3. Nhấn **Chi tiết** bên cạnh một nhân viên để:
   - Xem phân tích chi tiết: lương cơ bản, giờ tăng ca, thưởng, khấu trừ.
   - Nhấn **Thêm điều chỉnh** để ghi thêm khoản thưởng/phạt.
4. Sau khi kiểm tra xong: nhấn **Xác nhận lương** → trạng thái chuyển thành *Confirmed*.
5. Khi đã chi trả lương thực tế: nhấn **Đánh dấu đã trả** → trạng thái chuyển thành *Paid* (khoá, không sửa được).

### Quản lý: Thêm nhân viên vào bảng lương

1. Vào tab **Nhân viên** → nhấn **Thêm nhân viên**.
2. Chọn tài khoản từ danh sách, điền lương cơ bản và hệ số giờ.
3. Nhấn **Lưu**.

---

## 11. Quy trình chuẩn (SOP)

**Ai dùng:** Tất cả *(đọc)* · Admin/Manager *(soạn thảo)*

SOP (Standard Operating Procedure) là nơi lưu các quy trình làm việc chuẩn của nhà hàng.

### Đọc SOP

Vào menu **SOP** → chọn quy trình cần xem → đọc từng bước hướng dẫn.

> Bạn chỉ thấy các SOP dành cho vai trò của mình.

### Soạn thảo SOP *(Admin/Manager)*

1. Vào **SOP** → nhấn **SOP Editor** (hoặc vào `/sop/editor`).
2. Nhấn **Tạo mới** hoặc chọn SOP có sẵn để chỉnh sửa.
3. Đặt tiêu đề, thêm từng bước hướng dẫn.
4. Chọn **vai trò nào được phép xem** SOP này (waiter, kitchen, v.v.).
5. Nhấn **Lưu**.

---

## 12. Quản lý người dùng

**Ai dùng:** Superadmin, Admin

### Duyệt tài khoản mới

Khi có nhân viên mới đăng ký, badge đỏ xuất hiện trên mục **Người dùng** trong sidebar.

1. Vào **Người dùng**.
2. Xem danh sách tài khoản **Chờ duyệt**.
3. Nhấn **Duyệt** để kích hoạt, hoặc **Từ chối** để huỷ.

### Xem danh sách nhân viên

Trang Người dùng hiển thị tất cả tài khoản đã được duyệt, sắp xếp theo vai trò. Mỗi dòng hiển thị trạng thái **Hoạt động** (xanh) hoặc **Vô hiệu** (xám).

### Vô hiệu hoá / Kích hoạt tài khoản

Khi nhân viên nghỉ việc hoặc cần tạm khoá:

1. Vào **Người dùng** → tab **Nhân viên**.
2. Tìm nhân viên cần đổi trạng thái.
3. Nhấn nút **🔴 Vô hiệu hoá** → xác nhận trong popup.
4. Tài khoản bị khoá: nhân viên **không thể đăng nhập** và không được tính vào bảng lương.

Để mở lại: nhấn nút **🟢 Kích hoạt** → xác nhận.

> **Lưu ý:**
> - Không thể vô hiệu hoá tài khoản `superadmin`.
> - Không thể vô hiệu hoá chính tài khoản đang đăng nhập.
> - Để xoá hoàn toàn tài khoản → dùng chức năng **Từ chối** ở bước phê duyệt (chỉ áp dụng cho tài khoản chưa được duyệt).

### Phân quyền *(Superadmin)*

Vào **Phân quyền** (`/roles`) để xem và chỉnh permissions cho từng vai trò. Thay đổi có hiệu lực ngay sau khi người dùng đăng nhập lại.

### Đặt lại mật khẩu cho nhân viên

Xem hướng dẫn chi tiết tại [mục 1 — Quên mật khẩu (phần Admin)](#hướng-dẫn-dành-cho-adminmanager).

---

## 13. Câu hỏi thường gặp

**Q: Tôi vừa đăng ký nhưng không đăng nhập được?**
Tài khoản cần được duyệt trước. Liên hệ quản lý để được kích hoạt.

**Q: Tôi quên mật khẩu, phải làm gì?**
Liên hệ admin/quản lý để được cấp **mã reset 8 ký tự** (ví dụ: `A3X9PK72`). Sau đó:
1. Vào trang đăng nhập → nhấn **"Quên mật khẩu?"**
2. Điền email + mã reset + mật khẩu mới → nhấn **Đặt lại mật khẩu**

Mã hết hạn sau 30 phút và chỉ dùng được 1 lần. Xem chi tiết tại [mục 1](#quên-mật-khẩu).

**Q: Mã reset bị báo "không hợp lệ hoặc đã hết hạn"?**
Ba nguyên nhân có thể xảy ra:
- Nhập sai mã (chú ý chữ hoa/thường không quan trọng, nhưng phải đúng 8 ký tự)
- Mã đã được dùng một lần rồi
- Đã quá 30 phút kể từ khi admin tạo mã

→ Yêu cầu admin nhấn **"Tạo mã reset"** lần nữa để có mã mới.

**Q: Tôi là admin, tìm nút tạo mã reset ở đâu?**
Vào **Người dùng** → tab **Nhân viên** → tìm nhân viên cần reset → nhấn nút **🔑 Tạo mã reset** ở cuối dòng. Mã hiện trong popup, nhấn **Sao chép** rồi đưa cho nhân viên.

**Q: Tôi không thấy một số mục trong menu?**
Bình thường — bạn chỉ thấy các tính năng phù hợp với vai trò của mình.

**Q: Tài khoản nhân viên bị vô hiệu hoá, làm gì để mở lại?**
Vào **Người dùng** → tab **Nhân viên** → tìm nhân viên (trạng thái **Vô hiệu** màu xám) → nhấn **Kích hoạt** → xác nhận. Nhân viên có thể đăng nhập ngay sau đó.

**Q: Tại sao không xoá được danh mục / bàn?**
- Danh mục: còn món ăn bên trong → xoá hết món trước.
- Bàn: đã từng có đơn hàng → không thể xoá, chỉ có thể tắt hoạt động.

**Q: Tôi đặt nhầm món, có sửa lại được không?**
Có, nếu đơn đang ở trạng thái **Pending** hoặc **In Progress** — nhấn ✏️ trên đơn để sửa. Sau khi giao xong không sửa được nữa.

**Q: Làm sao biết nguyên liệu nào sắp hết?**
Vào **Kho** → tab **Nguyên liệu** — nguyên liệu có nhãn ⚠️ **Low Stock** cần nhập thêm. Ngưỡng cảnh báo được đặt khi thêm nguyên liệu.

**Q: Tôi muốn xem lại đơn hàng tháng trước?**
Vào **Đơn hàng** → chỉnh ngày bắt đầu và kết thúc theo khoảng thời gian cần xem.

**Q: Có thể đổi giao diện sang tiếng Anh không?**
Có — kéo xuống cuối sidebar, nhấn **EN**.

**Q: Bảng lương của tôi chưa được tính, phải làm gì?**
Kiểm tra các ca làm đã được **Duyệt** chưa → nếu vẫn **Chờ duyệt** thì nhắc quản lý duyệt công trước khi chốt lương.

---

*Nếu gặp vấn đề không có trong tài liệu này, liên hệ quản trị viên hệ thống.*
