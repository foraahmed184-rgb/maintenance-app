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

document.addEventListener("DOMContentLoaded", () => {
  $("loginRole").addEventListener("change", updatePasswordVisibility);
  $("loginBtn").addEventListener("click", login);
  $("logoutBtn").addEventListener("click", logout);
  $("submitRequestBtn").addEventListener("click", submitRequest);
  $("refreshBtn").addEventListener("click", () => location.reload());
  $("closeModalBtn").addEventListener("click", closeImageModal);

  updatePasswordVisibility();
  setupAudioRecorder();

  const savedUser = localStorage.getItem("maintenance_current_user");
  const savedRole = localStorage.getItem("maintenance_current_role");

  if (savedUser && savedRole) {
    currentUser = savedUser;
    currentRole = savedRole;
    showApp();
  }
});

function updatePasswordVisibility() {
  const role = $("loginRole").value;

  if (role === "admin" || role === "worker") {
    $("passwordBox").classList.remove("hidden");
  } else {
    $("passwordBox").classList.add("hidden");
    $("loginPassword").value = "";
  }
}

function getRoleLabel(role) {
  if (role === "admin") return "مسؤول 👑";
  if (role === "worker") return "عامل 🛠️";
  return "عضو فريق 👥";
}

function login() {
  const name = $("loginName").value.trim();
  const selectedRole = $("loginRole").value;
  const password = $("loginPassword").value.trim();

  if (!name) {
    alert("اكتب اسم المستخدم");
    return;
  }

  if (selectedRole === "admin") {
    if (name !== "Ahmed" || password !== "2006") {
      alert("بيانات المسؤول غير صحيحة");
      return;
    }
  }

  if (selectedRole === "worker") {
    if (name !== "هارون" || password !== "1111") {
      alert("بيانات العامل غير صحيحة");
      return;
    }
  }

  currentUser = name;
  currentRole = selectedRole;

  localStorage.setItem("maintenance_current_user", currentUser);
  localStorage.setItem("maintenance_current_role", currentRole);

  showApp();
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");

  $("currentUserName").textContent = currentUser;
  $("currentRoleBadge").textContent = getRoleLabel(currentRole);

  applyWorkerUrduMode();
  updateRoleBasedUI();
  listenRequests();
  listenNotifications();
}

function logout() {
  localStorage.removeItem("maintenance_current_user");
  localStorage.removeItem("maintenance_current_role");
  location.reload();
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
    images.push(await compressImage(file));
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
    if (action === "workerStartAudio") {
      event.preventDefault();
      await workerStartAudio(id, event.currentTarget);
      return;
    }

    if (action === "workerStopAudio") {
      event.preventDefault();
      workerStopAudio(id, event.currentTarget);
      return;
    }

    if (action === "workerSaveMedia") {
      event.preventDefault();
      await workerSaveMedia(id);
      return;
    }

    if (action === "startWorkerAudio") {
      await startWorkerAudio(id, event.currentTarget);
      return;
    }

    if (action === "stopWorkerAudio") {
      stopWorkerAudio(id, event.currentTarget);
      return;
    }

    if (action === "uploadWorkerMedia") {
      event.preventDefault();
      await uploadWorkerMedia(id);
      return;
    }

    const images = await getCompressedImages($("imagesInput"));
    const videoFile = $("videoInput")?.files?.[0];
    const videoBase64 = await fileToBase64Limited(videoFile);

    await addDoc(requestsRef, {
      title,
      description,
      priority,
      status: "جديد",
      createdBy: currentUser,
      createdAt: serverTimestamp(),
      images,
      doneImages: [],
      voiceAudio: audioBase64,
      video: videoBase64,
      comments: [
        {
          by: currentUser,
          text: "تم إنشاء الطلب",
          at: new Date().toISOString()
        }
      ]
    });

    await addNotification(`طلب جديد من ${currentUser}: ${title}`);
    pushLocalNotification(`طلب جديد من ${currentUser}`);

    $("titleInput").value = "";
    $("descriptionInput").value = "";
    $("priorityInput").value = "عادي";
    $("imagesInput").value = "";
    if ($("videoInput")) $("videoInput").value = "";
    audioBase64 = "";
    const ap = document.getElementById("audioPreview");
    if (ap) { ap.src = ""; ap.classList.add("hidden"); }

    alert("تم إرسال الطلب ✅");
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

  const videoHtml = request.video ? `<div class="videos"><strong>فيديو المشكلة</strong><video src="${request.video}" controls></video></div>` : "";

  const voiceAudioHtml = request.voiceAudio ? `<div class="audio-list"><strong>${urduText("تسجيل صوتي")}</strong><audio src="${request.voiceAudio}" controls preload="metadata"></audio></div>` : "";

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

  
  const workerAudioHtml = request.workerAudio ? `<div class="audio-list"><strong>شرح العامل بالصوت</strong><audio src="${request.workerAudio}" controls preload="metadata"></audio></div>` : "";
  const workerVideoHtml = request.workerVideo ? `<div class="videos"><strong>فيديو شرح العامل</strong><video src="${request.workerVideo}" controls></video></div>` : "";

  const canChangeStatus = currentRole === "worker" || currentRole === "admin";
  const canDelete = currentRole === "admin";
  const canRemind = currentRole === "member";

  let actionsHtml = "";

  if (canChangeStatus && request.status !== "قيد التنفيذ") {
    actionsHtml += `<button class="warning" data-action="progress" data-id="${request.id}">${urduText("قيد التنفيذ")}</button>`;
  }

  if (canChangeStatus && request.status !== "تم التنفيذ") {
    actionsHtml += `<button class="success" data-action="done" data-id="${request.id}">${urduText("تم التنفيذ")}</button>`;
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
        <label>${urduText("صور الإنجاز")}</label>
        <input id="doneImages-${request.id}" type="file" accept="image/*" multiple>
        <button data-action="uploadDoneImages" data-id="${request.id}">${urduText("رفع صور الإنجاز")}</button>
      </div>
    `
    : "";

  return `
    <article class="request-card ${priorityCardClass}">
      <div class="request-top">
        <div>
          <div class="request-title">${escapeHtml(request.title || "طلب صيانة")}</div>
          <div class="meta">${urduText("المرسل")}: ${escapeHtml(request.createdBy || "غير معروف")}</div>
        </div>

        <div class="badges">
          <span class="badge ${priorityBadgeClass}">${escapeHtml(urduText(request.priority || "عادي"))}</span>
          <span class="badge ${statusBadgeClass}">${escapeHtml(urduText(request.status || "جديد"))}</span>
        </div>
      </div>

      <div class="description">${escapeHtml(request.description || "")}</div>

      ${imagesHtml ? `<strong>${urduText("صور المشكلة")}</strong><div class="images">${imagesHtml}</div>` : ""}
      ${voiceAudioHtml}
      ${videoHtml}
      ${doneImagesHtml ? `<strong>صور الإنجاز</strong><div class="images">${doneImagesHtml}</div>` : ""}

      ${workerAudioHtml}
      ${workerVideoHtml}
      ${doneUploadHtml}
      ${workerMediaHtml(request.id)}

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
      pushLocalNotification(`${currentUser} غيّر حالة الطلب`);
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
      pushLocalNotification(`${currentUser} أنهى طلب صيانة`);
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
  $("modalImage").src = "";
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


if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./firebase-messaging-sw.js');
      console.log('SW registered');
    } catch (e) {
      console.log(e);
    }
  });
}

async function requestNotificationPermission() {
  try {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);
    }
  } catch (e) {
    console.log(e);
  }
}

requestNotificationPermission();

function pushLocalNotification(text) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('نظام الصيانة', {
        body: text,
        icon: './icon-192.png'
      });
    }
  } catch (e) {
    console.log(e);
  }
}


let audioBase64 = "";
let mediaRecorder = null;
let audioChunks = [];

async function setupAudioRecorder() {
  const recordBtn = document.getElementById("recordAudioBtn");
  const stopBtn = document.getElementById("stopAudioBtn");
  const preview = document.getElementById("audioPreview");
  if (!recordBtn || !stopBtn || !preview) return;

  recordBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      }

      mediaRecorder = new MediaRecorder(stream, { mimeType });


      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        if (blob.size > 2000000) {
          alert("التسجيل طويل. خليه قصير أقل من دقيقة تقريبًا.");
          audioBase64 = "";
          preview.classList.add("hidden");
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        audioBase64 = await blobToBase64(blob);
        preview.src = audioBase64;
        preview.classList.remove("hidden");
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      recordBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
    } catch (e) {
      alert("المتصفح لم يسمح بالمايكروفون");
    }
  });

  stopBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    stopBtn.classList.add("hidden");
    recordBtn.classList.remove("hidden");
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function applyWorkerUrduMode() {
  const panel = document.getElementById("workerUrduNotice");
  if (!panel) return;
  if (currentRole === "worker") {
    panel.classList.remove("hidden");
    document.documentElement.lang = "ur";
  } else {
    panel.classList.add("hidden");
    document.documentElement.lang = "ar";
  }
}

function urduText(text) {
  const map = {
    "الطلبات":"درخواستیں",
    "قيد التنفيذ":"کام جاری ہے",
    "تم التنفيذ":"کام مکمل ہوگیا",
    "صور الإنجاز":"کام مکمل ہونے کی تصاویر",
    "رفع صور الإنجاز":"مکمل کام کی تصاویر اپلوڈ کریں",
    "لا توجد طلبات حالياً.":"فی الحال کوئی درخواست نہیں۔",
    "المرسل":"بھیجنے والا",
    "صور المشكلة":"مسئلہ کی تصاویر",
    "جديد":"نئی",
    "عادي":"عام",
    "مهم":"اہم",
    "مستعجل":"فوری",
    "تسجيل صوتي":"آواز کی ریکارڈنگ"
  };
  return currentRole === "worker" ? (map[text] || text) : text;
}


async function fileToBase64Limited(file, maxBytes = 5000000) {
  if (!file) return "";
  if (file.size > maxBytes) {
    alert("حجم الفيديو كبير. اختر فيديو قصير جدًا أو قلل الجودة.");
    return "";
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


function updateRoleBasedUI() {
  const newRequestCard = document.getElementById("newRequestCard");
  if (newRequestCard) {
    if (currentRole === "worker") {
      newRequestCard.classList.add("hidden");
    } else {
      newRequestCard.classList.remove("hidden");
    }
  }
}


let workerAudioRecorders = {};


function workerMediaHtml(requestId) {
  if (currentRole !== "worker" && currentRole !== "admin") return "";

  return `
    <div class="done-box worker-media-box">
      <label>شرح العامل بالصوت</label>
      <div class="voice-box">
        <button type="button" class="ghost" data-worker-action="startAudio" data-id="${requestId}">بدء تسجيل صوت العامل 🎙️</button>
        <button type="button" class="ghost hidden" data-worker-action="stopAudio" data-id="${requestId}">إيقاف التسجيل ⏹️</button>
        <audio id="workerAudioPreviewFixed-${requestId}" controls class="hidden"></audio>
      </div>

      <label>فيديو شرح العامل</label>
      <input id="workerVideoFixed-${requestId}" type="file" accept="video/*">

      <button type="button" data-worker-action="saveMedia" data-id="${requestId}">حفظ صوت/فيديو العامل</button>
      <p class="muted small">الفيديو يفضل يكون قصير. إذا كان كبير جدًا لن يتم حفظه.</p>
    </div>
  `;
}


async function startWorkerAudio(requestId, startBtn) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];

    let mimeType = "audio/webm";
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/mp4")) {
      mimeType = "audio/mp4";
    } else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm")) {
      mimeType = "audio/webm";
    }

    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });

      if (blob.size > 2000000) {
        alert("التسجيل طويل. خليه أقصر.");
        workerAudioRecorders[requestId].audio = "";
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const audio = await blobToBase64(blob);
      workerAudioRecorders[requestId].audio = audio;

      const preview = document.getElementById(`workerAudioPreview-${requestId}`);
      if (preview) {
        preview.src = audio;
        preview.classList.remove("hidden");
      }

      stream.getTracks().forEach(track => track.stop());
    };

    workerAudioRecorders[requestId] = { recorder: recorder, audio: "" };
    recorder.start();

    const stopBtn = document.querySelector(`[data-action="stopWorkerAudio"][data-id="${requestId}"]`);
    if (startBtn) startBtn.classList.add("hidden");
    if (stopBtn) stopBtn.classList.remove("hidden");
  } catch (e) {
    alert("المتصفح لم يسمح بالمايكروفون");
    console.log(e);
  }
}

function stopWorkerAudio(requestId, stopBtn) {
  const item = workerAudioRecorders[requestId];
  if (item && item.recorder && item.recorder.state !== "inactive") {
    item.recorder.stop();
  }

  const startBtn = document.querySelector(`[data-action="startWorkerAudio"][data-id="${requestId}"]`);
  if (stopBtn) stopBtn.classList.add("hidden");
  if (startBtn) startBtn.classList.remove("hidden");
}

async function uploadWorkerMedia(requestId) {
  const requestDoc = doc(db, "requests", requestId);
  const videoInput = document.getElementById(`workerVideo-${requestId}`);
  const workerVideoFile = videoInput?.files?.[0];

  let workerVideo = "";
  try {
    if (workerVideoFile) {
      workerVideo = await fileToBase64Limited(workerVideoFile, 5000000);
    }
  } catch(e) {
    console.log(e);
  }

  const workerAudio = workerAudioRecorders[requestId]?.audio || "";

  if (!workerAudio && !workerVideo) {
    alert("سجل صوت أو أضف فيديو أولاً");
    return;
  }

  await updateDoc(requestDoc, {
    workerAudio: workerAudio || "",
    workerVideo: workerVideo || "",
    comments: arrayUnion({
      by: currentUser,
      text: "أضاف العامل شرح صوتي/فيديو للإنجاز",
      at: new Date().toISOString()
    })
  });

  await addNotification(`${currentUser} أضاف شرح للإنجاز`);
  alert("تم حفظ شرح العامل ✅");
}


let workerAudioData = {};

function workerMediaHtml(requestId) {
  if (currentRole !== "worker" && currentRole !== "admin") return "";

  return `
    <div class="done-box worker-media-box">
      <label>شرح العامل بالصوت</label>
      <div class="voice-box">
        <button type="button" class="ghost" data-action="workerStartAudio" data-id="${requestId}">بدء تسجيل صوت العامل 🎙️</button>
        <button type="button" class="ghost hidden" data-action="workerStopAudio" data-id="${requestId}">إيقاف التسجيل ⏹️</button>
        <audio id="workerAudioPreview-${requestId}" controls class="hidden"></audio>
      </div>

      <label>فيديو شرح العامل</label>
      <input id="workerVideo-${requestId}" type="file" accept="video/*">

      <button type="button" data-action="workerSaveMedia" data-id="${requestId}">حفظ صوت/فيديو العامل</button>
      <p class="muted small">الفيديو يفضل يكون قصير. إذا كان كبير جدًا لن يتم حفظه.</p>
    </div>
  `;
}

async function workerStartAudio(requestId, button) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("المتصفح لا يدعم تسجيل الصوت");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];

    let options = {};
    if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options.mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        options.mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options.mimeType = "audio/mp4";
      }
    }

    const recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = async () => {
      const type = recorder.mimeType || options.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });

      if (blob.size > 2500000) {
        alert("التسجيل طويل. سجل صوت أقصر.");
        workerAudioData[requestId] = "";
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      workerAudioData[requestId] = await blobToBase64(blob);

      const preview = document.getElementById(`workerAudioPreview-${requestId}`);
      if (preview) {
        preview.src = workerAudioData[requestId];
        preview.classList.remove("hidden");
      }

      stream.getTracks().forEach(track => track.stop());
    };

    workerAudioData[requestId + "_recorder"] = recorder;
    recorder.start();

    const stopBtn = document.querySelector(`[data-action="workerStopAudio"][data-id="${requestId}"]`);
    if (button) button.classList.add("hidden");
    if (stopBtn) stopBtn.classList.remove("hidden");

  } catch (error) {
    console.error(error);
    alert("لم يتم السماح بالمايكروفون أو يوجد خطأ في التسجيل");
  }
}

function workerStopAudio(requestId, button) {
  const recorder = workerAudioData[requestId + "_recorder"];
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }

  const startBtn = document.querySelector(`[data-action="workerStartAudio"][data-id="${requestId}"]`);
  if (button) button.classList.add("hidden");
  if (startBtn) startBtn.classList.remove("hidden");
}

async function workerSaveMedia(requestId) {
  try {
    const requestDoc = doc(db, "requests", requestId);
    const videoInput = document.getElementById(`workerVideo-${requestId}`);
    const file = videoInput && videoInput.files ? videoInput.files[0] : null;

    let workerVideo = "";
    if (file) {
      workerVideo = await fileToBase64Limited(file, 5000000);
    }

    const workerAudio = workerAudioData[requestId] || "";

    if (!workerAudio && !workerVideo) {
      alert("سجل صوت أو اختر فيديو أولاً");
      return;
    }

    const updateData = {
      comments: arrayUnion({
        by: currentUser,
        text: "أضاف العامل شرح صوتي/فيديو للإنجاز",
        at: new Date().toISOString()
      })
    };

    if (workerAudio) updateData.workerAudio = workerAudio;
    if (workerVideo) updateData.workerVideo = workerVideo;

    await updateDoc(requestDoc, updateData);
    await addNotification(`${currentUser} أضاف شرح صوتي/فيديو للإنجاز`);

    alert("تم حفظ صوت/فيديو العامل ✅");
  } catch (error) {
    console.error(error);
    alert("حدث خطأ أثناء حفظ صوت/فيديو العامل");
  }
}


// إصلاح نهائي لأزرار صوت/فيديو العامل: يعمل حتى بعد تحديث الطلبات
document.addEventListener("click", async function (event) {
  const btn = event.target.closest("[data-worker-action]");
  if (!btn) return;

  event.preventDefault();
  event.stopPropagation();

  const requestId = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-worker-action");

  if (!requestId || !action) return;

  if (action === "startAudio") {
    await workerStartAudioFixed(requestId, btn);
  }

  if (action === "stopAudio") {
    workerStopAudioFixed(requestId, btn);
  }

  if (action === "saveMedia") {
    await workerSaveMediaFixed(requestId);
  }
});

let workerAudioStoreFixed = {};

async function workerStartAudioFixed(requestId, startButton) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("المتصفح لا يدعم تسجيل الصوت");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];

    let options = {};
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options.mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        options.mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options.mimeType = "audio/mp4";
      }
    }

    const recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async function () {
      const blob = new Blob(chunks, { type: recorder.mimeType || options.mimeType || "audio/webm" });

      if (blob.size > 2500000) {
        alert("التسجيل طويل. سجل صوت أقصر.");
        workerAudioStoreFixed[requestId] = "";
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      workerAudioStoreFixed[requestId] = await workerBlobToBase64Fixed(blob);

      const preview = document.getElementById("workerAudioPreviewFixed-" + requestId);
      if (preview) {
        preview.src = workerAudioStoreFixed[requestId];
        preview.classList.remove("hidden");
      }

      stream.getTracks().forEach(t => t.stop());
    };

    workerAudioStoreFixed[requestId + "_recorder"] = recorder;
    recorder.start();

    const stopBtn = document.querySelector('[data-worker-action="stopAudio"][data-id="' + requestId + '"]');
    startButton.classList.add("hidden");
    if (stopBtn) stopBtn.classList.remove("hidden");

  } catch (error) {
    console.error(error);
    alert("لم يتم السماح بالمايكروفون أو المتصفح لا يدعم التسجيل");
  }
}

function workerStopAudioFixed(requestId, stopButton) {
  const recorder = workerAudioStoreFixed[requestId + "_recorder"];

  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }

  const startBtn = document.querySelector('[data-worker-action="startAudio"][data-id="' + requestId + '"]');
  stopButton.classList.add("hidden");
  if (startBtn) startBtn.classList.remove("hidden");
}

async function workerSaveMediaFixed(requestId) {
  try {
    const videoInput = document.getElementById("workerVideoFixed-" + requestId);
    const videoFile = videoInput && videoInput.files ? videoInput.files[0] : null;

    let workerVideo = "";
    if (videoFile) {
      workerVideo = await fileToBase64LimitedFixed(videoFile, 5000000);
    }

    const workerAudio = workerAudioStoreFixed[requestId] || "";

    if (!workerAudio && !workerVideo) {
      alert("سجل صوت أو اختر فيديو أولاً");
      return;
    }

    const requestDoc = doc(db, "requests", requestId);
    const updateData = {
      comments: arrayUnion({
        by: currentUser,
        text: "أضاف العامل شرح صوتي/فيديو للإنجاز",
        at: new Date().toISOString()
      })
    };

    if (workerAudio) updateData.workerAudio = workerAudio;
    if (workerVideo) updateData.workerVideo = workerVideo;

    await updateDoc(requestDoc, updateData);
    await addNotification(currentUser + " أضاف شرح صوتي/فيديو للإنجاز");

    alert("تم حفظ صوت/فيديو العامل ✅");
  } catch (error) {
    console.error(error);
    alert("حدث خطأ أثناء حفظ الصوت/الفيديو");
  }
}

function workerBlobToBase64Fixed(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onloadend = function () { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fileToBase64LimitedFixed(file, maxBytes) {
  if (!file) return "";

  if (file.size > maxBytes) {
    alert("حجم الفيديو كبير. اختر فيديو أقصر أو أقل جودة.");
    return "";
  }

  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onloadend = function () { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
