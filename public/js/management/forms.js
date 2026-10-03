import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, showDialog, closeDialog, toast } from '../core/dom.js';
import { escapeHtml } from '../core/format.js';
import { showManagement } from './index.js';

function field(name, label, type='text', options=null, full=false) {
  const optionHtml = options ? `<select name="${name}" required>${options.map(([v,l])=>`<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>` : `<input name="${name}" type="${type}" ${type!=='checkbox'?'required':''}>`;
  return `<label class="${full?'field-full':''}"><span>${label}</span>${optionHtml}</label>`;
}

function venueOptions() { return [...new Map((state.managementData.courts||[]).map((c)=>[String(c.venue_id),c.venue_name])).entries()]; }

export function openEntityForm() {
  const tab = state.managementTab; let config;
  if (state.user.role === 'owner' && tab === 'courts') config={title:'Thêm sân',endpoint:'/api/owner/courts',fields:field('venue_id','Địa điểm','text',venueOptions())+field('sport_id','Bộ môn','text',state.sports.map((s)=>[String(s.id),s.name]))+field('name','Tên sân')+field('surface','Mặt sân')+field('capacity','Sức chứa','number')+field('base_price','Giá cơ bản','number')+field('slot_minutes','Thời lượng slot','text',[['30','30 phút'],['60','60 phút'],['90','90 phút'],['120','120 phút']])};
  if (state.user.role === 'owner' && tab === 'promotions') config={title:'Tạo khuyến mãi',endpoint:'/api/owner/promotions',fields:field('code','Mã khuyến mãi')+field('name','Tên chương trình')+field('discount_type','Loại giảm','text',[['percent','Phần trăm'],['fixed','Số tiền']])+field('discount_value','Giá trị giảm','number')+field('min_order_value','Đơn tối thiểu','number')+field('max_discount','Giảm tối đa','number')+field('starts_at','Bắt đầu','datetime-local')+field('ends_at','Kết thúc','datetime-local')};
  if (state.user.role === 'owner' && tab === 'staff') config={title:'Tạo nhân viên',endpoint:'/api/owner/staff',fields:field('venue_id','Cơ sở','text',venueOptions())+field('position','Vị trí','text',[['receptionist','Lễ tân'],['technician','Kỹ thuật'],['cleaner','Vệ sinh']])+field('full_name','Họ tên')+field('email','Email','email')+field('phone','Số điện thoại','tel')+field('password','Mật khẩu','password')+field('shift_start','Bắt đầu ca','datetime-local')+field('shift_end','Kết thúc ca','datetime-local')};
  if (state.user.role === 'owner' && tab === 'services') config={title:'Thêm dịch vụ',endpoint:'/api/owner/services',fields:field('venue_id','Cơ sở','text',venueOptions())+field('type','Loại','text',[['sale','Bán hàng'],['rental','Cho thuê'],['technical','Kỹ thuật']])+field('name','Tên dịch vụ')+field('unit','Đơn vị')+field('price','Đơn giá','number')+field('stock_quantity','Tồn kho','number')};
  if (state.user.role === 'admin') config={title:'Tạo tài khoản vận hành',endpoint:'/api/admin/users',fields:field('role','Vai trò','text',[['owner','Chủ sân'],['receptionist','Lễ tân'],['technician','Kỹ thuật'],['cleaner','Vệ sinh']])+field('full_name','Họ tên')+field('email','Email','email')+field('phone','Số điện thoại','tel')+field('password','Mật khẩu','password')};
  if (state.user.role === 'technician' || state.user.role === 'receptionist') config={title:'Báo sự cố kỹ thuật',endpoint:'/api/staff/maintenance',fields:field('court_id','Mã sân','number')+field('priority','Mức ưu tiên','text',[['low','Thấp'],['medium','Trung bình'],['high','Cao'],['urgent','Khẩn cấp']])+field('title','Tiêu đề', 'text', null, true)+field('description','Mô tả', 'text', null, true)};
  if (!config) return; state.entityConfig = config; $('#entity-title').textContent=config.title; $('#entity-fields').innerHTML=config.fields; $('#entity-error').classList.add('hidden'); showDialog('entity-dialog');
}

export async function submitEntity(event) {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const errorBox=$('#entity-error');
  const payload=Object.fromEntries(new FormData(form).entries()); button.disabled=true; errorBox.classList.add('hidden');
  try{await api(state.entityConfig.endpoint,{method:'POST',body:JSON.stringify(payload)});closeDialog('entity-dialog');form.reset();toast('Đã thêm dữ liệu mới.');await showManagement();}
  catch(error){errorBox.textContent=error.message;errorBox.classList.remove('hidden');}
  finally{button.disabled=false;}
}
