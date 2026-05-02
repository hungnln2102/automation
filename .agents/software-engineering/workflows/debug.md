---
description: debug - Quy trình debug có hệ thống
---

## /debug — Systematic Debug Workflow

1. **Reproduce**: Tái hiện lỗi với bước rõ ràng.
2. **Isolate**: Thu hẹp phạm vi:
   - Lỗi ở layer nào? (DB / Service / Controller / Route)
   - Đọc log: `logger.error` / `logger.warn`
3. **Hypothesis**: Đặt giả thuyết nguyên nhân (≥ 2 giả thuyết).
4. **Verify**: Kiểm tra từng giả thuyết bằng code/log.
5. **Fix**: Atomic — chỉ sửa đúng file liên quan.
6. **Confirm**: Chạy lại để xác nhận fix đúng.
7. **Document**: Cập nhật `lesson_learned.md` nếu lỗi nghiêm trọng.
