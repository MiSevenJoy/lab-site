// 乙方案双语：前端语言切换
(function () {
  var STORAGE_KEY = "lab-lang";
  var root = document.documentElement;

  function getInitialLang() {
    var m = location.search.match(/[?&]lang=(zh|en)(?:&|$)/);
    if (m) {
      try { localStorage.setItem(STORAGE_KEY, m[1]); } catch (e) {}
      return m[1];
    }
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    return stored === "en" || stored === "zh" ? stored : "zh";
  }

  function applyLang(lang) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);
    var btn = document.getElementById("lang-toggle");
    if (btn) btn.textContent = lang === "zh" ? "EN" : "中";
    var btnAlt = document.getElementById("lang-toggle-alt");
    if (btnAlt) btnAlt.textContent = lang === "zh" ? "EN" : "中";
  }

  window.setLang = function (lang) {
    lang = lang === "en" ? "en" : "zh";
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    applyLang(lang);
  };

  window.toggleLang = function () {
    var cur = root.getAttribute("data-lang") === "en" ? "en" : "zh";
    setLang(cur === "zh" ? "en" : "zh");
  };

  applyLang(getInitialLang());
})();
