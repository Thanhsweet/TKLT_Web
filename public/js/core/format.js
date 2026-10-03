export const formatter = new Intl.NumberFormat('vi-VN');
export const money = (value) => `${formatter.format(Number(value || 0))}₫`;
export const parseDate = (value) => new Date(String(value).replace(' ', 'T'));
export const dateTime = (value) => new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(parseDate(value));
export const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

export function statusText(status) {
  return ({ pending:'Chờ thanh toán',confirmed:'Đã xác nhận',checked_in:'Đang sử dụng',completed:'Hoàn tất',cancel_requested:'Chờ duyệt hủy',cancelled:'Đã hủy',expired:'Hết hạn',no_show:'Khách vắng',paid:'Đã thanh toán',active:'Hoạt động',inactive:'Ngừng hoạt động',maintenance:'Bảo trì',locked:'Đã khóa',suspended:'Tạm dừng',open:'Mới tạo',assigned:'Đã giao',in_progress:'Đang xử lý',waiting_approval:'Chờ duyệt',resolved:'Đã xử lý',closed:'Đã đóng',rejected:'Từ chối',approved:'Đã duyệt',refunded:'Đã hoàn',ready:'Sẵn sàng',needs_cleaning:'Cần vệ sinh',cleaning:'Đang vệ sinh',blocked:'Bị chặn' })[status] || status;
}
