/*
lottie-loader.js - small helper that ensures lottie is available.
This is a tiny loader that attempts to load local lottie.min.js first,
then falls back to CDN. Included for convenience so the package works
when uploaded to GitHub Pages.
*/
(function(){
  if (window.lottie && typeof window.lottie.loadAnimation === 'function') return;
  var local = document.createElement('script');
  local.src = './lottie.min.js';
  local.async = true;
  local.onload = function(){ console.log('lottie loaded (local)'); };
  local.onerror = function(){
    var cdn = document.createElement('script');
    cdn.src = 'https://unpkg.com/lottie-web@5.8.1/build/player/lottie.min.js';
    cdn.async = true;
    cdn.onload = function(){ console.log('lottie loaded (cdn)'); };
    cdn.onerror = function(){ console.warn('Could not load lottie'); };
    document.head.appendChild(cdn);
  };
  document.head.appendChild(local);
})();
