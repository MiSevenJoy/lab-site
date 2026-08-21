/*
  Keeps heading ids usable for section navigation without displaying
  a link icon after each heading.
*/

{
  const onLoad = () => {
    // For each heading with an automatically generated id.
    const headings = document.querySelectorAll(
      "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]"
    );
    for (const heading of headings) {
      // If first heading in the section, move id to parent section so
      // anchored navigation still accounts for the sticky header.
      if (heading.matches("section > :first-child")) {
        heading.parentElement.id = heading.id;
        heading.removeAttribute("id");
      }
    }
  };

  // scroll to target of url hash
  const scrollToTarget = () => {
    const id = window.location.hash.replace("#", "");
    const target = document.getElementById(id);

    if (!target) return;
    const offset = document.querySelector("header").clientHeight || 0;
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - offset,
      behavior: "smooth",
    });
  };

  // after page loads
  window.addEventListener("load", onLoad);
  window.addEventListener("load", scrollToTarget);
  window.addEventListener("tagsfetched", scrollToTarget);

  // when hash nav happens
  window.addEventListener("hashchange", scrollToTarget);
}
