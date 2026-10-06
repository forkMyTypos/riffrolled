/* riffrolled — ai-dj-lab-stubs.js
   What the bench has to define before aidj.js loads: the escapeHtml helper
   (normally from ui.js) and the two globals the parser checks for but does
   not use. Separate file so the page has no inline <script>. */

function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  var db = null, dbBoss = null;          // the parser needs neither
