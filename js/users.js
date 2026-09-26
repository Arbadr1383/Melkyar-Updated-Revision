const USER_PERMISSIONS = [
  ['dashboard','داشبورد'],['properties','فایل‌های ملکی'],['customers','مشتری‌ها'],
  ['owners','مالکین'],['search','جستجوی پیشرفته'],['visits','بازدیدها'],
  ['followups','پیگیری‌ها'],['deals','معاملات'],['commissions','کمیسیون'],
  ['finance','حسابداری'],['accounts','حساب‌ها'],['loans','قرض و طلب'],
  ['builders','سازندگان'],['reports','گزارش‌ها'],['notifications','اعلان‌ها'],
  ['backup','پشتیبان'],['settings','تنظیمات'],['club','باشگاه مشتریان'],['sharing','اشتراک فایل']
];

const ROLE_DEFAULTS = {
  admin: ['all'],
  manager: USER_PERMISSIONS.map(([k]) => k),
  consultant: ['dashboard','properties','customers','owners','search','visits','followups','deals','commissions','notifications'],
  limited: ['dashboard','customers']
};

function userPermissions(user) {
  if (!user) return [];
  if (user.role === 'admin' || (user.permissions || []).includes('all')) return ['all'];
  return Array.isArray(user.permissions) ? user.permissions : (ROLE_DEFAULTS[user.role] || []);
}

const usersModule = {
  async renderUsers(el, embedded=false) {
    ui.renderLoading(el, 'در حال بارگذاری کاربران و دسترسی‌ها...');
    try {
      const [allUsers, customers, requests] = await Promise.all([db.users.getAll(), db.customers.getAll(), db.userRequests.getAll()]);
      const isOwner = !!(AUTH.currentUser()?.developer || AUTH.currentUser()?.username?.toLowerCase() === 'alireza');
      const us = isOwner ? allUsers : allUsers.filter(u => !u.developer && !u.builtin);
      const freeLimit = Number((await db.settings.get('freeUserLimit'))?.value || 3);
      const customerMap = new Map(customers.map(c => [Number(c.id), c]));
      const rows = us.map(u => {
        const customer = customerMap.get(Number(u.customerId));
        const role = ({admin:'مدیر کل',manager:'مدیر دفتر',consultant:'مشاور',limited:'کاربر محدود'})[u.role] || 'کاربر';
        const perms = userPermissions(u);
        return `<tr>
          <td>${mk.esc(u.name)}</td><td>${mk.esc(u.username)}</td>
          <td>${mk.esc(customer?.name || '—')}</td><td>${role}</td>
          <td><span class="status-badge ${u.status === 'active' ? 'status-badge--success' : ''}">${u.status === 'active' ? 'فعال' : 'غیرفعال'}</span></td>
          <td>${perms.includes('all') ? 'همه دسترسی‌ها' : `${perms.length} دسترسی`} ${Number(u.id) > freeLimit && !u.builtin ? '<span class="hint">نیازمند تأیید سازنده</span>' : ''}</td>
          <td><button class="btn btn--ghost btn--sm" data-edit="${u.id}">ویرایش</button>
          ${!u.builtin && String(u.username).toLowerCase() !== 'ali' ? `<button class="btn btn--danger btn--sm" data-del="${u.id}">حذف</button>` : '<span class="hint">مدیر اصلی</span>'}</td>
        </tr>`;
      });
      const action = isOwner ? '<button class="btn btn--primary" id="add">+ ایجاد کاربر</button>' : '<button class="btn btn--primary" id="request-add">+ درخواست کاربر جدید</button>';
      const reqRows = isOwner ? requests.filter(r=>r.status==='pending').map(r=>`<tr><td>${mk.esc(r.name)}</td><td>${mk.esc(r.username)}</td><td>${mk.esc(r.roleLabel||r.role||'مشاور')}</td><td>${mk.esc(r.requestedByName||'—')}</td><td>${new Date(r.requestedAt||Date.now()).toLocaleString('fa-IR')}</td><td><button class="btn btn--primary btn--sm" data-approve-request="${r.id}">تأیید و ساخت</button> <button class="btn btn--danger btn--sm" data-reject-request="${r.id}">رد</button></td></tr>`).join('') : '';
      const reqPanel = isOwner ? `<section class="panel"><div class="page-header"><div><h3>درخواست‌های کاربران</h3><p class="muted">درخواست کاربر چهارم به بعد را از اینجا تأیید یا رد کنید.</p></div></div>${mk.table(['نام','نام کاربری','نقش','درخواست‌دهنده','تاریخ','عملیات'],reqRows,'درخواست در انتظار تأیید وجود ندارد.')}</section>` : '';
      el.innerHTML = (embedded ? '<div class="users-embedded">' : '') + mk.page('کاربران و دسترسی‌ها','ساخت کاربر، اتصال به مشتری و کنترل دقیق دسترسی‌ها',action)
        + mk.table(['نام','نام کاربری','مشتری مرتبط','نقش','وضعیت','دسترسی','عملیات'], rows, 'هنوز کاربری ثبت نشده است.') + reqPanel + (embedded ? '</div>' : '');
      el.querySelector('#add')?.addEventListener('click', () => this.openUserForm(el, null));
      el.querySelector('#request-add')?.addEventListener('click', () => this.openRequestForm(el));
      el.querySelectorAll('[data-approve-request]').forEach(b=>b.onclick=async()=>{ const r=await db.userRequests.get(Number(b.dataset.approveRequest)); if(r) this.approveRequest(el,r); });
      el.querySelectorAll('[data-reject-request]').forEach(b=>b.onclick=async()=>{ const r=await db.userRequests.get(Number(b.dataset.rejectRequest)); if(r){ await db.userRequests.update(r.id,{status:'rejected',reviewedAt:new Date().toISOString(),reviewedBy:AUTH.currentUser()?.username||'alireza'}); await db.logActivity({entityType:'userRequest',entityId:r.id,action:'reject'}); ui.toast('درخواست رد شد.','success'); await this.renderUsers(el,embedded); }});
      el.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
        try { const u = await db.users.get(Number(b.dataset.edit)); if (u) this.openUserForm(el, u); else ui.toast('کاربر پیدا نشد.','error'); }
        catch (err) { console.error(err); ui.toast('اطلاعات کاربر قابل دریافت نیست.','error'); }
      });
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const id = Number(b.dataset.del);
        if (!(await ui.confirmDialog('این کاربر حذف شود؟'))) return;
        try { await db.users.remove(id); ui.toast('کاربر حذف شد','success'); await this.renderUsers(el); }
        catch (err) { console.error(err); ui.toast('حذف کاربر انجام نشد.','error'); }
      });
    } catch (err) {
      console.error('users.renderUsers', err);
      ui.renderError(el, 'بارگذاری کاربران انجام نشد. اگر دیتابیس قدیمی است، یک‌بار صفحه را کامل ببندید و دوباره باز کنید.', () => this.renderUsers(el));
    }
  },

  async openUserForm(el, existing) {
    let customers = [];
    try { customers = await db.customers.getAll(); }
    catch (err) { console.error(err); ui.toast('فهرست مشتری‌ها بارگذاری نشد.','error'); return; }

    const selected = new Set(userPermissions(existing));
    const permissionHtml = USER_PERMISSIONS.map(([k,l]) =>
      `<label class="check-row"><input type="checkbox" name="perm" value="${k}" ${selected.has('all') || selected.has(k) ? 'checked':''}> ${l}</label>`
    ).join('');

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<form id="user-form" class="form-grid" autocomplete="off">
      <label>نام کامل<input name="name" value="${mk.esc(existing?.name || '')}" required></label>
      <label>نام کاربری<input name="username" value="${mk.esc(existing?.username || '')}" required autocomplete="username"></label>
      <label>رمز عبور<input name="password" type="password" ${existing ? '' : 'required'} autocomplete="new-password" placeholder="${existing ? 'برای تغییر، رمز جدید وارد کنید' : 'رمز عبور'}"></label>
      <label>مشتری مرتبط<select name="customerId"><option value="">بدون مشتری</option>${customers.map(c => `<option value="${c.id}" ${Number(existing?.customerId)===Number(c.id)?'selected':''}>${mk.esc(c.name)} — ${mk.esc(c.phone||'')}</option>`).join('')}</select></label>
      <label>نقش<select name="role" id="user-role"><option value="admin">مدیر کل</option><option value="manager">مدیر دفتر</option><option value="consultant">مشاور</option><option value="limited">کاربر محدود</option></select></label>
      <label>وضعیت<select name="status"><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></label>
      <div class="full-width permission-box">
        <div class="permission-head"><b>دسترسی‌ها</b><div><button type="button" class="btn btn--ghost btn--sm" id="perm-all">باز کردن همه</button><button type="button" class="btn btn--ghost btn--sm" id="perm-none">بستن همه</button></div></div>
        <div class="permission-grid">${permissionHtml}</div>
        <small class="hint">مدیر کل همه دسترسی‌ها را دارد. برای سایر نقش‌ها می‌توانید هر بخش را جداگانه باز یا بسته کنید.</small>
      </div>
      <div class="full-width"><button class="btn btn--primary" type="submit">ذخیره کاربر</button></div>
    </form>`;

    const role = wrapper.querySelector('#user-role');
    role.value = existing?.role || 'consultant';
    wrapper.querySelector('[name="status"]').value = existing?.status === 'inactive' ? 'inactive' : 'active';
    const checks = () => [...wrapper.querySelectorAll('input[name="perm"]')];
    const setAll = checked => checks().forEach(c => c.checked = checked);
    wrapper.querySelector('#perm-all').onclick = () => setAll(true);
    wrapper.querySelector('#perm-none').onclick = () => setAll(false);
    role.addEventListener('change', () => { if (role.value === 'admin') setAll(true); else if (!existing) setAll(false); });

    const modal = ui.openModal({ title: existing ? 'ویرایش کاربر' : 'ایجاد کاربر جدید', bodyEl: wrapper, size: 'lg' });
    wrapper.querySelector('#user-form').addEventListener('submit', async e => {
      e.preventDefault();
      const button = e.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const fd = new FormData(e.currentTarget);
        const name = String(fd.get('name') || '').trim();
        const username = String(fd.get('username') || '').trim();
        const password = String(fd.get('password') || '');
        if (!name || !username) throw new Error('نام و نام کاربری الزامی است.');
        const all = await db.users.getAll();
        const freeLimit = Number((await db.settings.get('freeUserLimit'))?.value || 3);
        const isOwner = !!(AUTH.currentUser()?.developer || AUTH.currentUser()?.username?.toLowerCase() === 'alireza');
        if (!existing && all.filter(u => !u.builtin).length >= freeLimit && !isOwner) throw new Error('از گزینه «درخواست کاربر جدید» استفاده کنید تا سازنده آن را تأیید کند.');
        const duplicate = all.find(u => String(u.username || '').trim().toLowerCase() === username.toLowerCase() && Number(u.id) !== Number(existing?.id));
        if (duplicate) throw new Error('این نام کاربری قبلاً استفاده شده است.');

        const roleValue = String(fd.get('role') || 'consultant');
        const data = { name, username, customerId: fd.get('customerId') ? Number(fd.get('customerId')) : null, role: roleValue, status: fd.get('status') === 'inactive' ? 'inactive' : 'active', permissions: roleValue === 'admin' ? ['all'] : fd.getAll('perm') };
        if (roleValue !== 'admin' && data.permissions.includes('all')) data.permissions = USER_PERMISSIONS.map(([k]) => k);
        if (!existing && !password) throw new Error('رمز عبور را وارد کنید.');
        if (password) data.passwordHash = await AUTH.sha256(password);

        if (existing) {
          if (existing.builtin || String(existing.username).toLowerCase() === 'ali') {
            data.username = 'Ali'; data.role = 'admin'; data.status = 'active'; data.permissions = ['all']; data.builtin = true;
            data.passwordHash = existing.passwordHash || 'a20a2b7bb0842d5cf8a0c06c626421fd51ec103925c1819a51271f2779afa730';
          }
          await db.users.update(existing.id, data);
        } else {
          await db.users.add(data);
        }
        modal.close();
        ui.toast(existing ? 'کاربر با موفقیت ویرایش شد.' : 'کاربر با موفقیت ایجاد شد.','success');
        await this.renderUsers(el);
      } catch (err) {
        console.error('users.save', err);
        ui.toast(err?.message || 'ذخیره کاربر انجام نشد.','error');
        button.disabled = false;
      }
    });
  },

  async openRequestForm(el) {
    const wrapper=document.createElement('div');
    wrapper.innerHTML=`<form id="request-form" class="form-grid" autocomplete="off">
      <label>نام کامل<input name="name" required></label>
      <label>نام کاربری پیشنهادی<input name="username" required autocomplete="off"></label>
      <label>نقش<select name="role"><option value="consultant">مشاور</option><option value="manager">مدیر دفتر</option><option value="limited">کاربر محدود</option></select></label>
      <label>توضیحات درخواست<input name="reason" placeholder="مثلاً اضافه شدن مشاور جدید"></label>
      <div class="full-width"><button class="btn btn--primary" type="submit">ثبت درخواست</button></div>
    </form>`;
    const modal=ui.openModal({title:'درخواست کاربر جدید',bodyEl:wrapper});
    wrapper.querySelector('form').onsubmit=async e=>{e.preventDefault(); const fd=new FormData(e.currentTarget); const username=String(fd.get('username')||'').trim(); const all=await db.users.getAll(); const pending=await db.userRequests.getAll(); if(all.some(u=>String(u.username).toLowerCase()===username.toLowerCase())||pending.some(r=>r.status==='pending'&&String(r.username).toLowerCase()===username.toLowerCase())){ui.toast('این نام کاربری قبلاً استفاده شده یا در انتظار تأیید است.','error');return;} const actor=AUTH.currentUser(); await db.userRequests.add({name:String(fd.get('name')).trim(),username,role:String(fd.get('role')),roleLabel:{consultant:'مشاور',manager:'مدیر دفتر',limited:'کاربر محدود'}[fd.get('role')]||'کاربر',reason:String(fd.get('reason')||'').trim(),status:'pending',requestedAt:new Date().toISOString(),requestedBy:actor?.username||null,requestedByName:actor?.name||actor?.username||'سیستم'}); await db.logActivity({entityType:'userRequest',action:'create'}); modal.close(); ui.toast('درخواست برای سازنده ارسال شد.','success'); await this.renderUsers(el,true);};
  },

  async approveRequest(el, request) {
    const wrapper=document.createElement('div'); wrapper.innerHTML=`<form id="approve-form" class="form-grid"><label>نام کاربری<input value="${mk.esc(request.username)}" disabled></label><label>رمز اولیه<input name="password" type="password" required autocomplete="new-password"></label><label>وضعیت<select name="status"><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></label><div class="full-width"><button class="btn btn--primary" type="submit">تأیید و ساخت حساب</button></div></form>`; const modal=ui.openModal({title:'تأیید درخواست کاربر',bodyEl:wrapper}); wrapper.querySelector('form').onsubmit=async e=>{e.preventDefault(); const fd=new FormData(e.currentTarget); const all=await db.users.getAll(); if(all.some(u=>String(u.username).toLowerCase()===request.username.toLowerCase())){ui.toast('این نام کاربری قبلاً ساخته شده است.','error');return;} const user=await db.users.add({name:request.name,username:request.username,passwordHash:await AUTH.sha256(String(fd.get('password'))),role:request.role,status:String(fd.get('status')),permissions:ROLE_DEFAULTS[request.role]||ROLE_DEFAULTS.limited,builtin:false,approvedBy:AUTH.currentUser()?.username||'alireza',approvedAt:new Date().toISOString(),requestId:request.id}); await db.userRequests.update(request.id,{status:'approved',reviewedAt:new Date().toISOString(),reviewedBy:AUTH.currentUser()?.username||'alireza',createdUserId:user.id}); await db.logActivity({entityType:'userRequest',entityId:request.id,action:'approve',newValue:user.username}); modal.close(); ui.toast('حساب کاربر ساخته و فعال شد.','success'); await this.renderUsers(el,true);};
  }
};
window.usersModule = usersModule;
