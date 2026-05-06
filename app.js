import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
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

const $ = (id) => document.getElementById(id);
let currentUser = JSON.parse(localStorage.getItem("maintenanceUser") || "null");
let allRequests = [];

const roleNames = { member: "عضو فريق", worker: "عامل", admin: "مسؤول" };
const statusNames = { new: "جديد", progress: "قيد التنفيذ", done: "تم التنفيذ", cancelled: "ملغي" };
const priorityNames = { normal: "عادي", important: "مهم", urgent: "مستعجل" };

$("loginRole").addEventListener("change", () => {
  const role = $("loginRole").value;
  $("passwordWrap").classList.toggle("hidden", role === "member");
});

$("loginBtn").addEventListener("click", () => {
  const name = $("loginName").value.trim();
  const role = $("loginRole").value;
  const pass = $("loginPass").value.trim();

  if (!name) return alert("اكتب اسمك أولاً");
  if (role === "admin" && !(name === "Ahmed" && pass === "2006")) {
    return alert("بيانات المسؤول غير صحيحة");
  }
  if (role === "worker" && !(name === "هارون" && pass === "1111")) {
    return alert("بيانات العامل غير صحيحة");
  }

  currentUser = { name, role };
  localStorage.setItem("maintenanceUser", JSON.stringify(currentUser));
  showApp();
});

$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("maintenanceUser");
  currentUser = null;
  location.reload();
});

$("submitRequest").addEventListener("click", submitRequest);
$("filterStatus").addEventListener("change", renderRequests);
$("closeModal").addEventListener("click", () => $("imageModal").classList.add("hidden"));
$("imageModal").addEventListener("click", (e) => {
  if (e.target.id === "imageModal") $("imageModal").classList.add("hidden");
});

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("currentUser").textContent = currentUser.name;
  $("currentRole").textContent = ` - ${roleNames[currentUser.role]}`;
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxWidth = 650;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.48));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function submitRequest() {
  const btn = $("submitRequest");
  const title = $("title").value.trim();
  const location = $("location").value.trim();
  const description = $("description").value.trim();
  const priority = $("priority").value;
  const files = Array.from($("images").files || []).slice(0, 3);

  if (!title || !description) return alert("اكتب عنوان المشكلة والوصف");

  btn.disabled = true;
  btn.textContent = "جاري الإرسال...";
  try {
    const images = [];
    for (const file of files) images.push(await compressImage(file));

    await addDoc(requestsRef, {
      title,
      location,
      description,
      priority,
      images,
      doneImages: [],
      status: "new",
      requesterName: currentUser.name,
      requesterRole: currentUser.role,
      comments: [{ by: currentUser.name, text: "تم إنشاء الطلب", at: new Date().toISOString() }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $("title").value = "";
    $("location").value = "";
    $("description").value = "";
    $("images").value = "";
    $("priority").value = "normal";
    alert("تم إرسال الطلب ✅");
  } catch (err) {
    console.error(err);
    alert("تعذر إرسال الطلب. جرّب صورة أصغر أو أعد المحاولة.");
  } finally {
    btn.disabled = false;
    btn.textContent = "إرسال الطلب";
  }
}

const q = query(requestsRef, orderBy("createdAt", "desc"));
onSnapshot(q, (snap) => {
  allRequests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  $("syncState").textContent = "متصل مباشر";
  renderRequests();
}, (err) => {
  console.error(err);
  $("syncState").textContent = "مشكلة اتصال";
});

function renderRequests() {
  const list = $("requestsList");
  const filter = $("filterStatus").value;
  const data = filter === "all" ? allRequests : allRequests.filter((r) => r.status === filter);
  if (!data.length) {
    list.innerHTML = `<div class="empty">لا توجد طلبات حالياً</div>`;
    return;
  }
  list.innerHTML = data.map(cardHtml).join("");
  bindCardActions();
}

function cardHtml(r) {
  const canChange = ["worker", "admin"].includes(currentUser.role);
  const canDelete = currentUser.role === "admin";
  const created = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("ar-SA") : "";
  const images = [...(r.images || []), ...(r.doneImages || [])];
  return `
    <article class="request-card priority-${r.priority || "normal"}">
      <div class="request-head">
        <div>
          <h3>${escapeHtml(r.title || "طلب صيانة")}</h3>
          <p>بواسطة: ${escapeHtml(r.requesterName || "غير معروف")} ${r.location ? " • " + escapeHtml(r.location) : ""}</p>
        </div>
        <div class="badges">
          <span class="badge status-${r.status}">${statusNames[r.status] || r.status}</span>
          <span class="badge priority-badge">${priorityNames[r.priority] || "عادي"}</span>
        </div>
      </div>
      <p class="desc">${escapeHtml(r.description || "")}</p>
      <small>${created}</small>
      ${images.length ? `<div class="thumbs">${images.map((src) => `<img src="${src}" class="thumb" data-src="${src}" alt="صورة طلب" />`).join("")}</div>` : ""}
      <div class="actions">
        ${canChange ? statusButtons(r) : `<span class="note">تغيير الحالة للعامل فقط</span>`}
        ${canDelete ? `<button class="danger delete-btn" data-id="${r.id}">حذف الطلب</button>` : ""}
      </div>
    </article>`;
}

function statusButtons(r) {
  return `
    <button class="status-btn" data-id="${r.id}" data-status="new">جديد</button>
    <button class="status-btn" data-id="${r.id}" data-status="progress">قيد التنفيذ</button>
    <button class="status-btn" data-id="${r.id}" data-status="done">تم التنفيذ</button>
    <button class="status-btn" data-id="${r.id}" data-status="cancelled">ملغي</button>
  `;
}

function bindCardActions() {
  document.querySelectorAll(".status-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (!["worker", "admin"].includes(currentUser.role)) return alert("تغيير الحالة للعامل فقط");
      await updateDoc(doc(db, "requests", btn.dataset.id), {
        status: btn.dataset.status,
        updatedAt: serverTimestamp()
      });
    };
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (currentUser.role !== "admin") return alert("الحذف للمسؤول فقط");
      if (confirm("متأكد من حذف الطلب؟")) await deleteDoc(doc(db, "requests", btn.dataset.id));
    };
  });
  document.querySelectorAll(".thumb").forEach((img) => {
    img.onclick = () => {
      $("modalImg").src = img.dataset.src;
      $("imageModal").classList.remove("hidden");
    };
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

if (currentUser) showApp();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
