# usage-band

Thanh hạn mức Claude hiện ngay phía trên ô chat của Claude Code (terminal và tab Code trong app Claude desktop).

```
╭──────────────────────────────────────────────────────────────────────╮
│ ❯ claude::hạn-mức  │  tháng còn 14 ngày  │  ● cập nhật 0p trước      │
│ phiên 5h ━━━━━━━━━━━━━━━━━━──  91%  ↻ 3g57p   ✓ đủ dùng tới reset    │
│ tuần 7n  ━━━━━━━━━━━━━━━━━───  85%  ↻ 3n17g   ✓ đủ dùng tới reset    │
╰──────────────────────────────────────────────────────────────────────╯
```

- **% còn lại** của cửa sổ 5 giờ và cửa sổ 7 ngày (gói Claude trả phí); thanh càng dài càng còn nhiều.
- Màu: xanh > 50%, vàng 21–50%, đỏ ≤ 20%.
- **↻** thời gian tới lúc reset · **✓ / ▲** dự đoán theo tốc độ đang dùng: đủ dùng tới reset hay cạn sau bao lâu.
- Số ngày còn lại trong tháng (theo lịch).
- Cập nhật sau mỗi câu trả lời, đồng hồ đếm lại mỗi 30 giây; số liệu lần trước được giữ nên mở chat là thấy ngay.
- `/usage-band` để ẩn/hiện.

## Cài đặt

Gõ ở ô chat của Claude Code trong terminal:

```
/plugin install usage-band --marketplace dnhoang77/usage-band
```

hoặc từ shell:

```
claude plugin install usage-band --marketplace dnhoang77/usage-band
```

Trả lời `y` khi được hỏi thêm marketplace, rồi chọn phạm vi **user** để thanh hiện ở mọi phiên. Sau đó app Claude desktop (tab Code) trên máy đó cũng hiện thanh.

## Giới hạn

- Gói Claude không có hạn mức token theo tháng; hạn mức thật là cửa sổ 5 giờ và 7 ngày, chỉ có dạng phần trăm.
- Chỉ hiện trong Claude Code, không có trên claude.ai hay phần chat thường.
