import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const requestsRef = collection(db, "requests");
const notificationsRef = collection(db, "notifications");

const $ = (id) => document.getElementById(id);
const loginCard = $("loginCard");
const appArea = $("appArea");
const passwordWrap = $("passwordWrap");
const userRole = $("userRole");
const password = $("password");
const userName = $("userName");
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const sendBtn = $("sendBtn");
const requestsList = $("requestsList");
const notificationsList = $("notificationsList");
const statusFilter = $("statusFilter");

let currentUser = JSON.parse(localStorage.getItem("maintenanceUser") || "null");
let allRequests = [];
let lastNotificationCount = 0;

const roleNames = { member: "عضو من الفريق", worker: "عامل الصيانة", admin: "مسؤول" };
const statusNames = { new: "جديد", progress: "قيد التنفيذ", done: "تم التنفيذ", cancelled: "ملغي" };
const priorityNames = { normal: "عادي", important: "مهم", urgent: "مستعجل" };

userRole.addEventListener("change", () => {
  passwordWrap.classList.toggle("hidden", userRole.value === "member");
});

loginBtn.addEventListener("click", () => {
  const name = userName.value.trim();
  const role = userRole.value;
  const pass = password.value.trim();
  if (!name) return alert("اكتب اسمك أولاً");
  if (role === "admin" && !(name.toLowerCase() === "admin" && pass === "1234")) return alert("بيانات المسؤول غير صحيحة");
  if (role === "worker" && pass !== "0000") return alert("كلمة مرور العامل غير صحيحة");
  currentUser = { name, role };
  localStorage.setItem("maintenanceUser", JSON.stringify(currentUser));
  showApp();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("maintenanceUser");
  currentUser = null;
  loginCard.classList.remove("hidden");
  appArea.classList.add("hidden");
  logoutBtn.classList.add("hidden");
});

function showApp() {
  loginCard.classList.add("hidden");
  appArea.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  $("currentUserLabel").textContent = currentUser.name;
  $("roleLabel").textContent = roleNames[currentUser.role];
}

if (currentUser) showApp();

async function compressImage(file, maxWidth = 650, quality = 0.5) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function filesToCompressedBase64(input) {
  const files = Array.from(input.files || []).slice(0, 4);
  const results = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const compressed = await compressImage(file);
    // Skip if somehow still too big
    if (compressed.length > 900000) {
      const smaller = await compressImage(file, 450, 0.38);
      results.push(smaller);
    } else {
      results.push(compressed);
    }
  }
  return results;
}

sendBtn.addEventListener("click", async () => {
  if (!currentUser) return alert("سجل الدخول أولاً");
  const title = $("title").value.trim();
  const description = $("description").value.trim();
  const priority = $("priority").value;
  if (!title || !description) return alert("اكتب عنوان ووصف المشكلة");
  sendBtn.disabled = true;
  sendBtn.textContent = "جاري الإرسال...";
  try {
    const images = await filesToCompressedBase64($("images"));
    await addDoc(requestsRef, {
      title,
      description,
      priority,
      status: "new",
      requestedBy: currentUser.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      images,
      doneImages: [],
      comments: [{ by: currentUser.name, text: "تم إنشاء الطلب", at: new Date().toISOString() }]
    });
    await addNotification(`طلب جديد: ${title} بواسطة ${currentUser.name}`);
    $("title").value = "";
    $("description").value = "";
    $("images").value = "";
    alert("تم إرسال الطلب ✅");
  } catch (err) {
    console.error(err);
    alert("صار خطأ أثناء إرسال الطلب. جرّب صورة أصغر أو صورة واحدة فقط.");
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "إرسال الطلب";
  }
});

async function addNotification(text) {
  await addDoc(notificationsRef, { text, at: serverTimestamp(), by: currentUser?.name || "النظام" });
}

async function changeStatus(id, status, title) {
  if (!currentUser || !["worker", "admin"].includes(currentUser.role)) return alert("تغيير الحالة للعامل أو المسؤول فقط");
  await updateDoc(doc(db, "requests", id), {
    status,
    updatedAt: serverTimestamp()
  });
  await addNotification(`تم تغيير حالة الطلب (${title}) إلى: ${statusNames[status]} بواسطة ${currentUser.name}`);
}

async function deleteRequest(id, title) {
  if (currentUser?.role !== "admin") return alert("الحذف للمسؤول فقط");
  if (!confirm("متأكد من حذف الطلب؟")) return;
  await deleteDoc(doc(db, "requests", id));
  await addNotification(`تم حذف الطلب (${title}) بواسطة المسؤول`);
}

async function sendReminder(id, title) {
  if (!currentUser) return;
  const req = allRequests.find(r => r.id === id);
  const comments = [...(req.comments || []), { by: currentUser.name, text: "تذكير: الطلب متأخر ويحتاج متابعة", at: new Date().toISOString() }];
  await updateDoc(doc(db, "requests", id), { comments, updatedAt: serverTimestamp() });
  await addNotification(`تذكير على الطلب (${title}) بواسطة ${currentUser.name}`);
}

async function addComment(id) {
  if (!currentUser) return;
  const input = document.querySelector(`[data-comment-input="${id}"]`);
  const text = input.value.trim();
  if (!text) return;
  const req = allRequests.find(r => r.id === id);
  const comments = [...(req.comments || []), { by: currentUser.name, text, at: new Date().toISOString() }];
  await updateDoc(doc(db, "requests", id), { comments, updatedAt: serverTimestamp() });
  input.value = "";
  await addNotification(`تعليق جديد على الطلب (${req.title}) بواسطة ${currentUser.name}`);
}

async function uploadDoneImages(id) {
  if (!currentUser || !["worker", "admin"].includes(currentUser.role)) return alert("رفع صور الإنجاز للعامل أو المسؤول فقط");
  const input = document.querySelector(`[data-done-input="${id}"]`);
  const req = allRequests.find(r => r.id === id);
  const imgs = await filesToCompressedBase64(input);
  await updateDoc(doc(db, "requests", id), { doneImages: [...(req.doneImages || []), ...imgs], updatedAt: serverTimestamp() });
  input.value = "";
  await addNotification(`تم رفع صور إنجاز للطلب (${req.title})`);
}

function formatDate(ts) {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("ar-SA");
  } catch { return ""; }
}

function renderRequests() {
  const filter = statusFilter.value;
  const list = allRequests.filter(r => filter === "all" || r.status === filter);
  if (!list.length) {
    requestsList.innerHTML = `<div class="empty">لا توجد طلبات حالياً</div>`;
    return;
  }
  requestsList.innerHTML = list.map(r => {
    const canManage = currentUser && ["worker", "admin"].includes(currentUser.role);
    const isAdmin = currentUser?.role === "admin";
    const comments = (r.comments || []).map(c => `<div class="comment"><b>${escapeHtml(c.by)}:</b> ${escapeHtml(c.text)}</div>`).join("");
    const images = (r.images || []).map(src => `<img class="thumb" src="${src}" data-img="${src}" alt="صورة المشكلة">`).join("");
    const doneImages = (r.doneImages || []).map(src => `<img class="thumb done" src="${src}" data-img="${src}" alt="صورة الإنجاز">`).join("");
    return `
      <article class="request priority-${r.priority || 'normal'}">
        <div class="request-head">
          <div>
            <h3>${escapeHtml(r.title || "طلب صيانة")}</h3>
            <p class="muted">بواسطة: ${escapeHtml(r.requestedBy || "-")} — ${formatDate(r.createdAt)}</p>
          </div>
          <div class="badges">
            <span class="badge status-${r.status || 'new'}">${statusNames[r.status || 'new']}</span>
            <span class="badge priority-badge priority-${r.priority || 'normal'}">${priorityNames[r.priority || 'normal']}</span>
          </div>
        </div>
        <p class="desc">${escapeHtml(r.description || "")}</p>
        ${images ? `<div><strong>صور المشكلة:</strong><div class="image-row">${images}</div></div>` : ""}
        ${doneImages ? `<div><strong>صور الإنجاز:</strong><div class="image-row">${doneImages}</div></div>` : ""}
        <div class="actions">
          ${canManage ? `<button data-status="progress" data-id="${r.id}" data-title="${escapeAttr(r.title)}">قيد التنفيذ</button><button data-status="done" data-id="${r.id}" data-title="${escapeAttr(r.title)}">تم التنفيذ</button><button class="secondary" data-status="cancelled" data-id="${r.id}" data-title="${escapeAttr(r.title)}">إلغاء</button>` : ""}
          <button class="secondary" data-reminder="${r.id}" data-title="${escapeAttr(r.title)}">تذكير</button>
          ${isAdmin ? `<button class="danger" data-delete="${r.id}" data-title="${escapeAttr(r.title)}">حذف</button>` : ""}
        </div>
        ${canManage ? `<div class="done-upload"><input type="file" accept="image/*" multiple data-done-input="${r.id}"><button class="secondary" data-done-upload="${r.id}">رفع صور الإنجاز</button></div>` : ""}
        <div class="comments"><strong>التعليقات:</strong>${comments || `<p class="muted">لا توجد تعليقات</p>`}</div>
        <div class="comment-box"><input data-comment-input="${r.id}" placeholder="اكتب تعليق..."><button class="secondary" data-comment="${r.id}">إضافة تعليق</button></div>
      </article>
    `;
  }).join("");
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}
function escapeAttr(str) { return escapeHtml(str).replace(/`/g, "&#96;"); }

requestsList.addEventListener("click", async (e) => {
  const t = e.target;
  if (t.dataset.img) openImage(t.dataset.img);
  if (t.dataset.status) await changeStatus(t.dataset.id, t.dataset.status, t.dataset.title);
  if (t.dataset.delete) await deleteRequest(t.dataset.delete, t.dataset.title);
  if (t.dataset.reminder) await sendReminder(t.dataset.reminder, t.dataset.title);
  if (t.dataset.comment) await addComment(t.dataset.comment);
  if (t.dataset.doneUpload) await uploadDoneImages(t.dataset.doneUpload);
});

statusFilter.addEventListener("change", renderRequests);

function openImage(src) {
  $("modalImage").src = src;
  $("imageModal").classList.remove("hidden");
}
$("closeModal").addEventListener("click", () => $("imageModal").classList.add("hidden"));
$("imageModal").addEventListener("click", (e) => { if (e.target.id === "imageModal") $("imageModal").classList.add("hidden"); });

onSnapshot(query(requestsRef, orderBy("createdAt", "desc")), (snapshot) => {
  allRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderRequests();
}, (err) => {
  console.error(err);
  requestsList.innerHTML = `<div class="empty error">خطأ في قراءة الطلبات. تأكد من قواعد Firestore.</div>`;
});

onSnapshot(query(notificationsRef, orderBy("at", "desc")), (snapshot) => {
  const notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 20);
  notificationsList.innerHTML = notes.length ? notes.map(n => `<div class="note">${escapeHtml(n.text)}<span>${formatDate(n.at)}</span></div>`).join("") : `<p class="muted">لا توجد إشعارات</p>`;
  if (lastNotificationCount && notes.length > lastNotificationCount) showBrowserNotification(notes[0]?.text || "تحديث جديد");
  lastNotificationCount = notes.length;
});

$("notifyBtn").addEventListener("click", async () => {
  if (!("Notification" in window)) return alert("المتصفح لا يدعم الإشعارات");
  const permission = await Notification.requestPermission();
  alert(permission === "granted" ? "تم تفعيل الإشعارات داخل المتصفح" : "لم يتم تفعيل الإشعارات");
});

function showBrowserNotification(text) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("نظام الصيانة", { body: text });
  }
}
