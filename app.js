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
  orderBy,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCK7gJ9-zUiygiYHJVwYFb6nUBweptV3XI",
  authDomain: "maintenance-app-fa8cc.firebaseapp.com",
  projectId: "maintenance-app-fa8cc",
  storageBucket: "maintenance-app-fa8cc.firebasestorage.app",
  messagingSenderId: "888866675500",
  appId: "1:888866675500:web:d808b825c1801ed566ea89"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const requestsRef = collection(db, "requests");
const notificationsRef = collection(db, "notifications");

let currentUser = "";
let currentRole = "member";

const $ = (id) => document.getElementById(id);

$("loginBtn").addEventListener("click", login);
$("logoutBtn").addEventListener("click", logout);
$("submitRequestBtn").addEventListener("click", submitRequest);
$("refreshBtn").addEventListener("click", () => location.reload());
$("closeModalBtn").addEventListener("click", closeImageModal);


function getRole(name, role, password) {
  const clean = String(name || "").trim();

  if (role === "admin" && clean === "Ahmed" && password === "2006") return "admin";

  if (role === "worker" && clean === "هارون" && password === "1111") return "worker";

  return "member";
}


function getRoleLabel(role) {
  if (role === "admin") return "👑 مسؤول";
  if (role === "worker") return "🛠️ عامل";
  return "عضو فريق";
}

function login() {
  const name = $("loginName").value.trim();
  const code = $("loginCode").value.trim();
  if (!name) {
    alert("اكتب اسمك");
    return;
  }

  currentUser = name;
  currentRole = getRole(name, code);

  localStorage.setItem("maintenance_current_user", currentUser);

  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("currentUserName").textContent = currentUser;
  $("currentRoleBadge").textContent = getRoleLabel(currentRole);

  listenRequests();
  listenNotifications();
}

function logout() {
  localStorage.removeItem("maintenance_current_user");
  location.reload();
}

const savedUser = localStorage.getItem("maintenance_current_user");
if (savedUser) {
  $("loginName").value = savedUser;
  login();
}

async function compressImage(file, maxWidth = 520, quality = 0.45) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getCompressedImages(inputElement) {
  const files = Array.from(inputElement.files || []).slice(0, 3);
  const images = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const compressed = await compressImage(file);
    images.push(compressed);
  }

  return images;
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
    const images = await getCompressedImages($("imagesInput"));

    await addDoc(requestsRef, {
      title,
      description,
      priority,
      status: "جديد",
      createdBy: currentUser,
      createdAt: serverTimestamp(),
      images,
      doneImages: [],
      comments: [
        {
          by: currentUser,
          text: "تم إنشاء الطلب",
          at: new Date().toISOString()
        }
      ]
    });

    await addNotification(`طلب جديد من ${currentUser}: ${title}`);

    $("titleInput").value = "";
    $("descriptionInput").value = "";
    $("priorityInput").value = "عادي";
    $("imagesInput").value = "";

    sendBrowserNotification("تم إرسال طلب صيانة جديد");\n    alert("تم إرسال الطلب ✅");
  } catch (error) {
    console.error(error);
    alert("ما قدرنا نرسل الطلب. جرّب صورة واحدة أو صورة أصغر.");
  }

  $("submitRequestBtn").disabled = false;
  $("submitRequestBtn").textContent = "إرسال الطلب";
}

function listenRequests() {
  const q = query(requestsRef, orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    const requests = [];
    snapshot.forEach((item) => {
      requests.push({ id: item.id, ...item.data() });
    });
    renderRequests(requests);
  }, (error) => {
    console.error(error);
    $("requestsList").innerHTML = `<p class="muted">تعذر تحميل الطلبات.</p>`;
  });
}

function listenNotifications() {
  const q = query(notificationsRef, orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    const notifications = [];
    snapshot.forEach((item) => {
      notifications.push({ id: item.id, ...item.data() });
    });
    renderNotifications(notifications.slice(0, 20));
  });
}

function renderRequests(requests) {
  if (!requests.length) {
    $("requestsList").innerHTML = `<p class="muted">لا توجد طلبات حالياً.</p>`;
    return;
  }

  $("requestsList").innerHTML = requests.map((request) => renderRequestCard(request)).join("");

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", handleAction);
  });

  document.querySelectorAll("[data-image]").forEach((img) => {
    img.addEventListener("click", () => openImageModal(img.getAttribute("data-image")));
  });
}

function renderRequestCard(request) {
  const priorityCardClass =
    request.priority === "مستعجل"
      ? "priority-urgent"
      : request.priority === "مهم"
      ? "priority-important"
      : "";

  const priorityBadgeClass =
    request.priority === "مستعجل"
      ? "badge-urgent"
      : request.priority === "مهم"
      ? "badge-important"
      : "badge-normal";

  const statusBadgeClass =
    request.status === "تم التنفيذ"
      ? "badge-done"
      : request.status === "قيد التنفيذ"
      ? "badge-progress"
      : "badge-new";

  const imagesHtml = (request.images || [])
    .map((src) => `<img src="${src}" data-image="${src}" alt="صورة المشكلة">`)
    .join("");

  const doneImagesHtml = (request.doneImages || [])
    .map((src) => `<img src="${src}" data-image="${src}" alt="صورة الإنجاز">`)
    .join("");

  const commentsHtml = (request.comments || [])
    .map((comment) => `
      <div class="comment">
        <strong>${escapeHtml(comment.by || "")}</strong>: ${escapeHtml(comment.text || "")}
      </div>
    `)
    .join("");

  const canChangeStatus = currentRole === "worker" || currentRole === "admin";
  const canDelete = currentRole === "admin";
  const canRemind = currentRole === "member";

  let actionsHtml = "";

  if (canChangeStatus && request.status !== "قيد التنفيذ") {
    actionsHtml += `<button class="warning" data-action="progress" data-id="${request.id}">قيد التنفيذ</button>`;
  }

  if (canChangeStatus && request.status !== "تم التنفيذ") {
    actionsHtml += `<button class="success" data-action="done" data-id="${request.id}">تم التنفيذ</button>`;
  }

  if (canDelete) {
    actionsHtml += `<button class="danger" data-action="delete" data-id="${request.id}">حذف الطلب</button>`;
  }

  if (canRemind) {
    actionsHtml += `<button class="ghost" data-action="remind" data-id="${request.id}">تذكير بالتأخير</button>`;
  }

  const doneUploadHtml = canChangeStatus
    ? `
      <div class="done-box">
        <label>صور الإنجاز</label>
        <input id="doneImages-${request.id}" type="file" accept="image/*" multiple>
        <button data-action="uploadDoneImages" data-id="${request.id}">رفع صور الإنجاز</button>
      </div>
    `
    : "";

  return `
    <article class="request-card ${priorityCardClass}">
      <div class="request-top">
        <div>
          <div class="request-title">${escapeHtml(request.title || "طلب صيانة")}</div>
          <div class="meta">المرسل: ${escapeHtml(request.createdBy || "غير معروف")}</div>
        </div>

        <div class="badges">
          <span class="badge ${priorityBadgeClass}">${escapeHtml(request.priority || "عادي")}</span>
          <span class="badge ${statusBadgeClass}">${escapeHtml(request.status || "جديد")}</span>
        </div>
      </div>

      <div class="description">${escapeHtml(request.description || "")}</div>

      ${imagesHtml ? `<strong>صور المشكلة</strong><div class="images">${imagesHtml}</div>` : ""}
      ${doneImagesHtml ? `<strong>صور الإنجاز</strong><div class="images">${doneImagesHtml}</div>` : ""}

      ${doneUploadHtml}

      <div class="actions">${actionsHtml}</div>

      <div class="comments">
        ${commentsHtml}
      </div>
    </article>
  `;
}

async function handleAction(event) {
  const action = event.currentTarget.getAttribute("data-action");
  const id = event.currentTarget.getAttribute("data-id");
  const requestDoc = doc(db, "requests", id);

  try {
    if (action === "progress") {
      if (currentRole !== "worker" && currentRole !== "admin") return;

      await updateDoc(requestDoc, {
        status: "قيد التنفيذ",
        comments: arrayUnion({
          by: currentUser,
          text: "تم تغيير الحالة إلى قيد التنفيذ",
          at: new Date().toISOString()
        })
      });

      await addNotification(`${currentUser} غيّر حالة طلب إلى قيد التنفيذ`);
    }

    if (action === "done") {
      if (currentRole !== "worker" && currentRole !== "admin") return;

      await updateDoc(requestDoc, {
        status: "تم التنفيذ",
        comments: arrayUnion({
          by: currentUser,
          text: "تم تغيير الحالة إلى تم التنفيذ",
          at: new Date().toISOString()
        })
      });

      await addNotification(`${currentUser} أنهى طلب صيانة`);
    }

    if (action === "delete") {
      if (currentRole !== "admin") return;

      if (confirm("هل أنت متأكد من حذف الطلب؟")) {
        await deleteDoc(requestDoc);
        await addNotification(`${currentUser} حذف طلب صيانة`);
      }
    }

    if (action === "remind") {
      await updateDoc(requestDoc, {
        comments: arrayUnion({
          by: currentUser,
          text: "تذكير: الطلب متأخر",
          at: new Date().toISOString()
        })
      });

      await addNotification(`${currentUser} أرسل تذكير بتأخير طلب صيانة`);
      alert("تم إرسال التذكير داخل التطبيق ✅");
    }

    if (action === "uploadDoneImages") {
      if (currentRole !== "worker" && currentRole !== "admin") return;

      const input = $(`doneImages-${id}`);
      const doneImages = await getCompressedImages(input);

      if (!doneImages.length) {
        alert("اختر صورة إنجاز أولاً");
        return;
      }

      await updateDoc(requestDoc, {
        doneImages,
        status: "تم التنفيذ",
        comments: arrayUnion({
          by: currentUser,
          text: "تم رفع صور الإنجاز",
          at: new Date().toISOString()
        })
      });

      await addNotification(`${currentUser} رفع صور الإنجاز`);
      alert("تم رفع صور الإنجاز ✅");
    }
  } catch (error) {
    console.error(error);
    alert("حدث خطأ. جرّب مرة ثانية.");
  }
}

async function addNotification(text) {
  try {
    await addDoc(notificationsRef, {
      text,
      by: currentUser || "النظام",
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
  }
}

function renderNotifications(notifications) {
  if (!notifications.length) {
    $("notificationsList").innerHTML = `<p class="muted">لا توجد إشعارات.</p>`;
    return;
  }

  $("notificationsList").innerHTML = notifications
    .map((item) => `<div class="notification">${escapeHtml(item.text || "")}</div>`)
    .join("");
}

function openImageModal(src) {
  $("modalImage").src = src;
  $("imageModal").classList.remove("hidden");
}

function closeImageModal() {
  $("imageModal").src = "";
  $("imageModal").classList.add("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


async function createNotification(text) {
  try {
    console.log("notification:", text);
  } catch(e){}
}


document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = document.getElementById("loginRole");
  const wrapper = document.getElementById("passwordFieldWrapper");

  function togglePasswordField() {
    const role = roleSelect.value;
    if (role === "admin" || role === "worker") {
      wrapper.style.display = "block";
    } else {
      wrapper.style.display = "none";
    }
  }

  roleSelect.addEventListener("change", togglePasswordField);
  togglePasswordField();
});


document.addEventListener("DOMContentLoaded", async () => {
  if ("Notification" in window) {
    try {
      await Notification.requestPermission();
    } catch(e){}
  }
});

function sendBrowserNotification(text){
  try{
    if("Notification" in window && Notification.permission === "granted"){
      new Notification("نظام الصيانة", { body: text });
    }
  }catch(e){}
}
