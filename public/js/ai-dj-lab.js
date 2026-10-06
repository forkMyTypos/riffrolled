/* riffrolled — ai-dj-lab.js
   The bench itself: paste a reply, see what the parser makes of it.
   Moved out of ai-dj-lab.html so the page carries no inline <script>. */

(function(){
  var $ = function(id){ return document.getElementById(id); };

  $('run').onclick = function(){
    var parsed = djAi.parseReply($('in').value);
    var items = parsed.items;
    $('out').hidden = false; $('scores').hidden = false;

    if (!items.length){
      $('msg').textContent = 'Nothing read. The parser found no playlist in that.';
      $('out').querySelector('tbody').innerHTML = '';
      $('scores').innerHTML = '';
      return;
    }
    $('msg').textContent = parsed.name ? 'Set name read: “' + parsed.name + '”' : 'No NAME: line — riffrolled would name it from the brief.';

    var withLink = items.filter(function(i){ return i.url; }).length;
    var withTime = items.filter(function(i){ return i.secs; }).length;
    var withGenre = items.filter(function(i){ return i.genre; }).length;
    var total = djAi.totalSecs(items);
    $('scores').innerHTML = [
      ['tracks read', items.length],
      ['playable', withLink + '/' + items.length],
      ['with time', withTime],
      ['with genre', withGenre],
      ['runtime', djAi.fmtSecs(total)]
    ].map(function(c){ return '<div class="score"><b>' + c[1] + '</b><span>' + c[0] + '</span></div>'; }).join('');

    $('out').querySelector('tbody').innerHTML = items.map(function(it, i){
      return '<tr><td class="n">' + (i + 1) + '</td>'
        + '<td>' + escapeHtml(it.artist || '—') + '</td>'
        + '<td>' + escapeHtml(it.title || '—') + '</td>'
        + '<td class="' + (it.url ? 'yes' : 'no') + '">' + (it.url ? escapeHtml(it.url) : 'none — skipped') + '</td>'
        + '<td>' + (it.secs ? Math.floor(it.secs / 60) + ':' + String(it.secs % 60).padStart(2, '0') : '—') + '</td>'
        + '<td>' + escapeHtml(it.genre || '—') + '</td>'
        + '<td>' + escapeHtml(it.why || '—') + '</td></tr>';
    }).join('');
  };
})();
