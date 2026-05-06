import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
let requestAudioBase64 = "";
let mainRecorder = null;
let mainChunks = [];
let workerAudioStore = {};
let lastNotificationId = "";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("loginRole").addEventListener("change", updatePasswordVisibility);
  $("loginBtn").addEventListener("click", login);
  $("logoutBtn").addEventListener("click", logout);
  $("submitRequestBtn").addEventListener("click", submitRequest);
  $("refreshBtn").addEventListener("click", () => location.reload());
  $("closeModalBtn").addEventListener("click", closeImageModal);
  $("enableNotifyBtn").addEventListener("click", requestNotificationPermission);
  $("recordAudioBtn").addEventListener("click", startMainAudio);
  $("stopAudioBtn").addEventListener("click", stopMainAudio);

  document.addEventListener("click", workerMediaDelegation);

  updatePasswordVisibility();

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
  if (role === "admin") return currentRole === "worker" ? "منیجر 👑" : "مسؤول 👑";
  if (role === "worker") return "کاریگر 🛠️";
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
  if (selectedRole === "admin" && (name !== "Ahmed" || password !== "2006")) {
    alert("بيانات المسؤول غير صحيحة");
    return;
  }
  if (selectedRole === "worker" && (name !== "هارون" || password !== "1111")) {
    alert("بيانات العاديل غير صحيحة");
    return;
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
  applyRoleUI();
  listenRequests();
  listenNotifications();
}

function applyRoleUI() {
  $("newRequestCard").classList.toggle("hidden", currentRole === "worker");
  $("workerUrduNotice").classList.toggle("hidden", currentRole !== "worker");
  document.documentElement.lang = currentRole === "worker" ? "ur" : "ar";
}

function logout() {
  localStorage.removeItem("maintenance_current_user");
  localStorage.removeItem("maintenance_current_role");
  location.reload();
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("المتصفح لا يدعم الإشعارات");
    return;
  }
  const permission = await Notification.requestPermission();
  alert(permission === "granted" ? "تم تفعيل الإشعارات" : "لم يتم السماح بالإشعارات");
}

function browserNotify(text) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("نظام الصيانة", { body: text });
  }
}

function makeRecorder(stream) {
  let options = {};
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) options.mimeType = "audio/webm;codecs=opus";
    else if (MediaRecorder.isTypeSupported("audio/webm")) options.mimeType = "audio/webm";
    else if (MediaRecorder.isTypeSupported("audio/mp4")) options.mimeType = "audio/mp4";
  }
  return new MediaRecorder(stream, options);
}

async function startMainAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mainChunks = [];
    mainRecorder = makeRecorder(stream);
    mainRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) mainChunks.push(e.data); };
    mainRecorder.onstop = async () => {
      const blob = new Blob(mainChunks, { type: mainRecorder.mimeType || "audio/webm" });
      if (blob.size > 2000000) {
        alert("التسجيل طويل. خليه أقصر.");
        requestAudioBase64 = "";
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      requestAudioBase64 = await blobToBase64(blob);
      $("audioPreview").src = requestAudioBase64;
      $("audioPreview").classList.remove("hidden");
      stream.getTracks().forEach(t => t.stop());
    };
    mainRecorder.start();
    $("recordAudioBtn").classList.add("hidden");
    $("stopAudioBtn").classList.remove("hidden");
  } catch (e) {
    alert("المتصفح لم يسمح بالمايكروفون");
  }
}

function stopMainAudio() {
  if (mainRecorder && mainRecorder.state !== "inactive") mainRecorder.stop();
  $("stopAudioBtn").classList.add("hidden");
  $("recordAudioBtn").classList.remove("hidden");
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
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
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

async function fileToBase64Limited(file, maxBytes = 3000000) {
  if (!file) return "";
  if (file.size > maxBytes) {
    alert("حجم الفيديو كبير. اختر فيديو قصير أو أقل جودة.");
    return "";
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
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
    const video = await fileToBase64Limited($("videoInput").files[0], 3000000);

    await addDoc(requestsRef, {
      title,
      description,
      priority,
      status: "جديد",
      createdBy: currentUser,
      createdAt: serverTimestamp(),
      images,
      video,
      voiceAudio: requestAudioBase64,
      doneImages: [],
      workerAudio: "",
      workerVideo: "",
      comments: [{ by: currentUser, text: "تم إنشاء الطلب", at: new Date().toISOString() }]
    });

    await addNotification(`طلب جديد من ${currentUser}: ${title}`);
    $("titleInput").value = "";
    $("descriptionInput").value = "";
    $("priorityInput").value = "عادي";
    $("imagesInput").value = "";
    $("videoInput").value = "";
    requestAudioBase64 = "";
    $("audioPreview").src = "";
    $("audioPreview").classList.add("hidden");
    alert("تم إرسال الطلب ✅");
  } catch (error) {
    console.error(error);
    alert("ما قدرنا نرسل الطلب. جرّب صورة واحدة أو فيديو أصغر.");
  }

  $("submitRequestBtn").disabled = false;
  $("submitRequestBtn").textContent = "إرسال الطلب";
}

function listenRequests() {
  const q = query(requestsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    const requests = [];
    snapshot.forEach((item) => requests.push({ id: item.id, ...item.data() }));
    renderRequests(requests);
  }, (error) => {
    console.error(error);
    $("requestsList").innerHTML = `<p class="muted">${t("loadError")}</p>`;
  });
}

function listenNotifications() {
  const q = query(notificationsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    const notifications = [];
    snapshot.forEach((item) => notifications.push({ id: item.id, ...item.data() }));
    renderNotifications(notifications.slice(0, 20));
    if (notifications[0] && notifications[0].id !== lastNotificationId) {
      lastNotificationId = notifications[0].id;
      browserNotify(notifications[0].text || "تحديث جديد");
    }
  });
}

function t(keyOrText) {
  if (currentRole !== "worker") return keyOrText;
  const map = {
    "المرسل": "لېږونکی",
    "صور المشكلة": "د ستونزې انځورونه",
    "فيديو المشكلة": "د ستونزې ویډیو",
    "تسجيل صوتي": "غږ ثبتول",
    "صور الإنجاز": "د کار بشپړېدو انځورونه",
    "شرح العاديل بالصوت": "د کارګر غږیز تشریح",
    "فيديو شرح العاديل": "د کارګر ویډیویي تشریح",
    "قيد التنفيذ": "کار روان دی",
    "تم التنفيذ": "کار بشپړ شو",
    "رفع صور الإنجاز": "د بشپړ کار انځورونه پورته کړئ",
    "بدء تسجيل صوت العاديل 🎙️": "د کارګر غږ ثبت پیل کړئ 🎙️",
    "إيقاف التسجيل ⏹️": "ثبت بند کړئ ⏹️",
    "حفظ صوت/فيديو العاديل": "د کارګر غږ/ویډیو خوندي کړئ",
    "جديد": "نوی",
    "عادي": "عادي",
    "مهم": "مهم",
    "مستعجل": "بیړنی",
    "لا توجد طلبات حالياً.": "اوس مهال هېڅ غوښتنه نشته.",
    "loadError": "غوښتنې پورته نشوې."
  };
  return map[keyOrText] || keyOrText;
}

function renderRequests(requests) {
  if (!requests.length) {
    $("requestsList").innerHTML = `<p class="muted">${t("لا توجد طلبات حالياً.")}</p>`;
    return;
  }
  $("requestsList").innerHTML = requests.map(renderRequestCard).join("");
  document.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", handleAction));
  document.querySelectorAll("[data-image]").forEach((img) => img.addEventListener("click", () => openImageModal(img.getAttribute("data-image"))));
}

function renderRequestCard(request) {
  const priorityCardClass = request.priority === "مستعجل" ? "priority-urgent" : request.priority === "مهم" ? "priority-important" : "";
  const priorityBadgeClass = request.priority === "مستعجل" ? "badge-urgent" : request.priority === "مهم" ? "badge-important" : "badge-normal";
  const statusBadgeClass = request.status === "تم التنفيذ" ? "badge-done" : request.status === "قيد التنفيذ" ? "badge-progress" : "badge-new";

  const imagesHtml = (request.images || []).map((src) => `<img src="${src}" data-image="${src}" alt="صورة المشكلة">`).join("");
  const doneImagesHtml = (request.doneImages || []).map((src) => `<img src="${src}" data-image="${src}" alt="صورة الإنجاز">`).join("");
  const videoHtml = request.video ? `<div class="videos"><strong>${t("فيديو المشكلة")}</strong><video src="${request.video}" controls></video></div>` : "";
  const audioHtml = request.voiceAudio ? `<div class="audio-list"><strong>${t("تسجيل صوتي")}</strong><audio src="${request.voiceAudio}" controls preload="metadata"></audio></div>` : "";
  const workerAudioHtml = request.workerAudio ? `<div class="audio-list"><strong>${t("شرح العاديل بالصوت")}</strong><audio src="${request.workerAudio}" controls preload="metadata"></audio></div>` : "";
  const workerVideoHtml = request.workerVideo ? `<div class="videos"><strong>${t("فيديو شرح العاديل")}</strong><video src="${request.workerVideo}" controls></video></div>` : "";

  const commentsHtml = (request.comments || []).map((c) => `<div class="comment"><strong>${escapeHtml(c.by || "")}</strong>: ${escapeHtml(c.text || "")}</div>`).join("");

  const canChangeStatus = currentRole === "worker" || currentRole === "admin";
  const canDelete = currentRole === "admin";
  const canRemind = currentRole === "member";

  let actionsHtml = "";
  if (canChangeStatus && request.status !== "قيد التنفيذ") actionsHtml += `<button class="warning" data-action="progress" data-id="${request.id}">${t("قيد التنفيذ")}</button>`;
  if (canChangeStatus && request.status !== "تم التنفيذ") actionsHtml += `<button class="success" data-action="done" data-id="${request.id}">${t("تم التنفيذ")}</button>`;
  if (canDelete) actionsHtml += `<button class="danger" data-action="delete" data-id="${request.id}">حذف الطلب</button>`;
  if (canRemind) actionsHtml += `<button class="ghost" data-action="remind" data-id="${request.id}">تذكير بالتأخير</button>`;

  const doneUploadHtml = canChangeStatus ? `
    <div class="done-box">
      <label>${t("صور الإنجاز")}</label>
      <input id="doneImages-${request.id}" type="file" accept="image/*" multiple>
      <button data-action="uploadDoneImages" data-id="${request.id}">${t("رفع صور الإنجاز")}</button>
    </div>` : "";

  const workerMediaHtml = canChangeStatus ? `
    <div class="done-box">
      <label>${t("شرح العاديل بالصوت")}</label>
      <div class="voice-box">
        <button type="button" class="ghost" data-action="workerStartAudio" data-id="${request.id}">${t("بدء تسجيل صوت العاديل 🎙️")}</button>
        <button type="button" class="ghost hidden" data-action="workerStopAudio" data-id="${request.id}">${t("إيقاف التسجيل ⏹️")}</button>
        <audio id="workerAudioPreview-${request.id}" controls class="hidden"></audio>
      </div>
      <label>${t("فيديو شرح العاديل")}</label>
      <input id="workerVideo-${request.id}" type="file" accept="video/*">
      <button type="button" data-action="workerSaveMedia" data-id="${request.id}">${t("حفظ صوت/فيديو العاديل")}</button>
      <p class="muted small">الفيديو يجب أن يكون قصيرًا.</p>
    </div>` : "";

  return `
    <article class="request-card ${priorityCardClass}">
      <div class="request-top">
        <div>
          <div class="request-title">${escapeHtml(request.title || "طلب صيانة")}</div>
          <div class="meta">${t("المرسل")}: ${escapeHtml(request.createdBy || "غير معروف")}</div>
        </div>
        <div class="badges">
          <span class="badge ${priorityBadgeClass}">${escapeHtml(t(request.priority || "عادي"))}</span>
          <span class="badge ${statusBadgeClass}">${escapeHtml(t(request.status || "جديد"))}</span>
        </div>
      </div>
      <div class="description">${escapeHtml(request.description || "")}</div>
      ${imagesHtml ? `<strong>${t("صور المشكلة")}</strong><div class="images">${imagesHtml}</div>` : ""}
      ${videoHtml}
      ${audioHtml}
      ${doneImagesHtml ? `<strong>${t("صور الإنجاز")}</strong><div class="images">${doneImagesHtml}</div>` : ""}
      ${workerAudioHtml}
      ${workerVideoHtml}
      ${doneUploadHtml}
      ${workerMediaHtml}
      <div class="actions">${actionsHtml}</div>
      <div class="comments">${commentsHtml}</div>
    </article>`;
}

async function handleAction(event) {
  const action = event.currentTarget.getAttribute("data-action");
  const id = event.currentTarget.getAttribute("data-id");
  const requestDoc = doc(db, "requests", id);

  try {
    if (action === "workerStartAudio") {
      await workerStartAudio(id, event.currentTarget);
      return;
    }
    if (action === "workerStopAudio") {
      workerStopAudio(id, event.currentTarget);
      return;
    }
    if (action === "workerSaveMedia") {
      await workerSaveMedia(id);
      return;
    }
    if (action === "progress") {
      if (currentRole !== "worker" && currentRole !== "admin") return;
      await updateDoc(requestDoc, { status: "قيد التنفيذ", comments: arrayUnion({ by: currentUser, text: "تم تغيير الحالة إلى قيد التنفيذ", at: new Date().toISOString() }) });
      await addNotification(`${currentUser} غيّر حالة طلب إلى قيد التنفيذ`);
    }
    if (action === "done") {
      if (currentRole !== "worker" && currentRole !== "admin") return;
      await updateDoc(requestDoc, { status: "تم التنفيذ", comments: arrayUnion({ by: currentUser, text: "تم تغيير الحالة إلى تم التنفيذ", at: new Date().toISOString() }) });
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
      await updateDoc(requestDoc, { comments: arrayUnion({ by: currentUser, text: "تذكير: الطلب متأخر", at: new Date().toISOString() }) });
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
      await updateDoc(requestDoc, { doneImages, status: "تم التنفيذ", comments: arrayUnion({ by: currentUser, text: "تم رفع صور الإنجاز", at: new Date().toISOString() }) });
      await addNotification(`${currentUser} رفع صور الإنجاز`);
      alert("تم رفع صور الإنجاز ✅");
    }
  } catch (error) {
    console.error(error);
    alert("حدث خطأ. جرّب مرة ثانية.");
  }
}

async function workerStartAudio(requestId, startButton) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const recorder = makeRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size > 2000000) {
        alert("التسجيل طويل. سجل صوت أقصر.");
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      workerAudioStore[requestId] = await blobToBase64(blob);
      const preview = $(`workerAudioPreview-${requestId}`);
      if (preview) {
        preview.src = workerAudioStore[requestId];
        preview.classList.remove("hidden");
      }
      stream.getTracks().forEach(t => t.stop());
    };
    workerAudioStore[requestId + "_recorder"] = recorder;
    recorder.start();
    startButton.classList.add("hidden");
    const stopButton = document.querySelector(`[data-action="workerStopAudio"][data-id="${requestId}"]`);
    if (stopButton) stopButton.classList.remove("hidden");
  } catch (e) {
    alert("لم يتم السماح بالمايكروفون");
  }
}

function workerStopAudio(requestId, stopButton) {
  const recorder = workerAudioStore[requestId + "_recorder"];
  if (recorder && recorder.state !== "inactive") recorder.stop();
  stopButton.classList.add("hidden");
  const startButton = document.querySelector(`[data-action="workerStartAudio"][data-id="${requestId}"]`);
  if (startButton) startButton.classList.remove("hidden");
}

async function workerSaveMedia(requestId) {
  const requestDoc = doc(db, "requests", requestId);
  const videoInput = $(`workerVideo-${requestId}`);
  const workerVideo = await fileToBase64Limited(videoInput?.files?.[0], 3000000);
  const workerAudio = workerAudioStore[requestId] || "";

  if (!workerAudio && !workerVideo) {
    alert("سجل صوت أو اختر فيديو أولاً");
    return;
  }

  const updateData = {
    comments: arrayUnion({ by: currentUser, text: "أضاف العاديل شرح صوتي/فيديو للإنجاز", at: new Date().toISOString() })
  };
  if (workerAudio) updateData.workerAudio = workerAudio;
  if (workerVideo) updateData.workerVideo = workerVideo;

  await updateDoc(requestDoc, updateData);
  await addNotification(`${currentUser} أضاف شرح صوتي/فيديو للإنجاز`);
  alert("تم حفظ صوت/فيديو العاديل ✅");
}

async function addNotification(text) {
  try {
    await addDoc(notificationsRef, { text, by: currentUser || "النظام", createdAt: serverTimestamp() });
  } catch (error) {
    console.error(error);
  }
}

function renderNotifications(notifications) {
  if (!notifications.length) {
    $("notificationsList").innerHTML = `<p class="muted">لا توجد إشعارات.</p>`;
    return;
  }
  $("notificationsList").innerHTML = notifications.map((item) => `<div class="notification">${escapeHtml(item.text || "")}</div>`).join("");
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
