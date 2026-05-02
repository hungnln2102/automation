---
description: test - Quy trình kiểm thử unit test và integration test
---

## /test — Testing Workflow

1. **Xác định scope test**: Unit test / Integration test / E2E?
2. **Unit test** (Jest):
   - Mock DB (knex), external services, logger
   - Test từng function độc lập
   - Edge cases: empty array, null, lỗi network, timeout
3. **Integration test**:
   - Test flow từ đầu đến cuối với DB thực (test DB riêng)
   - Kiểm tra idempotency: chạy 2 lần có ra kết quả giống nhau không?
4. **Chạy test**: `npm test` hoặc `jest --coverage`
5. **Review coverage**: Mục tiêu ≥ 80% cho business logic quan trọng.
6. Báo cáo kết quả cho Sếp.
