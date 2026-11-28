# Tài liệu Lattice OS

Bộ tài liệu này giúp các nhà phát triển, cộng tác viên, người đánh giá và đội ngũ bảo trì trong tương lai hiểu rõ mã nguồn cũng như cách nền tảng Lattice OS vận hành.

Mục tiêu là sự rõ ràng, không phải quảng cáo.

## Nguyên tắc viết tài liệu

- giải thích hệ thống thực sự làm gì
- phân biệt hành vi ổn định với kiến trúc đang phát triển
- làm rõ các ranh giới tin cậy
- ghi chép minh bạch các lựa chọn công nghệ thực tế
- ưu tiên mô tả cụ thể thay vì thuật ngữ AI mơ hồ

## Tài liệu nền tảng

### Tổng quan
- `overview/technology-transparency.md` — công nghệ sử dụng và các thành phần của nền tảng
- `overview/seo-strategy.md` — định vị SEO phù hợp thương hiệu, định hướng siêu dữ liệu và kiến trúc nội dung cho Lattice OS

### Kiến trúc
- `architecture/system-architecture.md` — cấu trúc hệ thống tổng quát, các thành phần chính và luồng dữ liệu/điều khiển

## Tài liệu hiện hành

### CLI và triển khai (MỚI)
- **lattice-cli v0.3.0** — CLI sẵn sàng cho môi trường production để quản lý bản cài đặt Docker
  - Vị trí: `scripts/lattice-cli/`
  - Tính năng: xác thực, triển khai, kích hoạt giấy phép V3, kiểm tra tình trạng, nâng cấp và sao lưu
  - Quy trình triển khai: kiểm tra trước (Docker, Compose v2, RAM/CPU, cổng, ổ đĩa và xác thực Docker), sau đó xác minh giấy phép trong lúc triển khai
  - CI/CD: tự động tạo bản nhị phân qua GitHub Actions
  - Phân phối: tập lệnh `install.sh` tự nhận diện hệ điều hành và kiến trúc
  - Xem: `scripts/lattice-cli/README.md` để tham khảo đầy đủ các lệnh

### Chương trình beta (MỚI)
- **Tài liệu mời tham gia beta**: `docs/beta-outreach/`
  - Mẫu tin nhắn riêng trên Threads (tuân thủ giới hạn 200 ký tự)
  - Chuỗi email cho người thử nghiệm quan tâm
  - Chiến lược tiếp cận theo nhóm người dùng
  - Xử lý câu trả lời: “có”, “đó là gì?”, “có miễn phí không?”, “để sau”

- **Hướng dẫn bắt đầu beta**: `app/[locale]/(public)/beta/`
  - Bắt đầu nhanh (15 phút) - `/beta/start`
  - Lộ trình nhà phát triển (45 phút) - `/beta/dev`
  - Lộ trình doanh nghiệp (1 giờ) - `/beta/enterprise`
  - Lộ trình quyền riêng tư (1 giờ) - `/beta/privacy`
  - Tạo trang tĩnh để tải nhanh

### Xác thực (ĐÃ CẬP NHẬT)
- **Trải nghiệm đăng nhập lấy cảm hứng từ PS1/PS2**
  - Giao diện Clerk tùy chỉnh với thẻ hiệu ứng kính
  - Nền chuyển động cùng hiệu ứng hạt tinh tế
  - Phong cách hoài cổ pha hiện đại (gợi nhớ trò chơi thập niên 90)
  - Vị trí: `app/[locale]/(auth)/layout.tsx`

## Các lớp hệ thống dự kiến tiếp theo

### Kiến trúc
- `architecture/runtime-mode-routing.md`
- `architecture/memory-and-context-architecture.md`
- `architecture/workspace-operating-profile-model.md`

### Bảo mật
- `security/public-routes.md`
- `security/trust-boundaries.md`
- `security/licensing-cryptography.md` — thiết kế hệ thống giấy phép V3 ed25519

### Vận hành
- `operations/truth-surfaces.md`
- `operations/deployment.md` — quy trình triển khai bằng Docker
- `operations/air-gap-deployment.md` — hướng dẫn vận hành hoàn toàn ngoại tuyến

### Tham khảo
- `reference/api-reference.md`
- `reference/environment-variables.md`
- `reference/cli-commands.md` — tài liệu tham khảo toàn bộ lệnh lattice-cli

### Quyết định kiến trúc
- `decisions/adr-001-*.md`

## Ghi chú

Các tài liệu này cần phát triển cùng sản phẩm.
Khi hành vi hệ thống thay đổi, tài liệu phải được cập nhật trong quá trình triển khai thay vì coi là công việc làm sau.

---

**Cập nhật lần cuối:** 2026-06-21
**Phiên bản:** 0.3.0 (lattice-cli)
