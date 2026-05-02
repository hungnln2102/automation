-- Seed: 4 slide hero mặc định (đúng nội dung Website BannerSlider.tsx + URL ảnh w=960).
-- Bảng: content.banners
--
-- Chạy (từ máy có psql):
--   psql "$DATABASE_URL" -f database/seeds/seed_hero_banners_website_defaults.sql
--
-- An toàn khi chạy lại: chỉ INSERT nếu bảng đang không có dòng nào.
-- Nếu đã có banner và bạn muốn nhập thêm 4 slide này: mở admin → thêm tay,
-- hoặc backup → TRUNCATE content.banners → chạy lại file này.

BEGIN;

INSERT INTO content.banners (
  image_url,
  title,
  description,
  tag_text,
  image_alt,
  button_label,
  button_href,
  sort_order,
  active
)
SELECT
  v.image_url,
  v.title,
  v.description,
  v.tag_text,
  v.image_alt,
  v.button_label,
  v.button_href,
  v.sort_order,
  v.active
FROM (VALUES
  (
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=960&q=45&fit=crop&crop=entropy&fm=webp'::text,
    'Mavryk Premium Store - Phần mềm bản quyền chính hãng'::text,
    'Mavryk Premium Store cung cấp key và tài khoản bản quyền cho Windows, Office, Adobe, Autodesk cùng nhiều phần mềm làm việc khác. Sản phẩm rõ nguồn gốc, hướng dẫn kích hoạt chi tiết, xử lý đơn nhanh và hỗ trợ sau bán hàng tận tâm.'::text,
    'Giới thiệu'::text,
    'Không gian làm việc với laptop — banner giới thiệu cửa hàng'::text,
    'Tìm hiểu thêm'::text,
    '/about'::text,
    1,
    TRUE
  ),
  (
    'https://images.unsplash.com/photo-1526498460520-4c246339dccb?w=960&q=45&fit=crop&crop=entropy&fm=webp'::text,
    'Giảm 20% bộ Office bản quyền'::text,
    'Kích hoạt trong 5 phút, hỗ trợ cài đặt từ xa.'::text,
    'Ưu đãi đặc biệt'::text,
    'Điện thoại hiển thị giao diện lập trình — banner ưu đãi Office'::text,
    'Nhận ưu đãi'::text,
    '/promotions'::text,
    2,
    TRUE
  ),
  (
    'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=960&q=45&fit=crop&crop=entropy&fm=webp'::text,
    'Bảo mật đa lớp cho doanh nghiệp'::text,
    'Diệt virus, chống ransomware, quản trị tập trung.'::text,
    'Ưu đãi đặc biệt'::text,
    'Màn hình máy tính với giao diện ứng dụng — banner bảo mật'::text,
    'Xem gói bảo mật'::text,
    '/all-products'::text,
    3,
    TRUE
  ),
  (
    'https://images.unsplash.com/photo-1483478550801-ceba5fe50e8e?w=960&q=45&fit=crop&crop=entropy&fm=webp'::text,
    'Hỗ trợ 24/7 - Uy tín, tận tâm'::text,
    'Đội ngũ kỹ thuật sẵn sàng hỗ trợ mọi thời điểm.'::text,
    'Ưu đãi đặc biệt'::text,
    'Laptop và thiết bị — banner hỗ trợ khách hàng'::text,
    'Liên hệ ngay'::text,
    '/about'::text,
    4,
    TRUE
  )
) AS v(
  image_url,
  title,
  description,
  tag_text,
  image_alt,
  button_label,
  button_href,
  sort_order,
  active
)
WHERE NOT EXISTS (SELECT 1 FROM content.banners LIMIT 1);

COMMIT;
