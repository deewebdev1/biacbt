/* mathfmt.js: shows maths markup as proper maths.
   x^(2n + 1)  ->  x with a raised 2n + 1      log_(1/2)  ->  log with a lowered 1/2      {br}  ->  line break
   It watches the page, so it also works on text that the page adds later (questions, options, explanations). */
(function () {
  /* parse(): text -> list of nodes. Pure function, no page needed. */
  function parse(s) {
    var out = [], buf = '', i = 0;
    function flush() { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } }
    while (i < s.length) {
      var c = s.charAt(i);
      if ((c === '^' || c === '_') && s.charAt(i + 1) === '(') {
        var depth = 0, j = i + 1;
        for (; j < s.length; j++) {
          var ch = s.charAt(j);
          if (ch === '(') depth++;
          else if (ch === ')') { depth--; if (depth === 0) break; }
        }
        if (j < s.length) { flush(); out.push({ t: c === '^' ? 'sup' : 'sub', kids: parse(s.slice(i + 2, j)) }); i = j + 1; continue; }
      }
      if (s.substr(i, 4) === '{br}') { flush(); out.push({ t: 'br' }); i += 4; continue; }
      buf += c; i++;
    }
    flush();
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { parse: parse }; return; }
  if (typeof document === 'undefined') return;

  var RX = /[\^_]\(|\{br\}/;
  function render(nodes, parent) {
    nodes.forEach(function (n) {
      if (n.t === 'text') parent.appendChild(document.createTextNode(n.v));
      else if (n.t === 'br') parent.appendChild(document.createElement('br'));
      else { var e = document.createElement(n.t); e.className = 'mf'; render(n.kids, e); parent.appendChild(e); }
    });
    return parent;
  }
  function skip(node) { return /^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE)$/.test(node.parentNode ? node.parentNode.nodeName : ''); }
  function fixText(t) {
    if (!t.parentNode || skip(t) || !RX.test(t.nodeValue)) return;
    t.parentNode.replaceChild(render(parse(t.nodeValue), document.createDocumentFragment()), t);
  }
  function fix(root) {
    if (!root) return;
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(root.nodeName)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) { if (RX.test(n.nodeValue)) list.push(n); }
    list.forEach(fixText);
  }

  var st = document.createElement('style');
  st.textContent = 'sup.mf,sub.mf{font-size:.72em;line-height:0;position:relative;vertical-align:baseline;font-weight:inherit}sup.mf{top:-.5em}sub.mf{top:.3em}';
  (document.head || document.documentElement).appendChild(st);

  function start() {
    fix(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') fix(m.target);
        else for (var k = 0; k < m.addedNodes.length; k++) fix(m.addedNodes[k]);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
