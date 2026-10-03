import { state } from '../core/state.js';
import { $ } from '../core/dom.js';
import { escapeHtml, dateTime, statusText } from '../core/format.js';
import { table, actionButton } from './components.js';

export function renderAdminView(data) {
  $('#management-create').classList.toggle('hidden', state.managementTab !== 'users');
  if (state.managementTab === 'users') {
    $('#table-title').textContent = 'Tài khoản hệ thống';
    $('#management-table').innerHTML = table(['Họ tên','Email','Vai trò','Trạng thái','Thao tác'], data.users.map((u) => `<tr><td><strong>${escapeHtml(u.full_name)}</strong></td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td><span class="status ${u.status}">${statusText(u.status)}</span></td><td><div class="row-actions">${u.role!=='admin'?actionButton(u.status==='active'?'Khóa':'Mở khóa','toggle-user',u.id,u.status==='active'?'danger':'outline'):''}</div></td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Phân quyền</h3></div><ul class="side-list"><li><div><strong>Khóa tài khoản</strong><small>Phiên đăng nhập hiện tại bị vô hiệu hóa.</small></div></li></ul>';
  } else if (state.managementTab === 'venues') {
    $('#table-title').textContent = 'Cụm sân đăng ký';
    $('#management-table').innerHTML = table(['Địa điểm','Chủ sân','Khu vực','Đánh giá','Trạng thái','Thao tác'], data.venues.map((v) => `<tr><td><strong>${escapeHtml(v.name)}</strong></td><td>${escapeHtml(v.owner_name)}</td><td>${escapeHtml(v.district)}, ${escapeHtml(v.city)}</td><td>${v.rating}/5</td><td><span class="status ${v.status}">${statusText(v.status)}</span></td><td><div class="row-actions">${v.status!=='active'?actionButton('Duyệt','activate-venue',v.id):actionButton('Tạm dừng','suspend-venue',v.id,'danger')}</div></td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Kiểm duyệt</h3></div><ul class="side-list"><li><div><strong>Địa điểm tạm dừng</strong><small>Không xuất hiện trong kết quả tìm kiếm.</small></div></li></ul>';
  } else {
    $('#table-title').textContent = 'Nhật ký quản trị';
    $('#management-table').innerHTML = table(['Thời gian','Người thực hiện','Hành động','Đối tượng','Mã'], data.audit.map((a) => `<tr><td>${dateTime(a.created_at)}</td><td>${escapeHtml(a.actor_name||'Hệ thống')}</td><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.entity_type)}</td><td>${a.entity_id||'—'}</td></tr>`));
    $('#side-panel').innerHTML = '<div class="panel-heading"><h3>Audit log</h3></div><ul class="side-list"><li><div><strong>Không chỉnh sửa</strong><small>Lưu dấu vết thao tác quản trị và vận hành.</small></div></li></ul>';
  }
}
