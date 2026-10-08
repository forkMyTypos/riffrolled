/* riffrolled — ui.js
   escapeHtml, panel construction (menuB), dragging, z-order. */

// safe-render helper — titles can contain quotes, <, &
function escapeHtml(s){
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

/**
 * One cell of a CSV file, escaped.
 *
 * Two separate jobs, and the second is the one that is easy to miss.
 *
 * The first is CSV quoting: a value containing a comma, a quote or a
 * newline has to be wrapped in quotes with its own quotes doubled, or the
 * row silently gains a column.
 *
 * The second is formula injection. Excel, LibreOffice and Google Sheets
 * all treat a cell beginning =, +, - or @ as a formula, so a track called
 * `=HYPERLINK("http://evil","click")` is not a weird title, it is code
 * that runs when somebody opens the export. riffrolled's track names come
 * from the shared catalogue, which anyone can POST to, and from AI
 * replies — so they are exactly the untrusted strings this applies to.
 * Prefixing a tab neutralises it: spreadsheets stop parsing it as a
 * formula and still show the original text.
 */
function csvCell(v){
  var s = (v == null ? '' : String(v));
  if (/^[=+\-@\t\r]/.test(s)) s = '\t' + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

var menuB = {
    createMenu:function(title,main){
        let txt=this.createMenuD(title,main);
        document.body.insertAdjacentHTML("beforeend",txt);
        const panel=document.body.lastElementChild;
        makeDraggableEle(panel,panel.querySelector(".panel-header"));
        return panel;
    },

    createMenuD:function(title,main){
        return "<div class='cont flex column panel'>"
            +"<div class='flex alignMe title panel-header fs1em'>"+title+"<button class='panel-close' title='Close' aria-label='Close'>✕</button></div>"
            +"<div class='mainC flex1'>"+main+"</div>"
        +"</div>"
    },

    // set a sensible default position / size so panels don't all stack
    place:function(panel, css){ Object.assign(panel.style, css); return panel; },


}


/* ── toast ──────────────────────────────────────────────────────────────
   For the small confirmations that belong next to the thing you just did
   rather than in a banner across the top: "prompt copied", and friends.
   Sits low on the screen, out of the way, and never over the YouTube
   player — ytGuard has the final say on that, as it does for every other
   floating thing in here. */
function appToast(msg, kind){
  let t = document.getElementById('appToast');
  if (!t){
    t = document.createElement('div');
    t.id = 'appToast';
    t.className = 'app-toast';
    t.hidden = true;
    document.body.appendChild(t);
  }
  t.textContent = msg || '';
  t.className = 'app-toast' + (kind ? ' ' + kind : '');
  t.hidden = false;
  // force a reflow so the transition runs again on a repeat message
  void t.offsetWidth;
  t.classList.add('show');

  if (window.ytGuard && ytGuard.overlaps(t)) t.classList.add('aside');
  clearTimeout(t._t);
  t._t = setTimeout(function(){
    t.classList.remove('show');
    setTimeout(function(){ if (!t.classList.contains('show')){ t.hidden = true; t.classList.remove('aside'); } }, 250);
  }, 2600);
}

let z=10;
// panels stay below the deck (z-index:60) so the record player is never covered by a menu
function bringToFront(el){ el.style.zIndex = Math.min(++z, 50); }

function makeDraggableEle(panel,handle){
  let d=false,ox=0,oy=0;
  handle.onmousedown=e=>{
    if(e.target.tagName==='BUTTON'||e.target.tagName==='INPUT')return;
    bringToFront(panel); d=true;
    const r=panel.getBoundingClientRect();
    // work in page coordinates so a panel can be dragged down into the scrollable area
    ox=e.pageX-(r.left+window.scrollX);
    oy=e.pageY-(r.top+window.scrollY);
    document.onmousemove=ev=>{
      if(!d)return;
      // the page doesn't scroll, so never let a panel leave the screen
      panel.style.left=Math.min(Math.max(0, ev.pageX-ox), innerWidth - 80)+'px';
      panel.style.top=Math.min(Math.max(0, ev.pageY-oy), innerHeight - 44)+'px';
      panel.style.right='auto';
    };
    document.onmouseup=()=>{ if(d){ d=false; if(window.dock){ if(dock.markPlaced) dock.markPlaced(panel); if(dock.saveLayoutSoon) dock.saveLayoutSoon(); } } };
  };
}
