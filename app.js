import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (id)=>document.getElementById(id);
const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PUT_");
let app, db, storage;
let currentUser = JSON.parse(localStorage.getItem("maintenance_user") || "null");
let requests = [];
let deferredPrompt = null;

if (!isConfigured) $("setupCard").classList.remove("hidden");
else {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
}

window.addEventListener("beforeinstallprompt", (e)=>{ e.preventDefault(); deferredPrompt = e; $("installBtn").classList.remove("hidden"); });
$("installBtn").onclick = async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; $("installBtn").classList.add("hidden"); }};

function initUser(){
  if(currentUser){
    $("loginCard").classList.add("hidden");
    $("mainContent").classList.remove("hidden");
    startListening();
  }
}
$("saveUserBtn").onclick = ()=>{
  const name = $("userName").value.trim();
  const role = $("userRole").value;
  if(!name) return alert("اكتب اسمك أولاً");
  currentUser = {name, role};
  localStorage.setItem("maintenance_user", JSON.stringify(currentUser));
  initUser();
};

for(const btn of document.querySelectorAll(".tab")){
  btn.onclick = ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
    btn.classList.add("active");
    $(btn.dataset.view).classList.remove("hidden");
  };
}

async function uploadFiles(files, folder){
  const urls = [];
  for(const file of files){
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    urls.push(await getDownloadURL(fileRef));
  }
  return urls;
}

$("requestForm").onsubmit = async(e)=>{
  e.preventDefault();
  if(!isConfigured) return alert("اربط Firebase أولاً");
  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true; submitBtn.textContent = "جاري الإرسال...";
  try{
    const imageUrls = await uploadFiles($("requestImages").files, "request-images");
    await addDoc(collection(db,"maintenance_requests"), {
      title: $("title").value.trim(), location: $("location").value.trim(), priority: $("priority").value,
      description: $("description").value.trim(), requester: currentUser.name, status: "جديد",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), images: imageUrls, doneImages: [],
      comments: [{by: currentUser.name, text: "تم إنشاء الطلب", at: new Date().toISOString()}]
    });
    e.target.reset(); alert("تم إرسال الطلب، وسيظهر للجميع داخل التطبيق");
  } catch(err){ alert("صار خطأ: " + err.message); }
  finally{ submitBtn.disabled=false; submitBtn.textContent="إرسال الطلب"; }
};

function startListening(){
  if(!isConfigured) return;
  const q = query(collection(db,"maintenance_requests"), orderBy("createdAt","desc"));
  onSnapshot(q, snap=>{
    requests = snap.docs.map(d=>({id:d.id, ...d.data()}));
    render();
  }, err=>alert("خطأ في قراءة الطلبات: " + err.message));
}

["statusFilter","priorityFilter","searchBox"].forEach(id=>$(id).addEventListener("input", render));
function statusClass(s){return s==="جديد"?"new":s==="قيد التنفيذ"?"progress":s==="تم التنفيذ"?"done":"cancel"}
function timeText(ts){try{return ts?.toDate ? ts.toDate().toLocaleString("ar-SA") : "الآن"}catch{return ""}}
function filtered(){
  const sf=$("statusFilter").value, pf=$("priorityFilter").value, text=$("searchBox").value.trim();
  return requests.filter(r=>(sf==="all"||r.status===sf)&&(pf==="all"||r.priority===pf)&&(!text||`${r.title} ${r.location} ${r.requester}`.includes(text)));
}
function card(r, workerMode=false){
  const div=document.createElement("article"); div.className="request";
  div.innerHTML=`
    <div class="requestTop"><div><h3>${esc(r.title)}</h3><p class="muted">${esc(r.description||"")}</p></div><span class="pill ${statusClass(r.status)}">${r.status}</span></div>
    <div class="meta"><span class="pill">الطالب: ${esc(r.requester||"")}</span><span class="pill">الموقع: ${esc(r.location||"")}</span><span class="pill ${r.priority==="عاجل"?"urgent":r.priority==="مهم"?"important":""}">${r.priority}</span><span class="pill">${timeText(r.createdAt)}</span></div>
    ${(r.images||[]).length?`<div class="images">${r.images.map(u=>`<img src="${u}" alt="صورة المشكلة">`).join("")}</div>`:""}
    ${(r.doneImages||[]).length?`<h4>صور الإنجاز</h4><div class="images">${r.doneImages.map(u=>`<img src="${u}" alt="صورة الإنجاز">`).join("")}</div>`:""}
    <div class="actions"><button data-open="${r.id}">فتح التفاصيل</button>${workerMode?workerActions(r):""}</div>`;
  div.querySelector("[data-open]").onclick=()=>openDetails(r.id);
  div.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>setStatus(r.id,b.dataset.status));
  return div;
}
function workerActions(r){
  return `<button class="warnBtn" data-status="قيد التنفيذ">قيد التنفيذ</button><button class="success" data-status="تم التنفيذ">تم التنفيذ</button><button class="danger" data-status="ملغي">إلغاء</button>`;
}
function render(){
  $("countBadge").textContent=requests.length;
  const list=$("requestList"); list.innerHTML=""; filtered().forEach(r=>list.appendChild(card(r,false)));
  if(!filtered().length) list.innerHTML='<div class="card muted">لا توجد طلبات حالياً</div>';
  const wl=$("workerList"); wl.innerHTML="";
  [...requests].sort((a,b)=>(prio(b.priority)-prio(a.priority)) || ((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))).forEach(r=>wl.appendChild(card(r,true)));
}
function prio(p){return p==="عاجل"?3:p==="مهم"?2:1}
async function setStatus(id,status){
  await updateDoc(doc(db,"maintenance_requests",id),{status,updatedAt:serverTimestamp(),comments:arrayUnion({by:currentUser.name,text:`تم تغيير الحالة إلى: ${status}`,at:new Date().toISOString()})});
}
function openDetails(id){
  const r=requests.find(x=>x.id===id); if(!r)return;
  $("dialogTitle").textContent=r.title;
  $("dialogBody").innerHTML=`
    <p><b>الوصف:</b> ${esc(r.description)}</p><p><b>الموقع:</b> ${esc(r.location)} | <b>الطالب:</b> ${esc(r.requester)} | <b>الحالة:</b> ${esc(r.status)}</p>
    ${(r.images||[]).length?`<h3>صور المشكلة</h3><div class="images">${r.images.map(u=>`<img src="${u}">`).join("")}</div>`:""}
    ${(r.doneImages||[]).length?`<h3>صور الإنجاز</h3><div class="images">${r.doneImages.map(u=>`<img src="${u}">`).join("")}</div>`:""}
    <h3>التواصل داخل التطبيق</h3><div id="commentsBox">${(r.comments||[]).map(c=>`<div class="comment"><b>${esc(c.by)}</b><span>${esc(c.text)}</span><br><small class="muted">${new Date(c.at).toLocaleString("ar-SA")}</small></div>`).join("")}</div>
    <label>إضافة تعليق / تحديث<input id="newComment" placeholder="مثلاً: رايح للموقع الآن"></label><button id="addCommentBtn">إضافة التعليق</button>
    <hr><label>إضافة صور بعد التنفيذ<input id="doneImagesInput" type="file" accept="image/*" multiple></label><button id="uploadDoneImages" class="success">رفع صور الإنجاز</button>`;
  $("addCommentBtn").onclick=async()=>{const text=$("newComment").value.trim(); if(!text)return; await updateDoc(doc(db,"maintenance_requests",id),{updatedAt:serverTimestamp(),comments:arrayUnion({by:currentUser.name,text,at:new Date().toISOString()})}); $("detailsDialog").close();};
  $("uploadDoneImages").onclick=async()=>{const files=$("doneImagesInput").files; if(!files.length)return alert("اختر صورة"); const urls=await uploadFiles(files,"done-images"); await updateDoc(doc(db,"maintenance_requests",id),{doneImages:arrayUnion(...urls),updatedAt:serverTimestamp(),comments:arrayUnion({by:currentUser.name,text:"تم رفع صور الإنجاز",at:new Date().toISOString()})}); $("detailsDialog").close();};
  $("detailsDialog").showModal();
}
$("closeDialog").onclick=()=>$("detailsDialog").close();
function esc(s=""){return String(s).replace(/[&<>'"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[m]))}
initUser();
