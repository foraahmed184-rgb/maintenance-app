نظام طلبات الصيانة الداخلي

الفكرة:
- 10 أشخاص يدخلون نفس رابط التطبيق.
- أي شخص يرسل طلب صيانة مع الموقع والوصف والصور.
- الجميع يشوف كل الطلبات والحالة.
- عامل الصيانة يدخل لوحة العامل ويغير الحالة: جديد / قيد التنفيذ / تم التنفيذ / ملغي.
- العامل يقدر يضيف صور الإنجاز وتعليقات داخل التطبيق.
- التواصل داخل التطبيق يتم بالتعليقات على كل طلب.

تشغيل Firebase:
1) افتح Firebase Console.
2) أنشئ مشروع جديد.
3) فعل Firestore Database.
4) فعل Storage للصور.
5) من Project settings > Web app انسخ بيانات firebaseConfig.
6) ضعها في ملف firebase-config.js.
7) ارفع الملفات على GitHub Pages أو أي استضافة.

قواعد Firestore مؤقتة للتجربة فقط:
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /maintenance_requests/{doc} {
      allow read, write: if true;
    }
  }
}

قواعد Storage مؤقتة للتجربة فقط:
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}

ملاحظة مهمة:
هذه القواعد مفتوحة للتجربة. بعد التأكد من النظام، الأفضل إضافة تسجيل دخول وحماية.
