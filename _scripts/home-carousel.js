(function () {
  function initCarousel(carousel) {
    var track = carousel.querySelector("[data-carousel-track]");
    var slides = Array.prototype.slice.call(
      carousel.querySelectorAll("[data-carousel-slide]")
    );
    var previous = carousel.querySelector("[data-carousel-prev]");
    var next = carousel.querySelector("[data-carousel-next]");
    var interval = parseInt(carousel.getAttribute("data-interval"), 10) || 5000;
    var index = 0;
    var timer = null;
    var touchStartX = null;
    var reduceMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!track || slides.length < 2) return;

    function show(target) {
      index = (target + slides.length) % slides.length;
      track.style.transform = "translate3d(" + (-index * 100) + "%, 0, 0)";
      slides.forEach(function (slide, slideIndex) {
        slide.setAttribute("aria-hidden", slideIndex === index ? "false" : "true");
      });
    }

    function stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    }

    function start() {
      stop();
      if (reduceMotion || document.hidden) return;
      timer = window.setInterval(function () { show(index + 1); }, interval);
    }

    function changeBy(amount) {
      show(index + amount);
      start();
    }

    if (previous) previous.addEventListener("click", function () { changeBy(-1); });
    if (next) next.addEventListener("click", function () { changeBy(1); });

    carousel.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        changeBy(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        changeBy(1);
      }
    });

    carousel.addEventListener("touchstart", function (event) {
      touchStartX = event.touches.length ? event.touches[0].clientX : null;
    }, { passive: true });

    carousel.addEventListener("touchend", function (event) {
      if (touchStartX === null || !event.changedTouches.length) return;
      var distance = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(distance) < 45) return;
      changeBy(distance > 0 ? -1 : 1);
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else start();
    });

    show(0);
    start();
  }

  function init() {
    document.querySelectorAll("[data-carousel]").forEach(initCarousel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
