import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCK7gJ9-zUiygiYHJVwYFb6nUBweptV3XI",
  authDomain: "maintenance-app-fa8cc.firebaseapp.com",
  projectId: "maintenance-app-fa8cc",
  storageBucket: "maintenance-app-fa8cc.firebasestorage.app",
  messagingSenderId: "888866675500",
  appId: "1:888866675500:web:d808b825c1801ed566ea89"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const loginView = $("loginView");
const appView = $("appView");
const syncStatus = $("syncStatus");
const loginName = $("loginName");
const loginRole = $("loginRole");
const loginPin = $("loginPin");
const pinBox = $("pinBox");
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const welcomeText = $("welcomeText");
const roleText = $("roleText");
const submitRequestBtn = $("submitRequestBtn");
const requestsList = $("requestsList");
const notificationsList = $("notificationsList");
const filterStatus = $("filterStatus");
const notifyBtn = $("notifyBtn");

let currentUser = JSON.parse(localStorage.getItem("maintenanceUser") || "null");
let allRequests = [];
let allNotifications = [];
let firstLoadDone = false;

const roleLabels = {
  member: "عضو من الفريق",
  worker: "عامل الصيانة",
  admin: "المسؤول"
};
const statusLabels = {
  new: "جديد",
  in_progress: "قيد التنفيذ",
  done: "تم التنفيذ",
  cancelled: "ملغي"
};
const priorityLabels = {
  normal: "عادي",
  important: "مهم",
  urgent: "مستعجل"
};

loginRole.addEventListener("change", () => {
  pinBox.classList.toggle("hidden", loginRole.value === "member");
});

loginBtn.addEventListener("click", () => {
  const name = loginName.value.trim();
  const role = loginRole.value;
  const pin = loginPin.value.trim();
  if (!name) return alert("اكتب اسمك أولاً");
  if (role === "admin" && pin !== "1234") return alert("كلمة مرور المسؤول غير صحيحة");
  if (role === "worker" && pin !== "0000") return alert("كلمة مرور العامل غير صحيحة");
  currentUser = { name, role };
  localStorage.setItem("maintenanceUser", JSON.stringify(currentUser));
  showApp();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("maintenanceUser");
  currentUser = null;
  location.reload();
});

notifyBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) return alert("متصفحك لا يدعم الإشعارات");
  const result = await Notification.requestPermission();
  alert(result === "granted" ? "تم تفعيل إشعارات المتصفح" : "لم يتم تفعيل الإشعارات");
});

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  welcomeText.textContent = `مرحباً، ${currentUser.name}`;
  roleText.textContent = `الدور: ${roleLabels[currentUser.role]}`;
  if (currentUser.role === "worker") {
    $("requestFormCard").classList.add("hidden");
  }
  startRealtime();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readImages(input) {
  const files = Array.from(input.files || []).slice(0, 3);
  const images = [];
  for (const file of files) {
    if (file.size > 900000) {
      alert(`الصورة ${file.name} كبيرة. اختر صورة أقل من 900KB أو صغرها.`);
      continue;
    }
    images.push(await fileToDataUrl(file));
  }
  return images;
}

submitRequestBtn.addEventListener("click", async () => {
  if (!currentUser) return alert("سجل الدخول أولاً");
  const title = $("titleInput").value.trim();
  const locationText = $("locationInput").value.trim();
  const desc = $("descInput").value.trim();
  const priority = $("priorityInput").value;
  if (!title || !desc) return alert("اكتب عنوان الطلب ووصف المشكلة");

  submitRequestBtn.disabled = true;
  submitRequestBtn.textContent = "جاري الإرسال...";
  try {
    const beforeImages = await readImages($("beforeImages"));
    const requestRef = await addDoc(collection(db, "maintenanceRequests"), {
      title,
      location: locationText,
      description: desc,
      priority,
      status: "new",
      requesterName: currentUser.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      beforeImages,
      afterImages: [],
      reminders: 0,
      lastReminderBy: "",
      comments: []
    });
    await createNotification(`طلب جديد من ${currentUser.name}: ${title}`, requestRef.id);
    $("titleInput").value = "";
    $("locationInput").value = "";
    $("descInput").value = "";
    $("beforeImages").value = "";
    alert("تم إرسال الطلب ووصل للجميع");
  } catch (err) {
    console.error(err);
    alert("صار خطأ أثناء الإرسال. تأكد أن Firestore في test mode وأن الإنترنت يعمل.");
  } finally {
    submitRequestBtn.disabled = false;
    submitRequestBtn.textContent = "إرسال الطلب";
  }
});

function startRealtime() {
  syncStatus.textContent = "متصل - الطلبات تظهر للجميع مباشرة";
  const reqQ = query(collection(db, "maintenanceRequests"), orderBy("createdAt", "desc"));
  onSnapshot(reqQ, (snapshot) => {
    allRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRequests();
  }, (err) => {
    console.error(err);
    syncStatus.textContent = "مشكلة اتصال بقاعدة البيانات";
  });

  const notQ = query(collection(db, "maintenanceNotifications"), orderBy("createdAt", "desc"));
  onSnapshot(notQ, (snapshot) => {
    const previousCount = allNotifications.length;
    allNotifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNotifications();
    if (firstLoadDone && allNotifications.length > previousCount) {
      const n = allNotifications[0];
      showBrowserNotification(n.message || "تحديث جديد في طلبات الصيانة");
    }
    firstLoadDone = true;
  });
}

function formatDate(ts) {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("ar-SA");
  } catch { return ""; }
}

function renderRequests() {
  const selected = filterStatus.value;
  const data = selected === "all" ? allRequests : allRequests.filter(r => r.status === selected);
  if (!data.length) {
    requestsList.innerHTML = `<p class="empty">لا توجد طلبات حالياً</p>`;
    return;
  }
  requestsList.innerHTML = data.map(r => requestCardHtml(r)).join("");
  bindRequestButtons();
}

filterStatus.addEventListener("change", renderRequests);

function requestCardHtml(r) {
  const canChange = currentUser.role === "worker" || currentUser.role === "admin";
  const canDelete = currentUser.role === "admin";
  const canRemind = currentUser.role === "member" || currentUser.role === "admin";
  return `
    <article class="requestCard priority-${r.priority || 'normal'}">
      <div class="requestTop">
        <div>
          <h3>${escapeHtml(r.title || "بدون عنوان")}</h3>
          <p class="meta">طالب الصيانة: <b>${escapeHtml(r.requesterName || "غير معروف")}</b> — ${formatDate(r.createdAt)}</p>
          <p class="meta">الموقع: ${escapeHtml(r.location || "غير محدد")}</p>
        </div>
        <div class="badges">
          <span class="badge status-${r.status || 'new'}">${statusLabels[r.status] || r.status}</span>
          <span class="badge pr-${r.priority || 'normal'}">${priorityLabels[r.priority] || 'عادي'}</span>
        </div>
      </div>
      <p class="desc">${escapeHtml(r.description || "")}</p>
      ${imagesHtml(r.beforeImages, "صور المشكلة")}
      ${imagesHtml(r.afterImages, "صور بعد التنفيذ")}
      <div class="actions">
        ${canChange ? `<button data-action="progress" data-id="${r.id}" ${r.status==='in_progress'?'disabled':''}>قيد التنفيذ</button>` : ""}
        ${canChange ? `<label class="uploadAfter">رفع صور الإنجاز<input type="file" accept="image/*" multiple data-action="after" data-id="${r.id}"></label>` : ""}
        ${canChange ? `<button data-action="done" data-id="${r.id}" ${r.status==='done'?'disabled':''}>تم التنفيذ</button>` : ""}
        ${canRemind ? `<button class="secondary" data-action="remind" data-id="${r.id}">تذكير بالتأخير (${r.reminders || 0})</button>` : ""}
        ${canDelete ? `<button class="danger" data-action="delete" data-id="${r.id}">حذف</button>` : ""}
      </div>
    </article>
  `;
}

function imagesHtml(images = [], title) {
  if (!images || !images.length) return "";
  return `<div class="imagesBlock"><strong>${title}</strong><div class="thumbs">${images.map(src => `<img src="${src}" class="thumb" alt="صورة" data-img="${src}">`).join("")}</div></div>`;
}

function bindRequestButtons() {
  document.querySelectorAll("[data-action]").forEach(el => {
    const action = el.dataset.action;
    const id = el.dataset.id;
    if (action === "progress") el.onclick = () => updateStatus(id, "in_progress");
    if (action === "done") el.onclick = () => updateStatus(id, "done");
    if (action === "remind") el.onclick = () => remindRequest(id);
    if (action === "delete") el.onclick = () => deleteRequest(id);
    if (action === "after") el.onchange = (e) => uploadAfterImages(id, e.target);
  });
  document.querySelectorAll(".thumb").forEach(img => {
    img.onclick = () => openImage(img.dataset.img);
  });
}

async function updateStatus(id, status) {
  const r = allRequests.find(x => x.id === id);
  await updateDoc(doc(db, "maintenanceRequests", id), {
    status,
    updatedAt: serverTimestamp()
  });
  await createNotification(`${currentUser.name} غيّر حالة الطلب "${r?.title || ''}" إلى ${statusLabels[status]}`, id);
}

async function uploadAfterImages(id, input) {
  const r = allRequests.find(x => x.id === id);
  const imgs = await readImages(input);
  const existing = r?.afterImages || [];
  await updateDoc(doc(db, "maintenanceRequests", id), {
    afterImages: [...existing, ...imgs].slice(0, 6),
    updatedAt: serverTimestamp()
  });
  await createNotification(`${currentUser.name} أضاف صور إنجاز للطلب "${r?.title || ''}"`, id);
}

async function remindRequest(id) {
  const r = allRequests.find(x => x.id === id);
  await updateDoc(doc(db, "maintenanceRequests", id), {
    reminders: (r?.reminders || 0) + 1,
    lastReminderBy: currentUser.name,
    updatedAt: serverTimestamp()
  });
  await createNotification(`تذكير من ${currentUser.name}: الطلب "${r?.title || ''}" متأخر`, id);
}

async function deleteRequest(id) {
  if (!confirm("متأكد تريد حذف الطلب؟")) return;
  const r = allRequests.find(x => x.id === id);
  await deleteDoc(doc(db, "maintenanceRequests", id));
  await createNotification(`${currentUser.name} حذف الطلب "${r?.title || ''}"`, id);
}

async function createNotification(message, requestId = "") {
  await addDoc(collection(db, "maintenanceNotifications"), {
    message,
    requestId,
    by: currentUser?.name || "النظام",
    createdAt: serverTimestamp()
  });
}

function renderNotifications() {
  const items = allNotifications.slice(0, 20);
  if (!items.length) {
    notificationsList.innerHTML = `<p class="empty">لا توجد إشعارات بعد</p>`;
    return;
  }
  notificationsList.innerHTML = items.map(n => `
    <div class="notification">
      <b>${escapeHtml(n.message || "")}</b>
      <small>${formatDate(n.createdAt)}</small>
    </div>
  `).join("");
}

function showBrowserNotification(message) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("نظام الصيانة", { body: message });
  }
}

function openImage(src) {
  $("modalImg").src = src;
  $("imageModal").classList.remove("hidden");
}
$("closeModal").onclick = () => $("imageModal").classList.add("hidden");
$("imageModal").onclick = (e) => { if (e.target.id === "imageModal") $("imageModal").classList.add("hidden"); };

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

if (currentUser) showApp();
else syncStatus.textContent = "سجل الدخول للمتابعة";
