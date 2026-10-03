import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, $$, showDialog, toast } from '../core/dom.js';
import { money, parseDate } from '../core/format.js';
import { isManagement } from '../session.js';
import { renderOwnerView } from './owner-view.js';
import { renderAdminView } from './admin-view.js';
import { renderStaffView } from './staff-view.js';

function roleTabs() {
  if (state.user.role === 'owner') return [['overview','Tổng quan'],['courts','Sân'],['promotions','Khuyến mãi'],['staff','Nhân viên'],['services','Dịch vụ'],['maintenance','Bảo trì'],['refunds','Hủy và hoàn tiền']];
  if (state.user.role === 'admin') return [['users','Tài khoản'],['venues','Địa điểm'],['audit','Nhật ký']];
  return [['work',state.user.role === 'receptionist' ? 'Lịch đặt sân' : 'Công việc hôm nay']];
}

function renderTabs() {
  const tabs = roleTabs(); if (!tabs.some(([id]) => id === state.managementTab)) state.managementTab = tabs[0][0];
  $('#management-tabs').innerHTML = tabs.map(([id,label]) => `<button class="management-tab ${state.managementTab===id?'active':''}" type="button" role="tab" aria-selected="${state.managementTab===id}" data-management-tab="${id}">${label}</button>`).join('');
  $$('[data-management-tab]').forEach((button) => button.addEventListener('click', () => { state.managementTab = button.dataset.managementTab; renderManagementView(); }));
}

function bindRowActions() { $$('[data-action]').forEach((button) => button.addEventListener('click', () => runAction(button.dataset.action, Number(button.dataset.id)))); }

function renderManagementView() {
  renderTabs(); const data = state.managementData;
  if (state.user.role === 'owner') renderOwnerView(data); else if (state.user.role === 'admin') renderAdminView(data); else renderStaffView(data);
  bindRowActions();
}

export async function showManagement() {
  if (!isManagement()) return showDialog('login-dialog');
  try {
    const receptionist = state.user.role === 'receptionist';
    $('#staff-booking-create').classList.toggle('hidden', !receptionist);
    $('#staff-date-control').classList.toggle('hidden', !receptionist);
    const isStaff = ['receptionist','technician','cleaner'].includes(state.user.role);
    const data = await api(state.user.role === 'owner' ? '/api/owner/dashboard' : state.user.role === 'admin' ? '/api/admin/dashboard' : `/api/staff/dashboard${receptionist ? `?date=${encodeURIComponent($('#staff-work-date').value)}` : ''}`);
    state.managementData = data;
    const labels = { owner:['VẬN HÀNH CHỦ SÂN','Trung tâm quản lý'],admin:['QUẢN TRỊ HỆ THỐNG','Tổng quan nền tảng'],receptionist:['VẬN HÀNH LỄ TÂN','Lịch đặt sân của khách'],technician:['VẬN HÀNH KỸ THUẬT','Yêu cầu kỹ thuật'],cleaner:['VẬN HÀNH VỆ SINH','Bàn giao sân'] }[state.user.role];
    $('#management-eyebrow').textContent = labels[0]; $('#management-title').textContent = labels[1];
    const workDate = receptionist ? parseDate(`${data.date}T12:00:00`) : new Date();
    const metrics = state.user.role === 'owner' ? [['Sân quản lý',data.metrics.courts],['Lịch sắp tới',data.metrics.upcoming_bookings],['Đã xác nhận',data.metrics.confirmed],['Đã thu',money(data.metrics.collected)]] : state.user.role === 'admin' ? [['Người dùng',data.metrics.users],['Cụm sân',data.metrics.venues],['Sân thi đấu',data.metrics.courts],['Đã thu',money(data.metrics.collected)]] : [['Ca làm',data.assignments.length],['Công việc',data.work.length],['Vai trò',labels[0].replace('VẬN HÀNH ','')],['Ngày làm việc',new Intl.DateTimeFormat('vi-VN').format(workDate)]];
    $('#metrics-grid').innerHTML = metrics.map(([label,value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
    if (isStaff) state.managementTab = 'work'; else if (!roleTabs().some(([id]) => id === state.managementTab)) state.managementTab = roleTabs()[0][0];
    renderManagementView(); $('#management-section').classList.remove('hidden'); $('#dashboard-section').classList.add('hidden'); $('#management-section').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { toast(error.message); }
}

async function runAction(action, id) {
  try {
    if (action === 'toggle-court') { const item = state.managementData.courts.find((x) => x.id === id); await api(`/api/owner/courts/${id}`, { method:'PATCH', body:JSON.stringify({ status:item.status==='active'?'inactive':'active' }) }); }
    if (action === 'approve-maintenance') await api(`/api/owner/maintenance/${id}`, { method:'PATCH', body:JSON.stringify({ status:'in_progress' }) });
    if (action === 'approve-refund') await api(`/api/owner/refunds/${id}`, { method:'PATCH', body:JSON.stringify({ status:'approved' }) });
    if (action === 'reject-refund') await api(`/api/owner/refunds/${id}`, { method:'PATCH', body:JSON.stringify({ status:'rejected', review_note:'Không đủ điều kiện hoàn tiền' }) });
    if (action === 'finish-refund') await api(`/api/owner/refunds/${id}`, { method:'PATCH', body:JSON.stringify({ status:'refunded' }) });
    if (action === 'toggle-user') { const item=state.managementData.users.find((x)=>x.id===id); await api(`/api/admin/users/${id}`,{method:'PATCH',body:JSON.stringify({status:item.status==='active'?'locked':'active'})}); }
    if (action === 'activate-venue') await api(`/api/admin/venues/${id}`,{method:'PATCH',body:JSON.stringify({status:'active'})});
    if (action === 'suspend-venue') await api(`/api/admin/venues/${id}`,{method:'PATCH',body:JSON.stringify({status:'suspended'})});
    if (['check-in','no-show','complete-booking'].includes(action)) await api(`/api/staff/bookings/${id}/status`,{method:'PATCH',body:JSON.stringify({status:{'check-in':'checked_in','no-show':'no_show','complete-booking':'completed'}[action]})});
    if (['collect-cash','collect-transfer'].includes(action)) await api(`/api/staff/bookings/${id}/pay`, { method:'POST', body:JSON.stringify({ payment_method:action === 'collect-cash' ? 'cash' : 'bank_transfer' }) });
    if (['maintenance-start','maintenance-done'].includes(action)) await api(`/api/staff/maintenance/${id}`,{method:'PATCH',body:JSON.stringify({status:action==='maintenance-start'?'in_progress':'resolved'})});
    if (['cleaning-start','cleaning-done','cleaning-blocked'].includes(action)) await api(`/api/staff/cleaning/${id}`,{method:'PATCH',body:JSON.stringify({status:{'cleaning-start':'in_progress','cleaning-done':'completed','cleaning-blocked':'blocked'}[action],issue_note:action==='cleaning-blocked'?'Cần lễ tân hoặc kỹ thuật kiểm tra':''})});
    toast('Đã cập nhật dữ liệu.'); await showManagement();
  } catch (error) { toast(error.message); }
}
