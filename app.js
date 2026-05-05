const ADMIN_USER = 'admin';
const ADMIN_PASS = '1234';
const WORKER_PASS = '0000';

let currentUser = null;
const $ = (id) => document.getElementById(id);

const priorityText = { normal: 'عادي', important: 'مهم', urgent: 'مستعجل' };
const statusText = { new: 'جديد', progress: 'قيد التنفيذ', done: 'تم التنفيذ' };
const roleTextMap = { admin: 'مسؤول النظام', worker: 'العامل', member: 'عضو من الفريق' };

function getRequests(){
  try { return JSON.parse(localStorage.getItem('maintenanceRequests') || '[]'); }
  catch { return []; }
}
function saveRequests(items){ localStorage.setItem('maintenanceRequests', JSON.stringify(items)); }
function getNotifications(){
  try { return JSON.parse(localStorage.getItem('maintenanceNotifications') || '[]'); }
  catch { return []; }
}
function saveNotifications(items){ localStorage.setItem('maintenanceNotifications', JSON.stringify(items)); }

function pushNotification(title, body, type='info'){
  const item = { id: Date.now().toString()+Math.random().toString(16).slice(2), title, body, type, at: new Date().toLocaleString('ar-SA') };
  const list = [item, ...getNotifications()].slice(0, 80);
  saveNotifications(list);
  renderNotifications();
  if('Notification' in window && Notification.permission === 'granted'){
    try { new Notification(title, { body }); } catch(e) {}
  }
}
function requestNotificationPermission(){
  if(!('Notification' in window)){ alert('المتصفح لا يدعم إشعارات سطح المكتب.'); return; }
  Notification.requestPermission().then(p=>{
    if(p==='granted') pushNotification('تم تفعيل الإشعارات', 'ستظهر لك تنبيهات داخل التطبيق وعلى الجهاز أثناء فتح الموقع.', 'success');
    else alert('لم يتم تفعيل الإشعارات. تقدر تستخدم إشعارات التطبيق الداخلية.');
  });
}
function renderNotifications(){
  const box=$('notificationsList');
  if(!box) return;
  const list=getNotifications();
  if(!list.length){ box.innerHTML='<p class="muted">لا توجد إشعارات حالياً.</p>'; return; }
  box.innerHTML=list.slice(0,10).map(n=>`
    <div class="notification ${n.type}">
      <strong>${escapeHtml(n.title)}</strong>
      <p>${escapeHtml(n.body)}</p>
      <span>${escapeHtml(n.at)}</span>
    </div>`).join('');
}
function clearNotifications(){ saveNotifications([]); renderNotifications(); }

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file);
  });
}
async function filesToDataUrls(input){
  const files=[...(input.files||[])].slice(0,5);
  const resized=[];
  for(const file of files){ resized.push(await resizeImage(file)); }
  return resized;
}
function resizeImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const max=900; let {width,height}=img;
        if(width>height && width>max){height=Math.round(height*max/width);width=max}
        if(height>=width && height>max){width=Math.round(width*max/height);height=max}
        const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
        canvas.getContext('2d').drawImage(img,0,0,width,height);
        resolve(canvas.toDataURL('image/jpeg',0.72));
      };
      img.onerror=reject; img.src=reader.result;
    };
    reader.onerror=reject; reader.readAsDataURL(file);
  });
}

function login(){
  const name=$('nameInput').value.trim();
  const role=$('roleInput').value;
  const pass=$('passwordInput').value;
  $('loginError').textContent='';
  if(!name){ $('loginError').textContent='اكتب اسمك أولاً'; return; }
  if(role==='admin' && !(name.toLowerCase()===ADMIN_USER && pass===ADMIN_PASS)){
    $('loginError').textContent='بيانات المسؤول غير صحيحة'; return;
  }
  if(role==='worker' && pass!==WORKER_PASS){ $('loginError').textContent='كلمة مرور العامل غير صحيحة'; return; }
  currentUser={name,role};
  localStorage.setItem('maintenanceCurrentUser', JSON.stringify(currentUser));
  showApp();
}
function logout(){ localStorage.removeItem('maintenanceCurrentUser'); currentUser=null; location.reload(); }
function showApp(){
  $('loginCard').classList.add('hidden'); $('appView').classList.remove('hidden'); $('topActions').classList.remove('hidden');
  $('welcomeText').textContent=`مرحباً، ${currentUser.name}`;
  $('roleText').textContent=roleTextMap[currentUser.role] || 'مستخدم';
  $('requestFormCard').style.display=currentUser.role==='worker' ? 'none' : 'block';
  renderNotifications();
  renderRequests();
}
async function submitRequest(){
  const title=$('titleInput').value.trim(), location=$('locationInput').value.trim(), description=$('descriptionInput').value.trim(), priority=$('priorityInput').value;
  $('submitMsg').textContent='';
  if(!title || !location || !description){ $('submitMsg').textContent='عبّئ العنوان والمكان والوصف'; $('submitMsg').className='error'; return; }
  $('submitRequestBtn').disabled=true; $('submitRequestBtn').textContent='جاري الإرسال...';
  try{
    const beforeImages=await filesToDataUrls($('beforeImagesInput'));
    const items=getRequests();
    const req={id:Date.now().toString(),title,location,description,priority,status:'new',requester:currentUser.name,createdAt:new Date().toLocaleString('ar-SA'),beforeImages,afterImages:[],updates:[],reminders:[]};
    items.unshift(req);
    saveRequests(items);
    pushNotification('طلب صيانة جديد', `${currentUser.name} أرسل طلب: ${title} (${priorityText[priority]})`, priority==='urgent'?'urgent':'info');
    $('titleInput').value=''; $('locationInput').value=''; $('descriptionInput').value=''; $('beforeImagesInput').value=''; $('priorityInput').value='normal';
    $('submitMsg').className='success'; $('submitMsg').textContent='تم إرسال الطلب بنجاح'; renderRequests();
  }catch(e){ $('submitMsg').className='error'; $('submitMsg').textContent='تعذر إرسال الطلب. جرّب صورة أصغر.'; }
  $('submitRequestBtn').disabled=false; $('submitRequestBtn').textContent='إرسال الطلب';
}
function setStatus(id,status){
  if(currentUser.role!=='worker' && currentUser.role!=='admin') return;
  let changedTitle='';
  const items=getRequests().map(r=>{
    if(r.id!==id) return r;
    changedTitle=r.title;
    return {...r,status,updates:[...(r.updates||[]),`${currentUser.name}: ${statusText[status]} - ${new Date().toLocaleString('ar-SA')}`]};
  });
  saveRequests(items);
  pushNotification('تحديث حالة طلب', `تم تغيير حالة "${changedTitle}" إلى: ${statusText[status]} بواسطة ${currentUser.name}`, status==='done'?'success':'info');
  renderRequests();
}
function sendReminder(id){
  const items=getRequests().map(r=>{
    if(r.id!==id) return r;
    const reminder = `${currentUser.name}: تذكير بسبب التأخير - ${new Date().toLocaleString('ar-SA')}`;
    pushNotification('تذكير تأخير صيانة', `${currentUser.name} أرسل تذكير للطلب: ${r.title}`, 'warning');
    return {...r, reminders:[...(r.reminders||[]), reminder], updates:[...(r.updates||[]), reminder]};
  });
  saveRequests(items); renderRequests();
}
function deleteRequest(id){
  if(currentUser.role!=='admin') return;
  if(!confirm('هل تريد حذف الطلب؟')) return;
  const req=getRequests().find(r=>r.id===id);
  saveRequests(getRequests().filter(r=>r.id!==id));
  pushNotification('حذف طلب صيانة', `المسؤول حذف الطلب: ${req?.title || ''}`, 'danger');
  renderRequests();
}
async function addAfterImages(id,input){
  if(currentUser.role!=='worker' && currentUser.role!=='admin') return;
  const imgs=await filesToDataUrls(input);
  let title='';
  const items=getRequests().map(r=>{ if(r.id!==id) return r; title=r.title; return {...r,afterImages:[...(r.afterImages||[]),...imgs],updates:[...(r.updates||[]),`${currentUser.name}: أضاف صور بعد التنفيذ - ${new Date().toLocaleString('ar-SA')}`]}; });
  saveRequests(items);
  pushNotification('إضافة صور للطلب', `تمت إضافة صور للطلب: ${title}`, 'info');
  renderRequests();
}
function openImage(src){ $('modalImage').src=src; $('imageModal').classList.remove('hidden'); }
function renderImages(images=[]){
  if(!images.length) return '';
  return `<div class="images">${images.map(src=>`<img src="${src}" onclick="openImage('${src}')" alt="صورة الطلب">`).join('')}</div>`;
}
function canRemind(r){
  return currentUser.role==='member' && r.requester===currentUser.name && r.status!=='done';
}
function renderRequests(){
  const filter=$('filterInput').value;
  let items=getRequests(); if(filter!=='all') items=items.filter(r=>r.status===filter);
  const box=$('requestsList');
  if(!items.length){ box.innerHTML='<p class="muted">لا توجد طلبات حالياً.</p>'; return; }
  box.innerHTML=items.map(r=>`
    <article class="request priority-${r.priority}">
      <div class="request-head">
        <div>
          <h3>${escapeHtml(r.title)}</h3>
          <div class="badges"><span class="badge ${r.priority}">${priorityText[r.priority]}</span><span class="badge ${r.status}">${statusText[r.status]}</span>${(r.reminders||[]).length?`<span class="badge remind">تذكير ${r.reminders.length}</span>`:''}</div>
        </div>
        ${currentUser.role==='admin'?`<button class="danger" onclick="deleteRequest('${r.id}')">حذف</button>`:''}
      </div>
      <div class="meta">الطالب: ${escapeHtml(r.requester)}<br>المكان: ${escapeHtml(r.location)}<br>التاريخ: ${r.createdAt}</div>
      <p class="desc">${escapeHtml(r.description)}</p>
      ${r.beforeImages?.length?'<strong>صور المشكلة:</strong>':''}${renderImages(r.beforeImages)}
      ${r.afterImages?.length?'<strong>صور بعد التنفيذ:</strong>':''}${renderImages(r.afterImages)}
      ${canRemind(r)?`<button class="remind-btn" onclick="sendReminder('${r.id}')">تذكير: الطلب متأخر</button>`:''}
      ${(currentUser.role==='worker'||currentUser.role==='admin')?`
        <div class="actions">
          <button class="small-btn ${r.status==='new'?'active':''}" onclick="setStatus('${r.id}','new')">جديد</button>
          <button class="small-btn ${r.status==='progress'?'active':''}" onclick="setStatus('${r.id}','progress')">قيد التنفيذ</button>
          <button class="small-btn ${r.status==='done'?'active':''}" onclick="setStatus('${r.id}','done')">تم التنفيذ</button>
        </div>
        <div class="after-upload"><label>إضافة صور بعد التنفيذ</label><input type="file" accept="image/*" multiple onchange="addAfterImages('${r.id}', this)"></div>`:''}
      ${(r.updates||[]).length?`<div class="meta updates"><strong>التحديثات والتذكيرات:</strong><br>${r.updates.map(escapeHtml).join('<br>')}</div>`:''}
    </article>`).join('');
}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}

$('roleInput').addEventListener('change',()=>{ $('passwordWrap').classList.toggle('hidden', $('roleInput').value==='member'); });
$('loginBtn').addEventListener('click',login);
$('logoutBtn').addEventListener('click',logout);
$('notifyBtn').addEventListener('click',requestNotificationPermission);
$('clearNotifsBtn').addEventListener('click',clearNotifications);
$('submitRequestBtn').addEventListener('click',submitRequest);
$('filterInput').addEventListener('change',renderRequests);
$('closeModal').addEventListener('click',()=>$('imageModal').classList.add('hidden'));
$('imageModal').addEventListener('click',(e)=>{if(e.target.id==='imageModal') $('imageModal').classList.add('hidden')});
try{ currentUser=JSON.parse(localStorage.getItem('maintenanceCurrentUser')||'null'); if(currentUser) showApp(); }catch{}
