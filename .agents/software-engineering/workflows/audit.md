---
description: audit - Kiểm tra code quality và bảo mật
---

## /audit — Code & Security Audit

1. **Code Quality**:
   - [ ] Có hardcoded string nào không? (status, table name, URL)
   - [ ] Có logic lặp (DRY vi phạm) không?
   - [ ] Hàm nào quá dài (>50 lines)? Tách ra không?
   - [ ] Error handling đầy đủ chưa?
2. **Security**:
   - [ ] Password/secret có bị log ra không?
   - [ ] SQL injection: dùng parameterized query chưa?
   - [ ] `.env` không bị commit vào git chưa?
3. **Performance**:
   - [ ] Query N+1 problem?
   - [ ] Có index trên các cột hay dùng WHERE không?
4. **Dependencies**:
   - [ ] `npm audit` — có lỗ hổng bảo mật nào không?
5. Tổng hợp danh sách vấn đề theo severity (Critical/High/Medium/Low).
