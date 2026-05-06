
const users = {
  Ahmed:{password:"2006",role:"admin"},
  "هارون":{password:"1111",role:"worker"}
};

let currentRole = "";

function login(){
 const u=document.getElementById("username").value;
 const p=document.getElementById("password").value;

 if(users[u] && users[u].password===p){
   currentRole = users[u].role;
   document.querySelector(".login").style.display="none";
   document.getElementById("app").style.display="block";
 }else{
   currentRole = "member";
   document.querySelector(".login").style.display="none";
   document.getElementById("app").style.display="block";
 }
}

function sendRequest(){
 const text=document.getElementById("requestText").value;
 const priority=document.getElementById("priority").value;
 const file=document.getElementById("beforeImage").files[0];

 const reader = new FileReader();
 reader.onload = function(e){
   const requests = JSON.parse(localStorage.getItem("requests") || "[]");
   requests.push({
     text,
     priority,
     image:e.target.result,
     status:"جديد"
   });
   localStorage.setItem("requests", JSON.stringify(requests));
   render();
 };

 if(file){
   reader.readAsDataURL(file);
 }else{
   const requests = JSON.parse(localStorage.getItem("requests") || "[]");
   requests.push({
     text,
     priority,
     image:"",
     status:"جديد"
   });
   localStorage.setItem("requests", JSON.stringify(requests));
   render();
 }
}

function render(){
 const box=document.getElementById("requests");
 box.innerHTML="";
 const requests=JSON.parse(localStorage.getItem("requests") || "[]");

 requests.forEach((r,i)=>{
   let cls="normal";
   if(r.priority==="مهم") cls="important";
   if(r.priority==="مستعجل") cls="urgent";

   box.innerHTML += `
   <div class="request ${cls}">
   <b>${r.text}</b><br>
   الحالة: ${r.status}<br>
   ${r.image ? `<img src="${r.image}" onclick="window.open('${r.image}')">` : ""}
   ${
     currentRole==="worker" || currentRole==="admin"
     ? `<br><button onclick="finishRequest(${i})">تم التنفيذ</button>`
     : ""
   }
   ${
     currentRole==="admin"
     ? `<button onclick="deleteRequest(${i})">حذف</button>`
     : ""
   }
   </div>`;
 });
}

function finishRequest(i){
 const requests=JSON.parse(localStorage.getItem("requests") || "[]");
 requests[i].status="تم التنفيذ";
 localStorage.setItem("requests", JSON.stringify(requests));
 render();
}

function deleteRequest(i){
 const requests=JSON.parse(localStorage.getItem("requests") || "[]");
 requests.splice(i,1);
 localStorage.setItem("requests", JSON.stringify(requests));
 render();
}

render();
