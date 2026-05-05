const firebaseConfig = {
  apiKey: "AIzaSyCK7gJ9-zUiygiYHJVwYFb6nUBweptV3XI",
  authDomain: "maintenance-app-fa8cc.firebaseapp.com",
  projectId: "maintenance-app-fa8cc",
  storageBucket: "maintenance-app-fa8cc.firebasestorage.app",
  messagingSenderId: "888866675500",
  appId: "1:888866675500:web:d808b825c1801ed566ea89"
};

const $ = id => document.getElementById(id);
let db;
let currentUser = JSON.parse(localStorage.getItem('maintenance_user') || 'null');
let requests = [];

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
} catch (e) {
  alert('خطأ Firebase: ' + e.message);
}

function initUser() {
  if (currentUser) {
    $('loginCard').classList.add('hidden');
    $('mainContent').classList.remove('hidden');
    $('hello').textContent = 'مرحباً، ' + currentUser.name + ' (' + (currentUser.role === 'worker' ? 'عامل الصيانة' : 'عضو فريق') + ')';
    startListening();
  }
}

$('saveUserBtn').onclick = () => {
  const name = $('userName').value.trim();
  const role = $('userRole').value;
  if (!name) {
    $('loginMsg').textContent = 'اكتب اسمك أولاً';
    return;
  }
  currentUser = { name, role };
  localStorage.setItem('maintenance_user', JSON.stringify(currentUser));
  initUser();
};

$('logoutBtn').onclick = () => {
  localStorage.removeItem('maintenance_user');
  location.reload();
};

document.querySelectorAll('.tab').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  btn.classList.add('active');
  $(btn.dataset.view).classList.remove('hidden');
});

function imageToDataUrl(file, maxSize = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('صيغة الصورة غير مدعومة'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function readImages(files) {
  const selected = Array.from(files || []).slice(0, 3);
  const urls = [];
  for (const file of selected) {
    urls.push(await imageToDataUrl(file));
  }
  return urls;
}

$('requestForm').onsubmit = async e => {
  e.preventDefault();
  const b = e.target.querySelector('button');
  b.disabled = true;
  b.textContent = 'جاري الإرسال...';

  try {
    const title = $('title').value.trim();
    const location = $('location').value.trim();
    if (!title || !location) throw new Error('اكتب عنوان المشكلة والموقع');

    const imgs = await readImages($('requestImages').files);
    await db.collection('maintenance_requests').add({
      title,
      location,
      priority: $('priority').value,
      description: $('description').value.trim(),
      requester: currentUser.name,
      status: 'جديد',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      images: imgs,
      doneImages: [],
      comments: [{ by: currentUser.name, text: 'تم إنشاء الطلب', at: new Date().toISOString() }]
    });
    e.target.reset();
    alert('تم إرسال الطلب بنجاح');
  } catch (err) {
    alert('صار خطأ: ' + err.message);
  } finally {
    b.disabled = false;
    b.textContent = 'إرسال الطلب';
  }
};

function startListening() {
  db.collection('maintenance_requests').orderBy('createdAt', 'desc').onSnapshot(s => {
    requests = s.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, e => alert('خطأ قراءة البيانات: ' + e.message));
}

['statusFilter', 'priorityFilter', 'searchBox'].forEach(id => $(id).addEventListener('input', render));

function filtered() {
  const sf = $('statusFilter').value;
  const pf = $('priorityFilter').value;
  const t = $('searchBox').value.trim();
  return requests.filter(r => (sf === 'all' || r.status === sf) && (pf === 'all' || r.priority === pf) && (!t || `${r.title} ${r.location} ${r.requester}`.includes(t)));
}

function esc(s = '') {
  return String(s).replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m]));
}

function timeText(ts) {
  try { return ts?.toDate ? ts.toDate().toLocaleString('ar-SA') : 'الآن'; } catch { return ''; }
}

function prio(p) { return p === 'عاجل' ? 3 : p === 'مهم' ? 2 : 1; }

function card(r, worker = false) {
  const d = document.createElement('article');
  d.className = 'request';
  d.innerHTML = `<h3>${esc(r.title)}</h3><p>${esc(r.description || '')}</p><div class="meta"><span class="badge ${r.status === 'جديد' ? 'new' : r.status === 'قيد التنفيذ' ? 'progress' : r.status === 'تم التنفيذ' ? 'done' : 'cancel'}">${r.status}</span><span>الطالب: ${esc(r.requester || '')}</span><span>الموقع: ${esc(r.location || '')}</span><span>${r.priority}</span><span>${timeText(r.createdAt)}</span></div>${(r.images || []).length ? `<div class="images">${r.images.map(u => `<img src="${u}">`).join('')}</div>` : ''}${(r.doneImages || []).length ? `<h4>صور الإنجاز</h4><div class="images">${r.doneImages.map(u => `<img src="${u}">`).join('')}</div>` : ''}<div class="actions"><button data-open>فتح التفاصيل</button>${worker ? '<button data-status="قيد التنفيذ">قيد التنفيذ</button><button data-status="تم التنفيذ">تم التنفيذ</button><button data-status="ملغي">إلغاء</button>' : ''}</div>`;
  d.querySelector('[data-open]').onclick = () => openDetails(r.id);
  d.querySelectorAll('[data-status]').forEach(b => b.onclick = () => setStatus(r.id, b.dataset.status));
  return d;
}

function render() {
  $('countBadge').textContent = requests.length;
  const list = $('requestList');
  list.innerHTML = '';
  filtered().forEach(r => list.appendChild(card(r, false)));
  if (!filtered().length) list.innerHTML = '<div class="card">لا توجد طلبات حالياً</div>';

  const wl = $('workerList');
  wl.innerHTML = '';
  [...requests].sort((a, b) => (prio(b.priority) - prio(a.priority)) || ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))).forEach(r => wl.appendChild(card(r, true)));
}

async function setStatus(id, status) {
  try {
    await db.collection('maintenance_requests').doc(id).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      comments: firebase.firestore.FieldValue.arrayUnion({ by: currentUser.name, text: 'تم تغيير الحالة إلى: ' + status, at: new Date().toISOString() })
    });
  } catch (err) {
    alert('تعذر تغيير الحالة: ' + err.message);
  }
}

function openDetails(id) {
  const r = requests.find(x => x.id === id);
  if (!r) return;
  $('dialogTitle').textContent = r.title;
  $('dialogBody').innerHTML = `<p><b>الوصف:</b> ${esc(r.description)}</p><p><b>الموقع:</b> ${esc(r.location)} | <b>الطالب:</b> ${esc(r.requester)} | <b>الحالة:</b> ${esc(r.status)}</p>${(r.images || []).length ? `<h3>صور المشكلة</h3><div class="images">${r.images.map(u => `<img src="${u}">`).join('')}</div>` : ''}${(r.doneImages || []).length ? `<h3>صور الإنجاز</h3><div class="images">${r.doneImages.map(u => `<img src="${u}">`).join('')}</div>` : ''}<h3>التواصل داخل التطبيق</h3>${(r.comments || []).map(c => `<div class="comment"><b>${esc(c.by)}</b><br>${esc(c.text)}<br><small>${new Date(c.at).toLocaleString('ar-SA')}</small></div>`).join('')}<label>إضافة تعليق<input id="newComment" placeholder="اكتب تحديث"></label><button id="addCommentBtn">إضافة التعليق</button><hr><label>صور بعد التنفيذ<input id="doneImagesInput" type="file" accept="image/*" multiple></label><button id="uploadDoneImages">رفع صور الإنجاز</button>`;

  $('addCommentBtn').onclick = async () => {
    const text = $('newComment').value.trim();
    if (!text) return;
    await db.collection('maintenance_requests').doc(id).update({
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      comments: firebase.firestore.FieldValue.arrayUnion({ by: currentUser.name, text, at: new Date().toISOString() })
    });
    $('detailsDialog').close();
  };

  $('uploadDoneImages').onclick = async () => {
    try {
      const files = $('doneImagesInput').files;
      if (!files.length) return alert('اختر صورة');
      const urls = await readImages(files);
      await db.collection('maintenance_requests').doc(id).update({
        doneImages: firebase.firestore.FieldValue.arrayUnion(...urls),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        comments: firebase.firestore.FieldValue.arrayUnion({ by: currentUser.name, text: 'تم رفع صور الإنجاز', at: new Date().toISOString() })
      });
      $('detailsDialog').close();
    } catch (err) {
      alert('تعذر رفع الصور: ' + err.message);
    }
  };
  $('detailsDialog').showModal();
}

$('closeDialog').onclick = () => $('detailsDialog').close();
initUser();
