
let currentRole='member';

function login(){
 const user=document.getElementById('user').value;
 const role=document.getElementById('role').value;
 const pass=document.getElementById('pass').value;

 if(role==='admin' && (user!=='Ahmed' || pass!=='2006')){
   alert('رمز المسؤول خطأ');
   return;
 }

 if(role==='worker' && (user!=='هارون' || pass!=='1111')){
   alert('رمز العامل خطأ');
   return;
 }

 currentRole=role;

 document.getElementById('login').style.display='none';
 document.getElementById('app').style.display='block';
 document.getElementById('welcome').innerText='مرحباً '+user;

 if(role==='worker'){
   document.getElementById('requestBox').style.display='none';
 }
 loadRequests();
}

function addRequest(){
 const title=document.getElementById('title').value;
 const desc=document.getElementById('desc').value;
 const priority=document.getElementById('priority').value;

 let data=JSON.parse(localStorage.getItem('requests')||'[]');
 data.push({title,desc,priority,status:'جديد'});
 localStorage.setItem('requests',JSON.stringify(data));

 loadRequests();
}

function loadRequests(){
 let data=JSON.parse(localStorage.getItem('requests')||'[]');
 let html='';

 data.forEach((r,i)=>{
   html+=`
   <div class="req">
   <h3>${r.title}</h3>
   <p>${r.desc}</p>
   <b>${r.priority}</b><br>
   <b>${r.status}</b><br>
   ${currentRole!=='member'?`<button onclick="doneReq(${i})">تم التنفيذ</button>`:''}
   ${currentRole==='admin'?`<button onclick="deleteReq(${i})">حذف</button>`:''}
   </div>`;
 });

 document.getElementById('requests').innerHTML=html;
}

function doneReq(i){
 let data=JSON.parse(localStorage.getItem('requests')||'[]');
 data[i].status='تم التنفيذ';
 localStorage.setItem('requests',JSON.stringify(data));
 loadRequests();
}

function deleteReq(i){
 let data=JSON.parse(localStorage.getItem('requests')||'[]');
 data.splice(i,1);
 localStorage.setItem('requests',JSON.stringify(data));
 loadRequests();
}

function logout(){
 location.reload();
}
