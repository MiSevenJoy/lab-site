// 手机端导航下拉：点击标题展开/收起下拉菜单（不跳转）
(function () {
  var COLLAPSE = 700; // 与 header.scss 的 $collapse 保持一致

  function isMobile() {
    return window.matchMedia("(max-width: " + COLLAPSE + "px)").matches;
  }

  document.addEventListener("click", function (e) {
    var title = e.target.closest(".nav-dropdown-title");

    if (title && isMobile()) {
      e.preventDefault();
      var dd = title.closest(".nav-dropdown");
      if (!dd) return;
      var wasOpen = dd.classList.contains("nav-dropdown-open");
      document.querySelectorAll(".nav-dropdown.nav-dropdown-open").forEach(function (d) {
        d.classList.remove("nav-dropdown-open");
      });
      if (!wasOpen) dd.classList.add("nav-dropdown-open");
      return;
    }

    // 点击下拉菜单以外的区域时，关闭所有下拉
    if (!e.target.closest(".nav-dropdown")) {
      document.querySelectorAll(".nav-dropdown.nav-dropdown-open").forEach(function (d) {
        d.classList.remove("nav-dropdown-open");
      });
    }
  });
})();
