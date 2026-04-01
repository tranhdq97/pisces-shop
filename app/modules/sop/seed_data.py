"""Master SOP content seeded idempotently when category « SOP chung » is absent."""

SOP_MASTER_CATEGORY_NAME = "SOP chung"

# Each item: title, optional description, steps as list of {"type": "text"|"check", "content": str}
SOP_MASTER_TASKS: list[dict[str, object]] = [
    {
        "title": "Chào đón & phục vụ khách",
        "description": "Chuẩn thái độ, lời chào và hành vi khi tiếp đón khách tại nhà hàng.",
        # Mức phạt gợi ý (VNĐ) khi ghi nhận vi phạm SOP — có thể chỉnh trong Soạn SOP
        "penalty_amount": 50_000,
        "steps": [
            {
                "type": "text",
                "content": (
                    "Mục tiêu: Khách cảm thấy được chào đón chân thành, tôn trọng và sẵn sàng "
                    "trải nghiệm dịch vụ tốt ngay từ giây đầu."
                ),
            },
            {
                "type": "check",
                "content": "Nhìn khách, mỉm cười tự nhiên; tránh vừa làm việc vừa cúi mặt xuống điện thoại.",
            },
            {
                "type": "check",
                "content": (
                    "Chào theo khung giờ phù hợp (ví dụ: « Chào anh/chị », « Xin kính chào ») "
                    "— giọng rõ ràng, không vội vàng."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Dẫn khách hoặc chỉ bàn trong vòng 30 giây kể từ khi khách vào khu vực phục vụ "
                    "(trừ khi đang xử lý sự cố khẩn cấp — cần nhờ đồng nghiệp hỗ trợ)."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Giới thiệu ngắn menu/ưu đãi nếu khách cần; luôn hỏi nhu cầu (nước, trẻ em, "
                    "dị ứng thực phẩm) trước khi gợi ý món."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Khi khách rời đi: cảm ơn, mời ghé lại; kiểm tra không bỏ quên đồ trên bàn "
                    "và bàn gọn gàng cho lượt sau."
                ),
            },
            {
                "type": "text",
                "content": (
                    "Thưởng / phạt gắn SOP chào & phục vụ (làm sai SOP = có hậu quả tài chính; "
                    "số tiền ghi trên bảng lương sau khi quản lý duyệt): "
                    "Thưởng — phản hồi tích cực có xác minh (ghi chú bill, khảo sát, tin nhắn khách): "
                    "+200.000đ/lần hoặc +3% lương cơ bản của ngày làm đó (chọn một), tối đa 2 lần/tháng. "
                    "Phạt — bị ghi nhận vi phạm rõ (không chào trong tầm nhìn khách, dùng điện thoại cá nhân "
                    "trước mặt khách, không cảm ơn tiễn khách): 50.000đ/lần hoặc trừ 1% lương ngày; "
                    "vi phạm lặp trong cùng tháng: nhân đôi mức hoặc kỷ luật bằng văn bản."
                ),
            },
        ],
    },
    {
        "title": "Xử lý sự cố thường gặp",
        "description": (
            "Nguyên tắc chung: an toàn người và tài sản trước, giữ bình tĩnh, thông tin kịp thời "
            "cho quản lý."
        ),
        "penalty_amount": 200_000,
        "steps": [
            {
                "type": "text",
                "content": (
                    "Mọi sự cố nghiêm trọng (cháy, điện, ngã, cấp cứu, tranh chấp bạo lực): "
                    "ưu tiên sơ tán/an toàn, gọi quản lý và số khẩn cấp theo quy định địa phương."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Khách phàn nàn món ăn/dịch vụ: lắng nghe, không cãi; xin lỗi chân thành; "
                    "đề xuất thay món/điều chỉnh theo chính sách cửa hàng; báo quản lý nếu vượt thẩm quyền."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Món chậm hoặc sai: thông báo thực tế cho khách, xin lỗi; phối hợp bếp/máy lấy order "
                    "để rút ngắn thời gian hoặc sửa sai."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Khách say hoặc gây rối: giữ giọng điềm tĩnh, giữ khoảng cách an toàn; "
                    "nhờ quản lý/bảo vệ can thiệp, không đối đầu một mình."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Vỡ đồ, trơn ngã: cô lập khu vực, dọn kính/gốm an toàn; "
                    "ghi nhận sự cố (thời gian, vị trí) để báo cáo nội bộ."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Sau khi xử lý: cập nhật quản lý bằng miệng hoặc kênh nội bộ để tránh lặp lại "
                    "và cải thiện quy trình."
                ),
            },
            {
                "type": "text",
                "content": (
                    "Thưởng / phạt gắn SOP sự cố: "
                    "Thưởng — báo cáo sự cố đầy đủ (thời gian, diễn biến, hành động đã làm) trong ca "
                    "và được quản lý đánh giá « đúng quy trình »: +100.000đ/ca hoặc +2% lương cơ bản ngày làm đó. "
                    "Phạt — chậm báo quản lý khi sự cố đã ảnh hưởng khách hoặc an toàn (quá 30 phút kể từ "
                    "khi phát hiện): 200.000đ/lần hoặc trừ 2% lương tháng; che giấu, không ghi nhận sự cố "
                    "liên quan ATTP/ngộ độc thực phẩm: 2.000.000đ hoặc 15–25% lương tháng (theo mức độ) + biên bản kỷ luật."
                ),
            },
        ],
    },
    {
        "title": "Quy tắc làm việc, thưởng & phạt",
        "description": (
            "Khung tiền và % lương áp dụng nội bộ; mỗi khoản phải có quyết định của quản lý và "
            "phản ánh trên bảng lương / biên bản (có thể điều chỉnh theo hợp đồng lao động)."
        ),
        "penalty_amount": 100_000,
        "steps": [
            {
                "type": "text",
                "content": (
                    "Tuân thủ giờ ca, đồng phục, vệ sinh cá nhân và ATTP; "
                    "không hút thuốc, không dùng điện thoại cá nhân trước mặt khách trừ khi phục vụ công việc."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Đúng giờ vào ca, xin phép nghỉ đúng quy trình; hoàn thành checklist bàn giao ca "
                    "theo phân công."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Tôn trọng đồng nghiệp và khách; không tiết lộ thông tin nội bộ, doanh thu hoặc "
                    "dữ liệu khách ra ngoài."
                ),
            },
            {
                "type": "text",
                "content": (
                    "Bảng phạt tiền / trừ % lương tháng (áp dụng khi vi phạm nội quy có bằng chứng; "
                    "chọn một trong hai cách tính theo từng vụ, không cộng trùng nếu quản lý quyết định chỉ áp dụng %): "
                    "Đi trễ dưới 15 phút, không phép — 50.000đ/lần hoặc trừ 0,5% lương cơ bản tháng; "
                    "trễ từ 15–45 phút — 150.000đ hoặc trừ 1%; trễ trên 45 phút hoặc vắng không phép — "
                    "300.000đ hoặc trừ 2% + buổi làm không lương. "
                    "Không đúng đồng phục / vệ sinh cá nhân khi vào ca — 100.000đ hoặc trừ 0,5% tháng. "
                    "Vi phạm ATTP (bỏ qua checklist bắt buộc, không tách thớt hoặc gây lẫn chéo đồ sống–chín) — 500.000đ "
                    "hoặc trừ 5% lương tháng; tái phạm trong 90 ngày — 1.500.000đ hoặc 10% tháng đó."
                ),
            },
            {
                "type": "text",
                "content": (
                    "Cư xử thiếu chuyên nghiệp (cãi khách, xúc phạm đồng nghiệp có nhân chứng) — "
                    "300.000đ hoặc trừ 3% lương tháng; nặng (gây thương tích, phân biệt đối xử) — "
                    "phạt tối thiểu 5.000.000đ hoặc 20–50% lương tháng + tạm ngưng ca theo nội quy. "
                    "Tiết lộ doanh thu / dữ liệu khách — 2.000.000đ hoặc 15% lương tháng + xem xét chấm dứt hợp đồng."
                ),
            },
            {
                "type": "text",
                "content": (
                    "Bảng thưởng tiền / % lương tháng (sau khi quản lý duyệt, có minh chứng): "
                    "Hoàn thành xuất sắc KPI dịch vụ tháng (theo bảng điểm nội bộ) — +500.000đ "
                    "hoặc +5% lương cơ bản tháng. "
                    "Khen từ khách có xác minh — +200.000đ/lần (tối đa +1.000.000đ/tháng) hoặc cộng dồn tối đa +3% lương tháng. "
                    "Đề xuất cải tiến được áp dụng toàn cửa hàng — +300.000đ–1.000.000đ/lần hoặc +2–5% một tháng lương được chọn."
                ),
            },
            {
                "type": "check",
                "content": (
                    "Mọi khoản thưởng/phạt tài chính phải do quản lý/cấp có thẩm quyền xác nhận "
                    "và phản ánh đúng trên bảng lương hoặc biên bản nội bộ."
                ),
            },
        ],
    },
]
