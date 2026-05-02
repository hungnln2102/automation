---
description: Quy trình cập nhật task document sau mỗi lần sửa code
---

# Update Task Document After Code Changes

// turbo-all

Mỗi khi đang thực hiện các mục trong task document (file `add_user_flow_task.md` hoặc bất kỳ task artifact nào), sau khi sửa code xong **BẮT BUỘC** phải cập nhật lại task document:

## Quy trình

1. **Trước khi bắt đầu sửa code**: Đọc task document hiện tại, xác định mục đang làm
2. **Thực hiện sửa code**: Sửa file theo yêu cầu
3. **Sau khi sửa code xong**: Cập nhật task document ngay lập tức:
   - Đánh dấu `[x]` cho mục đã hoàn thành
   - Đánh dấu `[/]` cho mục đang làm dở
   - Cập nhật nội dung mô tả nếu luồng/logic đã thay đổi
   - Thêm ghi chú thay đổi (ví dụ: "Đã chuyển V1 → V2", "Đã xóa hàm X")
4. **Cập nhật task boundary**: Gọi `task_boundary` tool với `TaskSummary` mô tả những gì đã làm

## Lưu ý quan trọng

- **KHÔNG ĐƯỢC** sửa code xong mà quên update task document
- Task document phải luôn phản ánh trạng thái thực tế của code
- Nếu thay đổi làm thay đổi luồng (flow), phải cập nhật lại sơ đồ/mô tả luồng trong task document
- Khi xóa code/function, phải cập nhật lại bảng file liên quan trong task document
