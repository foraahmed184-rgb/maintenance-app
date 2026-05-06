import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy
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
const requestsCol = collection(db, "requests");
const notificationsCol = collection(db, "notifications");

let currentUser = null;
let currentRole = "member";
let unsubscribeRequests = null;
let unsubscribeNotifications = null;

const $ = (id) => document.getElementById(id);

function getRoleByName(name) {
  const clean = (name || "").trim();
  if (clean === "Ahmed") return "admin";
  if (clean === "هارون") return "worker";
  return "member";
}

function roleName(role) {
  if (role === "admin") return "مسؤول";
  if (role === "worker") return "عامل";
  return "عضو فريق";
}

$("loginBtn").addEventListener("click", login);
$("logoutBtn").addEventListener("click", logout);
$("submitRequestBtn").addEventListener("click", submitRequest);
$("refreshBtn").addEventListener("click", () => location.reload());
$("clearNotificationsBtn").addEventListener("click", () => $("notificationsList").innerHTML = "");
$("enableNotificationsBtn").addEventListener("click", enableBrowserNotifications);
$("closeModalBtn").addEventListener("click", () => $("imageModal").classList.add("hidden"));

function login() {
  const name = $("loginName").value.trim();
  if (!name) {
    alert("اكتب اسمك");
    return;
  }

  currentUser = name;
  currentRole = getRoleByName(name);

  localStorage.setItem("maintenance_user", currentUser);

  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("currentUserName").textContent = currentUser;
  $("currentRoleBadge").textContent = roleName(currentRole);

  listenRequests();
  listenNotifications();
}

function logout() {
  localStorage.removeItem("maintenance_user");
  location.reload();
}

const savedUser = localStorage.getItem("maintenance_user");
if (savedUser) {
  $("loginName").value = savedUser;
  login();
}

async function compressImage(file, maxWidth = 650, quality = 0.52) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round(height * maxWidth / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function filesToCompressedBase64(fileList) {
  const files = Array.from(fileList || []).slice(0, 4);
  const result = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    result.push(await compressImage(file));
  }
  return result;
}

async function submitRequest() {
  const title = $("titleInput").value.trim();
  const description = $("descriptionInput").value.trim();
  const priority = $("priorityInput").value;

  if (!title || !description) {
    alert("اكتب عنوان ووصف المشكلة");
    return;
  }

  $("submitRequestBtn").disabled = true;
  $("submitRequestBtn").textContent = "جاري الإرسال...";

  try {
    const images = await filesToCompressedBase64($("imagesInput").files);

    await addDoc(requestsCol, {
      title,
      description,
      priority,
      status: "جديد",
      createdBy: currentUser,
      createdAt: serverTimestamp(),
      images,
      doneImages: [],
      comments: [
        { by: currentUser, text: "تم إنشاء الطلب", at: new Date().toISOString() }
      ]
    });

    await addNotification(`طلب جديد من ${currentUser}: ${title}`);

    $("titleInput").value = "";
    $("descriptionInput").value = "";
    $("imagesInput").value = "";
    $("priorityInput").value = "عادي";
    alert("تم إرسال الطلب ✅");
  } catch (err) {
    console.error(err);
    alert("تعذر إرسال الطلب. جرّب صورة أصغر أو صورة واحدة فقط.");
  }

  $("submitRequestBtn").disabled = false;
  $("submitRequestBtn").textContent = "إرسال الطلب";
}

function listenRequests() {
  if (unsubscribeRequests) unsubscribeRequests();

  const q = query(requestsCol, orderBy("createdAt", "desc"));
  unsubscribeRequests = onSnapshot(q, (snapshot) => {
    const requests = [];
    snapshot.forEach(d => requests.push({ id: d.id, ...d.data() }));
    renderRequests(requests);
  }, (err) => {
    console.error(err);
    $("requestsList").innerHTML = `<p class="muted">حدث خطأ في تحميل الطلبات.</p>`;
  });
}

function listenNotifications() {
  if (unsubscribeNotifications) unsubscribeNotifications();

  const q = query(notificationsCol, orderBy("createdAt", "desc"));
  unsubscribeNotifications = onSnapshot(q, (snapshot) => {
    const list = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
    renderNotifications(list.slice(0, 20));

    const latest = list[0];
    if (latest && latest.text) {
      showBrowserNotification(latest.text);
    }
  });
}

function renderRequests(requests) {
  const box = $("requestsList");
  if (!requests.length) {
    box.innerHTML = `<p class="muted">لا توجد طلبات حالياً.</p>`;
    return;
  }

  box.innerHTML = requests.map(r => requestHtml(r)).join("");

  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", handleAction);
  });
  document.querySelectorAll("[data-img]").forEach(img => {
    img.addEventListener("click", () => openImage(img.getAttribute("data-img")));
  });
}

function requestHtml(r) {
  const priorityClass = r.priority === "مستعجل" ? "priority-urgent" : r.priority === "مهم" ? "priority-important" : "priority-normal";
  const statusClass = r.status === "تم التنفيذ" ? "status-done" : r.status === "قيد التنفيذ" ? "status-progress" : "status-new";
  const cardClass = `priority-${r.priority || "عادي"}`;
  const images = (r.images || []).map(src => `<img src="${src}" data-img="${src}" alt="صورة المشكلة">`).join("");
  const doneImages = (r.doneImages || []).map(src => `<img src="${src}" data-img="${src}" alt="صورة الإنجاز">`).join("");
  const comments = (r.comments || []).map(c => `<div class="comment"><b>${escapeHtml(c.by || "")}:</b> ${escapeHtml(c.text || "")}</div>`).join("");

  const canChangeStatus = currentRole === "worker" || currentRole === "admin";
  const canDelete = currentRole === "admin";

  let actions = "";
  if (canChangeStatus && r.status !== "قيد التنفيذ") {
    actions += `<button data-action="progress" data-id="${r.id}" class="warn">قيد التنفيذ</button>`;
  }
  if (canChangeStatus && r.status !== "تم التنفيذ") {
    actions += `<button data-action="done" data-id="${r.id}" class="success">تم التنفيذ</button>`;
  }
  if (canDelete) {
    actions += `<button data-action="delete" data-id="${r.id}" class="danger">حذف الطلب</button>`;
    if (r.status !== "ملغي") actions += `<button data-action="cancel" data-id="${r.id}" class="ghost">ملغي</button>`;
  }
  if (currentRole === "member") {
    actions += `<button data-action="remind" data-id="${r.id}" class="ghost">تذكير بالتأخير</button>`;
  }

  const doneUpload = canChangeStatus ? `
    <div class="done-upload">
      <label>صور الإنجاز</label>
      <input type="file" accept="image/*" multiple id="done-${r.id}">
      <button data-action="uploadDone" data-id="${r.id}">رفع صور الإنجاز</button>
    </div>` : "";

  return `
    <div class="request ${cardClass}">
      <div class="request-head">
        <div>
          <div class="request-title">${escapeHtml(r.title || "طلب صيانة")}</div>
          <div class="request-meta">بواسطة: ${escapeHtml(r.createdBy || "غير معروف")}</div>
        </div>
        <div class="badges">
          <span class="badge ${priorityClass}">${escapeHtml(r.priority || "عادي")}</span>
          <span class="badge ${statusClass}">${escapeHtml(r.status || "جديد")}</span>
        </div>
      </div>

      <div class="request-desc">${escapeHtml(r.description || "")}</div>

      ${images ? `<b>صور المشكلة:</b><div class="images">${images}</div>` : ""}
      ${doneImages ? `<b>صور الإنجاز:</b><div class="images">${doneImages}</div>` : ""}

      ${doneUpload}

      <div class="actions">${actions}</div>

      <div class="comment-box">
        <div class="comments">${comments}</div>
      </div>
    </div>
  `;
}

async function handleAction(e) {
  const action = e.currentTarget.getAttribute("data-action");
  const id = e.currentTarget.getAttribute("data-id");
  const ref = doc(db, "requests", id);

  try {
    if (action === "progress") {
      await updateDoc(ref, {
        status: "قيد التنفيذ",
        comments: arrayAppendLocal(await getCurrentComments(id), { by: currentUser, text: "تم تغيير الحالة إلى قيد التنفيذ", at: new Date().toISOString() })
      });
      await addNotification(`${currentUser} غيّر حالة طلب إلى قيد التنفيذ`);
    }

    if (action === "done") {
      await updateDoc(ref, {
        status: "تم التنفيذ",
        comments: arrayAppendLocal(await getCurrentComments(id), { by: currentUser, text: "تم تغيير الحالة إلى تم التنفيذ", at: new Date().toISOString() })
      });
      await addNotification(`${currentUser} أنهى طلب صيانة`);
    }

    if (action === "cancel") {
      if (currentRole !== "admin") return;
      await updateDoc(ref, { status: "ملغي" });
      await addNotification(`${currentUser} ألغى طلب صيانة`);
    }

    if (action === "delete") {
      if (currentRole !== "admin") return;
      if (confirm("هل تريد حذف الطلب؟")) {
        await deleteDoc(ref);
        await addNotification(`${currentUser} حذف طلب صيانة`);
      }
    }

    if (action === "remind") {
      await addNotification(`${currentUser} أرسل تذكير: الطلب متأخر`);
      alert("تم إرسال التذكير داخل التطبيق ✅");
    }

    if (action === "uploadDone") {
      const input = document.getElementById(`done-${id}`);
      const doneImages = await filesToCompressedBase64(input.files);
      if (!doneImages.length) {
        alert("اختر صورة أولاً");
        return;
      }
      await updateDoc(ref, {
        doneImages,
        status: "تم التنفيذ"
      });
      await addNotification(`${currentUser} رفع صور الإنجاز`);
      alert("تم رفع صور الإنجاز ✅");
    }
  } catch (err) {
    console.error(err);
    alert("حدث خطأ أثناء تنفيذ العملية.");
  }
}

/* حتى لا نحتاج دوال Firestore المعقدة للمصفوفات ونبقي الكود ثابت */
let lastRequestsCache = [];
function renderRequests(requests) {
  lastRequestsCache = requests;
  const box = $("requestsList");
  if (!requests.length) {
    box.innerHTML = `<p class="muted">لا توجد طلبات حالياً.</p>`;
    return;
  }
  box.innerHTML = requests.map(r => requestHtml(r)).join("");
  document.querySelectorAll("[data-action]").forEach(btn => btn.addEventListener("click", handleAction));
  document.querySelectorAll("[data-img]").forEach(img => img.addEventListener("click", () => openImage(img.getAttribute("data-img"))));
}

async function getCurrentComments(id) {
  const found = lastRequestsCache.find(r => r.id === id);
  return found?.comments || [];
}

function arrayAppendLocal(arr, item) {
  return [...(arr || []), item];
}

async function addNotification(text) {
  try {
    await addDoc(notificationsCol, {
      text,
      by: currentUser || "النظام",
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("notification error", err);
  }
}

function renderNotifications(list) {
  const box = $("notificationsList");
  if (!list.length) {
    box.innerHTML = `<p class="muted">لا توجد إشعارات.</p>`;
    return;
  }
  box.innerHTML = list.map(n => `<div class="notification">${escapeHtml(n.text || "")}</div>`).join("");
}

function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    alert("المتصفح لا يدعم الإشعارات");
    return;
  }
  Notification.requestPermission().then(p => {
    alert(p === "granted" ? "تم تفعيل الإشعارات" : "لم يتم السماح بالإشعارات");
  });
}

let lastNotificationText = "";
function showBrowserNotification(text) {
  if (!text || text === lastNotificationText) return;
  lastNotificationText = text;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("نظام الصيانة", { body: text });
  }
}

function openImage(src) {
  $("modalImage").src = src;
  $("imageModal").classList.remove("hidden");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
