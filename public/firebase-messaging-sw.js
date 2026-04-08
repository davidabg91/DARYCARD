importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB0F2U11RI7NcBs0ghhu5J642HcGNP5T18",
  authDomain: "darycard-6e8e7.firebaseapp.com",
  projectId: "darycard-6e8e7",
  storageBucket: "darycard-6e8e7.firebasestorage.app",
  messagingSenderId: "949719547537",
  appId: "1:949719547537:web:5ae189666873df89dc8930"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // We no longer call self.registration.showNotification here because 
  // the FCM SDK displays the 'notification' payload automatically, 
  // preventing double notifications on the device.
});
