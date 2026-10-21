self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch(e){}
 event.waitUntil(self.registration.showNotification(data.title||'Hide & Beep',{body:data.body||'A seeker beeped!',tag:data.tag||'beep',icon:'/icon-192.png',badge:'/icon-192.png',vibrate:[200,100,200],data:{url:data.url||'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{const url=new URL(event.notification.data?.url||'/',self.location.origin).href;const windows=await clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(client.url.startsWith(self.location.origin)){await client.focus();return}}await clients.openWindow(url)})());
});
