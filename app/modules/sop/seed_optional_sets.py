"""
Các bộ SOP bổ sung (không seed cùng lúc với « SOP chung »).

Chạy script khi cần, ví dụ:
    python scripts/seed_sop_sets.py chau_cay to_tuong
    python scripts/seed_sop_sets.py --list

Thêm bộ mới: khai báo hằng CATEGORY_NAME + TASKS, rồi đăng ký trong OPTIONAL_SOP_SETS.
"""

# --- Bán chậu trồng cây ----------------------------------------------------

SOP_CHAU_CAY_CATEGORY_NAME = "SOP bán chậu trồng cây"

SOP_CHAU_CAY_TASKS: list[dict[str, object]] = [
    {
        "title": "Tiếp đón & tư vấn chọn chậu",
        "description": (
            "Giúp khách chọn chậu phù hợp loại cây, không gian đặt và ngân sách; "
            "tránh vỡ hàng khi cầm."
        ),
        "steps": [
            {
                "type": "text",
                "content": (
                    "Mục tiêu: Khách hiểu rõ kích thước, chất liệu và khả năng thoát nước; "
                    "hài lòng trước khi thanh toán."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Chào khách, hỏi nhu cầu (loại cây, trong nhà/ngoài trời, kích thước khu đặt chậu)."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Gợi ý chậu có lỗ thoát nước hoặc hướng dẫn khoan/lót sỏi khi cần; "
                    "cảnh báo nếu chậu không phù hợp ngoài trời (đông, nứt)."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Cầm hai tay, đáy chậu không va quệt kệ; không xếp chồng quá cao khi khách tự chọn."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Báo giá rõ (đơn vị / bộ); kiểm tra vết nứt nhỏ trước khi giao cho khách."
                ),
            },
        ],
    },
    {
        "title": "Trưng bày, nhãn giá & kiểm kê",
        "description": "Kệ gọn, giá đúng, ghi nhận hàng mẻ hoặc thiếu.",
        "steps": [
            {
                "type": "check",
                "content": (
                    "Mỗi mã có nhãn giá nhìn thấy; đồng bộ với phần mềm/kho khi đổi giá."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Hàng nặng ở dưới, nhẹ trên; chèn chống đổ; khu vực đi lại không bị chậu lấn lối."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Cuối ca (hoặc theo lịch): đếm nhanh vùng trưng bày, ghi sổ vỡ/mẻ và báo quản lý."
                ),
            },
        ],
    },
    {
        "title": "Đóng gói, giao hàng & sau bán",
        "description": "Giảm vỡ khi vận chuyển; chính sách đổi trả thống nhất.",
        "steps": [
            {
                "type": "check",
                "content": (
                    "Bọc cạnh/góc, chèn giấy hoặc xốp; khách tự mang: nhắc cách cầm và không chồng nặng lên chậu sứ."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Giao xe/ship: cố định chậu trong thùng, không để lăn; chụp ảnh trạng thái đóng gói nếu quy định nội bộ."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Thu tiền đúng hóa đơn; lỗi sản xuất trong 24–48h (theo cửa hàng) báo quản lý trước khi đổi."
                ),
            },
        ],
    },
]


# --- Tô tượng -------------------------------------------------------------

SOP_TO_TUONG_CATEGORY_NAME = "SOP dịch vụ tô tượng"

SOP_TO_TUONG_TASKS: list[dict[str, object]] = [
    {
        "title": "Chuẩn bị ca & bàn làm việc",
        "description": "Màu, cọ, nước, khăn và an toàn cho khách (đặc biệt trẻ em).",
        "steps": [
            {
                "type": "check",
                "content": (
                    "Kiểm tra màu đủ loại cơ bản, cọ không cứng quá; thay nước rửa cọ giữa các nhóm khách bẩn."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Trải giấy/khăn chống bẩn bàn; có thùng rác nhỏ tại bàn; nhắc không ăn uống cạnh màu."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Tượng mẫu trưng bày còn tồn: đếm và khóa khu chưa trả tiền theo quy trình cửa hàng."
                ),
            },
        ],
    },
    {
        "title": "Hướng dẫn khách tô",
        "description": "Quy trình từ chọn tượng đến nhận tượng (sấy/làm khô/nung nếu có).",
        "steps": [
            {
                "type": "check",
                "content": (
                    "Giải thích giá theo size/loại tượng; thời gian chờ (sấy/nung), phí cọc nếu có."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Hướng dẫn lớp mỏng, đợi khô giữa các lớp; trẻ em cần người lớn đồng hành khi dùng cọ nhỏ."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Ghi tên/số điện thoại trên phiếu hoặc đáy tượng; hẹn giờ nhận rõ ràng."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Khách mang về: hướng dẫn bọc chống trầy; cảnh báo màu chưa khô hẳn."
                ),
            },
        ],
    },
    {
        "title": "Thu ngân, giữ tượng & bàn giao ca",
        "description": "Tiền đúng, khu lưu tượng gọn, bàn giao cho ca sau.",
        "steps": [
            {
                "type": "check",
                "content": (
                    "Thu đủ phí dịch vụ + phụ phí (sấy/nung) trước khi khách rời bàn hoặc theo chính sách cửa hàng."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Tượng chờ khách: xếp theo kệ có mã/phiếu, tránh nhầm; tượng quá hạn báo quản lý xử lý."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Cuối ca: lau bàn, đổ nước bẩn đúng nơi quy định, cọ ngâm sạch; báo hết màu/cọ cho quản lý."
                ),
            },
        ],
    },
]


# slug -> (category_name, sort_order, tasks)
OPTIONAL_SOP_SETS: dict[str, tuple[str, int, list[dict[str, object]]]] = {
    "chau_cay": (SOP_CHAU_CAY_CATEGORY_NAME, 10, SOP_CHAU_CAY_TASKS),
    "to_tuong": (SOP_TO_TUONG_CATEGORY_NAME, 20, SOP_TO_TUONG_TASKS),
}
