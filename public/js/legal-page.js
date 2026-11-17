/* riffrolled — legal-page.js
   riffrolled.com/terms and riffrolled.com/privacy: the same text as the
   About & Legal panel (legal-text.js), on a page of its own with a stable
   address, which YouTube's API review and app stores ask for. */
(function () {
  var page = document.body.getAttribute('data-page');
  var html = page === 'privacy' ? PRIVACY_HTML : TERMS_HTML;
  var main = document.getElementById('legal');
  main.innerHTML = html;
  // the counting switch only works inside the app: point there instead
  var opt = main.querySelector('.usage-opt');
  if (opt) {
    var p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'You can switch anonymous counting on or off inside riffrolled: About & Legal → Privacy.';
    opt.replaceWith(p);
  }
})();
