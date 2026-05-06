import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, arrayUnion, getDocs, where
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

let currentUser = "";
let currentRole = "member";
let requestAudio = "";
let recorder = null;
let chunks = [];
let workerAudio = {};
let latestNotificationId = "";

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
  $("closeModalBtn").addEventListener("click", closeImage);
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
  if (role === "worker" && (name !== "هارون" || pass !== "1111")) return alert("بيانات العامل غير صحيحة");

  currentUser = name;
  currentRole = role;
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("currentUser").textContent = currentUser;
  $("roleBadge").textContent = roleLabel(role);

  if (role === "worker") {
    $("newRequestCard").classList.add("hidden");
    $("workerPashtoNotice").classList.remove("hidden");
    $("pageTitle").textContent = "مینٹیننس درخواستیں";
    $("pageSubtitle").textContent = "کاریگر کا صفحہ";
    $("requestsTitle").textContent = "درخواستیں";
  }

  listenRequests();
  listenNotifications();
}

function roleLabel(role) {
  if (role === "admin") return "مسؤول 👑";
  if (role === "worker") return "کارګر 🛠️";
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
    chunks = [];
    recorder = makeRecorder(stream);
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size > 1800000) {
        alert("التسجيل طويل، خله أقصر.");
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      requestAudio = await blobToBase64(blob);
      $("audioPreview").src = requestAudio;
      $("audioPreview").classList.remove("hidden");
      stream.getTracks().forEach(t => t.stop());
    };
    recorder.start();
    $("recordBtn").classList.add("hidden");
    $("stopRecordBtn").classList.remove("hidden");
  } catch {
    alert("لم يتم السماح بالمايكروفون");
  }
}

function stopRequestAudio() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
  $("stopRecordBtn").classList.add("hidden");
  $("recordBtn").classList.remove("hidden");
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function fileToBase64(file, maxBytes = 2500000) {
  if (!file) return "";
  if (file.size > maxBytes) {
    alert("حجم الملف كبير، اختصر الفيديو أو قلل الجودة.");
    return "";
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}


async function fileToBase64Raw(file) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function saveVideoChunks(requestId, kind, file) {
  const base64 = await fileToBase64Raw(file);
  const chunkSize = 750000;
  const total = Math.ceil(base64.length / chunkSize);

  for (let i = 0; i < total; i++) {
    await addDoc(collection(db, "mediaChunks"), {
      requestId,
      kind,
      index: i,
      total,
      data: base64.slice(i * chunkSize, (i + 1) * chunkSize),
      createdAt: serverTimestamp()
    });
  }

  return `CHUNKED:${kind}:${total}`;
}

async function loadVideoChunks(requestId, kind, targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;

  target.innerHTML = "<p class='muted'>جاري تحميل الفيديو...</p>";

  const q = query(
    collection(db, "mediaChunks"),
    where("requestId", "==", requestId),
    where("kind", "==", kind)
  );

  const snap = await getDocs(q);
  const chunks = [];
  snap.forEach(d => chunks.push(d.data()));
  chunks.sort((a, b) => a.index - b.index);

  if (!chunks.length) {
    target.innerHTML = "<p class='muted'>تعذر تحميل الفيديو.</p>";
    return;
  }

  const videoBase64 = chunks.map(c => c.data).join("");
  target.innerHTML = `<video src="${videoBase64}" controls></video>`;
}

async function compressImage(file, maxWidth = 520, quality = 0.45) {
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
  const files = Array.from(input.files || []).slice(0, 3);
  const arr = [];
  for (const file of files) {
    if (file.type.startsWith("image/")) arr.push(await compressImage(file));
  }
  return arr;
}

async function sendRequest() {
  const title = $("titleInput").value.trim();
  const description = $("descriptionInput").value.trim();
  const priority = $("priorityInput").value;
  if (!title || !description) return alert("اكتب العنوان والوصف");

  $("sendBtn").disabled = true;
  $("sendBtn").textContent = "جاري الإرسال...";

  try {
    const images = await imageFilesToBase64($("imagesInput"));
    const video = await fileToBase64($("videoInput").files[0], 2500000);

    await addDoc(requestsRef, {
      title, description, priority,
      status: "جديد",
      createdBy: currentUser,
      createdAt: serverTimestamp(),
      images, video, audio: requestAudio,
      doneImages: [],
      workerAudio: "",
      workerVideo: "",
      comments: [{ by: currentUser, text: "تم إنشاء الطلب", at: new Date().toISOString() }]
    });

    await addNotification(`طلب جديد من ${currentUser}: ${title}`);
    resetForm();
    alert("تم إرسال الطلب ✅");
  } catch (e) {
    console.error(e);
    alert("حدث خطأ أثناء الإرسال. جرّب بدون فيديو أو بصورة واحدة.");
  }

  $("sendBtn").disabled = false;
  $("sendBtn").textContent = "إرسال الطلب";
}

function resetForm() {
  $("titleInput").value = "";
  $("descriptionInput").value = "";
  $("priorityInput").value = "عادي";
  $("imagesInput").value = "";
  $("videoInput").value = "";
  requestAudio = "";
  $("audioPreview").src = "";
  $("audioPreview").classList.add("hidden");
}

function listenRequests() {
  const q = query(requestsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    const data = [];
    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
    renderRequests(data);
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
    $("notificationsList").innerHTML = data.slice(0, 20).map(n => `<div class="notification">${escape(n.text || "")}</div>`).join("") || "<p class='muted'>لا توجد إشعارات.</p>";
    if (data[0] && data[0].id !== latestNotificationId) {
      latestNotificationId = data[0].id;
      browserNotify(data[0].text || "تحديث جديد");
    }
  });
}

function pt(text) {
  if (currentRole !== "worker") return text;
  const map = {
    "المرسل": "بھیجنے والا",
    "صور المشكلة": "مسئلہ کی تصاویر",
    "فيديو المشكلة": "مسئلہ کی ویڈیو",
    "تسجيل صوتي": "آواز کی ریکارڈنگ",
    "صور الإنجاز": "کام مکمل ہونے کی تصاویر",
    "شرح العامل بالصوت": "کاریگر کی آواز میں وضاحت",
    "فيديو شرح العامل": "کاریگر کی ویڈیو وضاحت",
    "قيد التنفيذ": "کام جاری ہے",
    "تم التنفيذ": "کام مکمل ہوگیا",
    "رفع صور الإنجاز": "مکمل کام کی تصاویر اپلوڈ کریں",
    "بدء تسجيل صوت العامل 🎙️": "کاریگر کی آواز ریکارڈ شروع کریں 🎙️",
    "إيقاف التسجيل ⏹️": "ریکارڈنگ بند کریں ⏹️",
    "حفظ صوت/فيديو العامل": "کاریگر کی آواز/ویڈیو محفوظ کریں",
    "جديد": "نئی",
    "عادي": "عادي",
    "مهم": "مهم",
    "مستعجل": "فوری",
    "لا توجد طلبات حالياً.": "فی الحال کوئی درخواست نہیں۔"
  };
  return map[text] || text;
}

function renderRequests(requests) {
  if (!requests.length) {
    $("requestsList").innerHTML = `<p class="muted">${pt("لا توجد طلبات حالياً.")}</p>`;
    return;
  }

  $("requestsList").innerHTML = requests.map(r => requestHTML(r)).join("");

  document.querySelectorAll("[data-action]").forEach(btn => btn.addEventListener("click", handleAction));
  document.querySelectorAll("[data-img]").forEach(img => img.addEventListener("click", () => openImage(img.dataset.img)));
}

function requestHTML(r) {
  const priorityClass = r.priority === "مستعجل" ? "priority-urgent" : r.priority === "مهم" ? "priority-important" : "";
  const priorityTag = r.priority === "مستعجل" ? "tag-urgent" : r.priority === "مهم" ? "tag-important" : "tag-normal";
  const statusTag = r.status === "تم التنفيذ" ? "tag-done" : r.status === "قيد التنفيذ" ? "tag-progress" : "tag-new";

  const images = (r.images || []).map(src => `<img src="${src}" data-img="${src}">`).join("");
  const doneImages = (r.doneImages || []).map(src => `<img src="${src}" data-img="${src}">`).join("");

  const canWork = currentRole === "worker" || currentRole === "admin";
  const canDelete = currentRole === "admin";
  const canRemind = currentRole === "member";

  return `
    <article class="request ${priorityClass}">
      <div class="request-head">
        <div>
          <div class="request-title">${escape(r.title || "طلب")}</div>
          <div class="meta">${pt("المرسل")}: ${escape(r.createdBy || "")}</div>
        </div>
        <div class="tags">
          <span class="tag ${priorityTag}">${escape(pt(r.priority || "عادي"))}</span>
          <span class="tag ${statusTag}">${escape(pt(r.status || "جديد"))}</span>
        </div>
      </div>

      <div class="desc">${escape(r.description || "")}</div>

      ${images ? `<b>${pt("صور المشكلة")}</b><div class="images">${images}</div>` : ""}
      ${r.video ? `<b>${pt("فيديو المشكلة")}</b><video src="${r.video}" controls></video>` : ""}
      ${r.audio ? `<b>${pt("تسجيل صوتي")}</b><audio src="${r.audio}" controls preload="metadata"></audio>` : ""}

      ${doneImages ? `<b>${pt("صور الإنجاز")}</b><div class="images">${doneImages}</div>` : ""}
      ${r.workerAudio ? `<b>${pt("شرح العامل بالصوت")}</b><audio src="${r.workerAudio}" controls preload="metadata"></audio>` : ""}
      ${r.workerVideo ? `<b>${pt("فيديو شرح العامل")}</b><video src="${r.workerVideo}" controls></video>` : ""}

      ${canWork ? workerTools(r.id) : ""}

      <div class="actions">
        ${canWork && r.status !== "قيد التنفيذ" ? `<button class="warning" data-action="progress" data-id="${r.id}">${pt("قيد التنفيذ")}</button>` : ""}
        ${canWork && r.status !== "تم التنفيذ" ? `<button class="success" data-action="done" data-id="${r.id}">${pt("تم التنفيذ")}</button>` : ""}
        ${canDelete ? `<button class="danger" data-action="delete" data-id="${r.id}">حذف الطلب</button>` : ""}
        ${canRemind ? `<button class="secondary" data-action="remind" data-id="${r.id}">تذكير بالتأخير</button>` : ""}
      </div>
    </article>
  `;
}

function workerTools(id) {
  return `
    <div class="action-box">
      <label>${pt("صور الإنجاز")}</label>
      <input id="doneImages-${id}" type="file" accept="image/*" multiple>
      <button type="button" data-action="saveDoneImages" data-id="${id}">${pt("رفع صور الإنجاز")}</button>

      <label>${pt("شرح العامل بالصوت")}</label>
      <button type="button" class="secondary" data-action="startWorkerAudio" data-id="${id}">${pt("بدء تسجيل صوت العامل 🎙️")}</button>
      <button type="button" class="secondary hidden" data-action="stopWorkerAudio" data-id="${id}">${pt("إيقاف التسجيل ⏹️")}</button>
      <audio id="workerAudioPreview-${id}" controls class="hidden"></audio>

      <label>${pt("فيديو شرح العامل")}</label>
      <input id="workerVideo-${id}" type="file" accept="video/*">
      <button type="button" data-action="saveWorkerMedia" data-id="${id}">${pt("حفظ صوت/فيديو العامل")}</button>
      <p class="hint">الفيديو يجب أن يكون قصيرًا جدًا.</p>
    </div>
  `;
}

async function handleAction(e) {
  const action = e.currentTarget.dataset.action;
  const id = e.currentTarget.dataset.id;
  const ref = doc(db, "requests", id);

  try {
    if (action === "progress") {
      await updateDoc(ref, { status: "قيد التنفيذ", comments: arrayUnion(comment("تم تغيير الحالة إلى قيد التنفيذ")) });
      await addNotification(`${currentUser} غيّر الحالة إلى قيد التنفيذ`);
    }
    if (action === "done") {
      await updateDoc(ref, { status: "تم التنفيذ", comments: arrayUnion(comment("تم تغيير الحالة إلى تم التنفيذ")) });
      await addNotification(`${currentUser} أنهى طلب صيانة`);
    }
    if (action === "delete") {
      if (confirm("حذف الطلب؟")) await deleteDoc(ref);
    }
    if (action === "remind") {
      await updateDoc(ref, { comments: arrayUnion(comment("تذكير: الطلب متأخر")) });
      await addNotification(`${currentUser} أرسل تذكير بالتأخير`);
      alert("تم إرسال التذكير");
    }
    if (action === "saveDoneImages") {
      const imgs = await imageFilesToBase64($(`doneImages-${id}`));
      if (!imgs.length) return alert("اختر صورة أولاً");
      await updateDoc(ref, { doneImages: imgs, status: "تم التنفيذ", comments: arrayUnion(comment("تم رفع صور الإنجاز")) });
      await addNotification(`${currentUser} رفع صور الإنجاز`);
      alert("تم حفظ الصور");
    }
    if (action === "startWorkerAudio") await startWorkerAudio(id, e.currentTarget);
    if (action === "stopWorkerAudio") stopWorkerAudio(id, e.currentTarget);
    if (action === "saveWorkerMedia") await saveWorkerMedia(id);
    if (action === "loadWorkerVideo") await loadVideoChunks(id, "workerVideo", `workerVideoBox-${id}`);
  } catch (err) {
    console.error(err);
    alert("حدث خطأ، جرّب ملف أصغر أو أعد المحاولة.");
  }
}

function comment(text) {
  return { by: currentUser, text, at: new Date().toISOString() };
}

async function startWorkerAudio(id, startBtn) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const localChunks = [];
    const rec = makeRecorder(stream);
    rec.ondataavailable = e => { if (e.data?.size) localChunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(localChunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size > 1800000) {
        alert("التسجيل طويل، خله أقصر.");
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      workerAudio[id] = await blobToBase64(blob);
      const preview = $(`workerAudioPreview-${id}`);
      preview.src = workerAudio[id];
      preview.classList.remove("hidden");
      stream.getTracks().forEach(t => t.stop());
    };
    workerAudio[id + "_rec"] = rec;
    rec.start();
    startBtn.classList.add("hidden");
    document.querySelector(`[data-action="stopWorkerAudio"][data-id="${id}"]`)?.classList.remove("hidden");
  } catch {
    alert("لم يتم السماح بالمايكروفون");
  }
}

function stopWorkerAudio(id, stopBtn) {
  const rec = workerAudio[id + "_rec"];
  if (rec && rec.state !== "inactive") rec.stop();
  stopBtn.classList.add("hidden");
  document.querySelector(`[data-action="startWorkerAudio"][data-id="${id}"]`)?.classList.remove("hidden");
}

async function saveWorkerMedia(id) {
  const ref = doc(db, "requests", id);
  const audio = workerAudio[id] || "";
  const file = $(`workerVideo-${id}`).files[0];

  let video = "";
  if (file) {
    if (file.size <= 700000) {
      video = await fileToBase64Raw(file);
    } else {
      video = await saveVideoChunks(id, "workerVideo", file);
    }
  }

  if (!audio && !video) return alert("سجل صوت أو اختر فيديو أولاً");

  const data = { comments: arrayUnion(comment("أضاف العامل شرح صوتي/فيديو")) };
  if (audio) data.workerAudio = audio;
  if (video) data.workerVideo = video;
  await updateDoc(ref, data);
  await addNotification(`${currentUser} أضاف شرح صوتي/فيديو`);
  alert("تم حفظ شرح العامل");
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

function escape(v) {
  return String(v || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
