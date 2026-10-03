import { state } from './core/state.js';
import { api } from './core/api.js';
import { $, showDialog, closeDialog, toast } from './core/dom.js';
import { isManagement, updateSessionUi } from './session.js';
import { loadCourts } from './courts.js';
import { showManagement } from './management/index.js';

export const demoAccounts = {
  customer: ['khach@n01sport.vn', 'Khach@123'], owner: ['chusan@n01sport.vn', 'ChuSan@123'],
  admin: ['admin@n01sport.vn', 'Admin@123'], receptionist: ['letan@n01sport.vn', 'LeTan@123'],
  technician: ['kythuat@n01sport.vn', 'KyThuat@123'], cleaner: ['vesinh@n01sport.vn', 'VeSinh@123']
};

export async function login(event) {
  event.preventDefault(); const button=$('#login-form button[type="submit"]'); const error=$('#login-error'); error.classList.add('hidden'); button.disabled=true; button.textContent='Đang đăng nhập…';
  try{const data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('#login-email').value,password:$('#login-password').value})});state.user=data.user;updateSessionUi();closeDialog('login-dialog');toast(`Xin chào ${state.user.full_name}.`);await loadCourts();if(isManagement())showManagement();}
  catch(err){error.textContent=err.message;error.classList.remove('hidden');}finally{button.disabled=false;button.textContent='Đăng nhập';}
}

export async function register(event) {
  event.preventDefault(); const button=$('#register-form button[type="submit"]');const error=$('#register-error');error.classList.add('hidden');button.disabled=true;
  try{await api('/api/auth/register',{method:'POST',body:JSON.stringify({full_name:$('#register-name').value,email:$('#register-email').value,phone:$('#register-phone').value,password:$('#register-password').value})});closeDialog('register-dialog');$('#login-email').value=$('#register-email').value;showDialog('login-dialog');toast('Đăng ký thành công. Hãy đăng nhập.');}
  catch(err){error.textContent=err.message;error.classList.remove('hidden');}finally{button.disabled=false;}
}

export async function logout() { await api('/api/auth/logout',{method:'POST',body:'{}'});state.user=null;state.managementData=null;updateSessionUi();$('#dashboard-section').classList.add('hidden');$('#management-section').classList.add('hidden');await loadCourts();toast('Bạn đã đăng xuất.'); }
