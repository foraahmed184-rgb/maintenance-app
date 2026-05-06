import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
apiKey:"AIzaSyCK7gJ9-zUiygiYHJVwYFb6nUBweptV3XI",
authDomain:"maintenance-app-fa8cc.firebaseapp.com",
projectId:"maintenance-app-fa8cc",
storageBucket:"maintenance-app-fa8cc.firebasestorage.app",
messagingSenderId:"888866675500",
appId:"1:888866675500:web:d808b825c1801ed566ea89"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser="";
let currentRole="member";
let voiceData="";
let mediaRecorder;
let chunks=[];

const $=id=>document.getElementById(id);

$("role").onchange=()=>{
 $("passwordArea").classList.toggle("hidden", $("role").value==="member");
};

$("loginBtn").onclick=()=>{
 const user=$("username").value.trim();
 const role=$("role").value;
 const pass=$("password").value;

 if(role==="admin" && (user!=="Ahmed" || pass!=="2006")) return alert("بيانات المسؤول خطأ");
 if(role==="worker" && (user!=="هارون" || pass!=="1111")) return alert("بيانات العامل خطأ");

 currentUser=user;
 currentRole=role;

 $("loginBox").classList.add("hidden");
 $("app").classList.remove("hidden");
 $("logoutBtn").classList.remove("hidden");

 if(role==="worker"){
   $("newRequest").classList.add("hidden");
   $("workerNotice").classList.remove("hidden");
 }

 loadRequests();
 loadNotifications();
};

$("logoutBtn").onclick=()=>location.reload();

$("startVoice").onclick=async()=>{
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});
 mediaRecorder=new MediaRecorder(stream);
 chunks=[];

 mediaRecorder.ondataavailable=e=>chunks.push(e.data);

 mediaRecorder.onstop=()=>{
   const blob=new Blob(chunks,{type:"audio/webm"});
   const reader=new FileReader();
   reader.onloadend=()=>{
      voiceData=reader.result;
      $("voicePreview").src=voiceData;
      $("voicePreview").classList.remove("hidden");
   };
   reader.readAsDataURL(blob);
 };

 mediaRecorder.start();
 $("startVoice").classList.add("hidden");
 $("stopVoice").classList.remove("hidden");
};

$("stopVoice").onclick=()=>{
 mediaRecorder.stop();
 $("stopVoice").classList.add("hidden");
 $("startVoice").classList.remove("hidden");
};

async function fileToBase64(file){
 if(!file) return "";
 return new Promise(r=>{
  const fr=new FileReader();
  fr.onloadend=()=>r(fr.result);
  fr.readAsDataURL(file);
 });
}

$("sendBtn").onclick=async()=>{
 const title=$("title").value;
 const desc=$("desc").value;
 const priority=$("priority").value;

 const imgs=[];
 for(const f of $("images").files){
   imgs.push(await fileToBase64(f));
 }

 const video=await fileToBase64($("video").files[0]);

 await addDoc(collection(db,"requests"),{
   title,desc,priority,
   images:imgs,
   video,
   voice:voiceData,
   workerVoice:"",
   workerVideo:"",
   status:"جديد",
   user:currentUser,
   createdAt:serverTimestamp()
 });

 await addDoc(collection(db,"notifications"),{
   text:`طلب جديد من ${currentUser}`,
   createdAt:serverTimestamp()
 });

 alert("تم الإرسال");
};

function loadRequests(){
 const q=query(collection(db,"requests"),orderBy("createdAt","desc"));

 onSnapshot(q,snap=>{
  $("requests").innerHTML="";
  snap.forEach(d=>{
   const r=d.data();
   const div=document.createElement("div");
   div.className=`request priority-${r.priority}`;

   let images="";
   (r.images||[]).forEach(i=>{
     images+=`<img src="${i}" class="openImg">`;
   });

   let workerTools="";
   if(currentRole==="worker" || currentRole==="admin"){
      workerTools=`
      <input type="file" id="workerVideo_${d.id}" accept="video/*">
      <button onclick="saveWorker('${d.id}')">حفظ شرح العامل</button>
      <button onclick="progressReq('${d.id}')">قيد التنفيذ</button>
      <button onclick="doneReq('${d.id}')">تم التنفيذ</button>
      `;
   }

   let del="";
   if(currentRole==="admin"){
     del=`<button onclick="deleteReq('${d.id}')">حذف</button>`;
   }

   div.innerHTML=`
   <h3>${r.title}</h3>
   <p>${r.desc}</p>
   <b>${r.status}</b>
   <div class="images">${images}</div>
   ${r.voice?`<audio controls src="${r.voice}"></audio>`:""}
   ${r.video?`<video controls src="${r.video}"></video>`:""}
   ${r.workerVoice?`<audio controls src="${r.workerVoice}"></audio>`:""}
   ${r.workerVideo?`<video controls src="${r.workerVideo}"></video>`:""}
   ${workerTools}
   ${del}
   `;
   $("requests").appendChild(div);
  });

  document.querySelectorAll(".openImg").forEach(img=>{
    img.onclick=()=>{
      $("modalImg").src=img.src;
      $("modal").classList.remove("hidden");
    };
  });
 });
}

window.progressReq=async(id)=>{
 await updateDoc(doc(db,"requests",id),{status:"قيد التنفيذ"});
};

window.doneReq=async(id)=>{
 await updateDoc(doc(db,"requests",id),{status:"تم التنفيذ"});
};

window.deleteReq=async(id)=>{
 await deleteDoc(doc(db,"requests",id));
};

window.saveWorker=async(id)=>{
 const file=document.getElementById("workerVideo_"+id).files[0];
 const workerVideo=await fileToBase64(file);

 let workerVoice="";
 try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   const rec=new MediaRecorder(stream);
   const c=[];

   rec.ondataavailable=e=>c.push(e.data);

   rec.onstop=()=>{
    const blob=new Blob(c,{type:"audio/webm"});
    const fr=new FileReader();
    fr.onloadend=async()=>{
      workerVoice=fr.result;
      await updateDoc(doc(db,"requests",id),{
        workerVoice,
        workerVideo
      });
      alert("تم حفظ شرح العامل");
    };
    fr.readAsDataURL(blob);
   };

   rec.start();
   setTimeout(()=>rec.stop(),5000);

 }catch(e){
   await updateDoc(doc(db,"requests",id),{
     workerVideo
   });
   alert("تم حفظ فيديو العامل");
 }
};

function loadNotifications(){
 const q=query(collection(db,"notifications"),orderBy("createdAt","desc"));

 onSnapshot(q,snap=>{
  $("notifications").innerHTML="";
  snap.forEach(d=>{
    const div=document.createElement("div");
    div.className="request";
    div.innerText=d.data().text;
    $("notifications").appendChild(div);
  });
 });
}

$("modal").onclick=()=>$("modal").classList.add("hidden");
