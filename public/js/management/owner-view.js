import { state } from '../core/state.js';
import { $ } from '../core/dom.js';
import { escapeHtml, money, dateTime, statusText } from '../core/format.js';
import { table, actionButton } from './components.js';

export function renderOwnerView(data) {
  const tab = state.managementTab; const createTabs = ['courts','promotions','staff','services'];
  $('#management-create').classList.toggle('hidden', !createTabs.includes(tab));
  if (tab === 'overview') {
    $('#table-title').textContent = 'Đơn đặt sân gần đây';
    $('#management-table').innerHTML = table(['Mã đơn','Khách hàng','Sân','Thời gian','Giá trị','Trạng thái'], data.recent.map((b) => `<tr><td><strong>${escapeHtml(b.booking_code)}</strong></td><td>${escapeHtml(b.full_name)}</td><td>${escapeHtml(b.court_name)}</td><td>${dateTime(b.start_at)}</td><td>${money(b.total_amount)}</td><td><span class="status ${b.status}">${statusText(b.status)}</span></td></tr>`));
    $('#side-panel').innerHTML = `<div class="panel-heading"><h3>Hiệu suất sân</h3><span>Theo lượt đặt</span></div><ul class="side-list">${data.courts.map((c) => `<li><div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.venue_name)}</small></div><strong>${c.booking_count}</strong></li>`).join('')}</ul>`;
  } else if (tab === 'courts') {
    $('#table-title').textContent = 'Danh mục sân';
    $('#management-table').innerHTML = table(['Sân','Địa điểm','Bộ môn','Giá cơ bản','Tình trạng','Thao tác'], data.courts.map((c) => `<tr><td><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.surface)}</small></td><td>${escapeHtml(c.venue_name)}</td><td>${escapeHtml(c.sport_name)}</td><td>${money(c.base_price)}</td><td><span class="status ${c.status}">${statusText(c.status)}</span></td><td><div class="row-actions">${actionButton(c.status==='active'?'Ngừng sân':'Mở sân','toggle-court',c.id,c.status==='active'?'danger':'outline')}</div></td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Quy tắc</h3></div><ul class="side-list"><li><div><strong>Ngừng sân</strong><small>Không xóa lịch sử và booking đã có.</small></div></li><li><div><strong>Giá mới</strong><small>Không thay đổi số tiền booking đã chốt.</small></div></li></ul>';
  } else if (tab === 'promotions') {
    $('#table-title').textContent = 'Chương trình khuyến mãi';
    $('#management-table').innerHTML = table(['Mã','Tên','Mức giảm','Điều kiện','Thời hạn','Trạng thái'], data.promotions.map((p) => `<tr><td><strong>${escapeHtml(p.code)}</strong></td><td>${escapeHtml(p.name)}</td><td>${p.discount_type==='percent'?`${p.discount_value}%`:money(p.discount_value)}</td><td>Từ ${money(p.min_order_value)}</td><td>${dateTime(p.starts_at)}<br>${dateTime(p.ends_at)}</td><td><span class="status ${p.active?'active':'inactive'}">${p.active?'Hoạt động':'Đã tắt'}</span></td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Mã mẫu</h3></div><ul class="side-list"><li><strong>CHAOSAN</strong><small>Giảm 10% lần đầu</small></li><li><strong>NHOMVUI</strong><small>Giảm 30.000₫</small></li></ul>';
  } else if (tab === 'staff') {
    $('#table-title').textContent = 'Nhân viên và phân công';
    $('#management-table').innerHTML = table(['Nhân viên','Liên hệ','Vị trí','Cơ sở','Trạng thái'], data.staff.map((u) => `<tr><td><strong>${escapeHtml(u.full_name)}</strong></td><td>${escapeHtml(u.email)}<br>${escapeHtml(u.phone||'')}</td><td>${escapeHtml(u.position)}</td><td>${escapeHtml(u.venue_name)}</td><td><span class="status ${u.status}">${statusText(u.status)}</span></td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Nhóm vận hành</h3></div><ul class="side-list"><li><strong>Lễ tân</strong><small>Check-in, hoàn tất booking</small></li><li><strong>Kỹ thuật</strong><small>Xử lý sự cố, bảo trì</small></li><li><strong>Vệ sinh</strong><small>Bàn giao sân sẵn sàng</small></li></ul>';
  } else if (tab === 'services') {
    $('#table-title').textContent = 'Dịch vụ và tồn kho';
    $('#management-table').innerHTML = table(['Dịch vụ','Loại','Địa điểm','Giá','Tồn kho','Trạng thái'], data.services.map((s) => `<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.venue_name)}</td><td>${money(s.price)} / ${escapeHtml(s.unit)}</td><td>${s.stock_quantity}</td><td><span class="status ${s.active?'active':'inactive'}">${s.active?'Đang bán':'Đã tắt'}</span></td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Loại dịch vụ</h3></div><ul class="side-list"><li><strong>Bán hàng</strong><small>Trừ tồn khi giao</small></li><li><strong>Cho thuê</strong><small>Ghi nhận bàn giao và trả đồ</small></li><li><strong>Kỹ thuật</strong><small>Gắn yêu cầu với booking</small></li></ul>';
  } else if (tab === 'maintenance') {
    $('#table-title').textContent = 'Yêu cầu bảo trì';
    $('#management-table').innerHTML = table(['Sân','Nội dung','Ưu tiên','Phụ trách','Trạng thái','Thao tác'], data.maintenance.map((m) => `<tr><td>${escapeHtml(m.court_name)}</td><td><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(m.description)}</small></td><td>${escapeHtml(m.priority)}</td><td>${escapeHtml(m.assigned_name||'Chưa giao')}</td><td><span class="status ${m.status}">${statusText(m.status)}</span></td><td><div class="row-actions">${!['closed','rejected'].includes(m.status)?actionButton('Duyệt xử lý','approve-maintenance',m.id):''}</div></td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Ảnh hưởng lịch sân</h3></div><ul class="side-list"><li><div><strong>Khoảng bảo trì</strong><small>Hệ thống chặn mọi booking mới bị trùng.</small></div></li></ul>';
  } else if (tab === 'refunds') {
    $('#table-title').textContent = 'Yêu cầu hủy và hoàn tiền';
    $('#management-table').innerHTML = table(['Booking','Khách hàng','Lý do','Số tiền','Trạng thái','Thao tác'], data.refunds.map((r) => `<tr><td><strong>${escapeHtml(r.booking_code)}</strong></td><td>${escapeHtml(r.full_name)}</td><td>${escapeHtml(r.reason)}</td><td>${money(r.requested_amount)}</td><td><span class="status ${r.status}">${statusText(r.status)}</span></td><td><div class="row-actions">${r.status==='pending'?`${actionButton('Duyệt','approve-refund',r.id)}${actionButton('Từ chối','reject-refund',r.id,'danger')}`:''}${r.status==='approved'?actionButton('Đã hoàn tiền','finish-refund',r.id):''}</div></td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Chính sách mẫu</h3></div><ul class="side-list"><li><div><strong>Chủ sân duyệt</strong><small>Khoản hoàn thực hiện thủ công và có nhật ký.</small></div></li></ul>';
  }
}
