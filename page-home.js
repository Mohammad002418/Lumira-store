(function () {
  "use strict";
  var L = window.Lumira;
  L.mount("index.html");
  var CATS = [
    { id: "smartphones", name: "Smartphones", desc: "Flagship and everyday phones with verified specs." },
    { id: "laptops", name: "Laptops & Computers", desc: "For study, work, programming, design and play." },
    { id: "smartwatches", name: "Smartwatches", desc: "Activity, health and sleep tracking on your wrist." },
    { id: "audio", name: "Headphones & Audio", desc: "Wireless and wired headphones and earbuds." },
    { id: "accessories", name: "Accessories & Chargers", desc: "Chargers, cables, cases and desk essentials." }
  ];
  L.getProducts().then(function (data) {
    var prods = data.products;
    document.getElementById("cat-grid").innerHTML = CATS.map(function (c) {
      var n = prods.filter(function (p) { return p.category === c.id; }).length;
      return '<a class="cat-card" href="category-' + c.id + '.html"><h3>' + L.esc(c.name) + '</h3><p>' + L.esc(c.desc) +
        '</p><span class="tag">' + n + ' items</span><span class="go">Explore →</span></a>';
    }).join("");
    document.getElementById("featured").innerHTML = prods.filter(function (p) { return p.featured; }).slice(0, 8).map(L.productCard).join("");
  }).catch(function (e) {
    document.getElementById("featured").innerHTML = '<p role="alert">Could not load products: ' + L.esc(e.message) + '</p>';
  });

  var form = document.getElementById("newsletter");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("nl-email").value.trim();
    var msg = document.getElementById("nl-msg");
    msg.textContent = "";
    try {
      var r = await L.api("/api/newsletter", { method: "POST", body: { email: email } });
      msg.textContent = r.message;
      form.reset();
    } catch (err) {
      msg.textContent = err.message;
    }
  });
})();
