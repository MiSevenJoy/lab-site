// 手机端导航下拉：点击标题展开/收起下拉菜单（不跳转）
// 规则：已在团队成员页 → 点击标题切换下拉；在其他页面 → 正常跳转到团队成员页
(function () {
  var COLLAPSE = 700; // 与 header.scss 的 $collapse 保持一致

  function isMobile() {
    return window.matchMedia("(max-width: " + COLLAPSE + "px)").matches;
  }

  function closeAll() {
    document.querySelectorAll(".nav-dropdown.nav-dropdown-open").forEach(function (d) {
      d.classList.remove("nav-dropdown-open");
    });
  }

  document.addEventListener("click", function (e) {
    var title = e.target.closest(".nav-dropdown-title");

    if (title && isMobile()) {
      var href = (title.getAttribute("href") || "").replace(/\/$/, "");
      var path = location.pathname.replace(/\/$/, "");

      if (path === href) {
        // 已在团队成员页：点击标题切换下拉菜单
        e.preventDefault();
        var dd = title.closest(".nav-dropdown");
        if (!dd) return;
        var wasOpen = dd.classList.contains("nav-dropdown-open");
        closeAll();
        if (!wasOpen) dd.classList.add("nav-dropdown-open");
      }
      // 其他页面：不拦截，正常跳转到团队成员页
      return;
    }

    // 手机端：点击导航里的任意链接后，收起导航栏
    if (isMobile() && e.target.closest("nav a")) {
      closeAll();
      document.querySelectorAll(".nav-toggle").forEach(function (t) {
        t.checked = false;
      });
      return;
    }

    // 点击下拉菜单以外的区域：收起
    if (!e.target.closest(".nav-dropdown")) {
      closeAll();
    }
  });
})();
