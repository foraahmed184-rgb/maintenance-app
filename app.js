import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, arrayUnion, getDocs, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const mediaRef = collection(db, "mediaChunks");

let currentUser = "";
let currentRole = "member";
let latestNotificationId = "";
let allRequests = [];
let requestAudios = [];
let pendingRequestAudio = "";
let requestRecorder = null;
let requestChunks = [];
let workerAudios = {};
let pendingWorkerAudios = {};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("loginRole").addEventListener("change", togglePassword);
  $("loginBtn").addEventListener("click", login);
  $("logoutBtn").addEventListener("click", logout);
  $("notifyBtn").addEventListener("click", askNotifications);
  $("refreshBtn").addEventListener("click", () => location.reload());
  $("sendBtn").addEventListener("click", sendRequest);
  $("recordBtn").addEventListener("click", startRequestAudio);
  $("stopRecordBtn").addEventListener("click", stopRequestAudio);
  $("sendAudioBtn").addEventListener("click", sendRequestAudio);
  $("closeModalBtn").addEventListener("click", closeImage);
  $("locationFilter").addEventListener("change", () => renderRequests(allRequests));
  $("statusFilter").addEventListener("change", () => renderRequests(allRequests));
  togglePassword();
});

function togglePassword() {
  const role = $("loginRole").value;
  $("passwordBox").classList.toggle("hidden", role === "member");
  if (role === "member") $("loginPassword").value = "";
}

function login() {
  const name = $("loginName").value.trim();
  const role = $("loginRole").value;
  const pass = $("loginPassword").value.trim();
  if (!name) return alert("اكتب اسم المستخدم");
  if (role === "admin" && (name !== "Ahmed" || pass !== "2006")) return alert("بيانات المسؤول غير صحيحة");
  if (role === "worker" && (name !== "Haroon" || pass !== "Ha")) return alert("بيانات العامل غير صحيحة");
  currentUser = name;
  currentRole = role;
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("currentUser").textContent = currentUser;
  $("roleBadge").textContent = roleLabel(role);
  if (role === "worker") {
    $("newRequestCard").classList.add("hidden");
    $("workerUrduNotice").classList.remove("hidden");
    $("appTitle").textContent = "مینٹیننس درخواستیں";
    $("appSubtitle").textContent = "کاریگر کا صفحہ";
    $("requestsTitle").textContent = "درخواستیں";
  }
  listenRequests();
  listenNotifications();
}

function roleLabel(role) {
  if (role === "admin") return "مسؤول 👑";
  if (role === "worker") return "کاریگر 🛠️";
  return "عضو فريق 👥";
}

function logout() { location.reload(); }

async function askNotifications() {
  if (!("Notification" in window)) return alert("المتصفح لا يدعم الإشعارات");
  const p = await Notification.requestPermission();
  alert(p === "granted" ? "تم تفعيل الإشعارات" : "لم يتم السماح بالإشعارات");
}

function browserNotify(text) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("نظام الصيانة", { body: text });
  }
}

function makeRecorder(stream) {
  let options = {};
  if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) options.mimeType = "audio/webm;codecs=opus";
    else if (MediaRecorder.isTypeSupported("audio/webm")) options.mimeType = "audio/webm";
    else if (MediaRecorder.isTypeSupported("audio/mp4")) options.mimeType = "audio/mp4";
  }
  return new MediaRecorder(stream, options);
}

async function startRequestAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    requestChunks = [];
    requestRecorder = makeRecorder(stream);
    requestRecorder.ondataavailable = e => { if (e.data && e.data.size) requestChunks.push(e.data); };
    requestRecorder.onstop = async () => {
      const blob = new Blob(requestChunks, { type: requestRecorder.mimeType || "audio/webm" });
      const data = await blobToBase64(blob);
      pendingRequestAudio = data;
      $("requestAudioPreviews").innerHTML = `<div class="audio-item"><audio src="${data}" controls preload="auto"></audio><p class="hint">اضغط إرسال الصوت لإضافته للطلب</p></div>`;
      $("requestAudioPreviews").querySelectorAll("audio").forEach(a => a.load());
      $("sendAudioBtn").classList.remove("hidden");
      stream.getTracks().forEach(t => t.stop());
    };
    requestRecorder.start();
    $("recordBtn").classList.add("hidden");
    $("stopRecordBtn").classList.remove("hidden");
  } catch {
    alert("لم يتم السماح بالمايكروفون");
  }
}

function stopRequestAudio() {
  if (requestRecorder && requestRecorder.state !== "inactive") requestRecorder.stop();
  $("stopRecordBtn").classList.add("hidden");
  $("recordBtn").classList.remove("hidden");
}


function sendRequestAudio() {
  if (!pendingRequestAudio) {
    alert("سجل صوت أولاً");
    return;
  }
  requestAudios.push(pendingRequestAudio);
  pendingRequestAudio = "";
  $("sendAudioBtn").classList.add("hidden");
  renderRequestAudioPreviews();
}

function deleteRequestAudio(index) {
  requestAudios.splice(index, 1);
  renderRequestAudioPreviews();
}

function renderRequestAudioPreviews() {
  $("requestAudioPreviews").innerHTML = requestAudios.map((src, index) => `
    <div class="audio-item">
      <audio src="${src}" controls preload="auto"></audio>
      <button type="button" class="danger" onclick="deleteRequestAudio(${index})">حذف الصوت</button>
    </div>
  `).join("");
  $("requestAudioPreviews").querySelectorAll("audio").forEach(a => a.load());
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function fileToBase64(file) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function compressImage(file, maxWidth = 650, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function imageFilesToBase64(input) {
  const files = Array.from(input.files || []);
  const arr = [];
  for (const file of files) {
    if (file.type.startsWith("image/")) arr.push(await compressImage(file));
  }
  return arr;
}

async function saveMediaChunks(requestId, kind, data) {
  const chunkSize = 700000;
  const total = Math.ceil(data.length / chunkSize);
  for (let i = 0; i < total; i++) {
    await addDoc(mediaRef, {
      requestId,
      kind,
      index: i,
      total,
      data: data.slice(i * chunkSize, (i + 1) * chunkSize),
      createdAt: serverTimestamp()
    });
  }
}

async function saveFilesAsRefs(requestId, files, baseKind) {
  const refs = [];
  const list = Array.from(files || []);
  for (let i = 0; i < list.length; i++) {
    const kind = `${baseKind}_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`;
    const data = await fileToBase64(list[i]);
    await saveMediaChunks(requestId, kind, data);
    refs.push({ kind, name: list[i].name || kind });
  }
  return refs;
}

async function saveAudioDataAsRefs(requestId, audios, baseKind) {
  const refs = [];
  for (let i = 0; i < audios.length; i++) {
    const kind = `${baseKind}_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`;
    await saveMediaChunks(requestId, kind, audios[i]);
    refs.push({ kind, name: `${baseKind}-${i}` });
  }
  return refs;
}

async function loadMedia(requestId, kind, targetId, type) {
  const target = $(targetId);
  if (!target) return;
  target.innerHTML = "<p class='muted'>جاري تحميل الملف...</p>";
  const q = query(mediaRef, where("requestId", "==", requestId), where("kind", "==", kind));
  const snap = await getDocs(q);
  const chunks = [];
  snap.forEach(d => chunks.push(d.data()));
  chunks.sort((a,b) => a.index - b.index);
  if (!chunks.length) {
    target.innerHTML = "<p class='muted'>تعذر تحميل الملف.</p>";
    return;
  }
  const data = chunks.map(c => c.data).join("");
  if (type === "audio") {
    target.innerHTML = `<audio src="${data}" controls preload="auto"></audio>`;
    const audio = target.querySelector("audio");
    if (audio) audio.load();
  } else {
    target.innerHTML = `<video src="${data}" controls preload="metadata"></video>`;
    const video = target.querySelector("video");
    if (video) video.load();
  }
}

async function sendRequest() {
  const title = $("titleInput").value.trim();
  const description = $("descriptionInput").value.trim();
  const priority = $("priorityInput").value;
  const location = $("locationInput").value;
  if (!title || !description) return alert("اكتب العنوان والوصف");
  if (!location) return alert("اختر الموقع");
  $("sendBtn").disabled = true;
  $("sendBtn").textContent = "جاري الإرسال...";
  try {
    const images = await imageFilesToBase64($("imagesInput"));
    const docRef = await addDoc(requestsRef, {
      title, description, priority, location,
      status: "جديد",
      createdBy: currentUser,
      createdAt: serverTimestamp(),
      images,
      requestVideos: [],
      requestAudios: [],
      doneImages: [],
      workerAudios: [],
      workerVideos: [],
      comments: [{ by: currentUser, text: "تم إنشاء الطلب", at: new Date().toISOString() }]
    });
    const requestVideos = await saveFilesAsRefs(docRef.id, $("videosInput").files, "requestVideo");
    const requestAudiosRefs = await saveAudioDataAsRefs(docRef.id, requestAudios, "requestAudio");
    await updateDoc(docRef, { requestVideos, requestAudios: requestAudiosRefs });
    await addNotification(`طلب جديد من ${currentUser}: ${title}`);
    resetForm();
    alert("تم إرسال الطلب ✅");
  } catch (e) {
    console.error(e);
    alert("حدث خطأ أثناء الإرسال. جرّب عدد ملفات أقل أو فيديو أقصر.");
  }
  $("sendBtn").disabled = false;
  $("sendBtn").textContent = "إرسال الطلب";
}

function resetForm() {
  $("titleInput").value = "";
  $("descriptionInput").value = "";
  $("priorityInput").value = "عادي";
  $("locationInput").value = "";
  $("imagesInput").value = "";
  $("videosInput").value = "";
  requestAudios = [];
  pendingRequestAudio = "";
  $("sendAudioBtn").classList.add("hidden");
  $("requestAudioPreviews").innerHTML = "";
}

function listenRequests() {
  const q = query(requestsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    allRequests = [];
    snap.forEach(d => allRequests.push({ id: d.id, ...d.data() }));
    renderRequests(allRequests);
  }, err => {
    console.error(err);
    $("requestsList").innerHTML = "<p class='muted'>تعذر تحميل الطلبات.</p>";
  });
}

function listenNotifications() {
  const q = query(notificationsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    const data = [];
    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
    $("notificationsList").innerHTML = data.slice(0, 20).map(n => `<div class="notification">${escapeHtml(n.text || "")}</div>`).join("") || "<p class='muted'>لا توجد إشعارات.</p>";
    if (data[0] && data[0].id !== latestNotificationId) {
      latestNotificationId = data[0].id;
      browserNotify(data[0].text || "تحديث جديد");
    }
  });
}

function tr(text) {
  if (currentRole !== "worker") return text;
  const map = {
    "المرسل": "بھیجنے والا",
    "صور المشكلة": "مسئلہ کی تصاویر",
    "فيديوهات الطلب": "درخواست کی ویڈیوز",
    "تسجيلات الطلب": "درخواست کی آوازیں",
    "صور الإنجاز": "کام مکمل ہونے کی تصاویر",
    "تسجيلات العامل": "کاریگر کی آوازیں",
    "فيديوهات العامل": "کاریگر کی ویڈیوز",
    "قيد التنفيذ": "کام جاری ہے",
    "تم التنفيذ": "کام مکمل ہوگیا",
    "رفع صور الإنجاز": "مکمل کام کی تصاویر اپلوڈ کریں",
    "بدء تسجيل صوت العامل 🎙️": "کاریگر کی آواز ریکارڈ شروع کریں 🎙️",
    "إيقاف التسجيل ⏹️": "ریکارڈنگ بند کریں ⏹️",
    "حفظ صوت/فيديو العامل": "کاریگر کی آواز/ویڈیو محفوظ کریں",
    "جديد": "نئی",
    "عادي": "عام",
    "مهم": "اہم",
    "مستعجل": "فوری",
    "لا توجد طلبات حالياً.": "فی الحال کوئی درخواست نہیں۔",
    "الموقع": "مقام",
    "غير محدد": "متعین نہیں",
    "فلتر الموقع": "مقام فلٹر",
    "فلتر حالة الطلب": "درخواست کی حالت فلٹر",
    "كل المواقع": "تمام مقامات",
    "كل الحالات": "تمام حالتیں",
    "تحديث": "تازہ کریں",
    "حذف الطلب": "درخواست حذف کریں",
    "تعديل الطلب": "درخواست میں ترمیم",
    "تذكير بالتأخير": "تاخیر کی یاد دہانی",
    "الإشعارات داخل التطبيق": "ایپ کے اندر نوٹیفکیشن",
    "تم إنشاء الطلب": "درخواست بن گئی",
    "تم رفع صور الإنجاز": "کام مکمل ہونے کی تصاویر اپلوڈ ہوگئیں",
    "قام المسؤول بتعديل بيانات الطلب": "ایڈمن نے درخواست میں ترمیم کی",
    "السبعين": "السبعین",
    "العزيزية الكبيرة": "العزیزیہ الکبیرہ",
    "العزيزية الصغيرة": "العزیزیہ الصغیرہ",
    "السكن": "رہائش",
    "التضامن": "التضامن",
    "العروبة": "العروبہ",
    "المكرونة": "المکرونہ",
    "الاربعين": "الاربعین",
    "عمارة 5": "عمارت 5",
    "الاستقدام": "الاستقدام",
    "ابحر": "ابحر",
    "فيلا الصفا": "ویلا الصفا",
    "العزيزية تمليك": "العزیزیہ تملیک"
  };
  return map[text] || text;
}

function renderRequests(requests) {
  let shown = requests;
  if ($("locationFilter").value) shown = shown.filter(r => (r.location || "") === $("locationFilter").value);
  if ($("statusFilter").value) shown = shown.filter(r => (r.status || "") === $("statusFilter").value);
  if (!shown.length) {
    $("requestsList").innerHTML = `<p class="muted">${tr("لا توجد طلبات حالياً.")}</p>`;
    return;
  }
  $("requestsList").innerHTML = shown.map(requestHTML).join("");
  document.querySelectorAll("[data-action]").forEach(btn => btn.addEventListener("click", handleAction));
  document.querySelectorAll("[data-img]").forEach(img => img.addEventListener("click", () => openImage(img.dataset.img)));
}

function mediaButtons(items, requestId, baseId, label, type) {
  if (!items || !items.length) return "";
  return `<b>${tr(label)}</b><div class="media-grid">` + items.map((item, i) => {
    const target = `${baseId}-${requestId}-${i}`;
    const text = type === "audio" ? `تشغيل صوت ${i+1}` : `تشغيل فيديو ${i+1}`;
    return `<div id="${target}"><button type="button" class="secondary" data-action="${type === "audio" ? "loadAudio" : "loadVideo"}" data-id="${requestId}" data-kind="${item.kind}" data-target="${target}">${text}</button></div>`;
  }).join("") + `</div>`;
}

function requestHTML(r) {
  const priorityClass = r.priority === "مستعجل" ? "priority-urgent" : r.priority === "مهم" ? "priority-important" : "";
  const priorityTag = r.priority === "مستعجل" ? "tag-urgent" : r.priority === "مهم" ? "tag-important" : "tag-normal";
  const statusTag = r.status === "تم التنفيذ" ? "tag-done" : r.status === "قيد التنفيذ" ? "tag-progress" : "tag-new";
  const images = (r.images || []).map(src => `<img src="${src}" data-img="${src}" loading="lazy">`).join("");
  const doneImages = (r.doneImages || []).map(src => `<img src="${src}" data-img="${src}" loading="lazy">`).join("");
  const canWork = currentRole === "worker" || currentRole === "admin";
  const canDelete = currentRole === "admin";
  const canRemind = currentRole === "member";
  return `
    <article class="request ${priorityClass}">
      <div class="request-head">
        <div>
          <div class="request-title">${escapeHtml(r.title || "طلب")}</div>
          <div class="meta">${tr("المرسل")}: ${escapeHtml(r.createdBy || "")}</div>
          <div class="meta">${tr("الموقع")}: ${escapeHtml(tr(r.location || "غير محدد"))}</div>
        </div>
        <div class="tags">
          <span class="tag ${priorityTag}">${escapeHtml(tr(r.priority || "عادي"))}</span>
          <span class="tag ${statusTag}">${escapeHtml(tr(r.status || "جديد"))}</span>
        </div>
      </div>
      <div class="desc">${escapeHtml(r.description || "")}</div>
      ${images ? `<b>${tr("صور المشكلة")}</b><div class="images">${images}</div>` : ""}
      ${mediaButtons(r.requestVideos, r.id, "requestVideo", "فيديوهات الطلب", "video")}
      ${mediaButtons(r.requestAudios, r.id, "requestAudio", "تسجيلات الطلب", "audio")}
      ${doneImages ? `<b>${tr("صور الإنجاز")}</b><div class="images">${doneImages}</div>` : ""}
      ${mediaButtons(r.workerAudios, r.id, "workerAudio", "تسجيلات العامل", "audio")}
      ${mediaButtons(r.workerVideos, r.id, "workerVideo", "فيديوهات العامل", "video")}
      ${canWork ? workerTools(r.id) : ""}
      <div class="actions">
        ${canWork && r.status !== "قيد التنفيذ" ? `<button class="warning" data-action="progress" data-id="${r.id}">${tr("قيد التنفيذ")}</button>` : ""}
        ${canWork && r.status !== "تم التنفيذ" ? `<button class="success" data-action="done" data-id="${r.id}">${tr("تم التنفيذ")}</button>` : ""}
        ${canDelete ? `<button class="secondary" data-action="editRequest" data-id="${r.id}">تعديل الطلب</button>` : ""}
        ${canDelete ? `<button class="danger" data-action="delete" data-id="${r.id}">حذف الطلب</button>` : ""}
        ${canRemind ? `<button class="secondary" data-action="remind" data-id="${r.id}">تذكير بالتأخير</button>` : ""}
      </div>
    </article>`;
}

function workerTools(id) {
  return `
    <div class="action-box">
      <label>${tr("صور الإنجاز")}</label>
      <input id="doneImages-${id}" type="file" accept="image/*" multiple>
      <button type="button" data-action="saveDoneImages" data-id="${id}">${tr("رفع صور الإنجاز")}</button>
      <label>${tr("تسجيلات العامل")}</label>
      <button type="button" class="secondary" data-action="startWorkerAudio" data-id="${id}">${tr("بدء تسجيل صوت العامل 🎙️")}</button>
      <button type="button" class="secondary hidden" data-action="stopWorkerAudio" data-id="${id}">${tr("إيقاف التسجيل ⏹️")}</button>
      <button type="button" class="secondary hidden" data-action="sendWorkerAudio" data-id="${id}">${tr("إرسال الصوت")}</button>
      <div id="workerAudioPreviews-${id}" class="media-list"></div>
      <label>${tr("فيديوهات العامل")}</label>
      <input id="workerVideo-${id}" type="file" accept="video/*" multiple>
      <button type="button" data-action="saveWorkerMedia" data-id="${id}">${tr("حفظ صوت/فيديو العامل")}</button>
    </div>`;
}

async function handleAction(e) {
  const action = e.currentTarget.dataset.action;
  const id = e.currentTarget.dataset.id;
  const kind = e.currentTarget.dataset.kind;
  const target = e.currentTarget.dataset.target;
  const ref = doc(db, "requests", id);
  try {
    if (action === "loadAudio") return await loadMedia(id, kind, target, "audio");
    if (action === "loadVideo") return await loadMedia(id, kind, target, "video");
    if (action === "progress") {
      await updateDoc(ref, { status: "قيد التنفيذ", comments: arrayUnion(comment("تم تغيير الحالة إلى قيد التنفيذ")) });
      return await addNotification(`${currentUser} غيّر الحالة إلى قيد التنفيذ`);
    }
    if (action === "done") {
      await updateDoc(ref, { status: "تم التنفيذ", comments: arrayUnion(comment("تم تغيير الحالة إلى تم التنفيذ")) });
      return await addNotification(`${currentUser} أنهى طلب صيانة`);
    }
    if (action === "editRequest") {
      return openAdminEdit(id);
    }

    if (action === "delete") {
      if (confirm("حذف الطلب؟")) return await deleteDoc(ref);
    }
    if (action === "remind") {
      await updateDoc(ref, { comments: arrayUnion(comment("تذكير: الطلب متأخر")) });
      await addNotification(`${currentUser} أرسل تذكير بالتأخير`);
      return alert("تم إرسال التذكير");
    }
    if (action === "saveDoneImages") {
      const imgs = await imageFilesToBase64($(`doneImages-${id}`));
      if (!imgs.length) return alert("اختر صورة أولاً");
      await updateDoc(ref, { doneImages: arrayUnion(...imgs), status: "تم التنفيذ", comments: arrayUnion(comment("تم رفع صور الإنجاز")) });
      await addNotification(`${currentUser} رفع صور الإنجاز`);
      return alert("تم حفظ الصور");
    }
    if (action === "startWorkerAudio") return await startWorkerAudio(id, e.currentTarget);
    if (action === "stopWorkerAudio") return stopWorkerAudio(id, e.currentTarget);
    if (action === "sendWorkerAudio") return sendWorkerAudio(id);
    if (action === "saveWorkerMedia") return await saveWorkerMedia(id);
  } catch (err) {
    console.error(err);
    alert("حدث خطأ، جرّب عدد ملفات أقل أو أعد المحاولة.");
  }
}

function comment(text) {
  return { by: currentUser, text, at: new Date().toISOString() };
}

async function startWorkerAudio(id, startBtn) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const rec = makeRecorder(stream);
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const data = await blobToBase64(blob);
      pendingWorkerAudios[id] = data;
      const box = $(`workerAudioPreviews-${id}`);
      if (box) {
        box.innerHTML = `<div class="audio-item"><audio src="${data}" controls preload="auto"></audio><p class="hint">${tr("إرسال الصوت")}</p></div>`;
        box.querySelectorAll("audio").forEach(a => a.load());
      }
      document.querySelector(`[data-action="sendWorkerAudio"][data-id="${id}"]`)?.classList.remove("hidden");
      stream.getTracks().forEach(t => t.stop());
    };
    workerAudios[id + "_rec"] = rec;
    rec.start();
    startBtn.classList.add("hidden");
    document.querySelector(`[data-action="stopWorkerAudio"][data-id="${id}"]`)?.classList.remove("hidden");
  } catch {
    alert("لم يتم السماح بالمايكروفون");
  }
}

function stopWorkerAudio(id, stopBtn) {
  const rec = workerAudios[id + "_rec"];
  if (rec && rec.state !== "inactive") rec.stop();
  stopBtn.classList.add("hidden");
  document.querySelector(`[data-action="startWorkerAudio"][data-id="${id}"]`)?.classList.remove("hidden");
}


function sendWorkerAudio(id) {
  const audio = pendingWorkerAudios[id];
  if (!audio) {
    alert("لا يوجد تسجيل لإرساله");
    return;
  }
  if (!workerAudios[id]) workerAudios[id] = [];
  workerAudios[id].push(audio);
  pendingWorkerAudios[id] = "";
  document.querySelector(`[data-action="sendWorkerAudio"][data-id="${id}"]`)?.classList.add("hidden");
  renderWorkerAudioPreviews(id);
}

function deleteWorkerAudio(id, index) {
  if (!workerAudios[id]) return;
  workerAudios[id].splice(index, 1);
  renderWorkerAudioPreviews(id);
}

function renderWorkerAudioPreviews(id) {
  const box = $(`workerAudioPreviews-${id}`);
  if (!box) return;
  box.innerHTML = (workerAudios[id] || []).map((src, index) => `
    <div class="audio-item">
      <audio src="${src}" controls preload="auto"></audio>
      <button type="button" class="danger" onclick="deleteWorkerAudio('${id}', ${index})">${tr("حذف الصوت")}</button>
    </div>
  `).join("");
  box.querySelectorAll("audio").forEach(a => a.load());
}

window.deleteWorkerAudio = deleteWorkerAudio;

async function saveWorkerMedia(id) {
  const ref = doc(db, "requests", id);
  const audios = workerAudios[id] || [];
  const videos = Array.from($(`workerVideo-${id}`).files || []);
  if (!audios.length && !videos.length) return alert("سجل صوت أو اختر فيديو أولاً");
  const workerAudioRefs = await saveAudioDataAsRefs(id, audios, "workerAudio");
  const workerVideoRefs = await saveFilesAsRefs(id, videos, "workerVideo");
  const data = { comments: arrayUnion(comment("أضاف العامل شرح صوتي/فيديو")) };
  if (workerAudioRefs.length) data.workerAudios = arrayUnion(...workerAudioRefs);
  if (workerVideoRefs.length) data.workerVideos = arrayUnion(...workerVideoRefs);
  await updateDoc(ref, data);
  await addNotification(`${currentUser} أضاف شرح صوتي/فيديو`);
  workerAudios[id] = [];
  pendingWorkerAudios[id] = "";
  document.querySelector(`[data-action="sendWorkerAudio"][data-id="${id}"]`)?.classList.add("hidden");
  const box = $(`workerAudioPreviews-${id}`);
  if (box) box.innerHTML = "";
  const input = $(`workerVideo-${id}`);
  if (input) input.value = "";
  alert("تم حفظ شرح العامل");
}


async function openAdminEdit(id) {
  if (currentRole !== "admin") {
    alert("التعديل للمسؤول فقط");
    return;
  }

  const req = allRequests.find(item => item.id === id);
  if (!req) {
    alert("لم يتم العثور على الطلب");
    return;
  }

  const title = prompt("عنوان المشكلة:", req.title || "");
  if (title === null) return;

  const description = prompt("وصف المشكلة:", req.description || "");
  if (description === null) return;

  const priority = prompt("الأولوية: عادي / مهم / مستعجل", req.priority || "عادي");
  if (priority === null) return;
  if (!["عادي", "مهم", "مستعجل"].includes(priority.trim())) {
    alert("الأولوية غير صحيحة");
    return;
  }

  const location = prompt("الموقع:", req.location || "");
  if (location === null) return;
  if (!location.trim()) {
    alert("الموقع لا يمكن يكون فارغ");
    return;
  }

  const status = prompt("الحالة: جديد / قيد التنفيذ / تم التنفيذ", req.status || "جديد");
  if (status === null) return;
  if (!["جديد", "قيد التنفيذ", "تم التنفيذ"].includes(status.trim())) {
    alert("الحالة غير صحيحة");
    return;
  }

  await updateDoc(doc(db, "requests", id), {
    title: title.trim(),
    description: description.trim(),
    priority: priority.trim(),
    location: location.trim(),
    status: status.trim(),
    comments: arrayUnion(comment("قام المسؤول بتعديل بيانات الطلب"))
  });

  await addNotification(`${currentUser} عدل بيانات طلب صيانة`);
  alert("تم تعديل الطلب ✅");
}


async function addNotification(text) {
  await addDoc(notificationsRef, { text, by: currentUser || "النظام", createdAt: serverTimestamp() });
}

function openImage(src) {
  $("modalImage").src = src;
  $("imageModal").classList.remove("hidden");
}

function closeImage() {
  $("modalImage").src = "";
  $("imageModal").classList.add("hidden");
}

function escapeHtml(v) {
  return String(v || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
