# N01SPORT 3.2 — hệ thống giao diện

## Định hướng

Website đặt sân và vận hành thể thao dành cho người chơi, chủ sân, nhân viên và quản trị. Áp dụng kỹ năng UI/UX Pro Max: bố cục hero-centric, hình ảnh mạnh, phân cấp nội dung, nhất quán hành vi và khả năng sử dụng. Điều chỉnh gợi ý màu mặc định của kỹ năng thành xanh rừng và xanh chanh phù hợp sân thể thao, dùng font hệ thống hỗ trợ tiếng Việt để không phụ thuộc tải font ngoài.

## Các thành phần dùng chung

| Thành phần | Quy ước |
|---|---|
| Màu chữ / nền đậm | #183B32 |
| Hành động chính | #176348, chữ trắng |
| Điểm nhấn | #DBF78E, chữ xanh đậm |
| Nền | #F7F8F2 |
| Bề mặt | #FFFFFF |
| Chữ phụ | #576B63 |
| Đường viền | #DCE5DC |
| Focus | #A34810, viền 3px |
| Khoảng cách | 4 / 8 / 12 / 16 / 24 / 32 / 48 |
| Bo góc | 8–10px control; 14–20px card; 24px hero |
| Kiểu chữ | Segoe UI / system-ui; hỗ trợ dấu tiếng Việt |
| Icon | SVG stroke, trang trí có aria-hidden |

`public/css/design-system.css` là nguồn token chung. `styles.css` triển khai trang đặt sân; `portal.css` triển khai tài khoản, quản trị và chi tiết sân. `public/js/ui.js` dùng chung icon, ánh xạ ảnh theo môn, xử lý fallback ảnh.

## Liên kết trải nghiệm

Trang chủ → chi tiết sân → xem lịch đúng sân → chọn ngày/giờ → tạo đơn → thanh toán → lịch của tôi.

Tài khoản → tổng quan vai trò → nhóm công việc / quản lý cơ sở / tài chính / quản trị / tài khoản. Chỉ hiển thị nhóm tương ứng vai trò. Các API hiện có vẫn kiểm soát quyền tại server.

Số liệu overview lấy từ API tại thời điểm tải trang, có nút làm mới. Không dùng số liệu tăng trưởng hoặc tỷ lệ giả. Bộ lọc giá áp dụng cho **giá cơ bản mỗi lượt của từng sân**; giá chính xác theo thời điểm hiển thị trong hộp chọn giờ. Lịch trống được tải lại sau đăng nhập và kiểm tra lại tại server khi tạo đơn.

## Ảnh đóng gói

Ảnh được tạo bằng công cụ ImageGen tích hợp, phục vụ minh họa giao diện. Không gắn ảnh tạo với cơ sở thực. Ảnh do chủ sân tải lên có ưu tiên cao hơn; nhãn minh họa xuất hiện nếu chưa có ảnh hoặc ảnh thật bị lỗi. Không thay đổi URL ảnh trong database.

| Tệp trong public/assets | Nội dung |
|---|---|
| tennis.webp / tennis-640.webp | Bạn bè chơi tennis trong nắng chiều; hero |
| football.webp / football-640.webp | Sân bóng đá với cây nhiệt đới |
| badminton.webp / badminton-640.webp | Sân cầu lông trong nhà, tường gỗ |
| basketball.webp / basketball-640.webp | Sân bóng rổ ngoài trời, nền đỏ đất |
| pickleball.webp / pickleball-640.webp | Sân pickleball xanh với ánh nắng chiều |

Bản lớn 1536×1024, bản thẻ 640×427, định dạng WebP. Hero dùng srcset/sizes và fetchpriority high; thẻ sân lazy-load, có kích thước để hạn chế dịch chuyển bố cục. Tổng ảnh khoảng 1,7 MB; không phải tải tất cả ảnh lớn khi vào trang chủ.

Prompt dùng để tạo ảnh (built-in ImageGen, không dùng CLI):

- Tennis: “Premium cinematic editorial photograph of two young adult Vietnamese friends playing tennis on an immaculate outdoor forest-green hard court, warm late-afternoon sunlight, white court lines, lush tropical trees and deep green fence. Landscape 3:2, slightly elevated courtside view, players toward right half. Natural proportions and textures. No text, logos, watermark or UI. Illustrative marketing imagery, not a specific real venue.”
- Football: “Beautiful small-sided football pitch with green artificial grass, crisp white markings, two goalposts, green perimeter net fence, Vietnamese tropical trees and low buildings. Late afternoon sunshine, elevated sideline architectural photography, no people, natural pitch geometry, no text logos watermark. Illustrative venue.”
- Badminton: “Modern indoor badminton hall in Vietnam, emerald green surfaces, white badminton markings, nets, warm wooden walls, dark roof rafters, diffused skylight. Court-level wide angle across two courts, no people, realistic textures, green and ivory palette, no logos text or watermark. Illustrative venue.”
- Basketball: “Outdoor basketball court, terracotta red area with forest green perimeter, white markings, two hoops at opposite ends, tropical trees and low Vietnamese skyline. Diagonal sideline view, warm afternoon light, real textures, no people, text, logos or watermark. Illustrative location.”
- Pickleball: “Outdoor pickleball court, emerald green area and warm blue kitchen zones, simple white rectangular markings, low central net, tropical trees and wire fence. Diagonal sideline view, warm afternoon light, real textures, no people, text, logos or watermark. Illustrative location.”

## Duy trì chất lượng

- Không thêm onclick/style inline vì CSP hiện tại chặn inline.
- Nhãn biểu mẫu luôn hiển thị; trạng thái luôn có chữ, không phụ thuộc màu.
- Control chính ít nhất 44px; input trên mobile 16px; giữ focus và khả năng phóng to.
- Tôn trọng prefers-reduced-motion; không ảnh/carousel tự động chạy.
- Khi thêm mục menu, cập nhật nhóm trong portal.js và kiểm tra tất cả vai trò.
- Kiểm tra 375, 768, 1024, 1440px, dữ liệu dài, trạng thái rỗng/lỗi và dialog.
- Không có migration mới trong bản giao diện này.
