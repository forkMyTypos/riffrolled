/* riffrolled — ui.js
   escapeHtml, panel construction (menuB), dragging, z-order. */

// safe-render helper — titles can contain quotes, <, &
function escapeHtml(s){
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
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
      panel.style.left=Math.max(0, ev.pageX-ox)+'px';
      panel.style.top=Math.max(0, ev.pageY-oy)+'px';
      panel.style.right='auto';
    };
    document.onmouseup=()=>{ if(d){ d=false; if(window.dock){ if(dock.markPlaced) dock.markPlaced(panel); if(dock.saveLayoutSoon) dock.saveLayoutSoon(); } } };
  };
}
